from django.shortcuts import render

# Create your views here.
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import RentPayment, Expense
from .serializers import RentPaymentSerializer, ExpenseSerializer


class RentPaymentViewSet(viewsets.ModelViewSet):
    """CRUD for rent payments — scoped to manager's leases."""
    serializer_class = RentPaymentSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options']  # No DELETE

    def get_queryset(self):
        qs = RentPayment.objects.filter(
            lease__property__user=self.request.user
        ).select_related('lease__tenant', 'lease__property')
        lease_id = self.request.query_params.get('lease')
        if lease_id:
            qs = qs.filter(lease_id=lease_id)
        status = self.request.query_params.get('status')
        if status:
            qs = qs.filter(status=status)
        return qs


class ExpenseViewSet(viewsets.ModelViewSet):
    """CRUD for expenses — scoped to manager's properties."""
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Expense.objects.filter(property__user=self.request.user).select_related('property')
        property_id = self.request.query_params.get('property')
        if property_id:
            qs = qs.filter(property_id=property_id)
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)
        return qs