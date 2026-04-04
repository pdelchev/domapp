# ── health/whoop_serializers.py ────────────────────────────────────────
# DRF serializers for WHOOP wearable integration API.
#
# §NAV: whoop_models → [whoop_serializers] → whoop_views → whoop_urls → whoop_services
# §PERF: Lightweight list serializers vs full detail serializers.
# §SEC: Connection serializer NEVER exposes access/refresh tokens.

from rest_framework import serializers
from .whoop_models import (
    WhoopConnection, WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout,
)


# ── Connection status serializer ──────────────────────────────────

class WhoopConnectionSerializer(serializers.ModelSerializer):
    """
    §CONN: Connection status — NO tokens exposed.
    Shows connection state, last sync, and error info.
    """
    is_token_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = WhoopConnection
        fields = [
            'id', 'whoop_user_id',
            'scopes', 'connected_at', 'last_sync_at',
            'is_active', 'is_token_expired', 'sync_error',
        ]
        read_only_fields = fields


# ── Recovery serializer ───────────────────────────────────────────

class WhoopRecoverySerializer(serializers.ModelSerializer):
    """
    §RECOVERY: Recovery score with zone color and metrics.
    """
    recovery_zone = serializers.CharField(read_only=True)
    cycle_start = serializers.DateTimeField(source='cycle.start', read_only=True)

    class Meta:
        model = WhoopRecovery
        fields = [
            'id', 'cycle', 'cycle_start',
            'score_state', 'recovery_score', 'recovery_zone',
            'resting_heart_rate', 'hrv_rmssd_milli',
            'spo2_percentage', 'skin_temp_celsius',
            'user_calibrating',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields


# ── Cycle serializer ──────────────────────────────────────────────

class WhoopCycleSerializer(serializers.ModelSerializer):
    """
    §CYCLE: Physiological cycle with nested recovery (if scored).
    """
    recovery = WhoopRecoverySerializer(read_only=True)

    class Meta:
        model = WhoopCycle
        fields = [
            'id', 'whoop_id', 'start', 'end',
            'timezone_offset', 'score_state',
            'strain', 'kilojoule',
            'average_heart_rate', 'max_heart_rate',
            'recovery',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields


# ── Sleep serializer ──────────────────────────────────────────────

class WhoopSleepSerializer(serializers.ModelSerializer):
    """
    §SLEEP: Sleep session with computed duration and stage percentages.
    """
    duration_hours = serializers.FloatField(read_only=True)
    total_sleep_milli = serializers.IntegerField(read_only=True)
    stage_percentages = serializers.SerializerMethodField()

    class Meta:
        model = WhoopSleep
        fields = [
            'id', 'whoop_id', 'cycle',
            'start', 'end', 'timezone_offset',
            'nap', 'score_state',
            'sleep_performance_pct', 'sleep_consistency_pct',
            'sleep_efficiency_pct', 'respiratory_rate',
            'total_in_bed_milli', 'total_awake_milli',
            'total_light_milli', 'total_sws_milli', 'total_rem_milli',
            'sleep_cycle_count', 'disturbance_count',
            'sleep_needed_baseline_milli', 'sleep_needed_debt_milli',
            'sleep_needed_strain_milli', 'sleep_needed_nap_milli',
            'duration_hours', 'total_sleep_milli', 'stage_percentages',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_stage_percentages(self, obj):
        """§CALC: Sleep stage distribution as percentages of total sleep time."""
        total = obj.total_sleep_milli
        if not total or total <= 0:
            return None
        return {
            'light_pct': round((obj.total_light_milli or 0) / total * 100, 1),
            'deep_pct': round((obj.total_sws_milli or 0) / total * 100, 1),
            'rem_pct': round((obj.total_rem_milli or 0) / total * 100, 1),
        }


# ── Workout serializer ───────────────────────────────────────────

class WhoopWorkoutSerializer(serializers.ModelSerializer):
    """
    §WORKOUT: Workout/activity with computed duration in minutes.
    """
    duration_minutes = serializers.FloatField(read_only=True)

    class Meta:
        model = WhoopWorkout
        fields = [
            'id', 'whoop_id', 'cycle',
            'sport_id', 'sport_name',
            'start', 'end', 'timezone_offset',
            'score_state',
            'strain', 'average_heart_rate', 'max_heart_rate',
            'kilojoule', 'percent_recorded',
            'distance_meter', 'altitude_gain_meter',
            'zone_zero_milli', 'zone_one_milli', 'zone_two_milli',
            'zone_three_milli', 'zone_four_milli', 'zone_five_milli',
            'duration_minutes',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields


# ── Dashboard method serializer ───────────────────────────────────

class WhoopDashboardSerializer(serializers.Serializer):
    """
    §DASH: Method serializer for the WHOOP dashboard endpoint.
    Not tied to a model — aggregates from multiple sources.
    """
    latest_recovery = serializers.DictField(allow_null=True)
    recovery_trend_7d = serializers.ListField(child=serializers.IntegerField(), allow_empty=True)
    avg_hrv_7d = serializers.FloatField(allow_null=True)
    avg_resting_hr_7d = serializers.FloatField(allow_null=True)
    avg_recovery_7d = serializers.FloatField(allow_null=True)
    avg_sleep_performance_7d = serializers.FloatField(allow_null=True)
    avg_strain_7d = serializers.FloatField(allow_null=True)
    sleep_debt_hours = serializers.FloatField(allow_null=True)
    recovery_distribution_30d = serializers.DictField()


# ── Recovery stats method serializer ──────────────────────────────

class WhoopRecoveryStatsSerializer(serializers.Serializer):
    """§RECOVERY_STATS: Method serializer for deep recovery statistics."""
    has_data = serializers.BooleanField()
    days = serializers.IntegerField(required=False)
    count = serializers.IntegerField(required=False)
    avg_recovery = serializers.FloatField(allow_null=True, required=False)
    avg_hrv = serializers.FloatField(allow_null=True, required=False)
    avg_resting_hr = serializers.FloatField(allow_null=True, required=False)
    avg_spo2 = serializers.FloatField(allow_null=True, required=False)
    min_hrv = serializers.FloatField(allow_null=True, required=False)
    max_hrv = serializers.FloatField(allow_null=True, required=False)
    min_resting_hr = serializers.IntegerField(allow_null=True, required=False)
    max_resting_hr = serializers.IntegerField(allow_null=True, required=False)
    hrv_trend_per_day = serializers.FloatField(allow_null=True, required=False)
    resting_hr_trend_per_day = serializers.FloatField(allow_null=True, required=False)
    recovery_by_day_of_week = serializers.DictField(required=False)


# ── Sleep stats method serializer ─────────────────────────────────

class WhoopSleepStatsSerializer(serializers.Serializer):
    """§SLEEP_STATS: Method serializer for deep sleep statistics."""
    has_data = serializers.BooleanField()
    days = serializers.IntegerField(required=False)
    count = serializers.IntegerField(required=False)
    avg_duration_hours = serializers.FloatField(allow_null=True, required=False)
    avg_efficiency = serializers.FloatField(allow_null=True, required=False)
    avg_performance = serializers.FloatField(allow_null=True, required=False)
    avg_respiratory_rate = serializers.FloatField(allow_null=True, required=False)
    stage_distribution_pct = serializers.DictField(required=False)
    avg_sleep_debt_hours = serializers.FloatField(allow_null=True, required=False)
    consistency_trend_per_day = serializers.FloatField(allow_null=True, required=False)


# ── Strain stats method serializer ────────────────────────────────

class WhoopStrainStatsSerializer(serializers.Serializer):
    """§STRAIN_STATS: Method serializer for workout/strain statistics."""
    has_data = serializers.BooleanField()
    days = serializers.IntegerField(required=False)
    avg_strain = serializers.FloatField(allow_null=True, required=False)
    max_strain = serializers.FloatField(allow_null=True, required=False)
    total_calories = serializers.FloatField(allow_null=True, required=False)
    workout_count = serializers.IntegerField(required=False)
    top_activities = serializers.ListField(required=False)
    avg_workout_hr = serializers.FloatField(allow_null=True, required=False)
    strain_by_day_of_week = serializers.DictField(required=False)
