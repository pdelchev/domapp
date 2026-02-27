from rest_framework import serializers
from .models import Tenant


class TenantSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)

    class Meta:
        model = Tenant
        fields = '__all__'