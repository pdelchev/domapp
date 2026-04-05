# ── health/weight_views.py ────────────────────────────────────────────
# REST API views for weight tracking + vitals fusion (weight + BP).
#
# §NAV: weight_models → weight_serializers → [weight_views] → weight_urls → weight_services
# §AUTH: All views require JWT auth. Data scoped by request.user (DomApp std).
# §PERF: dashboard read ≤4 queries (latest reading, latest session, active
#        goal, latest insights-per-type).

import csv
import io
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import HealthProfile
from .weight_models import (
    WeightReading, VitalsSession, WeightGoal, VitalsInsight,
    WeightMedicationEffect,
)
from .weight_serializers import (
    WeightReadingSerializer, VitalsSessionSerializer,
    WeightGoalSerializer, VitalsInsightSerializer,
    WeightMedicationEffectSerializer,
)
from . import weight_services as svc


# ── WeightReading CRUD ────────────────────────────────────────────────

class WeightReadingViewSet(viewsets.ModelViewSet):
    """
    §CRUD: list/create/retrieve/update/delete weight readings.
    §FILTERS: ?profile=&days=&source=
    §EVENT: on create, runs osmotic-spike detection and persists insight.
    """
    serializer_class = WeightReadingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # §OWNER: hard user scope
        qs = WeightReading.objects.filter(user=self.request.user).select_related('profile')
        profile = self.request.query_params.get('profile')
        if profile:
            qs = qs.filter(profile_id=profile)
        days = self.request.query_params.get('days')
        if days:
            try:
                qs = qs.filter(measured_at__gte=timezone.now() - timedelta(days=int(days)))
            except ValueError:
                pass
        source = self.request.query_params.get('source')
        if source:
            qs = qs.filter(source=source)
        return qs.order_by('-measured_at')

    def perform_create(self, serializer):
        reading = serializer.save(user=self.request.user)
        # §EVENT: synchronous spike detection (cheap — ≤3-day window query)
        spike = svc.detect_osmotic_spike(reading.profile_id, reading)
        if spike:
            svc.persist_insight(
                user_id=self.request.user.id,
                profile_id=reading.profile_id,
                insight_type='osmotic_spike',
                payload=spike,
                confidence=0.75,
            )


# ── VitalsSession (dual-capture ritual) ───────────────────────────────

class VitalsSessionViewSet(viewsets.ModelViewSet):
    """
    §RITUAL: POST to create (start), POST finalize/ to compute summary.
    §JOIN: BP readings logged during session window (±10/+30min) auto-link.
    """
    serializer_class = VitalsSessionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = VitalsSession.objects.filter(user=self.request.user).select_related('profile')
        profile = self.request.query_params.get('profile')
        if profile:
            qs = qs.filter(profile_id=profile)
        days = self.request.query_params.get('days')
        if days:
            try:
                qs = qs.filter(started_at__gte=timezone.now() - timedelta(days=int(days)))
            except ValueError:
                pass
        return qs.order_by('-started_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def finalize(self, request, pk=None):
        """§FINALIZE: compute averages + cache summary + fire insights."""
        session = self.get_object()
        summary = svc.finalize_vitals_session(session)
        return Response({
            'summary': summary,
            'session': VitalsSessionSerializer(session).data,
        })


# ── WeightGoal CRUD ───────────────────────────────────────────────────

class WeightGoalViewSet(viewsets.ModelViewSet):
    serializer_class = WeightGoalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = WeightGoal.objects.filter(user=self.request.user).select_related('profile')
        profile = self.request.query_params.get('profile')
        if profile:
            qs = qs.filter(profile_id=profile)
        active = self.request.query_params.get('active')
        if active is not None:
            qs = qs.filter(is_active=(active.lower() == 'true'))
        return qs

    def perform_create(self, serializer):
        goal = serializer.save(user=self.request.user)
        # §SOFT_RULE: deactivate other active goals on this profile
        WeightGoal.objects.filter(
            profile_id=goal.profile_id, is_active=True
        ).exclude(id=goal.id).update(is_active=False)


# ── Weight dashboard ──────────────────────────────────────────────────

class WeightDashboardView(APIView):
    """
    §DASHBOARD: single endpoint for the Weight page.
    §QUERIES: 4 — latest reading, active goal, recent trend slice,
              latest active insights per type.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile_id = request.query_params.get('profile')
        if not profile_id:
            return Response({'detail': 'profile query param required'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            profile_id = int(profile_id)
        except ValueError:
            return Response({'detail': 'profile must be int'},
                            status=status.HTTP_400_BAD_REQUEST)

        # §AUTH: verify user owns the profile
        if not HealthProfile.objects.filter(
                id=profile_id, user=request.user).exists():
            return Response({'detail': 'profile not found'},
                            status=status.HTTP_404_NOT_FOUND)

        # 1. latest reading
        latest = (WeightReading.objects
                  .filter(user=request.user, profile_id=profile_id)
                  .order_by('-measured_at').first())

        # 2. active goal
        goal = (WeightGoal.objects
                .filter(user=request.user, profile_id=profile_id, is_active=True)
                .first())

        # 3. trend (last 90 days raw + EWMA)
        trend_cutoff = timezone.now() - timedelta(days=90)
        trend_rows = list(WeightReading.objects
                          .filter(user=request.user, profile_id=profile_id,
                                  measured_at__gte=trend_cutoff)
                          .order_by('measured_at')
                          .values('measured_at', 'weight_kg'))
        # compute EWMA in Python (single pass)
        ewma, s = [], None
        for r in trend_rows:
            kg = float(r['weight_kg'])
            s = kg if s is None else 0.1 * kg + 0.9 * s
            ewma.append({
                'date': r['measured_at'].isoformat(),
                'raw_kg': kg,
                'ewma_kg': round(s, 2),
            })

        # 4. latest insights per type (single query)
        insights = list(VitalsInsight.objects
                        .filter(user=request.user, profile_id=profile_id,
                                superseded_by__isnull=True)
                        .order_by('insight_type', '-computed_at'))

        return Response({
            'latest_reading': WeightReadingSerializer(latest).data if latest else None,
            'active_goal': WeightGoalSerializer(goal).data if goal else None,
            'trend': ewma,
            'insights': VitalsInsightSerializer(insights, many=True).data,
            'reading_count_90d': len(ewma),
        })


# ── BP-per-kg slope ───────────────────────────────────────────────────

class BPPerKgSlopeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile_id = _require_profile(request)
        if isinstance(profile_id, Response):
            return profile_id
        if not HealthProfile.objects.filter(id=profile_id, user=request.user).exists():
            return Response({'detail': 'profile not found'}, status=404)
        days = int(request.query_params.get('days', 90))
        result = svc.compute_bp_per_kg_slope(profile_id, days=days)
        if result.get('status') == 'ok':
            svc.persist_insight(request.user.id, profile_id, 'bp_per_kg_slope',
                                result, confidence=result.get('confidence', 0.5))
        return Response(result)


# ── Cardiometabolic age ───────────────────────────────────────────────

class CardiometabolicAgeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile_id = _require_profile(request)
        if isinstance(profile_id, Response):
            return profile_id
        try:
            profile = HealthProfile.objects.get(id=profile_id, user=request.user)
        except HealthProfile.DoesNotExist:
            return Response({'detail': 'profile not found'}, status=404)
        if not profile.date_of_birth:
            return Response({'detail': 'profile.date_of_birth required for age calc'},
                            status=400)
        chrono = (timezone.now().date() - profile.date_of_birth).days // 365
        result = svc.compute_cardiometabolic_age(profile_id, chrono)
        svc.persist_insight(request.user.id, profile_id, 'cardiometabolic_age',
                            result, confidence=result.get('confidence', 0.5))
        return Response(result)


# ── Stage regression forecast ─────────────────────────────────────────

class StageRegressionForecastView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile_id = _require_profile(request)
        if isinstance(profile_id, Response):
            return profile_id
        if not HealthProfile.objects.filter(id=profile_id, user=request.user).exists():
            return Response({'detail': 'profile not found'}, status=404)
        target_sys = int(request.query_params.get('target_systolic', 120))
        result = svc.stage_regression_forecast(profile_id, target_systolic=target_sys)
        if result.get('status') == 'ok':
            svc.persist_insight(request.user.id, profile_id,
                                'stage_regression_forecast', result, confidence=0.7)
        return Response(result)


# ── Unified Vitals dashboard ──────────────────────────────────────────

class VitalsDashboardView(APIView):
    """
    §UNIFIED: weight + BP + blood + WHOOP snapshot.
    §QUERIES: ≤6 (latest weight, latest BP session, latest insights,
              active goal, cardiometabolic age trigger).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile_id = _require_profile(request)
        if isinstance(profile_id, Response):
            return profile_id
        try:
            profile = HealthProfile.objects.get(id=profile_id, user=request.user)
        except HealthProfile.DoesNotExist:
            return Response({'detail': 'profile not found'}, status=404)

        # local imports to avoid circular deps at module load
        from .bp_models import BPSession

        latest_w = (WeightReading.objects
                    .filter(user=request.user, profile_id=profile_id)
                    .order_by('-measured_at').first())
        latest_bp_session = (BPSession.objects
                             .filter(user=request.user, profile_id=profile_id)
                             .order_by('-measured_at').first())
        active_goal = (WeightGoal.objects
                       .filter(user=request.user, profile_id=profile_id, is_active=True)
                       .first())
        insights = list(VitalsInsight.objects
                        .filter(user=request.user, profile_id=profile_id,
                                superseded_by__isnull=True)
                        .order_by('insight_type', '-computed_at'))

        return Response({
            'profile': {
                'id': profile.id,
                'full_name': profile.full_name,
                'height_cm': float(profile.height_cm) if profile.height_cm else None,
                'sex': profile.sex,
            },
            'latest_weight': WeightReadingSerializer(latest_w).data if latest_w else None,
            'latest_bp_session': {
                'measured_at': latest_bp_session.measured_at.isoformat(),
                'avg_systolic': latest_bp_session.avg_systolic,
                'avg_diastolic': latest_bp_session.avg_diastolic,
                'stage': latest_bp_session.stage,
            } if latest_bp_session else None,
            'active_goal': WeightGoalSerializer(active_goal).data if active_goal else None,
            'insights': VitalsInsightSerializer(insights, many=True).data,
        })


# ── CSV import ────────────────────────────────────────────────────────

class WeightCSVImportView(APIView):
    """
    §IMPORT: upload CSV; columns: measured_at,weight_kg[,body_fat_pct,waist_cm,notes]
    §IDEMP: rows with source_ref are de-duplicated via unique constraint.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile_id = request.data.get('profile')
        if not profile_id:
            return Response({'detail': 'profile required'}, status=400)
        try:
            profile = HealthProfile.objects.get(id=profile_id, user=request.user)
        except HealthProfile.DoesNotExist:
            return Response({'detail': 'profile not found'}, status=404)

        file = request.FILES.get('file')
        if not file:
            return Response({'detail': 'file required (multipart)'}, status=400)

        decoded = file.read().decode('utf-8-sig', errors='replace')
        reader = csv.DictReader(io.StringIO(decoded))

        created, skipped, errors = 0, 0, []
        for i, row in enumerate(reader, start=2):  # header = line 1
            try:
                measured_at = parse_datetime(row.get('measured_at', '').strip())
                if not measured_at:
                    errors.append(f'Line {i}: bad measured_at')
                    continue
                weight_kg = Decimal(row.get('weight_kg', '').strip())
                source_ref = f'csv:{request.user.id}:{measured_at.isoformat()}:{weight_kg}'

                # §IDEMP: check dedupe
                if WeightReading.objects.filter(
                        user=request.user, source='csv', source_ref=source_ref).exists():
                    skipped += 1
                    continue

                kwargs = {
                    'user': request.user,
                    'profile': profile,
                    'measured_at': measured_at,
                    'weight_kg': weight_kg,
                    'source': 'csv',
                    'source_ref': source_ref,
                    'notes': row.get('notes', '').strip(),
                }
                # Optional columns
                for col, field in [('body_fat_pct', 'body_fat_pct'),
                                   ('waist_cm', 'waist_cm'),
                                   ('hip_cm', 'hip_cm'),
                                   ('muscle_mass_kg', 'muscle_mass_kg')]:
                    v = row.get(col, '').strip()
                    if v:
                        try:
                            kwargs[field] = Decimal(v)
                        except (InvalidOperation, ValueError):
                            pass

                WeightReading.objects.create(**kwargs)
                created += 1
            except (InvalidOperation, ValueError, KeyError) as e:
                errors.append(f'Line {i}: {e}')

        return Response({'created': created, 'skipped': skipped, 'errors': errors})


# ── Insights list ─────────────────────────────────────────────────────

class VitalsInsightsListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile_id = _require_profile(request)
        if isinstance(profile_id, Response):
            return profile_id
        qs = (VitalsInsight.objects
              .filter(user=request.user, profile_id=profile_id,
                      superseded_by__isnull=True)
              .order_by('-computed_at'))
        itype = request.query_params.get('type')
        if itype:
            qs = qs.filter(insight_type=itype)
        return Response(VitalsInsightSerializer(qs, many=True).data)


# ── helper ────────────────────────────────────────────────────────────

def _require_profile(request):
    """Return profile_id int, or a Response(400) if missing/invalid."""
    p = request.query_params.get('profile')
    if not p:
        return Response({'detail': 'profile query param required'}, status=400)
    try:
        return int(p)
    except ValueError:
        return Response({'detail': 'profile must be int'}, status=400)
