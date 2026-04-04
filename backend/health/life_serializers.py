# ── health/life_serializers.py ────────────────────────────────────────
# DRF serializers for the Life module: HealthScoreSnapshot + Intervention.

from rest_framework import serializers
from .models import HealthScoreSnapshot, Intervention, HealthProfile


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
            'started_on', 'ended_on',
            'hypothesis', 'target_metrics',
            'evidence_grade', 'source_url', 'notes',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'is_active', 'created_at', 'updated_at']

    def validate(self, attrs):
        started = attrs.get('started_on') or getattr(self.instance, 'started_on', None)
        ended = attrs.get('ended_on') or getattr(self.instance, 'ended_on', None)
        if started and ended and ended < started:
            raise serializers.ValidationError({'ended_on': 'ended_on cannot be before started_on'})
        return attrs
