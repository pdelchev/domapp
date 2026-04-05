# ── health/life_views.py ──────────────────────────────────────────────
# REST views for the Life module: HealthScore snapshots + Intervention CRUD.
#
# §AUTH: all endpoints require JWT; data scoped by request.user.

from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from datetime import date as date_cls, timedelta

from .models import Intervention, HealthProfile, HealthScoreSnapshot, InterventionLog
from .life_serializers import InterventionSerializer, HealthScoreSnapshotSerializer
from .life_services import compute_health_score, get_deltas
from .phenoage import compute_phenoage
from .briefing import compute_briefing
from .lab_order import generate_lab_order


def _primary_profile(user):
    """Return the user's primary HealthProfile (fallback: first profile). None if none exist."""
    return (
        HealthProfile.objects.filter(user=user).order_by('-is_primary', 'id').first()
    )


class InterventionViewSet(viewsets.ModelViewSet):
    """CRUD for user-logged interventions. Filters: ?category=&active=&profile=."""
    serializer_class = InterventionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Intervention.objects.filter(user=self.request.user).select_related('profile')
        params = self.request.query_params
        if (cat := params.get('category')):
            qs = qs.filter(category=cat)
        if (active := params.get('active')) in ('true', '1'):
            qs = qs.filter(ended_on__isnull=True)
        elif active in ('false', '0'):
            qs = qs.filter(ended_on__isnull=False)
        if (pid := params.get('profile')):
            qs = qs.filter(profile_id=pid)
        return qs

    def perform_create(self, serializer):
        # default to primary profile if client didn't pass one
        profile = serializer.validated_data.get('profile') or _primary_profile(self.request.user)
        # make sure a client-supplied profile belongs to this user
        if profile and profile.user_id != self.request.user.id:
            profile = _primary_profile(self.request.user)
        serializer.save(user=self.request.user, profile=profile)


class LifeSummaryView(APIView):
    """
    GET /api/health/life-summary/[?profile=<id>&recompute=1]

    Returns the current HealthScoreSnapshot for the user's primary (or specified)
    profile, recent history (30 days), and deltas vs 7/30 days ago.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        pid = request.query_params.get('profile')
        if pid:
            profile = HealthProfile.objects.filter(user=user, id=pid).first()
        else:
            profile = _primary_profile(user)

        if not profile:
            return Response(
                {'detail': 'No HealthProfile found for this user.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Recompute today's snapshot (idempotent; keeps the data fresh)
        recompute = request.query_params.get('recompute') != '0'
        today_data = compute_health_score(user, profile, save=recompute)

        # History sparkline (last 30 snapshots)
        history_qs = (
            HealthScoreSnapshot.objects
            .filter(user=user, profile=profile)
            .order_by('-date')[:30]
        )
        history = HealthScoreSnapshotSerializer(reversed(list(history_qs)), many=True).data

        # Active interventions (for the "what's in play" card)
        active_interventions = Intervention.objects.filter(
            user=user, ended_on__isnull=True,
        ).order_by('-started_on')[:10]

        return Response({
            'profile': {
                'id': profile.id,
                'full_name': profile.full_name,
                'sex': profile.sex,
                'is_primary': profile.is_primary,
            },
            'today': today_data,
            'deltas': get_deltas(user, profile),
            'history': history,
            'active_interventions': InterventionSerializer(active_interventions, many=True).data,
            'phenoage': compute_phenoage(profile),
            'briefing': compute_briefing(user, profile),
        })


class PhenoAgeView(APIView):
    """
    GET /api/health/phenoage/[?profile=<id>]
    Levine 2018 biological age from the profile's latest blood report.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        pid = request.query_params.get('profile')
        if pid:
            profile = HealthProfile.objects.filter(user=user, id=pid).first()
        else:
            profile = _primary_profile(user)
        if not profile:
            return Response({'detail': 'No HealthProfile found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(compute_phenoage(profile))


class LabOrderView(APIView):
    """
    GET /api/health/lab-order/[?profile=<id>]
    Returns a printable follow-up lab order based on the profile's latest blood
    report: abnormal results → recommended follow-up tests (EN+BG) grouped by
    priority, fasting instructions, receptionist phrase.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        pid = request.query_params.get('profile')
        if pid:
            profile = HealthProfile.objects.filter(user=user, id=pid).first()
        else:
            profile = _primary_profile(user)
        if not profile:
            return Response({'detail': 'No HealthProfile found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(generate_lab_order(profile))


class InterventionLogView(APIView):
    """
    §LOG: daily adherence checklist for the ritual.

    GET  /api/health/interventions/logs/?date=YYYY-MM-DD
         Returns active interventions + today's log + yesterday's log
         (for prefill). date defaults to today.

    POST /api/health/interventions/logs/batch/
         Body: {date: 'YYYY-MM-DD', logs: [{intervention: <id>, taken: bool, notes?}]}
         Upserts one row per intervention for the given date.
    """
    permission_classes = [IsAuthenticated]

    def _parse_date(self, s, fallback):
        if not s:
            return fallback
        try:
            return date_cls.fromisoformat(s)
        except ValueError:
            return fallback

    def get(self, request):
        user = request.user
        target = self._parse_date(request.query_params.get('date'), date_cls.today())
        yesterday = target - timedelta(days=1)

        actives = Intervention.objects.filter(user=user, ended_on__isnull=True).order_by('name')
        ids = list(actives.values_list('id', flat=True))
        logs_today = {
            l.intervention_id: l for l in
            InterventionLog.objects.filter(intervention_id__in=ids, date=target)
        }
        logs_yesterday = {
            l.intervention_id: l.taken for l in
            InterventionLog.objects.filter(intervention_id__in=ids, date=yesterday)
        }

        items = []
        for iv in actives:
            today_log = logs_today.get(iv.id)
            items.append({
                'intervention_id': iv.id,
                'name': iv.name,
                'category': iv.category,
                'dose': iv.dose,
                'taken_today': today_log.taken if today_log else None,
                'taken_yesterday': logs_yesterday.get(iv.id),  # None if no log
                'notes': today_log.notes if today_log else '',
            })
        return Response({'date': target.isoformat(), 'items': items})

    def post(self, request):
        user = request.user
        body = request.data or {}
        target = self._parse_date(body.get('date'), date_cls.today())
        logs = body.get('logs') or []
        if not isinstance(logs, list):
            return Response({'detail': 'logs must be a list'}, status=status.HTTP_400_BAD_REQUEST)

        # §AUTH: only allow logs against user's own interventions
        user_iv_ids = set(
            Intervention.objects.filter(user=user).values_list('id', flat=True)
        )
        saved = 0
        for row in logs:
            iv_id = row.get('intervention')
            if iv_id not in user_iv_ids:
                continue
            InterventionLog.objects.update_or_create(
                intervention_id=iv_id, date=target,
                defaults={
                    'taken': bool(row.get('taken', True)),
                    'notes': str(row.get('notes', ''))[:200],
                },
            )
            saved += 1
        return Response({'date': target.isoformat(), 'saved': saved})


class MorningBriefingView(APIView):
    """GET /api/health/briefing/[?profile=<id>] — rule-based daily synthesis."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        pid = request.query_params.get('profile')
        if pid:
            profile = HealthProfile.objects.filter(user=user, id=pid).first()
        else:
            profile = _primary_profile(user)
        if not profile:
            return Response({'detail': 'No HealthProfile found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(compute_briefing(user, profile))
