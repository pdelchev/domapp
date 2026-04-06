from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .ritual_views import (
    RitualItemViewSet, RitualDashboardView, RitualToggleView,
    RitualSeedView, RitualAdherenceView, BodyMeasurementViewSet,
)

router = DefaultRouter()
router.register(r'items', RitualItemViewSet, basename='ritual-item')
router.register(r'measurements', BodyMeasurementViewSet, basename='body-measurement')

urlpatterns = [
    path('dashboard/', RitualDashboardView.as_view(), name='ritual-dashboard'),
    path('toggle/<int:item_id>/', RitualToggleView.as_view(), name='ritual-toggle'),
    path('seed/', RitualSeedView.as_view(), name='ritual-seed'),
    path('adherence/', RitualAdherenceView.as_view(), name='ritual-adherence'),
    path('', include(router.urls)),
]
