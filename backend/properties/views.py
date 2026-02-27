from django.shortcuts import render

# Create your views here.
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import PropertyOwner, Property, Unit
from .serializers import PropertyOwnerSerializer, PropertySerializer, UnitSerializer


class PropertyOwnerViewSet(viewsets.ModelViewSet):
    """CRUD for property owners — scoped to the logged-in manager."""
    serializer_class = PropertyOwnerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PropertyOwner.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class PropertyViewSet(viewsets.ModelViewSet):
    """CRUD for properties — scoped to the logged-in manager."""
    serializer_class = PropertySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Property.objects.filter(user=self.request.user).select_related('owner')
        owner_id = self.request.query_params.get('owner')
        if owner_id:
            qs = qs.filter(owner_id=owner_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class UnitViewSet(viewsets.ModelViewSet):
    """CRUD for units — scoped to manager's properties."""
    serializer_class = UnitSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Unit.objects.filter(property__user=self.request.user)
        property_id = self.request.query_params.get('property')
        if property_id:
            qs = qs.filter(property_id=property_id)
        return qs