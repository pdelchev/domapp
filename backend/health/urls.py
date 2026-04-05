# ── health/urls.py ────────────────────────────────────────────────────
# §NAV: models → serializers → views → [urls] → parsers → services → recommendations
# §BP: Blood pressure sub-module mounted at bp/ prefix
# §WHOOP: WHOOP wearable integration sub-module mounted at whoop/ prefix

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'profiles', views.HealthProfileViewSet, basename='health-profile')
router.register(r'reports', views.BloodReportViewSet, basename='blood-report')
router.register(r'biomarkers', views.BiomarkerViewSet, basename='biomarker')
router.register(r'biomarker-categories', views.BiomarkerCategoryViewSet, basename='biomarker-category')

urlpatterns = [
    # §BP: Blood pressure tracking sub-module
    path('bp/', include('health.bp_urls')),
    # §WHOOP: WHOOP wearable integration sub-module
    path('whoop/', include('health.whoop_urls')),
    # §WEIGHT/VITALS: Weight tracking + BP fusion (weight/*, vitals/*)
    path('', include('health.weight_urls')),
    # §LIFE: Unified HealthScore + Intervention log
    path('', include('health.life_urls')),
    # Custom paths BEFORE router — otherwise router catches "bulk-upload" as a report pk
    path('reports/bulk-upload/', views.BulkUploadView.as_view(), name='bulk-upload'),
    path('reports/<int:report_id>/results/', views.ManualResultsView.as_view(), name='manual-results'),
    path('biomarker-history/<int:biomarker_id>/', views.BiomarkerHistoryView.as_view(), name='biomarker-history'),
    path('compare/', views.CompareReportsView.as_view(), name='compare-reports'),
    path('dashboard/', views.HealthDashboardView.as_view(), name='health-dashboard'),
    path('', include(router.urls)),
]
