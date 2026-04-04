# ── health/bp_views.py ────────────────────────────────────────────────
# REST API views for blood pressure tracking.
#
# §NAV: bp_models → bp_serializers → [bp_views] → bp_urls → bp_services
# §AUTH: All views require JWT auth. Data scoped by request.user.
# §PERF: select_related/prefetch_related on all querysets.

import csv
import io
from datetime import timedelta

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, mixins, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .bp_models import BPReading, BPSession, BPMedication, BPMedLog, BPAlert
from .bp_serializers import (
    BPReadingSerializer, BPReadingCreateSerializer,
    BPSessionListSerializer, BPSessionDetailSerializer, BPSessionCreateSerializer,
    BPMedicationSerializer,
    BPMedLogSerializer,
    BPAlertSerializer,
    BPExportSerializer,
)
from .bp_services import (
    classify_bp, check_alerts, compute_session_averages,
    get_bp_statistics, detect_circadian_pattern,
    detect_white_coat, detect_masked_hypertension,
    get_context_correlations, compute_cardiovascular_risk,
    get_medication_effectiveness, get_trend_projection,
    generate_bp_recommendations,
)
from .models import HealthProfile


# ── BP Reading CRUD ─────────────────────────────────────────────────

class BPReadingViewSet(viewsets.ModelViewSet):
    """
    §READING: CRUD for individual blood pressure readings.
    On create: classifies BP stage, runs alert checks.

    Filters:
    - ?profile=<id>: Filter by health profile
    - ?session=<id>: Filter by session
    - ?days=<N>: Filter to last N days (default: all)
    - ?stage=<stage>: Filter by AHA stage
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return BPReadingCreateSerializer
        return BPReadingSerializer

    def get_queryset(self):
        qs = (
            BPReading.objects
            .filter(user=self.request.user)
            .select_related('profile', 'session')
        )

        # §FILTER: By profile
        profile_id = self.request.query_params.get('profile')
        if profile_id:
            qs = qs.filter(profile_id=profile_id)

        # §FILTER: By session
        session_id = self.request.query_params.get('session')
        if session_id:
            qs = qs.filter(session_id=session_id)

        # §FILTER: By time window
        days = self.request.query_params.get('days')
        if days:
            try:
                cutoff = timezone.now() - timedelta(days=int(days))
                qs = qs.filter(measured_at__gte=cutoff)
            except (ValueError, TypeError):
                pass

        # §FILTER: By AHA stage (post-filter since stage is computed)
        stage = self.request.query_params.get('stage')
        if stage:
            # We need to filter in Python since stage is a computed property
            ids = [r.id for r in qs if classify_bp(r.systolic, r.diastolic) == stage]
            qs = qs.filter(id__in=ids)

        return qs

    def perform_create(self, serializer):
        """§CREATE: Save reading, then run alert checks."""
        reading = serializer.save(user=self.request.user)
        alerts = check_alerts(reading)
        # Stash alerts on the instance for the response
        reading._alerts = alerts

    def create(self, request, *args, **kwargs):
        """§RESPONSE: Override to include triggered alerts in response."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        reading = BPReading.objects.select_related('profile', 'session').get(
            id=serializer.instance.id
        )
        response_data = BPReadingSerializer(reading).data
        alerts = getattr(serializer.instance, '_alerts', [])
        if alerts:
            response_data['triggered_alerts'] = BPAlertSerializer(alerts, many=True).data
        return Response(response_data, status=status.HTTP_201_CREATED)


# ── BP Session CRUD ─────────────────────────────────────────────────

class BPSessionViewSet(viewsets.ModelViewSet):
    """
    §SESSION: CRUD for BP sessions (grouped readings).
    Create: accepts nested readings, computes averages, checks alerts.

    Filters:
    - ?profile=<id>: Filter by health profile
    - ?days=<N>: Filter to last N days
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'create':
            return BPSessionCreateSerializer
        if self.action == 'list':
            return BPSessionListSerializer
        return BPSessionDetailSerializer

    def get_queryset(self):
        qs = (
            BPSession.objects
            .filter(user=self.request.user)
            .select_related('profile')
            .prefetch_related('readings')
        )

        profile_id = self.request.query_params.get('profile')
        if profile_id:
            qs = qs.filter(profile_id=profile_id)

        days = self.request.query_params.get('days')
        if days:
            try:
                cutoff = timezone.now() - timedelta(days=int(days))
                qs = qs.filter(measured_at__gte=cutoff)
            except (ValueError, TypeError):
                pass

        return qs

    def create(self, request, *args, **kwargs):
        """§RESPONSE: Create session with nested readings and return detail view."""
        serializer = BPSessionCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        session = serializer.save()

        # Refresh and return full detail
        session = BPSession.objects.select_related('profile').prefetch_related('readings').get(id=session.id)
        response_data = BPSessionDetailSerializer(session).data

        # Include any triggered alerts
        alerts = getattr(serializer.instance, '_alerts', [])
        if alerts:
            response_data['triggered_alerts'] = BPAlertSerializer(alerts, many=True).data

        return Response(response_data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def recalculate(self, request, pk=None):
        """§RECALC: Recalculate session averages (e.g., after editing a reading)."""
        session = self.get_object()
        compute_session_averages(session)
        session.refresh_from_db()
        serializer = BPSessionDetailSerializer(session)
        return Response(serializer.data)


# ── BP Medication CRUD ──────────────────────────────────────────────

class BPMedicationViewSet(viewsets.ModelViewSet):
    """
    §MED: CRUD for tracked BP medications.
    Filters: ?profile=<id>, ?active=true/false
    """
    serializer_class = BPMedicationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = (
            BPMedication.objects
            .filter(user=self.request.user)
            .select_related('profile')
            .prefetch_related('logs')
        )

        profile_id = self.request.query_params.get('profile')
        if profile_id:
            qs = qs.filter(profile_id=profile_id)

        active = self.request.query_params.get('active')
        if active is not None:
            qs = qs.filter(is_active=(active.lower() == 'true'))

        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# ── BP Med Log CRUD ─────────────────────────────────────────────────

class BPMedLogViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    §ADHERE: List/create/update medication adherence logs.
    Filters: ?medication=<id>, ?date_from=, ?date_to=
    """
    serializer_class = BPMedLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = (
            BPMedLog.objects
            .filter(medication__user=self.request.user)
            .select_related('medication')
        )

        medication_id = self.request.query_params.get('medication')
        if medication_id:
            qs = qs.filter(medication_id=medication_id)

        date_from = self.request.query_params.get('date_from')
        if date_from:
            qs = qs.filter(date__gte=date_from)

        date_to = self.request.query_params.get('date_to')
        if date_to:
            qs = qs.filter(date__lte=date_to)

        return qs


# ── BP Alert list/read ──────────────────────────────────────────────

class BPAlertViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    §ALERT: List and manage BP alerts.
    Filters: ?profile=<id>, ?read=true/false, ?severity=<level>, ?type=<alert_type>
    Actions: mark-read (PATCH), mark-all-read (POST)
    """
    serializer_class = BPAlertSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = (
            BPAlert.objects
            .filter(user=self.request.user)
            .select_related('profile', 'related_reading')
        )

        profile_id = self.request.query_params.get('profile')
        if profile_id:
            qs = qs.filter(profile_id=profile_id)

        read_filter = self.request.query_params.get('read')
        if read_filter is not None:
            qs = qs.filter(is_read=(read_filter.lower() == 'true'))

        severity = self.request.query_params.get('severity')
        if severity:
            qs = qs.filter(severity=severity)

        alert_type = self.request.query_params.get('type')
        if alert_type:
            qs = qs.filter(alert_type=alert_type)

        return qs

    @action(detail=True, methods=['patch'])
    def mark_read(self, request, pk=None):
        """§READ: Mark a single alert as read."""
        alert = self.get_object()
        alert.is_read = True
        alert.save(update_fields=['is_read'])
        return Response(BPAlertSerializer(alert).data)

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """§READ_ALL: Mark all unread alerts as read for the user."""
        profile_id = request.data.get('profile')
        qs = BPAlert.objects.filter(user=request.user, is_read=False)
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        count = qs.update(is_read=True)
        return Response({'marked_read': count})


# ── BP Dashboard ────────────────────────────────────────────────────

class BPDashboardView(APIView):
    """
    §DASH: Aggregated BP dashboard for a profile.
    Returns latest reading, 7d/30d averages, staging, recent readings, active meds.

    GET /api/health/bp/dashboard/?profile=<id>
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile_id = request.query_params.get('profile')
        profiles = HealthProfile.objects.filter(user=request.user)

        if not profiles.exists():
            return Response({'profiles': [], 'has_data': False})

        if profile_id:
            try:
                profile = profiles.get(id=profile_id)
            except HealthProfile.DoesNotExist:
                return Response({'error': 'Profile not found'}, status=404)
        else:
            profile = profiles.filter(is_primary=True).first() or profiles.first()

        # §LATEST: Most recent reading
        latest = (
            BPReading.objects
            .filter(profile=profile)
            .select_related('profile', 'session')
            .order_by('-measured_at')
            .first()
        )

        if not latest:
            return Response({
                'profile': {'id': profile.id, 'full_name': profile.full_name},
                'has_data': False,
            })

        # §7D: 7-day averages
        stats_7d = get_bp_statistics(profile, days=7)
        avg_7d = None
        if stats_7d['avg_sys'] is not None:
            avg_7d = {
                'systolic': stats_7d['avg_sys'],
                'diastolic': stats_7d['avg_dia'],
                'pulse': stats_7d['avg_pulse'],
                'reading_count': stats_7d['reading_count'],
                'stage': classify_bp(round(stats_7d['avg_sys']), round(stats_7d['avg_dia'])),
            }

        # §30D: 30-day averages
        stats_30d = get_bp_statistics(profile, days=30)
        avg_30d = None
        if stats_30d['avg_sys'] is not None:
            avg_30d = {
                'systolic': stats_30d['avg_sys'],
                'diastolic': stats_30d['avg_dia'],
                'pulse': stats_30d['avg_pulse'],
                'reading_count': stats_30d['reading_count'],
                'stage': classify_bp(round(stats_30d['avg_sys']), round(stats_30d['avg_dia'])),
            }

        # §CURRENT: Current stage from 30d average (or latest reading if insufficient data)
        if stats_30d['reading_count'] >= 5:
            current_stage = classify_bp(round(stats_30d['avg_sys']), round(stats_30d['avg_dia']))
        else:
            current_stage = classify_bp(latest.systolic, latest.diastolic)

        # §RECENT: Last 10 readings
        recent_readings = (
            BPReading.objects
            .filter(profile=profile)
            .select_related('profile', 'session')
            .order_by('-measured_at')[:10]
        )

        # §MEDS: Active medications
        active_meds = (
            BPMedication.objects
            .filter(profile=profile, is_active=True)
            .select_related('profile')
            .prefetch_related('logs')
        )

        # §ALERTS: Unread alert count
        unread_count = BPAlert.objects.filter(
            profile=profile, is_read=False,
        ).count()

        # §TREND: Trend direction
        trend = get_trend_projection(profile, days=30)

        return Response({
            'profile': {'id': profile.id, 'full_name': profile.full_name},
            'has_data': True,
            'latest_reading': BPReadingSerializer(latest).data,
            'avg_7d': avg_7d,
            'avg_30d': avg_30d,
            'current_stage': current_stage,
            'recent_readings': BPReadingSerializer(recent_readings, many=True).data,
            'active_medications': BPMedicationSerializer(active_meds, many=True).data,
            'unread_alerts': unread_count,
            'reading_count_30d': stats_30d['reading_count'],
            'trend': trend,
        })


# ── Deep statistics ─────────────────────────────────────────────────

class BPStatisticsView(APIView):
    """
    §STATS: Comprehensive BP statistics with circadian patterns,
    white coat detection, masked hypertension, context correlations,
    trend projection, and personalized recommendations.

    GET /api/health/bp/statistics/?profile=<id>&days=<N>
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile_id = request.query_params.get('profile')
        if not profile_id:
            return Response({'error': 'profile parameter required'}, status=400)

        try:
            profile = HealthProfile.objects.get(id=profile_id, user=request.user)
        except HealthProfile.DoesNotExist:
            return Response({'error': 'Profile not found'}, status=404)

        days = int(request.query_params.get('days', 30))

        statistics = get_bp_statistics(profile, days=days)
        circadian = detect_circadian_pattern(profile, days=days)
        white_coat = detect_white_coat(profile)
        masked = detect_masked_hypertension(profile)
        correlations = get_context_correlations(profile)
        projection = get_trend_projection(profile, days=days)
        recommendations = generate_bp_recommendations(profile)

        return Response({
            'profile': {'id': profile.id, 'full_name': profile.full_name},
            'days': days,
            'statistics': statistics,
            'circadian': circadian,
            'white_coat': white_coat,
            'masked_hypertension': masked,
            'context_correlations': correlations,
            'trend_projection': projection,
            'recommendations': recommendations,
        })


# ── Cardiovascular risk ─────────────────────────────────────────────

class CardiovascularRiskView(APIView):
    """
    §CVR: Combined cardiovascular risk assessment using BP data + blood biomarkers.

    GET /api/health/bp/cardiovascular-risk/?profile=<id>
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile_id = request.query_params.get('profile')
        if not profile_id:
            return Response({'error': 'profile parameter required'}, status=400)

        try:
            profile = HealthProfile.objects.get(id=profile_id, user=request.user)
        except HealthProfile.DoesNotExist:
            return Response({'error': 'Profile not found'}, status=404)

        risk = compute_cardiovascular_risk(profile)
        return Response(risk)


# ── Medication effectiveness ────────────────────────────────────────

class MedicationEffectivenessView(APIView):
    """
    §MEDEFF: Compare BP before vs after starting a medication.

    GET /api/health/bp/medication-effectiveness/?medication=<id>
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        medication_id = request.query_params.get('medication')
        if not medication_id:
            return Response({'error': 'medication parameter required'}, status=400)

        try:
            medication = BPMedication.objects.get(id=medication_id, user=request.user)
        except BPMedication.DoesNotExist:
            return Response({'error': 'Medication not found'}, status=404)

        effectiveness = get_medication_effectiveness(medication)
        return Response(effectiveness)


# ── Export (CSV/PDF) ────────────────────────────────────────────────

class BPExportView(APIView):
    """
    §EXPORT: Export BP data as CSV or PDF.

    GET /api/health/bp/export/?profile=<id>&format=csv&date_from=&date_to=&include_sessions=true&include_medications=false
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Validate params
        serializer = BPExportSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        profile = data['profile']
        if profile.user != request.user:
            return Response({'error': 'Profile does not belong to you.'}, status=403)

        export_format = data.get('format', 'csv')
        date_from = data.get('date_from')
        date_to = data.get('date_to')

        # §QUERY: Get readings
        readings = BPReading.objects.filter(
            profile=profile,
        ).select_related('session').order_by('measured_at')

        if date_from:
            readings = readings.filter(measured_at__date__gte=date_from)
        if date_to:
            readings = readings.filter(measured_at__date__lte=date_to)

        if export_format == 'csv':
            return self._export_csv(readings, profile, data)
        else:
            return self._export_pdf(readings, profile, data)

    def _export_csv(self, readings, profile, params):
        """§CSV: Generate CSV file of BP readings."""
        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow([
            'Date/Time', 'Systolic (mmHg)', 'Diastolic (mmHg)', 'Pulse (BPM)',
            'Stage', 'Pulse Pressure', 'MAP',
            'Arm', 'Posture', 'Session ID',
            'Caffeine', 'Exercise', 'Medication', 'Stressed', 'Clinic', 'Fasting',
            'Notes',
        ])

        # Data rows
        for r in readings:
            stage = classify_bp(r.systolic, r.diastolic)
            pp = r.systolic - r.diastolic
            from .bp_services import compute_map
            map_val = compute_map(r.systolic, r.diastolic)

            writer.writerow([
                r.measured_at.strftime('%Y-%m-%d %H:%M'),
                r.systolic, r.diastolic, r.pulse or '',
                stage, pp, map_val,
                r.arm, r.posture, r.session_id or '',
                'Yes' if r.is_after_caffeine else '',
                'Yes' if r.is_after_exercise else '',
                'Yes' if r.is_after_medication else '',
                'Yes' if r.is_stressed else '',
                'Yes' if r.is_clinic_reading else '',
                'Yes' if r.is_fasting else '',
                r.notes,
            ])

        # §MEDS: Optionally include medications sheet
        if params.get('include_medications'):
            writer.writerow([])
            writer.writerow(['--- Medications ---'])
            writer.writerow(['Name', 'Dose', 'Frequency', 'Started', 'Ended', 'Active'])
            meds = BPMedication.objects.filter(profile=profile)
            for m in meds:
                writer.writerow([
                    m.name, m.dose, m.frequency,
                    m.started_at.isoformat(), m.ended_at.isoformat() if m.ended_at else '',
                    'Yes' if m.is_active else 'No',
                ])

        response = HttpResponse(output.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = (
            f'attachment; filename="bp_readings_{profile.full_name}_{timezone.now():%Y%m%d}.csv"'
        )
        return response

    def _export_pdf(self, readings, profile, params):
        """
        §PDF: Generate PDF report of BP readings.
        Returns a simple text-based report if reportlab is not available.
        """
        # Build a plain-text PDF-like report as fallback
        lines = []
        lines.append(f'Blood Pressure Report — {profile.full_name}')
        lines.append(f'Generated: {timezone.now():%Y-%m-%d %H:%M}')
        lines.append('')

        # Summary stats
        from .bp_services import get_bp_statistics
        stats = get_bp_statistics(profile, days=90)
        if stats['reading_count'] > 0:
            lines.append(f'Readings (90 days): {stats["reading_count"]}')
            lines.append(f'Average: {stats["avg_sys"]:.0f}/{stats["avg_dia"]:.0f} mmHg')
            lines.append(f'Range: {stats["min_sys"]}-{stats["max_sys"]}/{stats["min_dia"]}-{stats["max_dia"]} mmHg')
            if stats['avg_pulse']:
                lines.append(f'Average Pulse: {stats["avg_pulse"]:.0f} BPM')
            lines.append('')

        lines.append('Date/Time | Systolic | Diastolic | Pulse | Stage')
        lines.append('-' * 60)
        for r in readings:
            stage = classify_bp(r.systolic, r.diastolic)
            pulse_str = str(r.pulse) if r.pulse else '-'
            lines.append(
                f'{r.measured_at:%Y-%m-%d %H:%M} | {r.systolic} | {r.diastolic} | {pulse_str} | {stage}'
            )

        content = '\n'.join(lines)
        response = HttpResponse(content, content_type='text/plain')
        response['Content-Disposition'] = (
            f'attachment; filename="bp_report_{profile.full_name}_{timezone.now():%Y%m%d}.txt"'
        )
        return response
