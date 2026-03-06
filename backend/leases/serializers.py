from rest_framework import serializers
from .models import Lease
from finance.models import RentPayment


class LeaseSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.full_name', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)

    # Computed fields — payment stats for the lease
    total_paid = serializers.SerializerMethodField()
    total_due = serializers.SerializerMethodField()
    payments_count = serializers.SerializerMethodField()
    overdue_count = serializers.SerializerMethodField()

    class Meta:
        model = Lease
        fields = '__all__'

    def get_total_paid(self, obj):
        return float(
            RentPayment.objects.filter(lease=obj, status='paid')
            .aggregate(total=serializers.models.Sum('amount_paid'))['total'] or 0
        )

    def get_total_due(self, obj):
        return float(
            RentPayment.objects.filter(lease=obj)
            .exclude(status='paid')
            .aggregate(total=serializers.models.Sum('amount_due'))['total'] or 0
        )

    def get_payments_count(self, obj):
        return RentPayment.objects.filter(lease=obj).count()

    def get_overdue_count(self, obj):
        return RentPayment.objects.filter(lease=obj, status='overdue').count()
