# ── health/bp_urls.py ─────────────────────────────────────────────────
# URL routing for blood pressure tracking API.
# §NAV: bp_models → bp_serializers → bp_views → [bp_urls] → bp_services
#
# All endpoints are under /api/health/bp/
# Mounted by health/urls.py: path('bp/', include('health.bp_urls'))

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import bp_views

router = DefaultRouter()
router.register(r'readings', bp_views.BPReadingViewSet, basename='bp-reading')
router.register(r'sessions', bp_views.BPSessionViewSet, basename='bp-session')
router.register(r'medications', bp_views.BPMedicationViewSet, basename='bp-medication')
router.register(r'med-logs', bp_views.BPMedLogViewSet, basename='bp-med-log')
router.register(r'alerts', bp_views.BPAlertViewSet, basename='bp-alert')

urlpatterns = [
    # Custom paths BEFORE router — otherwise router catches slugs as pks
    path('dashboard/', bp_views.BPDashboardView.as_view(), name='bp-dashboard'),
    path('statistics/', bp_views.BPStatisticsView.as_view(), name='bp-statistics'),
    path('cardiovascular-risk/', bp_views.CardiovascularRiskView.as_view(), name='bp-cardiovascular-risk'),
    path('medication-effectiveness/', bp_views.MedicationEffectivenessView.as_view(), name='bp-medication-effectiveness'),
    path('metric/bp-per-kg/', bp_views.BPPerKgMetricView.as_view(), name='bp-per-kg-metric'),
    path('export/', bp_views.BPExportView.as_view(), name='bp-export'),
    path('', include(router.urls)),
]
