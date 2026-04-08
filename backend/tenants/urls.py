from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TenantViewSet, TenantLogViewSet

router = DefaultRouter()
router.register(r'tenants', TenantViewSet, basename='tenant')
router.register(r'tenant-logs', TenantLogViewSet, basename='tenant-log')

urlpatterns = [
    path('', include(router.urls)),
]