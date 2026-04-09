"""
Serializers for the unified Health Hub daily tracking.

§NAV: daily_models.py → daily_services.py → daily_serializers.py → daily_views.py
§SECURITY: All profile-accepting fields validate ownership via validate_profile().
§PERF: List serializers exclude heavy fields (photos served as URLs only).
"""

from rest_framework import serializers
from .daily_models import DailyLog, Supplement, SupplementSchedule, DoseLog, MetricTimeline
from .models import HealthProfile


class _ProfileOwnershipMixin:
    """
    §SECURITY: Validates that the profile belongs to the requesting user.
    Applied to every serializer that accepts a profile FK.
    Prevents cross-user data access via crafted profile IDs.
    """
    def validate_profile(self, value):
        request = self.context.get('request')
        if request and value.user_id != request.user.id:
            raise serializers.ValidationError('Profile does not belong to you.')
        return value


# ──────────────────────────────────────────────────────────────
# §SER: DailyLog
# ──────────────────────────────────────────────────────────────

class DailyLogSerializer(_ProfileOwnershipMixin, serializers.ModelSerializer):
    """Full DailyLog for read/detail views."""
    profile = serializers.PrimaryKeyRelatedField(
        queryset=HealthProfile.objects.all()
    )

    class Meta:
        model = DailyLog
        fields = [
            'id', 'profile', 'date', 'mood', 'energy',
            'sleep_hours', 'sleep_quality', 'pain_level', 'stress_level',
            'water_ml', 'notes', 'wizard_completed', 'completed_at',
            'dose_adherence_pct', 'cached_summary',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'dose_adherence_pct', 'cached_summary']


class WizardSubmitSerializer(serializers.Serializer):
    """
    §WIZARD: Accepts the full wizard payload in one POST.
    Validates all fields, delegates to submit_wizard() service.
    """
    date = serializers.DateField(required=False)
    profile_id = serializers.IntegerField()

    # Step 1: How are you?
    mood = serializers.IntegerField(min_value=1, max_value=5, required=False, allow_null=True)
    energy = serializers.IntegerField(min_value=1, max_value=5, required=False, allow_null=True)
    sleep_hours = serializers.DecimalField(max_digits=3, decimal_places=1, required=False, allow_null=True)
    sleep_quality = serializers.IntegerField(min_value=1, max_value=5, required=False, allow_null=True)
    pain_level = serializers.IntegerField(min_value=0, max_value=10, required=False, default=0)
    stress_level = serializers.IntegerField(min_value=1, max_value=5, required=False, allow_null=True)

    # Step 2: Weight (optional)
    weight = serializers.DictField(required=False, allow_null=True)

    # Step 3: BP (optional)
    bp = serializers.DictField(required=False, allow_null=True)

    # Step 4: Water
    water_ml = serializers.IntegerField(min_value=0, required=False, default=0)

    # Step 5: Doses
    doses = serializers.ListField(
        child=serializers.DictField(), required=False, default=list
    )

    notes = serializers.CharField(required=False, default='', allow_blank=True)

    def validate_profile_id(self, value):
        """§SECURITY: Ensure profile belongs to requesting user."""
        request = self.context.get('request')
        if not request:
            raise serializers.ValidationError('Request context required.')
        try:
            profile = HealthProfile.objects.get(id=value, user=request.user)
        except HealthProfile.DoesNotExist:
            raise serializers.ValidationError('Profile not found or not yours.')
        return value

    def validate_weight(self, value):
        if value is None:
            return value
        if 'value' in value:
            v = value['value']
            if v is not None and (v < 20 or v > 300):
                raise serializers.ValidationError('Weight must be between 20-300 kg.')
        return value

    def validate_bp(self, value):
        if value is None:
            return value
        sys = value.get('systolic')
        dia = value.get('diastolic')
        if sys and (sys < 60 or sys > 300):
            raise serializers.ValidationError('Systolic must be 60-300.')
        if dia and (dia < 30 or dia > 200):
            raise serializers.ValidationError('Diastolic must be 30-200.')
        return value


# ──────────────────────────────────────────────────────────────
# §SER: Supplement
# ──────────────────────────────────────────────────────────────

class SupplementListSerializer(serializers.ModelSerializer):
    """
    §LIST: Lightweight serializer for supplement catalog list.
    Excludes interactions/notes to reduce payload.
    """
    days_remaining = serializers.SerializerMethodField()
    active_schedules = serializers.SerializerMethodField()

    class Meta:
        model = Supplement
        fields = [
            'id', 'name', 'name_bg', 'category', 'form',
            'color', 'shape', 'size', 'photo', 'photo_closeup',
            'strength', 'strength_unit', 'manufacturer',
            'is_prescription', 'is_active',
            'current_stock', 'days_remaining', 'active_schedules',
            'started_at', 'linked_biomarkers',
        ]

    def get_days_remaining(self, obj):
        return obj.days_of_stock_remaining

    def get_active_schedules(self, obj):
        return obj.schedules.filter(is_active=True).count()


class SupplementDetailSerializer(serializers.ModelSerializer):
    """§DETAIL: Full supplement with all fields."""
    days_remaining = serializers.SerializerMethodField()
    schedules = serializers.SerializerMethodField()

    class Meta:
        model = Supplement
        fields = [
            'id', 'name', 'name_bg', 'category', 'form',
            'color', 'shape', 'size', 'photo', 'photo_closeup',
            'manufacturer', 'strength', 'strength_unit', 'barcode',
            'pack_size', 'current_stock', 'low_stock_threshold', 'days_remaining',
            'is_prescription', 'prescribing_doctor', 'prescription_note',
            'linked_biomarkers', 'interactions',
            'is_active', 'started_at', 'discontinued_at', 'discontinue_reason',
            'notes', 'schedules',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_days_remaining(self, obj):
        return obj.days_of_stock_remaining

    def get_schedules(self, obj):
        schedules = obj.schedules.filter(is_active=True).select_related('profile')
        return SupplementScheduleSerializer(schedules, many=True).data


class SupplementCreateSerializer(serializers.ModelSerializer):
    """§CREATE: Supplement creation with validation."""

    class Meta:
        model = Supplement
        fields = [
            'name', 'name_bg', 'category', 'form',
            'color', 'shape', 'size',
            'manufacturer', 'strength', 'strength_unit', 'barcode',
            'pack_size', 'current_stock', 'low_stock_threshold',
            'is_prescription', 'prescribing_doctor', 'prescription_note',
            'linked_biomarkers', 'interactions',
            'started_at', 'notes',
        ]


# ──────────────────────────────────────────────────────────────
# §SER: SupplementSchedule
# ──────────────────────────────────────────────────────────────

class SupplementScheduleSerializer(_ProfileOwnershipMixin, serializers.ModelSerializer):
    """Full schedule serializer for CRUD."""
    supplement_name = serializers.CharField(source='supplement.name', read_only=True)
    supplement_photo = serializers.ImageField(source='supplement.photo_closeup', read_only=True)
    profile = serializers.PrimaryKeyRelatedField(
        queryset=HealthProfile.objects.all()
    )

    class Meta:
        model = SupplementSchedule
        fields = [
            'id', 'supplement', 'supplement_name', 'supplement_photo',
            'profile', 'time_slot', 'preferred_time',
            'dose_amount', 'dose_unit', 'split_count',
            'take_with_food', 'take_with_water', 'take_on_empty_stomach',
            'condition', 'days_of_week',
            'start_date', 'end_date', 'is_active',
            'sort_order', 'notes',
        ]
        read_only_fields = ['id']

    def validate_supplement(self, value):
        """§SECURITY: Ensure supplement belongs to requesting user."""
        request = self.context.get('request')
        if request and value.user_id != request.user.id:
            raise serializers.ValidationError('Supplement does not belong to you.')
        return value


# ──────────────────────────────────────────────────────────────
# §SER: DoseLog
# ──────────────────────────────────────────────────────────────

class DoseLogSerializer(serializers.ModelSerializer):
    supplement_name = serializers.CharField(source='schedule.supplement.name', read_only=True)

    class Meta:
        model = DoseLog
        fields = [
            'id', 'schedule', 'supplement_name',
            'date', 'taken', 'taken_at', 'skipped_reason', 'notes',
        ]
        read_only_fields = ['id']


class BatchDoseSerializer(serializers.Serializer):
    """§BATCH: Log multiple doses at once."""
    date = serializers.DateField(required=False)
    doses = serializers.ListField(
        child=serializers.DictField(),
        min_length=1,
        help_text='[{schedule_id, taken, reason?}]'
    )


# ──────────────────────────────────────────────────────────────
# §SER: MetricTimeline
# ──────────────────────────────────────────────────────────────

class MetricTimelineSerializer(serializers.ModelSerializer):
    class Meta:
        model = MetricTimeline
        fields = ['date', 'metric_type', 'value', 'unit', 'context']


class TimelineQuerySerializer(serializers.Serializer):
    """§QUERY: Validates timeline query parameters."""
    profile_id = serializers.IntegerField(required=False)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    metrics = serializers.CharField(
        required=False,
        help_text='Comma-separated metric types (e.g., "weight,bp_systolic,mood")'
    )
