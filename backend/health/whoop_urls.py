# ── health/whoop_urls.py ───────────────────────────────────────────────
# URL routing for WHOOP wearable integration API.
# §NAV: whoop_models → whoop_serializers → whoop_views → [whoop_urls] → whoop_services
#
# All endpoints are under /api/health/whoop/
# Mounted by health/urls.py: path('whoop/', include('health.whoop_urls'))

from django.urls import path
from . import whoop_views

urlpatterns = [
    # §OAUTH: Connection management
    path('connect/', whoop_views.WhoopConnectView.as_view(), name='whoop-connect'),
    path('callback/', whoop_views.WhoopCallbackView.as_view(), name='whoop-callback'),
    path('disconnect/', whoop_views.WhoopDisconnectView.as_view(), name='whoop-disconnect'),
    path('status/', whoop_views.WhoopStatusView.as_view(), name='whoop-status'),

    # §SYNC: Manual data sync
    path('sync/', whoop_views.WhoopSyncView.as_view(), name='whoop-sync'),

    # §DASH: Dashboard
    path('dashboard/', whoop_views.WhoopDashboardView.as_view(), name='whoop-dashboard'),

    # §LIST: Data history endpoints
    path('recoveries/', whoop_views.WhoopRecoveryListView.as_view(), name='whoop-recoveries'),
    path('sleeps/', whoop_views.WhoopSleepListView.as_view(), name='whoop-sleeps'),
    path('workouts/', whoop_views.WhoopWorkoutListView.as_view(), name='whoop-workouts'),

    # §STATS: Deep statistics endpoints
    path('recovery-stats/', whoop_views.WhoopRecoveryStatsView.as_view(), name='whoop-recovery-stats'),
    path('sleep-stats/', whoop_views.WhoopSleepStatsView.as_view(), name='whoop-sleep-stats'),
    path('strain-stats/', whoop_views.WhoopStrainStatsView.as_view(), name='whoop-strain-stats'),

    # §CVF: Combined cardiovascular fitness
    path('cardiovascular-fitness/', whoop_views.CardiovascularFitnessView.as_view(), name='whoop-cardiovascular-fitness'),

    # §TRAIN: Next-session training recommendation
    path('training-recommendation/', whoop_views.TrainingRecommendationView.as_view(), name='whoop-training-recommendation'),
]
