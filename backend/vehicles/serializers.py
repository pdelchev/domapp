"""
# ═══ VEHICLES SERIALIZERS ═══
# Standard DRF ModelSerializers with computed fields.
# ObligationSerializer includes nested files (read) and computed status.
# VehicleListSerializer is lightweight (no nested obligations) for list views.
"""

from rest_framework import serializers
from .models import Vehicle, VehicleObligation, ObligationFile, VehicleReminder


class ObligationFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ObligationFile
        fields = ['id', 'file', 'label', 'file_size', 'uploaded_at']
        read_only_fields = ('file_size', 'uploaded_at')


class VehicleReminderSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleReminder
        fields = ['id', 'remind_at', 'sent', 'sent_at']
        read_only_fields = ('sent', 'sent_at')


class VehicleObligationSerializer(serializers.ModelSerializer):
    """Full obligation with nested files and computed status."""
    files = ObligationFileSerializer(many=True, read_only=True)
    status = serializers.CharField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    vehicle_plate = serializers.CharField(source='vehicle.plate_number', read_only=True)
    vehicle_make_model = serializers.SerializerMethodField()

    class Meta:
        model = VehicleObligation
        fields = [
            'id', 'vehicle', 'vehicle_plate', 'vehicle_make_model',
            'obligation_type', 'custom_type_name', 'display_name',
            'start_date', 'end_date',
            'provider', 'policy_number',
            'cost', 'currency',
            'reminder_days', 'is_current',
            'notes', 'status', 'files',
            'created_at', 'updated_at',
        ]
        read_only_fields = ('created_at', 'updated_at', 'status', 'display_name')

    def get_vehicle_make_model(self, obj):
        return f'{obj.vehicle.make} {obj.vehicle.model}'


class VehicleObligationListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for obligation lists (no nested files)."""
    status = serializers.CharField(read_only=True)
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = VehicleObligation
        fields = [
            'id', 'vehicle', 'obligation_type', 'custom_type_name', 'display_name',
            'start_date', 'end_date', 'provider', 'cost', 'currency',
            'is_current', 'status', 'created_at',
        ]


class VehicleSerializer(serializers.ModelSerializer):
    """Full vehicle with obligations count and compliance status."""
    obligations_count = serializers.SerializerMethodField()
    expired_count = serializers.SerializerMethodField()
    expiring_count = serializers.SerializerMethodField()
    property_name = serializers.CharField(source='linked_property.name', read_only=True, default=None)
    current_obligations = VehicleObligationListSerializer(many=True, read_only=True, source='get_current_obligations')

    class Meta:
        model = Vehicle
        fields = [
            'id', 'linked_property', 'property_name',
            'plate_number', 'make', 'model', 'year', 'color', 'fuel_type',
            'vin', 'engine_cc', 'first_registration_date',
            'is_active', 'notes',
            'obligations_count', 'expired_count', 'expiring_count',
            'current_obligations',
            'created_at', 'updated_at',
        ]
        read_only_fields = ('user', 'created_at', 'updated_at')

    def get_obligations_count(self, obj):
        return obj.obligations.filter(is_current=True).count()

    def get_expired_count(self, obj):
        from django.utils import timezone
        today = timezone.now().date()
        return obj.obligations.filter(is_current=True, end_date__lt=today).count()

    def get_expiring_count(self, obj):
        from django.utils import timezone
        from datetime import timedelta
        today = timezone.now().date()
        return obj.obligations.filter(
            is_current=True,
            end_date__gte=today,
            end_date__lte=today + timedelta(days=30)
        ).count()


class VehicleListSerializer(serializers.ModelSerializer):
    """Lightweight for list view — no nested obligations."""
    obligations_count = serializers.SerializerMethodField()
    expired_count = serializers.SerializerMethodField()
    expiring_count = serializers.SerializerMethodField()
    property_name = serializers.CharField(source='linked_property.name', read_only=True, default=None)

    class Meta:
        model = Vehicle
        fields = [
            'id', 'linked_property', 'property_name',
            'plate_number', 'make', 'model', 'year', 'color', 'fuel_type',
            'is_active',
            'obligations_count', 'expired_count', 'expiring_count',
            'created_at',
        ]

    def get_obligations_count(self, obj):
        return obj.obligations.filter(is_current=True).count()

    def get_expired_count(self, obj):
        from django.utils import timezone
        today = timezone.now().date()
        return obj.obligations.filter(is_current=True, end_date__lt=today).count()

    def get_expiring_count(self, obj):
        from django.utils import timezone
        from datetime import timedelta
        today = timezone.now().date()
        return obj.obligations.filter(
            is_current=True,
            end_date__gte=today,
            end_date__lte=today + timedelta(days=30)
        ).count()
