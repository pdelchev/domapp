from rest_framework import serializers
from .models import Tenant


class TenantSerializer(serializers.ModelSerializer):
    # Computed from active leases — so the list page can show status/property
    is_active = serializers.SerializerMethodField()
    active_property = serializers.SerializerMethodField()
    active_lease_id = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = [
            'id', 'full_name', 'phone', 'email', 'id_number',
            'is_active', 'active_property', 'active_lease_id',
        ]
        read_only_fields = ['id']

    def get_is_active(self, obj):
        return obj.leases.filter(status='active').exists()

    def get_active_property(self, obj):
        lease = obj.leases.filter(status='active').select_related('property').first()
        return lease.property.name if lease else None

    def get_active_lease_id(self, obj):
        lease = obj.leases.filter(status='active').first()
        return lease.id if lease else None
