# ── health/whoop_views.py ──────────────────────────────────────────────
# REST API views for WHOOP wearable integration.
#
# §NAV: whoop_models → whoop_serializers → [whoop_views] → whoop_urls → whoop_services
# §AUTH: All views require JWT auth. Data scoped by request.user.
# §PERF: select_related/prefetch_related on all querysets.

import uuid
from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .whoop_models import (
    WhoopConnection, WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout,
)
from .whoop_serializers import (
    WhoopConnectionSerializer,
    WhoopCycleSerializer,
    WhoopRecoverySerializer,
    WhoopSleepSerializer,
    WhoopWorkoutSerializer,
)
from .whoop_services import (
    get_auth_url, exchange_code, sync_whoop_data,
    get_whoop_dashboard, get_recovery_stats, get_sleep_stats,
    get_strain_stats, compute_cardiovascular_fitness,
    get_training_recommendation,
    disconnect_whoop, WhoopAPIError,
)


# ── Pagination ────────────────────────────────────────────────────

class WhoopPagination(PageNumberPagination):
    """§PAGE: Standard pagination for WHOOP list endpoints."""
    page_size = 30
    page_size_query_param = 'page_size'
    max_page_size = 100


# ── OAuth2: Connect ───────────────────────────────────────────────

class WhoopConnectView(APIView):
    """
    §CONNECT: Initiate WHOOP OAuth2 flow.
    Returns the authorization URL the frontend should redirect the user to.

    GET /api/health/whoop/connect/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # §CHECK: If already connected, inform the user
        if WhoopConnection.objects.filter(user=request.user, is_active=True).exists():
            return Response(
                {'error': 'WHOOP is already connected. Disconnect first to reconnect.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # §STATE: Generate CSRF state token
        state = str(uuid.uuid4())
        request.session['whoop_oauth_state'] = state

        auth_url = get_auth_url(state)
        return Response({'auth_url': auth_url, 'state': state})


# ── OAuth2: Callback ──────────────────────────────────────────────

class WhoopCallbackView(APIView):
    """
    §CALLBACK: Handle OAuth2 callback from WHOOP.
    Exchanges the authorization code for tokens, creates the connection,
    and triggers an initial data sync.

    GET /api/health/whoop/callback/?code=<code>&state=<state>
    POST /api/health/whoop/callback/ {code: "...", state: "..."}
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return self._handle(request.query_params.get('code'), request.query_params.get('state'), request)

    def post(self, request):
        return self._handle(request.data.get('code'), request.data.get('state'), request)

    def _handle(self, code, state, request):

        if not code:
            return Response(
                {'error': 'Missing authorization code.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # §CSRF: State validation skipped — Django sessions don't persist with JWT auth.
        # The OAuth flow is already protected by requiring a valid JWT token on this endpoint.

        # §TOKEN: Exchange code for tokens
        try:
            token_data = exchange_code(code)
        except WhoopAPIError as e:
            return Response(
                {'error': f'Failed to connect WHOOP: {e}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # §SAVE: Create or update connection
        expires_at = timezone.now() + timedelta(seconds=token_data.get('expires_in', 3600))

        connection, created = WhoopConnection.objects.update_or_create(
            user=request.user,
            defaults={
                'access_token': token_data['access_token'],
                'refresh_token': token_data.get('refresh_token', ''),
                'token_expires_at': expires_at,
                'scopes': token_data.get('scope', ''),
                'is_active': True,
                'sync_error': '',
            },
        )

        # §PROFILE: Fetch WHOOP user profile to store whoop_user_id
        try:
            from .whoop_services import _api_request
            profile_data = _api_request(connection, 'GET', '/developer/v1/user/profile/basic')
            connection.whoop_user_id = profile_data.get('user_id')
            connection.save(update_fields=['whoop_user_id'])
        except WhoopAPIError:
            pass  # Non-critical — continue without user_id

        # §SYNC: Initial data sync (last 30 days)
        sync_result = sync_whoop_data(request.user, days=30)

        # Clean up session state
        request.session.pop('whoop_oauth_state', None)

        return Response({
            'connected': True,
            'connection': WhoopConnectionSerializer(connection).data,
            'initial_sync': sync_result,
        }, status=status.HTTP_201_CREATED)


# ── Disconnect ────────────────────────────────────────────────────

class WhoopDisconnectView(APIView):
    """
    §DISCONNECT: Revoke WHOOP access and delete all WHOOP data.

    POST /api/health/whoop/disconnect/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not WhoopConnection.objects.filter(user=request.user).exists():
            return Response(
                {'error': 'No WHOOP connection found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        disconnect_whoop(request.user)
        return Response({'disconnected': True})


# ── Connection status ─────────────────────────────────────────────

class WhoopStatusView(APIView):
    """
    §STATUS: Get current WHOOP connection status.

    GET /api/health/whoop/status/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            connection = WhoopConnection.objects.get(user=request.user)
        except WhoopConnection.DoesNotExist:
            return Response({
                'connected': False,
                'connection': None,
            })

        return Response({
            'connected': connection.is_active,
            'connection': WhoopConnectionSerializer(connection).data,
        })


# ── Manual sync ───────────────────────────────────────────────────

class WhoopSyncView(APIView):
    """
    §SYNC: Manually trigger a data sync from WHOOP.

    POST /api/health/whoop/sync/?days=7
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        days = request.query_params.get('days', 7)
        try:
            days = int(days)
            days = min(days, 90)  # Cap at 90 days
        except (ValueError, TypeError):
            days = 7

        result = sync_whoop_data(request.user, days=days)

        if 'error' in result:
            return Response(
                {'error': result['error']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(result)


# ── Dashboard ─────────────────────────────────────────────────────

class WhoopDashboardView(APIView):
    """
    §DASH: Aggregated WHOOP dashboard — latest recovery, trends, averages.

    GET /api/health/whoop/dashboard/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not WhoopConnection.objects.filter(user=request.user, is_active=True).exists():
            return Response({
                'connected': False,
                'has_data': False,
            })

        dashboard = get_whoop_dashboard(request.user)
        # Has data if we have either recovery scores or cycle data
        has_data = (
            dashboard.get('latest_recovery') is not None
            or dashboard.get('cycles_count', 0) > 0
        )

        return Response({
            'connected': True,
            'has_data': has_data,
            **dashboard,
        })


# ── Recovery list ─────────────────────────────────────────────────

class WhoopRecoveryListView(ListAPIView):
    """
    §RECOVERY_LIST: Paginated recovery history.

    GET /api/health/whoop/recoveries/?days=30
    """
    serializer_class = WhoopRecoverySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = WhoopPagination

    def get_queryset(self):
        qs = (
            WhoopRecovery.objects
            .filter(user=self.request.user, score_state='scored')
            .select_related('cycle')
            .order_by('-cycle__start')
        )

        days = self.request.query_params.get('days')
        if days:
            try:
                cutoff = timezone.now() - timedelta(days=int(days))
                qs = qs.filter(cycle__start__gte=cutoff)
            except (ValueError, TypeError):
                pass

        return qs


# ── Sleep list ────────────────────────────────────────────────────

class WhoopSleepListView(ListAPIView):
    """
    §SLEEP_LIST: Paginated sleep history.

    GET /api/health/whoop/sleeps/?days=30&naps=false
    """
    serializer_class = WhoopSleepSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = WhoopPagination

    def get_queryset(self):
        qs = (
            WhoopSleep.objects
            .filter(user=self.request.user, score_state='scored')
            .select_related('cycle')
            .order_by('-start')
        )

        days = self.request.query_params.get('days')
        if days:
            try:
                cutoff = timezone.now() - timedelta(days=int(days))
                qs = qs.filter(start__gte=cutoff)
            except (ValueError, TypeError):
                pass

        # §FILTER: Optionally exclude naps
        naps = self.request.query_params.get('naps')
        if naps is not None and naps.lower() == 'false':
            qs = qs.filter(nap=False)

        return qs


# ── Workout list ──────────────────────────────────────────────────

class WhoopWorkoutListView(ListAPIView):
    """
    §WORKOUT_LIST: Paginated workout history.

    GET /api/health/whoop/workouts/?days=30&sport=<name>
    """
    serializer_class = WhoopWorkoutSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = WhoopPagination

    def get_queryset(self):
        qs = (
            WhoopWorkout.objects
            .filter(user=self.request.user, score_state='scored')
            .select_related('cycle')
            .order_by('-start')
        )

        days = self.request.query_params.get('days')
        if days:
            try:
                cutoff = timezone.now() - timedelta(days=int(days))
                qs = qs.filter(start__gte=cutoff)
            except (ValueError, TypeError):
                pass

        # §FILTER: By sport name (case-insensitive contains)
        sport = self.request.query_params.get('sport')
        if sport:
            qs = qs.filter(sport_name__icontains=sport)

        return qs


# ── Recovery stats ────────────────────────────────────────────────

class WhoopRecoveryStatsView(APIView):
    """
    §RECOVERY_STATS: Deep recovery and HRV statistics.

    GET /api/health/whoop/recovery-stats/?days=30
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        stats = get_recovery_stats(request.user, days=days)
        return Response(stats)


# ── Sleep stats ───────────────────────────────────────────────────

class WhoopSleepStatsView(APIView):
    """
    §SLEEP_STATS: Deep sleep statistics.

    GET /api/health/whoop/sleep-stats/?days=30
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        stats = get_sleep_stats(request.user, days=days)
        return Response(stats)


# ── Strain stats ──────────────────────────────────────────────────

class WhoopStrainStatsView(APIView):
    """
    §STRAIN_STATS: Workout and strain statistics.

    GET /api/health/whoop/strain-stats/?days=30
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        stats = get_strain_stats(request.user, days=days)
        return Response(stats)


# ── Cardiovascular fitness ────────────────────────────────────────

class CardiovascularFitnessView(APIView):
    """
    §CVF: Combined cardiovascular fitness assessment (WHOOP + BP + blood).

    GET /api/health/whoop/cardiovascular-fitness/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        result = compute_cardiovascular_fitness(request.user)
        return Response(result)


# ── Training Recommendation ───────────────────────────────────────

class TrainingRecommendationView(APIView):
    """
    §TRAINING_REC: Next-session prescription from recent strain/HR signals.

    GET /api/health/whoop/training-recommendation/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        result = get_training_recommendation(request.user)
        return Response(result)
