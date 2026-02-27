from django.shortcuts import render

# Create your views here.
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Lease
from .serializers import LeaseSerializer


class LeaseViewSet(viewsets.ModelViewSet):
    """CRUD for leases — scoped to manager's properties."""
    serializer_class = LeaseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Lease.objects.filter(property__user=self.request.user).select_related('tenant', 'property')
        property_id = self.request.query_params.get('property')
        if property_id:
            qs = qs.filter(property_id=property_id)
        status = self.request.query_params.get('status')
        if status:
            qs = qs.filter(status=status)
        return qs