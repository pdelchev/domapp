from django.shortcuts import render

# Create your views here.
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Tenant
from .serializers import TenantSerializer


class TenantViewSet(viewsets.ModelViewSet):
    """CRUD for tenants — scoped to manager's properties."""
    serializer_class = TenantSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Tenant.objects.filter(property__user=self.request.user).select_related('property')
        property_id = self.request.query_params.get('property')
        if property_id:
            qs = qs.filter(property_id=property_id)
        return qs