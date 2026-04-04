# ── health/life_urls.py ───────────────────────────────────────────────
# Routes mounted under /api/health/ by health/urls.py
#
#   GET/POST /api/health/interventions/
#   GET/PUT/PATCH/DELETE /api/health/interventions/<pk>/
#   GET /api/health/life-summary/

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import life_views

router = DefaultRouter()
router.register(r'interventions', life_views.InterventionViewSet, basename='intervention')

urlpatterns = [
    path('life-summary/', life_views.LifeSummaryView.as_view(), name='life-summary'),
    path('phenoage/', life_views.PhenoAgeView.as_view(), name='phenoage'),
    path('briefing/', life_views.MorningBriefingView.as_view(), name='morning-briefing'),
    path('', include(router.urls)),
]
