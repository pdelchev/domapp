"""
§NAV: URL routing for unified Health Hub daily tracking.
§PREFIX: All URLs are under /api/health/ (mounted in health/urls.py).
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .daily_views import (
    DailyLogViewSet, WizardSubmitView,
    SupplementViewSet, ScheduleViewSet,
    DoseLogView, BatchDoseView,
    TimelineView,
    health_summary_view, streak_view,
    low_stock_view, interactions_view,
    EmergencyCardView,
    gamification_view, gamification_seen_view,
    circadian_suggest_view,
    fasting_current_view, fasting_start_view, fasting_end_view,
    SymptomViewSet,
    WeatherSnapshotViewSet,
    CaregiverRelationshipViewSet,
    MedicationReminderViewSet, ReminderLogViewSet,
)

router = DefaultRouter()
router.register('daily-log', DailyLogViewSet, basename='daily-log')
router.register('supplements', SupplementViewSet, basename='supplement')
router.register('schedules', ScheduleViewSet, basename='schedule')
router.register('symptoms', SymptomViewSet, basename='symptom')
router.register('weather', WeatherSnapshotViewSet, basename='weather')
router.register('caregivers', CaregiverRelationshipViewSet, basename='caregiver')
router.register('reminders', MedicationReminderViewSet, basename='reminder')
router.register('reminder-logs', ReminderLogViewSet, basename='reminder-log')

urlpatterns = [
    # Custom paths BEFORE router — these must be checked first
    # Wizard (the main entry point)
    path('daily-log/wizard/', WizardSubmitView.as_view(), name='wizard-submit'),
    path('daily-log/streak/', streak_view, name='daily-streak'),

    # Dose logging
    path('doses/', DoseLogView.as_view(), name='dose-log'),
    path('doses/batch/', BatchDoseView.as_view(), name='dose-batch'),

    # Timeline
    path('timeline/', TimelineView.as_view(), name='timeline'),

    # Summary
    path('summary/', health_summary_view, name='health-summary'),

    # Stock & interactions
    path('supplements/low-stock/', low_stock_view, name='low-stock'),
    path('supplements/interactions/', interactions_view, name='interactions'),

    # Emergency Card (offline-accessible medical info)
    path('emergency-card/', EmergencyCardView.as_view(), name='emergency-card'),

    # Gamification — badges + weekly challenges
    path('gamification/', gamification_view, name='gamification'),
    path('gamification/seen/', gamification_seen_view, name='gamification-seen'),

    # Circadian optimizer — stateless timing suggestion
    path('circadian/suggest/', circadian_suggest_view, name='circadian-suggest'),

    # Fasting protocol — active window + schedule annotation
    path('fasting/current/', fasting_current_view, name='fasting-current'),
    path('fasting/start/', fasting_start_view, name='fasting-start'),
    path('fasting/end/', fasting_end_view, name='fasting-end'),

    # Router-based CRUD — checked after custom paths
    path('', include(router.urls)),
]
