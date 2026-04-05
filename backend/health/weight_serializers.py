# ── health/weight_serializers.py ──────────────────────────────────────
# §NAV: weight_models → weight_serializers → weight_views → weight_urls
# §VALIDATE: physiological bounds + weekly rate guardrails enforced here.

from decimal import Decimal
from rest_framework import serializers

from .weight_models import (
    WeightReading, VitalsSession, WeightGoal, VitalsInsight,
    WeightMedicationEffect,
)


class WeightReadingSerializer(serializers.ModelSerializer):
    """§READING: full CRUD serializer with BMI computed on read."""
    bmi = serializers.SerializerMethodField()
    waist_hip_ratio = serializers.SerializerMethodField()

    class Meta:
        model = WeightReading
        fields = ['id', 'profile', 'session', 'measured_at', 'weight_kg',
                  'body_fat_pct', 'muscle_mass_kg', 'body_water_pct',
                  'visceral_fat_rating', 'bone_mass_kg',
                  'waist_cm', 'hip_cm', 'context_flags',
                  'source', 'source_ref', 'notes',
                  'bmi', 'waist_hip_ratio', 'created_at']
        read_only_fields = ['id', 'bmi', 'waist_hip_ratio', 'created_at']

    def get_bmi(self, obj):
        return obj.bmi

    def get_waist_hip_ratio(self, obj):
        return obj.waist_hip_ratio

    def validate_weight_kg(self, v):
        if v < Decimal('20') or v > Decimal('400'):
            raise serializers.ValidationError(
                'Weight must be between 20 and 400 kg.')
        return v

    def validate_body_fat_pct(self, v):
        if v is not None and (v < 2 or v > 70):
            raise serializers.ValidationError('Body fat % out of range (2-70).')
        return v


class VitalsSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = VitalsSession
        fields = ['id', 'profile', 'started_at', 'finalized_at', 'ritual_type',
                  'completed', 'weight_captured', 'bp_reading_count',
                  'cached_summary', 'notes', 'created_at']
        read_only_fields = ['id', 'finalized_at', 'completed',
                            'weight_captured', 'bp_reading_count',
                            'cached_summary', 'created_at']


class WeightGoalSerializer(serializers.ModelSerializer):
    """§GOAL: includes live progress computation."""
    progress = serializers.SerializerMethodField()

    class Meta:
        model = WeightGoal
        fields = ['id', 'profile', 'goal_type', 'start_weight_kg',
                  'target_weight_kg', 'weekly_rate_kg',
                  'started_at', 'target_date', 'achieved_at',
                  'linked_bp_target', 'is_active',
                  'progress', 'created_at', 'updated_at']
        read_only_fields = ['id', 'achieved_at', 'progress',
                            'created_at', 'updated_at']

    def get_progress(self, obj):
        from . import weight_services
        return weight_services.get_goal_progress(obj)

    def validate(self, data):
        """§GUARDRAIL: weekly rate sanity check (0.25%..1.0% body weight)."""
        start = data.get('start_weight_kg')
        rate = data.get('weekly_rate_kg')
        if start and rate is not None:
            pct = abs(float(rate)) / float(start) * 100
            if pct > 1.0:
                raise serializers.ValidationError(
                    {'weekly_rate_kg': 'Rate exceeds 1% of body weight per week '
                                       '(unsafe). Reduce target or extend deadline.'})
        return data


class VitalsInsightSerializer(serializers.ModelSerializer):
    class Meta:
        model = VitalsInsight
        fields = ['id', 'insight_type', 'computed_at', 'window_start',
                  'window_end', 'payload', 'confidence', 'algo_version']
        read_only_fields = fields


class WeightMedicationEffectSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeightMedicationEffect
        fields = '__all__'
