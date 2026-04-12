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
router.register(r'meals', life_views.MealTimingViewSet, basename='meal')

urlpatterns = [
    path('life-summary/', life_views.LifeSummaryView.as_view(), name='life-summary'),
    path('phenoage/', life_views.PhenoAgeView.as_view(), name='phenoage'),
    path('briefing/', life_views.MorningBriefingView.as_view(), name='morning-briefing'),
    path('lab-order/', life_views.LabOrderView.as_view(), name='lab-order'),
    # §LOG: GET returns checklist; POST batch-upserts — single endpoint.
    path('interventions/logs/', life_views.InterventionLogView.as_view(), name='intervention-logs'),
    path('', include(router.urls)),
]
