"""
Serializers for the unified Health Hub daily tracking.

§NAV: daily_models.py → daily_services.py → daily_serializers.py → daily_views.py
§SECURITY: All profile-accepting fields validate ownership via validate_profile().
§PERF: List serializers exclude heavy fields (photos served as URLs only).
"""

from rest_framework import serializers
from .daily_models import DailyLog, Supplement, SupplementSchedule, DoseLog, MetricTimeline, EmergencyCard, Symptom, WeatherSnapshot, CaregiverRelationship, MedicationReminder, ReminderLog
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
    monthly_cost = serializers.SerializerMethodField()

    class Meta:
        model = Supplement
        fields = [
            'id', 'name', 'name_bg', 'category', 'form',
            'color', 'shape', 'size', 'photo', 'photo_closeup',
            'strength', 'strength_unit', 'manufacturer',
            'is_prescription', 'is_active',
            'current_stock', 'days_remaining', 'active_schedules',
            'started_at', 'linked_biomarkers',
            'cost', 'currency', 'purchase_date', 'monthly_cost',
        ]

    def get_days_remaining(self, obj):
        return obj.days_of_stock_remaining

    def get_active_schedules(self, obj):
        return obj.schedules.filter(is_active=True).count()

    def get_monthly_cost(self, obj):
        return obj.monthly_cost


class SupplementDetailSerializer(serializers.ModelSerializer):
    """§DETAIL: Full supplement with all fields."""
    days_remaining = serializers.SerializerMethodField()
    schedules = serializers.SerializerMethodField()
    monthly_cost = serializers.SerializerMethodField()
    cost_per_unit = serializers.SerializerMethodField()

    class Meta:
        model = Supplement
        fields = [
            'id', 'name', 'name_bg', 'category', 'form',
            'color', 'shape', 'size', 'photo', 'photo_closeup',
            'manufacturer', 'strength', 'strength_unit', 'barcode',
            'pack_size', 'current_stock', 'low_stock_threshold', 'days_remaining',
            'cost', 'currency', 'purchase_date', 'cost_per_unit', 'monthly_cost',
            'is_prescription', 'prescribing_doctor', 'prescription_note',
            'linked_biomarkers', 'interactions',
            'is_active', 'started_at', 'discontinued_at', 'discontinue_reason',
            'notes', 'schedules',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_days_remaining(self, obj):
        return obj.days_of_stock_remaining

    def get_monthly_cost(self, obj):
        return obj.monthly_cost

    def get_cost_per_unit(self, obj):
        return obj.cost_per_unit

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
            'cost', 'currency', 'purchase_date',
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


# ──────────────────────────────────────────────────────────────
# §SER: EmergencyCard
# ──────────────────────────────────────────────────────────────

class EmergencyCardSerializer(serializers.ModelSerializer):
    """
    §SER: EmergencyCard read/write.
    profile_full_name and active_medications are read-only convenience fields
    so the offline page can render everything from a single payload.
    """
    profile_full_name = serializers.CharField(source='profile.full_name', read_only=True)
    profile_dob = serializers.DateField(source='profile.date_of_birth', read_only=True)
    profile_sex = serializers.CharField(source='profile.sex', read_only=True)
    active_medications = serializers.SerializerMethodField()

    class Meta:
        model = EmergencyCard
        fields = [
            'profile', 'profile_full_name', 'profile_dob', 'profile_sex',
            'blood_type',
            'allergies', 'chronic_conditions',
            'current_medications_text', 'active_medications',
            'recent_surgeries', 'implants',
            'organ_donor', 'dnr', 'advance_directive_url',
            'insurance_provider', 'insurance_number',
            'emergency_contacts',
            'primary_doctor_name', 'primary_doctor_phone',
            'notes', 'updated_at',
        ]
        read_only_fields = ['profile', 'updated_at']

    def get_active_medications(self, obj):
        """
        Pulls active prescription/medication supplements from the catalog so
        the user doesn't have to maintain two lists.
        """
        meds = (
            Supplement.objects
            .filter(
                user=obj.profile.user,
                is_active=True,
                category__in=['medication', 'otc', 'injection'],
            )
            .order_by('name')
        )
        return [
            {
                'name': m.name,
                'strength': m.strength,
                'form': m.form,
                'is_prescription': m.is_prescription,
            }
            for m in meds
        ]


class SymptomSerializer(_ProfileOwnershipMixin, serializers.ModelSerializer):
    """Full CRUD serializer for Symptom."""
    profile = serializers.PrimaryKeyRelatedField(queryset=HealthProfile.objects.all())
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = Symptom
        fields = [
            'id', 'profile', 'category', 'category_display',
            'severity', 'occurred_at', 'duration_minutes',
            'body_location', 'triggers', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class WeatherSnapshotSerializer(_ProfileOwnershipMixin, serializers.ModelSerializer):
    """Weather data serializer for correlations analysis."""
    profile = serializers.PrimaryKeyRelatedField(queryset=HealthProfile.objects.all())
    condition_display = serializers.CharField(source='get_condition_display', read_only=True)

    class Meta:
        model = WeatherSnapshot
        fields = [
            'id', 'profile', 'date', 'location',
            'temperature_celsius', 'temp_min', 'temp_max',
            'humidity_percent', 'pressure_hpa', 'wind_speed_kmh',
            'precipitation_mm', 'air_quality_index',
            'condition', 'condition_display', 'condition_detail',
            'data_source', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class CaregiverRelationshipSerializer(serializers.ModelSerializer):
    """Caregiver relationship serializer for invite management."""
    from accounts.serializers import UserSerializer

    profile_name = serializers.CharField(source='profile.full_name', read_only=True)
    caregiver_name = serializers.CharField(source='caregiver_user.get_full_name', read_only=True)
    caregiver_email = serializers.CharField(source='caregiver_user.email', read_only=True)
    caregiver_user_id = serializers.IntegerField(source='caregiver_user.id', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = CaregiverRelationship
        fields = [
            'id', 'profile', 'profile_name', 'caregiver_user', 'caregiver_user_id',
            'caregiver_name', 'caregiver_email', 'permissions', 'status', 'status_display',
            'relationship_note', 'created_at', 'accepted_at', 'revoked_at',
        ]
        read_only_fields = [
            'id', 'caregiver_name', 'caregiver_email', 'caregiver_user_id',
            'status_display', 'created_at', 'accepted_at', 'revoked_at'
        ]

    def validate_profile(self, value):
        """Ensure profile belongs to the requesting user (primary)."""
        if value.user_id != self.context['request'].user.id:
            raise serializers.ValidationError('Profile not owned by user.')
        return value

    def validate_caregiver_user(self, value):
        """Prevent inviting yourself."""
        if value.id == self.context['request'].user.id:
            raise serializers.ValidationError('Cannot invite yourself.')
        return value


class CaregiverInviteListSerializer(serializers.ModelSerializer):
    """Simplified caregiver relationship list (for caregiver's pending/accepted list)."""
    primary_name = serializers.CharField(source='user.get_full_name', read_only=True)
    primary_email = serializers.CharField(source='user.email', read_only=True)
    profile_name = serializers.CharField(source='profile.full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = CaregiverRelationship
        fields = [
            'id', 'profile', 'profile_name', 'primary_name', 'primary_email',
            'permissions', 'status', 'status_display', 'relationship_note',
            'created_at', 'accepted_at',
        ]
        read_only_fields = fields


class ReminderLogSerializer(serializers.ModelSerializer):
    """Adherence log for a medication reminder on a specific date."""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    medication_name = serializers.CharField(source='reminder.medication_name', read_only=True)
    reminder_time = serializers.TimeField(source='reminder.reminder_time', read_only=True)

    class Meta:
        model = ReminderLog
        fields = [
            'id', 'reminder', 'medication_name', 'reminder_time', 'date',
            'status', 'status_display', 'taken_at', 'snoozed_until', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'medication_name', 'reminder_time']


class MedicationReminderSerializer(_ProfileOwnershipMixin, serializers.ModelSerializer):
    """Full CRUD serializer for medication reminders."""
    profile = serializers.PrimaryKeyRelatedField(queryset=HealthProfile.objects.all())
    frequency_display = serializers.CharField(source='get_frequency_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    adherence_rate = serializers.SerializerMethodField(read_only=True)
    supplement_name = serializers.CharField(source='supplement.name', read_only=True, allow_null=True)

    class Meta:
        model = MedicationReminder
        fields = [
            'id', 'profile', 'supplement', 'supplement_name', 'medication_name',
            'reminder_time', 'frequency', 'frequency_display', 'custom_days',
            'start_date', 'end_date', 'dosage', 'instructions', 'notes',
            'status', 'status_display', 'last_taken_at', 'taken_count', 'skipped_count',
            'adherence_rate', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'frequency_display', 'status_display', 'adherence_rate',
            'supplement_name', 'last_taken_at', 'taken_count', 'skipped_count',
            'created_at', 'updated_at'
        ]

    def get_adherence_rate(self, obj):
        """Return adherence rate as percentage."""
        return obj.adherence_rate


class MedicationReminderListSerializer(serializers.ModelSerializer):
    """Simplified list serializer (excludes logs)."""
    frequency_display = serializers.CharField(source='get_frequency_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    adherence_rate = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = MedicationReminder
        fields = [
            'id', 'profile', 'medication_name', 'reminder_time', 'frequency',
            'frequency_display', 'status', 'status_display', 'dosage',
            'taken_count', 'skipped_count', 'adherence_rate',
        ]
        read_only_fields = fields

    def get_adherence_rate(self, obj):
        return obj.adherence_rate
