from rest_framework import serializers
from .models import RentPayment, Expense


class RentPaymentSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='lease.tenant.full_name', read_only=True)
    property_name = serializers.CharField(source='lease.property.name', read_only=True)

    class Meta:
        model = RentPayment
        fields = '__all__'


class ExpenseSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)

    class Meta:
        model = Expense
        fields = '__all__'