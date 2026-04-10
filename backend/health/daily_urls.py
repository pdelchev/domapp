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
)

router = DefaultRouter()
router.register('daily-log', DailyLogViewSet, basename='daily-log')
router.register('supplements', SupplementViewSet, basename='supplement')
router.register('schedules', ScheduleViewSet, basename='schedule')

urlpatterns = [
    # Router-based CRUD
    path('', include(router.urls)),

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
]
