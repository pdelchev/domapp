# ── health/bp_serializers.py ───────────────────────────────────────────
# DRF serializers for blood pressure tracking API.
#
# §NAV: bp_models → [bp_serializers] → bp_views → bp_urls → bp_services
# §PERF: Lightweight list serializers vs full detail serializers (same pattern as health serializers).

from rest_framework import serializers
from .bp_models import (
    BPReading, BPSession, BPMedication, BPMedLog, BPAlert,
    BP_STAGE_CHOICES, ARM_CHOICES, POSTURE_CHOICES,
)
from .models import HealthProfile


# ── BP Reading serializers ──────────────────────────────────────────

class BPReadingSerializer(serializers.ModelSerializer):
    """§DETAIL: Full reading with computed stage, pulse pressure, MAP."""
    stage = serializers.SerializerMethodField()
    pulse_pressure = serializers.SerializerMethodField()
    mean_arterial_pressure = serializers.SerializerMethodField()
    profile_name = serializers.CharField(source='profile.full_name', read_only=True)

    class Meta:
        model = BPReading
        fields = [
            'id', 'profile', 'profile_name', 'session',
            'systolic', 'diastolic', 'pulse',
            'measured_at', 'arm', 'posture',
            'is_after_caffeine', 'is_after_exercise', 'is_after_medication',
            'is_stressed', 'is_clinic_reading', 'is_fasting',
            'notes',
            'stage', 'pulse_pressure', 'mean_arterial_pressure',
            'created_at',
        ]
        read_only_fields = ['created_at']

    def get_stage(self, obj):
        """§CALC: AHA classification from systolic/diastolic."""
        from .bp_services import classify_bp
        return classify_bp(obj.systolic, obj.diastolic)

    def get_pulse_pressure(self, obj):
        """§CALC: systolic - diastolic."""
        from .bp_services import compute_pulse_pressure
        return compute_pulse_pressure(obj.systolic, obj.diastolic)

    def get_mean_arterial_pressure(self, obj):
        """§CALC: diastolic + 1/3 * pulse_pressure."""
        from .bp_services import compute_map
        return compute_map(obj.systolic, obj.diastolic)


class BPReadingCreateSerializer(serializers.ModelSerializer):
    """
    §CREATE: For creating new BP readings.
    Validates physiological ranges to prevent data entry errors.
    """
    class Meta:
        model = BPReading
        fields = [
            'profile', 'session',
            'systolic', 'diastolic', 'pulse',
            'measured_at', 'arm', 'posture',
            'is_after_caffeine', 'is_after_exercise', 'is_after_medication',
            'is_stressed', 'is_clinic_reading', 'is_fasting',
            'notes',
        ]

    def validate_systolic(self, value):
        """§RANGE: Systolic must be 60-300 mmHg."""
        if value < 60 or value > 300:
            raise serializers.ValidationError(
                'Systolic pressure must be between 60 and 300 mmHg.'
            )
        return value

    def validate_diastolic(self, value):
        """§RANGE: Diastolic must be 30-200 mmHg."""
        if value < 30 or value > 200:
            raise serializers.ValidationError(
                'Diastolic pressure must be between 30 and 200 mmHg.'
            )
        return value

    def validate_pulse(self, value):
        """§RANGE: Pulse must be 30-220 BPM."""
        if value is not None and (value < 30 or value > 220):
            raise serializers.ValidationError(
                'Pulse must be between 30 and 220 BPM.'
            )
        return value

    def validate_profile(self, value):
        """§PERM: Ensure profile belongs to requesting user."""
        request = self.context.get('request')
        if request and value.user != request.user:
            raise serializers.ValidationError('Profile does not belong to you.')
        return value

    def validate(self, data):
        """§LOGIC: Systolic must be greater than diastolic."""
        if data.get('systolic') and data.get('diastolic'):
            if data['systolic'] <= data['diastolic']:
                raise serializers.ValidationError({
                    'systolic': 'Systolic pressure must be greater than diastolic pressure.'
                })
        return data


# ── BP Session serializers ──────────────────────────────────────────

class BPSessionListSerializer(serializers.ModelSerializer):
    """§PERF: Lightweight session for list view — averages + stage, no nested readings."""
    profile_name = serializers.CharField(source='profile.full_name', read_only=True)

    class Meta:
        model = BPSession
        fields = [
            'id', 'profile', 'profile_name',
            'measured_at', 'avg_systolic', 'avg_diastolic', 'avg_pulse',
            'reading_count', 'stage', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class BPSessionDetailSerializer(serializers.ModelSerializer):
    """§FULL: Session with all nested readings."""
    profile_name = serializers.CharField(source='profile.full_name', read_only=True)
    readings = BPReadingSerializer(many=True, read_only=True)

    class Meta:
        model = BPSession
        fields = [
            'id', 'profile', 'profile_name',
            'measured_at', 'avg_systolic', 'avg_diastolic', 'avg_pulse',
            'reading_count', 'stage', 'notes',
            'readings',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class BPSessionReadingInputSerializer(serializers.Serializer):
    """§NESTED: Reading data within a session create request."""
    systolic = serializers.IntegerField(min_value=60, max_value=300)
    diastolic = serializers.IntegerField(min_value=30, max_value=200)
    pulse = serializers.IntegerField(min_value=30, max_value=220, required=False, allow_null=True)
    arm = serializers.ChoiceField(choices=ARM_CHOICES, default='left')
    posture = serializers.ChoiceField(choices=POSTURE_CHOICES, default='sitting')
    is_after_caffeine = serializers.BooleanField(default=False)
    is_after_exercise = serializers.BooleanField(default=False)
    is_after_medication = serializers.BooleanField(default=False)
    is_stressed = serializers.BooleanField(default=False)
    is_clinic_reading = serializers.BooleanField(default=False)
    is_fasting = serializers.BooleanField(default=False)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class BPSessionCreateSerializer(serializers.Serializer):
    """
    §CREATE: Creates a session with nested readings in one request.
    Expects: {profile, measured_at, readings: [{systolic, diastolic, pulse?, ...}], notes?}
    Creates BPSession + BPReading objects, computes session averages.
    """
    profile = serializers.PrimaryKeyRelatedField(queryset=HealthProfile.objects.all())
    measured_at = serializers.DateTimeField()
    readings = BPSessionReadingInputSerializer(many=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_profile(self, value):
        """§PERM: Ensure profile belongs to requesting user."""
        request = self.context.get('request')
        if request and value.user != request.user:
            raise serializers.ValidationError('Profile does not belong to you.')
        return value

    def validate_readings(self, value):
        """§MIN: Session must have at least 1 reading (ideally 2-3)."""
        if not value or len(value) == 0:
            raise serializers.ValidationError('At least one reading is required.')
        if len(value) > 10:
            raise serializers.ValidationError('Maximum 10 readings per session.')
        # Validate systolic > diastolic for each reading
        for i, reading in enumerate(value):
            if reading['systolic'] <= reading['diastolic']:
                raise serializers.ValidationError(
                    f'Reading {i + 1}: systolic must be greater than diastolic.'
                )
        return value

    def create(self, validated_data):
        """§PIPELINE: Create session → create readings → compute averages → check alerts."""
        from .bp_services import compute_session_averages, check_alerts

        readings_data = validated_data.pop('readings')
        user = self.context['request'].user

        session = BPSession.objects.create(user=user, **validated_data)

        all_alerts = []
        for reading_data in readings_data:
            reading = BPReading.objects.create(
                user=user,
                profile=validated_data['profile'],
                session=session,
                measured_at=validated_data['measured_at'],
                **reading_data,
            )
            # Check alerts for each reading
            alerts = check_alerts(reading)
            all_alerts.extend(alerts)

        # Compute and save session averages
        compute_session_averages(session)

        # Stash alerts on session for the view to include in response
        session._alerts = all_alerts
        return session


# ── BP Medication serializers ───────────────────────────────────────

class BPMedicationSerializer(serializers.ModelSerializer):
    """§MED: Full medication CRUD serializer."""
    profile_name = serializers.CharField(source='profile.full_name', read_only=True)
    adherence_rate = serializers.SerializerMethodField()

    class Meta:
        model = BPMedication
        fields = [
            'id', 'profile', 'profile_name',
            'name', 'dose', 'frequency',
            'started_at', 'ended_at', 'is_active',
            'notes', 'adherence_rate',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate_profile(self, value):
        """§PERM: Ensure profile belongs to requesting user."""
        request = self.context.get('request')
        if request and value.user != request.user:
            raise serializers.ValidationError('Profile does not belong to you.')
        return value

    def get_adherence_rate(self, obj):
        """§ADHERE: Percentage of days medication was taken (last 30 days)."""
        total = obj.logs.count()
        if total == 0:
            return None
        taken = obj.logs.filter(taken=True).count()
        return round((taken / total) * 100, 1)


# ── BP Med Log serializer ──────────────────────────────────────────

class BPMedLogSerializer(serializers.ModelSerializer):
    """§ADHERE: Daily medication adherence log entry."""
    medication_name = serializers.CharField(source='medication.name', read_only=True)

    class Meta:
        model = BPMedLog
        fields = [
            'id', 'medication', 'medication_name',
            'date', 'taken', 'taken_at',
        ]

    def validate_medication(self, value):
        """§PERM: Ensure medication belongs to requesting user."""
        request = self.context.get('request')
        if request and value.user != request.user:
            raise serializers.ValidationError('Medication does not belong to you.')
        return value


# ── BP Alert serializer ────────────────────────────────────────────

class BPAlertSerializer(serializers.ModelSerializer):
    """§ALERT: Alert with read status for the alert list."""
    profile_name = serializers.CharField(source='profile.full_name', read_only=True)
    reading_summary = serializers.SerializerMethodField()

    class Meta:
        model = BPAlert
        fields = [
            'id', 'profile', 'profile_name',
            'alert_type', 'severity',
            'title', 'title_bg', 'message', 'message_bg',
            'related_reading', 'reading_summary',
            'is_read', 'created_at',
        ]
        read_only_fields = ['created_at']

    def get_reading_summary(self, obj):
        """§CONTEXT: Include reading values for context in alert display."""
        if obj.related_reading:
            r = obj.related_reading
            return {
                'systolic': r.systolic,
                'diastolic': r.diastolic,
                'pulse': r.pulse,
                'measured_at': r.measured_at.isoformat(),
            }
        return None


# ── Dashboard / statistics serializers ──────────────────────────────

class BPDashboardSerializer(serializers.Serializer):
    """
    §DASH: Method serializer for BP dashboard endpoint.
    Not tied to a model — aggregates data from multiple sources.
    """
    latest_reading = BPReadingSerializer(allow_null=True)
    avg_7d = serializers.DictField(allow_null=True)
    avg_30d = serializers.DictField(allow_null=True)
    current_stage = serializers.CharField(allow_null=True)
    recent_readings = BPReadingSerializer(many=True)
    active_medications = BPMedicationSerializer(many=True)
    unread_alerts = serializers.IntegerField()
    reading_count_30d = serializers.IntegerField()
    trend = serializers.DictField(allow_null=True)


class BPStatisticsSerializer(serializers.Serializer):
    """§STATS: Method serializer for deep statistics endpoint."""
    statistics = serializers.DictField()
    circadian = serializers.DictField()
    white_coat = serializers.DictField()
    masked_hypertension = serializers.DictField()
    context_correlations = serializers.ListField()
    trend_projection = serializers.DictField()
    recommendations = serializers.ListField()


class BPExportSerializer(serializers.Serializer):
    """§EXPORT: Parameters for BP data export."""
    format = serializers.ChoiceField(choices=[('csv', 'CSV'), ('pdf', 'PDF')], default='csv')
    profile = serializers.PrimaryKeyRelatedField(queryset=HealthProfile.objects.all())
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    include_sessions = serializers.BooleanField(default=True)
    include_medications = serializers.BooleanField(default=False)

    def validate_profile(self, value):
        """§SECURITY: Prevent cross-user data export via crafted profile IDs."""
        request = self.context.get('request')
        if request and value.user_id != request.user.id:
            raise serializers.ValidationError('Profile does not belong to you.')
        return value
