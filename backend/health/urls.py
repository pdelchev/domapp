from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MeasurementViewSet, FoodEntryViewSet, DailyRitualViewSet, HealthSummaryView

router = DefaultRouter()
router.register(r'measurements', MeasurementViewSet, basename='measurement')
router.register(r'food-entries', FoodEntryViewSet, basename='food-entry')
router.register(r'daily-rituals', DailyRitualViewSet, basename='daily-ritual')

urlpatterns = [
    path('health/summary/', HealthSummaryView.as_view(), name='health-summary'),
    path('', include(router.urls)),
]
