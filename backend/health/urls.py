# ── health/urls.py ────────────────────────────────────────────────────
# §NAV: models → serializers → views → [urls] → parsers → services → recommendations

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'profiles', views.HealthProfileViewSet, basename='health-profile')
router.register(r'reports', views.BloodReportViewSet, basename='blood-report')
router.register(r'biomarkers', views.BiomarkerViewSet, basename='biomarker')
router.register(r'biomarker-categories', views.BiomarkerCategoryViewSet, basename='biomarker-category')

urlpatterns = [
    path('', include(router.urls)),
    path('reports/bulk-upload/', views.BulkUploadView.as_view(), name='bulk-upload'),
    path('reports/<int:report_id>/results/', views.ManualResultsView.as_view(), name='manual-results'),
    path('biomarker-history/<int:biomarker_id>/', views.BiomarkerHistoryView.as_view(), name='biomarker-history'),
    path('compare/', views.CompareReportsView.as_view(), name='compare-reports'),
    path('dashboard/', views.HealthDashboardView.as_view(), name='health-dashboard'),
]
