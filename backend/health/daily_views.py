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

from .daily_models import DailyLog, Supplement, SupplementSchedule, DoseLog, MetricTimeline, EmergencyCard
from .daily_serializers import (
    DailyLogSerializer, WizardSubmitSerializer,
    SupplementListSerializer, SupplementDetailSerializer, SupplementCreateSerializer,
    SupplementScheduleSerializer,
    DoseLogSerializer, BatchDoseSerializer,
    MetricTimelineSerializer, TimelineQuerySerializer,
    EmergencyCardSerializer,
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

class DoseLogView(generics.CreateAPIView):
    """
    §API: POST /api/health/doses/
    Log a single dose taken/skipped.
    """
    serializer_class = DoseLogSerializer
    permission_classes = [permissions.IsAuthenticated]

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
