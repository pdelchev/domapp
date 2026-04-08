from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Tenant, TenantLog
from .serializers import TenantSerializer, TenantLogSerializer


class TenantViewSet(viewsets.ModelViewSet):
    """CRUD for tenants — scoped to the logged-in manager."""
    serializer_class = TenantSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Tenant.objects.filter(
            user=self.request.user.get_data_owner()
        ).prefetch_related('leases__property')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())


class TenantLogViewSet(viewsets.ModelViewSet):
    """Communication/event log for tenants."""
    serializer_class = TenantLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = TenantLog.objects.filter(user=self.request.user.get_data_owner())
        tenant_id = self.request.query_params.get('tenant')
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user.get_data_owner())
