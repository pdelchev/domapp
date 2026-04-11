# backend/health/protocol_serializers.py

from rest_framework import serializers
from .models import (
    HealthProtocol, DailyProtocolLog, ProtocolRecommendation, GeneticProfile
)


class GeneticProfileSerializer(serializers.ModelSerializer):
    """
    Serializes user genetic profile
    Contains: risk scores, nutrient absorption, metabolizer status, supplement recommendations
    """
    class Meta:
        model = GeneticProfile
        fields = [
            'id', 'cardiovascular_risk', 'metabolic_risk', 'inflammation_risk',
            'longevity_potential', 'nutrient_absorption', 'cyp_metabolizer_status',
            'recommended_supplements', 'last_updated'
        ]
        read_only_fields = ['last_updated']


class ProtocolListSerializer(serializers.ModelSerializer):
    """
    Lightweight version for list views
    Shows: name, status, adherence, confidence score
    """
    class Meta:
        model = HealthProtocol
        fields = [
            'id', 'name', 'status', 'adherence_percentage', 'confidence_score',
            'start_date', 'end_date', 'daily_log_fields'
        ]
        read_only_fields = ['adherence_percentage', 'start_date']


class ProtocolDetailSerializer(serializers.ModelSerializer):
    """
    Full protocol detail with all metadata
    Used for create/update and retrieve detail views
    """
    class Meta:
        model = HealthProtocol
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'adherence_percentage']


class DailyProtocolLogSerializer(serializers.ModelSerializer):
    """
    Daily log serializer
    Handles: mood, energy, biometrics, supplements, diet, exercise
    Auto-calculates adherence_pct based on required fields
    """
    protocol_name = serializers.CharField(source='protocol.name', read_only=True)

    class Meta:
        model = DailyProtocolLog
        fields = [
            'id', 'protocol', 'protocol_name', 'date', 'mood', 'energy_level',
            'stress_level', 'weight_kg', 'systolic_bp', 'diastolic_bp',
            'resting_heart_rate', 'sleep_hours', 'sleep_quality', 'sleep_notes',
            'whoop_recovery_score', 'supplements_taken', 'supplement_notes',
            'meals', 'diet_notes', 'water_intake_ml', 'exercise_type',
            'exercise_duration_min', 'exercise_intensity', 'whoop_strain_score',
            'protocol_adherence_pct', 'protocol_notes', 'symptoms', 'side_effects',
            'is_complete', 'ai_insights', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'protocol_adherence_pct', 'ai_insights', 'is_complete',
            'created_at', 'updated_at'
        ]


class RecommendationListSerializer(serializers.ModelSerializer):
    """
    Lightweight recommendation view
    Shows: title, priority, acceptance status
    """
    class Meta:
        model = ProtocolRecommendation
        fields = [
            'id', 'category', 'title', 'priority', 'is_accepted', 'is_implemented'
        ]


class RecommendationDetailSerializer(serializers.ModelSerializer):
    """
    Full recommendation with evidence, actionable steps, expected impact
    """
    class Meta:
        model = ProtocolRecommendation
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
