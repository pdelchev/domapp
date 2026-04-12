# ── health/life_serializers.py ────────────────────────────────────────
# DRF serializers for the Life module: HealthScoreSnapshot + Intervention.

from rest_framework import serializers
from .models import HealthScoreSnapshot, Intervention, HealthProfile, MealTiming


class HealthScoreSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = HealthScoreSnapshot
        fields = [
            'id', 'date',
            'composite_score', 'blood_score', 'bp_score',
            'recovery_score', 'lifestyle_score',
            'confidence', 'inputs', 'computed_at',
        ]
        read_only_fields = fields


class InterventionSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(read_only=True)
    profile = serializers.PrimaryKeyRelatedField(
        queryset=HealthProfile.objects.all(), required=False, allow_null=True,
    )

    class Meta:
        model = Intervention
        fields = [
            'id', 'profile', 'name', 'category', 'dose',
            'frequency', 'reminder_times',
            'started_on', 'ended_on',
            'hypothesis', 'target_metrics',
            'evidence_grade', 'source_url', 'notes',
            'photo', 'photo_prescription',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'is_active', 'created_at', 'updated_at']

    def validate_profile(self, value):
        """§SECURITY: Prevent cross-user intervention creation via crafted profile IDs."""
        if value is None:
            return value
        request = self.context.get('request')
        if request and value.user_id != request.user.id:
            raise serializers.ValidationError('Profile does not belong to you.')
        return value

    def validate(self, attrs):
        started = attrs.get('started_on') or getattr(self.instance, 'started_on', None)
        ended = attrs.get('ended_on') or getattr(self.instance, 'ended_on', None)
        if started and ended and ended < started:
            raise serializers.ValidationError({'ended_on': 'ended_on cannot be before started_on'})
        return attrs


class MealTimingSerializer(serializers.ModelSerializer):
    """Meal plan synchronized with supplement schedule."""
    profile = serializers.PrimaryKeyRelatedField(
        queryset=HealthProfile.objects.all(), required=False, allow_null=True,
    )

    class Meta:
        model = MealTiming
        fields = [
            'id', 'profile', 'time_slot', 'meal_name', 'meal_name_bg',
            'description', 'description_bg',
            'nutritional_focus', 'supplement_ids',
            'water_ml', 'suggested_foods', 'suggested_foods_bg',
            'notes', 'notes_bg', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_profile(self, value):
        """§SECURITY: Prevent cross-user meal creation via crafted profile IDs."""
        if value is None:
            return value
        request = self.context.get('request')
        if request and value.user_id != request.user.id:
            raise serializers.ValidationError('Profile does not belong to you.')
        return value
