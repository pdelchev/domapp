# backend/health/protocol_urls.py

"""
PROTOCOL URL ROUTING
====================
REST API routes for health protocol management
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .protocol_views import (
    ProtocolViewSet, DailyProtocolLogViewSet, RecommendationViewSet,
    DailyLogFieldsView, GeneticProfileView
)

router = DefaultRouter()
router.register(r'protocols', ProtocolViewSet, basename='protocol')
router.register(r'daily-log', DailyProtocolLogViewSet, basename='daily-log')
router.register(r'recommendations', RecommendationViewSet, basename='recommendation')

urlpatterns = [
    path('', include(router.urls)),
    path('daily-log-fields/', DailyLogFieldsView.as_view(), name='daily-log-fields'),
    path('genetic-profile/', GeneticProfileView.as_view(), name='genetic-profile'),
]
