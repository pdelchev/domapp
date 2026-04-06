from rest_framework import serializers
from .ritual_models import RitualItem, RitualLog, BodyMeasurement


class RitualLogSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)

    class Meta:
        model = RitualLog
        fields = '__all__'


class RitualItemSerializer(serializers.ModelSerializer):
    today_log = serializers.SerializerMethodField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    timing_display = serializers.CharField(source='get_timing_display', read_only=True)
    condition_display = serializers.CharField(source='get_condition_display', read_only=True)

    class Meta:
        model = RitualItem
        fields = '__all__'
        read_only_fields = ('user', 'created_at')

    def get_today_log(self, obj):
        from django.utils import timezone
        today = timezone.now().date()
        log = obj.logs.filter(date=today).first()
        if log:
            return {
                'id': log.id,
                'completed': log.completed,
                'completed_at': log.completed_at.isoformat() if log.completed_at else None,
                'skipped': log.skipped,
            }
        return None


class BodyMeasurementSerializer(serializers.ModelSerializer):
    site_display = serializers.CharField(source='get_site_display', read_only=True)

    class Meta:
        model = BodyMeasurement
        fields = '__all__'
        read_only_fields = ('user', 'created_at')
