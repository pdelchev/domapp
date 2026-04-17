"""
REST API views for the unified Health Hub daily tracking.

§NAV: daily_models.py → daily_services.py → daily_serializers.py → daily_views.py → daily_urls.py
§SECURITY: All views filter by request.user. No cross-user data access.
§PERF: List views use select_related/prefetch_related. Detail views return cached data.
"""

from datetime import date

from rest_framework import viewsets, generics, status, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .daily_models import DailyLog, Supplement, SupplementSchedule, DoseLog, MetricTimeline, EmergencyCard, Symptom, WeatherSnapshot, CaregiverRelationship, MedicationReminder, ReminderLog
from .daily_serializers import (
    DailyLogSerializer, WizardSubmitSerializer,
    SupplementListSerializer, SupplementDetailSerializer, SupplementCreateSerializer,
    SupplementScheduleSerializer,
    DoseLogSerializer, BatchDoseSerializer,
    MetricTimelineSerializer, TimelineQuerySerializer,
    EmergencyCardSerializer,
    SymptomSerializer,
    WeatherSnapshotSerializer,
    CaregiverRelationshipSerializer, CaregiverInviteListSerializer,
    MedicationReminderSerializer, MedicationReminderListSerializer, ReminderLogSerializer,
)
from .daily_services import (
    get_or_create_daily_log, submit_wizard,
    get_todays_schedule, get_streak, get_timeline,
    get_health_summary, get_low_stock_supplements,
    check_interactions, get_supplement_effectiveness,
    _batch_log_doses,
)
from .models import HealthProfile


# ──────────────────────────────────────────────────────────────
# §PERM: Health data ownership permission
# ──────────────────────────────────────────────────────────────

class IsHealthDataOwner(permissions.BasePermission):
    """
    §SECURITY: Ensures the requesting user owns the health data.
    Walks up the FK chain to find the owning user.
    Applied to all health viewsets.
    """
    def has_object_permission(self, request, view, obj):
        if hasattr(obj, 'user_id'):
            return obj.user_id == request.user.id
        if hasattr(obj, 'profile'):
            return obj.profile.user_id == request.user.id
        if hasattr(obj, 'schedule'):
            return obj.schedule.supplement.user_id == request.user.id
        return False


def _get_profile(request, profile_id=None):
    """
    §HELPER: Get profile from request, validating ownership.
    Falls back to primary profile if no ID given.
    """
    if profile_id:
        return HealthProfile.objects.filter(id=profile_id, user=request.user).first()
    return HealthProfile.objects.filter(user=request.user, is_primary=True).first()


# ──────────────────────────────────────────────────────────────
# §VIEW: DailyLog CRUD
# ──────────────────────────────────────────────────────────────

class DailyLogViewSet(viewsets.ModelViewSet):
    """
    §API: /api/health/daily-log/
    GET — list logs (paginated, filterable by date range)
    POST — create/get today's log
    GET /<date>/ — get specific day
    PATCH /<date>/ — update specific day
    """
    serializer_class = DailyLogSerializer
    permission_classes = [permissions.IsAuthenticated, IsHealthDataOwner]
    lookup_field = 'date'

    def get_queryset(self):
        # §ISOLATION: Only this user's data
        return DailyLog.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# ──────────────────────────────────────────────────────────────
# §VIEW: Wizard submit (the main entry point)
# ──────────────────────────────────────────────────────────────

class WizardSubmitView(generics.CreateAPIView):
    """
    §API: POST /api/health/daily-log/wizard/
    §PURPOSE: Single endpoint for the daily check-in wizard.
    Accepts all wizard data in one request, processes in one transaction.
    §PERF: 1 HTTP request replaces 3-5 separate API calls.
    """
    serializer_class = WizardSubmitSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        profile = _get_profile(request, serializer.validated_data['profile_id'])
        if not profile:
            return Response(
                {'error': 'Profile not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        result = submit_wizard(
            user=request.user,
            profile=profile,
            data=serializer.validated_data,
        )

        return Response({
            'status': 'ok',
            'date': result['daily_log'].date.isoformat(),
            'wizard_completed': True,
            'doses_logged': result['doses_logged'],
            'has_weight': result['weight_reading'] is not None,
            'has_bp': result['bp_reading'] is not None,
        }, status=status.HTTP_201_CREATED)


# ──────────────────────────────────────────────────────────────
# §VIEW: Supplement catalog CRUD
# ──────────────────────────────────────────────────────────────

class SupplementViewSet(viewsets.ModelViewSet):
    """
    §API: /api/health/supplements/
    Full CRUD for the user's supplement/medication catalog.
    §PHOTO: Use multipart upload for photo and photo_closeup fields.
    """
    permission_classes = [permissions.IsAuthenticated, IsHealthDataOwner]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = Supplement.objects.filter(user=self.request.user)
        # §FILTER: ?active=true, ?category=vitamin
        active = self.request.query_params.get('active')
        if active == 'true':
            qs = qs.filter(is_active=True)
        elif active == 'false':
            qs = qs.filter(is_active=False)
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return SupplementListSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return SupplementCreateSerializer
        return SupplementDetailSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'], url_path='photo')
    def upload_photo(self, request, pk=None):
        """§API: POST /api/health/supplements/<id>/photo/"""
        supplement = self.get_object()
        photo = request.FILES.get('photo')
        closeup = request.FILES.get('closeup')
        if photo:
            supplement.photo = photo
        if closeup:
            supplement.photo_closeup = closeup
        supplement.save(update_fields=['photo', 'photo_closeup', 'updated_at'])
        return Response({'status': 'ok'})

    @action(detail=False, methods=['get'], url_path='cost-report')
    def cost_report(self, request):
        """
        §API: GET /api/health/supplements/cost-report/
        Aggregated supplement cost analytics for the authenticated user.

        Returns monthly + annual totals (across all currencies present),
        per-supplement breakdown, and per-category rollups for active items
        that have both cost and pack_size set.
        """
        from collections import defaultdict

        items = (
            Supplement.objects
            .filter(user=request.user, is_active=True)
            .prefetch_related('schedules')
        )

        per_currency_monthly = defaultdict(float)
        per_category = defaultdict(lambda: {'monthly': 0.0, 'count': 0})
        per_supplement = []
        missing_cost = []

        for s in items:
            monthly = s.monthly_cost
            if monthly is None:
                # Track items the user could fill in to improve coverage
                if s.schedules.filter(is_active=True).exists():
                    missing_cost.append({'id': s.id, 'name': s.name})
                continue

            per_currency_monthly[s.currency] += monthly
            per_category[s.category]['monthly'] += monthly
            per_category[s.category]['count'] += 1
            per_supplement.append({
                'id': s.id,
                'name': s.name,
                'category': s.category,
                'cost_per_unit': round(s.cost_per_unit, 4) if s.cost_per_unit else None,
                'monthly_cost': monthly,
                'annual_cost': round(monthly * 12, 2),
                'currency': s.currency,
                'last_purchased': s.purchase_date.isoformat() if s.purchase_date else None,
            })

        per_supplement.sort(key=lambda x: x['monthly_cost'], reverse=True)

        totals = [
            {
                'currency': cur,
                'monthly': round(amt, 2),
                'annual': round(amt * 12, 2),
            }
            for cur, amt in sorted(per_currency_monthly.items())
        ]

        categories = [
            {
                'category': cat,
                'monthly': round(data['monthly'], 2),
                'annual': round(data['monthly'] * 12, 2),
                'count': data['count'],
            }
            for cat, data in sorted(per_category.items(), key=lambda x: -x[1]['monthly'])
        ]

        return Response({
            'totals': totals,
            'by_category': categories,
            'by_supplement': per_supplement,
            'missing_cost': missing_cost,
            'tracked_count': len(per_supplement),
        })

    @action(detail=True, methods=['get'], url_path='effectiveness')
    def effectiveness(self, request, pk=None):
        """
        §API: GET /api/health/supplements/<id>/effectiveness/
        §CLOSED-LOOP: Before/after biomarker comparison since starting supplement.
        """
        profile = _get_profile(request, request.query_params.get('profile'))
        if not profile:
            return Response({'error': 'Profile not found.'}, status=404)
        result = get_supplement_effectiveness(request.user, profile, pk)
        if result is None:
            return Response({'message': 'Insufficient data for comparison.'})
        return Response(result)

    @action(detail=True, methods=['get'], url_path='suggest-timing')
    def suggest_timing(self, request, pk=None):
        """
        §API: GET /api/health/supplements/<id>/suggest-timing/
        Rule-based chronobiology suggestion for this supplement's optimal dosing time.
        """
        from .circadian import suggest_timing as suggest_fn

        supplement = self.get_object()
        return Response(suggest_fn(
            name=supplement.name,
            category=supplement.category,
            form=supplement.form,
        ))


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def fasting_current_view(request):
    """
    §API: GET /api/health/fasting/current/?profile=<id>
    Return the active fasting session with annotated schedule, or null.
    """
    from .fasting import get_active_fast, annotate_schedule_for_fast

    profile = _get_profile(request, request.query_params.get('profile'))
    if not profile:
        return Response({'error': 'No profile found.'}, status=404)
    active = get_active_fast(request.user, profile)
    schedule = get_todays_schedule(request.user, profile)
    payload = annotate_schedule_for_fast(schedule, active)
    return Response(payload)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def fasting_start_view(request):
    """
    §API: POST /api/health/fasting/start/
    Body: {profile, protocol?, hours?, ends_at?, notes?}
    """
    from .fasting import start_fast
    from django.utils.dateparse import parse_datetime

    profile = _get_profile(request, request.data.get('profile'))
    if not profile:
        return Response({'error': 'No profile found.'}, status=404)

    ends_at_raw = request.data.get('ends_at')
    ends_at = parse_datetime(ends_at_raw) if ends_at_raw else None

    session = start_fast(
        user=request.user,
        profile=profile,
        protocol=request.data.get('protocol', '16_8'),
        hours=request.data.get('hours'),
        ends_at=ends_at,
        notes=request.data.get('notes', ''),
    )
    return Response({
        'id': session.id,
        'protocol': session.protocol,
        'starts_at': session.starts_at.isoformat(),
        'ends_at': session.ends_at.isoformat() if session.ends_at else None,
    }, status=201)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def fasting_end_view(request):
    """
    §API: POST /api/health/fasting/end/
    Body: {profile}
    """
    from .fasting import end_fast

    profile = _get_profile(request, request.data.get('profile'))
    if not profile:
        return Response({'error': 'No profile found.'}, status=404)
    session = end_fast(request.user, profile)
    if not session:
        return Response({'message': 'No active fast'}, status=200)
    return Response({
        'id': session.id,
        'ended_at': session.ended_early_at.isoformat(),
    })


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def circadian_suggest_view(request):
    """
    §API: POST /api/health/circadian/suggest/
    Stateless timing suggestion for an unsaved supplement.
    Body: {name, category, form, take_with_food?, take_on_empty_stomach?}
    """
    from .circadian import suggest_timing as suggest_fn

    data = request.data or {}
    return Response(suggest_fn(
        name=data.get('name', ''),
        category=data.get('category', ''),
        form=data.get('form', ''),
        take_with_food=data.get('take_with_food'),
        take_on_empty_stomach=data.get('take_on_empty_stomach'),
    ))


# ──────────────────────────────────────────────────────────────
# §VIEW: Schedule CRUD
# ──────────────────────────────────────────────────────────────

class ScheduleViewSet(viewsets.ModelViewSet):
    """
    §API: /api/health/schedules/
    Manage when and how to take supplements.
    """
    serializer_class = SupplementScheduleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return SupplementSchedule.objects.filter(
            supplement__user=self.request.user
        ).select_related('supplement', 'profile')

    @action(detail=False, methods=['get'], url_path='today')
    def today(self, request):
        """
        §API: GET /api/health/schedules/today/
        §PURPOSE: Today's full schedule with dose completion status.
        This is what the supplement section of the dashboard shows.
        """
        profile = _get_profile(request, request.query_params.get('profile'))
        if not profile:
            return Response({'error': 'Profile not found.'}, status=404)
        schedule = get_todays_schedule(request.user, profile)
        return Response(schedule)


# ──────────────────────────────────────────────────────────────
# §VIEW: Dose logging
# ──────────────────────────────────────────────────────────────

class DoseLogView(generics.ListCreateAPIView):
    """
    §API: GET/POST /api/health/doses/
    GET: Retrieve dose logs for a specific date (?date=YYYY-MM-DD)
    POST: Log a single dose taken/skipped.
    """
    serializer_class = DoseLogSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Filter by date from query param
        query_date = self.request.query_params.get('date')
        qs = DoseLog.objects.filter(
            schedule__supplement__user=self.request.user
        ).select_related('schedule', 'schedule__supplement')

        if query_date:
            qs = qs.filter(date=query_date)

        return qs.order_by('-date', 'schedule__supplement__name')

    def perform_create(self, serializer):
        # §SECURITY: Validate schedule ownership
        schedule = serializer.validated_data['schedule']
        if schedule.supplement.user_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Not your schedule.')
        serializer.save()


class BatchDoseView(generics.CreateAPIView):
    """
    §API: POST /api/health/doses/batch/
    §PURPOSE: Log multiple doses at once (wizard step 5 or "Mark All" button).
    """
    serializer_class = BatchDoseSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        profile = _get_profile(request, request.data.get('profile_id'))
        if not profile:
            return Response({'error': 'Profile not found.'}, status=404)

        log_date = serializer.validated_data.get('date', date.today())
        count = _batch_log_doses(
            request.user, profile, log_date,
            serializer.validated_data['doses']
        )
        return Response({'logged': count}, status=status.HTTP_201_CREATED)


# ──────────────────────────────────────────────────────────────
# §VIEW: Timeline (the unified history page)
# ──────────────────────────────────────────────────────────────

class TimelineView(generics.ListAPIView):
    """
    §API: GET /api/health/timeline/
    §PURPOSE: Single endpoint for the unified history page.
    Returns all metrics across all types, ordered by date.
    §PERF: Reads from denormalized MetricTimeline table — one query.

    Query params:
      ?profile=<id>
      ?date_from=2024-01-01
      ?date_to=2026-04-09
      ?metrics=weight,bp_systolic,mood (comma-separated)
    """
    serializer_class = MetricTimelineSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = MetricTimeline.objects.filter(user=self.request.user)

        profile = _get_profile(
            self.request, self.request.query_params.get('profile')
        )
        if profile:
            qs = qs.filter(profile=profile)

        date_from = self.request.query_params.get('date_from')
        if date_from:
            qs = qs.filter(date__gte=date_from)

        date_to = self.request.query_params.get('date_to')
        if date_to:
            qs = qs.filter(date__lte=date_to)

        metrics = self.request.query_params.get('metrics')
        if metrics:
            qs = qs.filter(metric_type__in=metrics.split(','))

        return qs.order_by('date', 'metric_type')


# ──────────────────────────────────────────────────────────────
# §VIEW: Unified health summary
# ──────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def health_summary_view(request):
    """
    §API: GET /api/health/summary/
    §PURPOSE: Single endpoint for the Health Hub dashboard.
    Returns current state of all metrics + today's schedule + streak.
    """
    profile = _get_profile(request, request.query_params.get('profile'))
    if not profile:
        return Response({'error': 'No profile found.'}, status=404)
    summary = get_health_summary(request.user, profile)
    return Response(summary)


# ──────────────────────────────────────────────────────────────
# §VIEW: Streak
# ──────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def gamification_view(request):
    """
    §API: GET /api/health/gamification/?profile=<id>
    Returns badges, current weekly challenge with progress, and any
    new badges unlocked since the last poll (for celebratory toast).
    """
    from .gamification import compute_gamification, mark_unlocks_seen

    profile = _get_profile(request, request.query_params.get('profile'))
    if not profile:
        return Response({'error': 'No profile found.'}, status=404)
    return Response(compute_gamification(request.user, profile))


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def gamification_seen_view(request):
    """
    §API: POST /api/health/gamification/seen/
    Body: {codes: ['streak_7', ...]} — marks toast-shown badges as seen.
    """
    from .gamification import mark_unlocks_seen

    codes = request.data.get('codes', [])
    if not isinstance(codes, list):
        return Response({'error': 'codes must be a list'}, status=400)
    updated = mark_unlocks_seen(request.user, codes)
    return Response({'marked': updated})


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def streak_view(request):
    """§API: GET /api/health/daily-log/streak/"""
    profile = _get_profile(request, request.query_params.get('profile'))
    if not profile:
        return Response({'error': 'No profile found.'}, status=404)
    return Response(get_streak(request.user, profile))


# ──────────────────────────────────────────────────────────────
# §VIEW: Stock alerts
# ──────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def low_stock_view(request):
    """§API: GET /api/health/supplements/low-stock/"""
    return Response(get_low_stock_supplements(request.user))


# ──────────────────────────────────────────────────────────────
# §VIEW: Interaction checker
# ──────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def interactions_view(request):
    """§API: GET /api/health/supplements/interactions/"""
    return Response(check_interactions(request.user))


# ──────────────────────────────────────────────────────────────
# §VIEW: Emergency Card (offline-accessible medical info)
# ──────────────────────────────────────────────────────────────

class EmergencyCardView(generics.RetrieveUpdateAPIView):
    """
    §API: GET/PUT/PATCH /api/health/emergency-card/?profile=<id>
    Returns or updates the EmergencyCard for the given (or primary) profile.
    Auto-creates a blank card on first GET.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = EmergencyCardSerializer

    def get_object(self):
        profile_id = self.request.query_params.get('profile') or self.request.data.get('profile')
        qs = HealthProfile.objects.filter(user=self.request.user)
        profile = (
            qs.filter(id=profile_id).first() if profile_id
            else qs.filter(is_primary=True).first() or qs.first()
        )
        if not profile:
            from rest_framework.exceptions import NotFound
            raise NotFound('No health profile exists yet.')
        card, _ = EmergencyCard.objects.get_or_create(profile=profile)
        return card


# ──────────────────────────────────────────────────────────────
# §VIEW: Symptom tracker + correlations
# ──────────────────────────────────────────────────────────────

class SymptomViewSet(viewsets.ModelViewSet):
    """
    §API: /api/health/symptoms/
    CRUD over user's symptom log entries. Filters:
      - ?profile=<id>
      - ?category=<str>
      - ?days=<int> (last N days)
    """
    serializer_class = SymptomSerializer
    permission_classes = [permissions.IsAuthenticated, IsHealthDataOwner]

    def get_queryset(self):
        from datetime import date as _date, timedelta as _td
        qs = Symptom.objects.filter(user=self.request.user)
        profile_id = self.request.query_params.get('profile')
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)
        days = self.request.query_params.get('days')
        if days:
            try:
                cutoff = _date.today() - _td(days=int(days))
                qs = qs.filter(occurred_at__date__gte=cutoff)
            except ValueError:
                pass
        return qs.select_related('profile')

    def perform_create(self, serializer):
        from django.utils import timezone as _tz
        profile = serializer.validated_data['profile']
        if profile.user_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Profile not owned by user.')
        if 'occurred_at' not in serializer.validated_data:
            serializer.save(user=self.request.user, occurred_at=_tz.now())
        else:
            serializer.save(user=self.request.user)

    @action(detail=False, methods=['get'], url_path='correlations')
    def correlations(self, request):
        """
        §API: GET /api/health/symptoms/correlations/?profile=<id>&days=90
        Run the correlation engine over logged symptoms and return
        per-category findings (hypothesis-generating, not causal).
        """
        from .symptom_correlations import analyze

        profile = _get_profile(request, request.query_params.get('profile'))
        if not profile:
            return Response({'error': 'No profile found.'}, status=404)
        days = int(request.query_params.get('days', 90))
        return Response(analyze(request.user, profile, days=days))


# ──────────────────────────────────────────────────────────────
# §VIEW: Weather snapshots for correlation analysis
# ──────────────────────────────────────────────────────────────

class WeatherSnapshotViewSet(viewsets.ModelViewSet):
    """
    Weather data CRUD + list.
    §API: POST /api/health/weather/ (manual entry)
          GET /api/health/weather/ (list with ?profile=&days=)
          GET /api/health/weather/<id>/
          PUT /api/health/weather/<id>/
          DELETE /api/health/weather/<id>/
    """
    serializer_class = WeatherSnapshotSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = WeatherSnapshot.objects.filter(user=user)

        # Filter by profile if provided
        profile_id = self.request.query_params.get('profile')
        if profile_id:
            qs = qs.filter(profile_id=profile_id)

        # Filter by days if provided (last N days)
        days = self.request.query_params.get('days')
        if days:
            from datetime import timedelta
            start = date.today() - timedelta(days=int(days))
            qs = qs.filter(date__gte=start)

        return qs.select_related('profile').order_by('-date')

    def perform_create(self, serializer):
        profile = serializer.validated_data['profile']
        if profile.user_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Profile not owned by user.')
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['post'], url_path='fetch-range')
    def fetch_range(self, request):
        """
        §API: POST /api/health/weather/fetch-range/
        Trigger weather data fetch for date range (for future API integration).
        Currently returns stub message (MVP: manual entry only).

        §BODY: {
            "profile": <id>,
            "start_date": "2026-04-01",
            "end_date": "2026-04-10",
            "location": "Sofia, Bulgaria" (optional, inferred if omitted)
        }
        """
        profile_id = request.data.get('profile')
        start_date_str = request.data.get('start_date')
        end_date_str = request.data.get('end_date')
        location = request.data.get('location', '')

        if not all([profile_id, start_date_str, end_date_str]):
            return Response(
                {'error': 'Required: profile, start_date, end_date'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            start_date = date.fromisoformat(start_date_str)
            end_date = date.fromisoformat(end_date_str)
        except ValueError:
            return Response(
                {'error': 'Invalid date format (use YYYY-MM-DD)'},
                status=status.HTTP_400_BAD_REQUEST
            )

        profile = _get_profile(request, profile_id)
        if not profile:
            return Response({'error': 'Profile not found.'}, status=404)

        # For MVP: just create stubs for missing dates (user fills in manually via POST)
        from .weather_services import fetch_weather_range
        result = fetch_weather_range(
            request.user, profile, start_date, end_date, location=location
        )

        return Response({
            'message': 'Weather records created/retrieved. Please fill in data manually.',
            'dates_processed': len(result),
            'date_range': f'{start_date} to {end_date}',
        })

    @action(detail=False, methods=['get'], url_path='timeline')
    def timeline(self, request):
        """
        §API: GET /api/health/weather/timeline/?profile=<id>&days=90
        Get weather timeline for the last N days (for dashboard/graphs).
        """
        profile = _get_profile(request, request.query_params.get('profile'))
        if not profile:
            return Response({'error': 'No profile found.'}, status=404)

        days = int(request.query_params.get('days', 90))

        from .weather_services import get_weather_timeline
        timeline = get_weather_timeline(profile, days=days)

        serializer = WeatherSnapshotSerializer(
            timeline.values(), many=True
        )
        return Response({
            'dates': len(timeline),
            'window_days': days,
            'snapshots': serializer.data,
        })


# ──────────────────────────────────────────────────────────────
# §VIEW: Caregiver relationships — delegate health data access
# ──────────────────────────────────────────────────────────────

class CaregiverRelationshipViewSet(viewsets.ModelViewSet):
    """
    Caregiver relationship management.

    §API:
      POST /api/health/caregivers/ — primary invites caregiver
      GET /api/health/caregivers/ — primary views own invites + list of caregivers
      PUT /api/health/caregivers/<id>/ — primary updates permissions
      DELETE /api/health/caregivers/<id>/ — primary revokes
      POST /api/health/caregivers/<id>/accept/ — caregiver accepts
      POST /api/health/caregivers/<id>/decline/ — caregiver declines
      GET /api/health/caregivers/my-invites/ — caregiver views pending invites
      GET /api/health/caregivers/my-access/ — caregiver views accepted relationships
    """
    serializer_class = CaregiverRelationshipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Primary user sees their own invites
        qs = CaregiverRelationship.objects.filter(user=user)
        return qs.select_related('profile', 'caregiver_user')

    def perform_create(self, serializer):
        """Create a caregiver invite (primary user inviting)."""
        from .caregiver_services import create_caregiver_invite

        profile = serializer.validated_data['profile']
        caregiver_user = serializer.validated_data['caregiver_user']
        permissions = serializer.validated_data.get('permissions', ['view_all'])
        relationship_note = serializer.validated_data.get('relationship_note', '')

        create_caregiver_invite(
            self.request.user, profile, caregiver_user,
            permissions=permissions, relationship_note=relationship_note
        )

    def perform_update(self, serializer):
        """Update permissions (primary user only)."""
        rel = serializer.instance
        if rel.user_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Not your invite.')
        serializer.save()

    def perform_destroy(self, instance):
        """Revoke access (primary or caregiver)."""
        from .caregiver_services import revoke_caregiver_access

        revoke_caregiver_access(self.request.user, instance.id)

    @action(detail=True, methods=['post'], url_path='accept')
    def accept(self, request, pk=None):
        """Caregiver accepts an invite."""
        from .caregiver_services import accept_caregiver_invite

        try:
            rel = accept_caregiver_invite(request.user, pk)
            serializer = self.get_serializer(rel)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='decline')
    def decline(self, request, pk=None):
        """Caregiver declines an invite."""
        from .caregiver_services import decline_caregiver_invite

        try:
            decline_caregiver_invite(request.user, pk)
            return Response({'status': 'Invite declined'})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='my-invites')
    def my_invites(self, request):
        """Caregiver views pending invites."""
        invites = CaregiverRelationship.objects.filter(
            caregiver_user=request.user,
            status='pending'
        ).select_related('user', 'profile')

        serializer = CaregiverInviteListSerializer(invites, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='my-access')
    def my_access(self, request):
        """Caregiver views accepted relationships (profiles they can access)."""
        rels = CaregiverRelationship.objects.filter(
            caregiver_user=request.user,
            status='accepted'
        ).exclude(revoked_at__isnull=False).select_related('user', 'profile')

        serializer = CaregiverInviteListSerializer(rels, many=True)
        return Response(serializer.data)


# ──────────────────────────────────────────────────────────────
# §VIEW: Medication reminders + adherence tracking
# ──────────────────────────────────────────────────────────────

class MedicationReminderViewSet(viewsets.ModelViewSet):
    """
    Medication reminders CRUD.

    §API:
      POST /api/health/reminders/ — create reminder
      GET /api/health/reminders/ — list with ?profile=&status=
      GET /api/health/reminders/<id>/ — detail
      PUT /api/health/reminders/<id>/ — update
      DELETE /api/health/reminders/<id>/ — delete
      POST /api/health/reminders/<id>/pause/ — pause
      POST /api/health/reminders/<id>/resume/ — resume
      POST /api/health/reminders/<id>/complete/ — mark as completed
      GET /api/health/reminders/today/ — today's reminders + stats
      GET /api/health/reminders/<id>/history/ — adherence history
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = MedicationReminder.objects.filter(user=user)

        # Filter by profile if provided
        profile_id = self.request.query_params.get('profile')
        if profile_id:
            qs = qs.filter(profile_id=profile_id)

        # Filter by status
        status = self.request.query_params.get('status')
        if status:
            qs = qs.filter(status=status)

        return qs.select_related('profile', 'supplement').order_by('reminder_time')

    def get_serializer_class(self):
        if self.action == 'list':
            return MedicationReminderListSerializer
        return MedicationReminderSerializer

    def perform_create(self, serializer):
        """Create reminder (validates profile ownership)."""
        profile = serializer.validated_data['profile']
        if profile.user_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Profile not owned by user.')
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'], url_path='pause')
    def pause(self, request, pk=None):
        """Pause a reminder (stops creating logs)."""
        from .medication_reminder_services import pause_reminder

        reminder = self.get_object()
        reminder = pause_reminder(reminder)
        serializer = self.get_serializer(reminder)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='resume')
    def resume(self, request, pk=None):
        """Resume a paused reminder."""
        from .medication_reminder_services import resume_reminder

        reminder = self.get_object()
        reminder = resume_reminder(reminder)
        serializer = self.get_serializer(reminder)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, pk=None):
        """Mark reminder as completed (course finished)."""
        from .medication_reminder_services import complete_reminder

        reminder = self.get_object()
        reminder = complete_reminder(reminder)
        serializer = self.get_serializer(reminder)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='today')
    def today(self, request):
        """Get today's reminders + adherence stats."""
        from .medication_reminder_services import get_todays_reminders

        profile = _get_profile(request, request.query_params.get('profile'))
        data = get_todays_reminders(request.user, profile)

        return Response({
            'date': data['date'],
            'stats': data['stats'],
            'reminders': [
                {
                    'reminder': MedicationReminderListSerializer(item['reminder']).data,
                    'log': ReminderLogSerializer(item['log']).data if item['log'] else None,
                    'status': item['status'],
                    'is_overdue': item['is_overdue'],
                }
                for item in data['reminders']
            ],
        })

    @action(detail=True, methods=['get'], url_path='history')
    def history(self, request, pk=None):
        """Get adherence history for a reminder."""
        from .medication_reminder_services import get_reminder_history

        reminder = self.get_object()
        days = int(request.query_params.get('days', 30))
        hist = get_reminder_history(reminder, days)

        return Response({
            'reminder': MedicationReminderSerializer(hist['reminder']).data,
            'window_days': hist['window_days'],
            'taken': hist['taken'],
            'skipped': hist['skipped'],
            'total_scheduled': hist['total_scheduled'],
            'adherence_rate': hist['adherence_rate'],
            'logs': ReminderLogSerializer(hist['logs'], many=True).data,
        })


class ReminderLogViewSet(viewsets.ModelViewSet):
    """
    Reminder adherence logs.

    §API:
      GET /api/health/reminder-logs/ — list with ?reminder=&date=&status=
      GET /api/health/reminder-logs/<id>/ — detail
      PATCH /api/health/reminder-logs/<id>/ — update status
      POST /api/health/reminder-logs/<id>/mark-taken/ — mark as taken
      POST /api/health/reminder-logs/<id>/mark-skipped/ — mark as skipped
      POST /api/health/reminder-logs/<id>/snooze/ — snooze (30min default)
      POST /api/health/reminder-logs/<id>/dismiss/ — dismiss
    """
    serializer_class = ReminderLogSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = ReminderLog.objects.filter(reminder__user=user)

        # Filter by reminder if provided
        reminder_id = self.request.query_params.get('reminder')
        if reminder_id:
            qs = qs.filter(reminder_id=reminder_id)

        # Filter by date
        date_str = self.request.query_params.get('date')
        if date_str:
            qs = qs.filter(date=date_str)

        # Filter by status
        status = self.request.query_params.get('status')
        if status:
            qs = qs.filter(status=status)

        return qs.select_related('reminder').order_by('-date', 'reminder__reminder_time')

    @action(detail=True, methods=['post'], url_path='mark-taken')
    def mark_taken(self, request, pk=None):
        """Mark reminder as taken."""
        from .medication_reminder_services import mark_reminder_taken

        log = self.get_object()
        notes = request.data.get('notes', '')
        log = mark_reminder_taken(log, notes)
        serializer = self.get_serializer(log)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='mark-skipped')
    def mark_skipped(self, request, pk=None):
        """Mark reminder as skipped."""
        from .medication_reminder_services import mark_reminder_skipped

        log = self.get_object()
        notes = request.data.get('notes', '')
        log = mark_reminder_skipped(log, notes)
        serializer = self.get_serializer(log)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='snooze')
    def snooze(self, request, pk=None):
        """Snooze a reminder."""
        from .medication_reminder_services import snooze_reminder

        log = self.get_object()
        minutes = int(request.data.get('minutes', 30))
        log = snooze_reminder(log, minutes)
        serializer = self.get_serializer(log)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='dismiss')
    def dismiss(self, request, pk=None):
        """Dismiss a reminder."""
        from .medication_reminder_services import dismiss_reminder

        log = self.get_object()
        log = dismiss_reminder(log)
        serializer = self.get_serializer(log)
        return Response(serializer.data)
