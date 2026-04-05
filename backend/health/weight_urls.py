# ── health/weight_urls.py ─────────────────────────────────────────────
# §NAV: weight_models → weight_serializers → weight_views → [weight_urls]
# §MOUNT: health/urls.py includes this at the health app root. Endpoints
#         appear under /api/health/weight/* and /api/health/vitals/*.

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import weight_views as v

router = DefaultRouter()
# §ROUTER: prefixes set here so this file can be included at health root
router.register(r'weight/readings', v.WeightReadingViewSet, basename='weight-reading')
router.register(r'weight/goals', v.WeightGoalViewSet, basename='weight-goal')
router.register(r'vitals/sessions', v.VitalsSessionViewSet, basename='vitals-session')

urlpatterns = [
    # §WEIGHT specific endpoints (non-CRUD)
    path('weight/dashboard/', v.WeightDashboardView.as_view(), name='weight-dashboard'),
    path('weight/import/csv/', v.WeightCSVImportView.as_view(), name='weight-csv-import'),
    # §VITALS fusion endpoints
    path('vitals/dashboard/', v.VitalsDashboardView.as_view(), name='vitals-dashboard'),
    path('vitals/bp-per-kg-slope/', v.BPPerKgSlopeView.as_view(), name='bp-per-kg-slope'),
    path('vitals/cardiometabolic-age/', v.CardiometabolicAgeView.as_view(), name='cardiometabolic-age'),
    path('vitals/stage-regression-forecast/', v.StageRegressionForecastView.as_view(), name='stage-regression-forecast'),
    path('vitals/insights/', v.VitalsInsightsListView.as_view(), name='vitals-insights'),
    # §ROUTER: CRUD endpoints
    path('', include(router.urls)),
]
