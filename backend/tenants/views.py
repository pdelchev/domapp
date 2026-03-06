from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Tenant
from .serializers import TenantSerializer


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
