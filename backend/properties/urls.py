from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PropertyOwnerViewSet, PropertyViewSet, UnitViewSet

router = DefaultRouter()
router.register(r'owners', PropertyOwnerViewSet, basename='owner')
router.register(r'properties', PropertyViewSet, basename='property')
router.register(r'units', UnitViewSet, basename='unit')

urlpatterns = [
    path('', include(router.urls)),
]