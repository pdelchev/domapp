from django.contrib import admin
from .models import (
    BiomarkerCategory, Biomarker, HealthProfile,
    BloodReport, BloodResult, HealthRecommendation,
    HealthScoreSnapshot, Intervention,
)
from .whoop_models import (
    WhoopConnection, WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout,
)
from .gout_models import GoutAttack, AttackTrigger, UricAcidReading, MedicalProcedure
from .daily_models import DailyLog, Supplement, SupplementSchedule, DoseLog


class BiomarkerInline(admin.TabularInline):
    model = Biomarker
    extra = 0
    fields = ('name', 'abbreviation', 'unit', 'ref_min_male', 'ref_max_male', 'sort_order')


@admin.register(BiomarkerCategory)
class BiomarkerCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'body_system', 'sort_order')
    inlines = [BiomarkerInline]


@admin.register(Biomarker)
class BiomarkerAdmin(admin.ModelAdmin):
    list_display = ('name', 'abbreviation', 'category', 'unit', 'ref_min_male', 'ref_max_male')
    list_filter = ('category',)
    search_fields = ('name', 'abbreviation', 'aliases')


class BloodResultInline(admin.TabularInline):
    model = BloodResult
    extra = 0
    fields = ('biomarker', 'value', 'unit', 'flag', 'deviation_pct')
    readonly_fields = ('flag', 'deviation_pct')


class RecommendationInline(admin.TabularInline):
    model = HealthRecommendation
    extra = 0
    fields = ('category', 'priority', 'title', 'description')


@admin.register(HealthProfile)
class HealthProfileAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'user', 'sex', 'is_primary', 'date_of_birth')
    list_filter = ('sex', 'is_primary')


@admin.register(BloodReport)
class BloodReportAdmin(admin.ModelAdmin):
    list_display = ('profile', 'test_date', 'lab_type', 'overall_score', 'created_at')
    list_filter = ('lab_type',)
    inlines = [BloodResultInline, RecommendationInline]


@admin.register(BloodResult)
class BloodResultAdmin(admin.ModelAdmin):
    list_display = ('report', 'biomarker', 'value', 'unit', 'flag', 'deviation_pct')
    list_filter = ('flag', 'biomarker__category')


@admin.register(HealthScoreSnapshot)
class HealthScoreSnapshotAdmin(admin.ModelAdmin):
    list_display = ('date', 'profile', 'composite_score', 'blood_score', 'bp_score', 'recovery_score', 'confidence')
    list_filter = ('profile',)
    date_hierarchy = 'date'
    readonly_fields = ('computed_at',)


@admin.register(Intervention)
class InterventionAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'profile', 'started_on', 'ended_on', 'evidence_grade')
    list_filter = ('category', 'evidence_grade')
    search_fields = ('name', 'hypothesis', 'notes')
    date_hierarchy = 'started_on'


# ── WHOOP integration admin ───────────────────────────────────────

@admin.register(WhoopConnection)
class WhoopConnectionAdmin(admin.ModelAdmin):
    list_display = ('user', 'whoop_user_id', 'is_active', 'last_sync_at', 'connected_at')
    list_filter = ('is_active',)
    readonly_fields = ('access_token', 'refresh_token', 'token_expires_at')


class WhoopRecoveryInline(admin.StackedInline):
    model = WhoopRecovery
    extra = 0
    fields = ('score_state', 'recovery_score', 'resting_heart_rate', 'hrv_rmssd_milli', 'spo2_percentage')


@admin.register(WhoopCycle)
class WhoopCycleAdmin(admin.ModelAdmin):
    list_display = ('whoop_id', 'user', 'start', 'score_state', 'strain', 'average_heart_rate')
    list_filter = ('score_state',)
    inlines = [WhoopRecoveryInline]


@admin.register(WhoopRecovery)
class WhoopRecoveryAdmin(admin.ModelAdmin):
    list_display = ('cycle', 'user', 'score_state', 'recovery_score', 'resting_heart_rate', 'hrv_rmssd_milli')
    list_filter = ('score_state', 'user_calibrating')


@admin.register(WhoopSleep)
class WhoopSleepAdmin(admin.ModelAdmin):
    list_display = ('whoop_id', 'user', 'start', 'nap', 'score_state', 'sleep_performance_pct', 'sleep_efficiency_pct')
    list_filter = ('score_state', 'nap')


@admin.register(WhoopWorkout)
class WhoopWorkoutAdmin(admin.ModelAdmin):
    list_display = ('whoop_id', 'user', 'sport_name', 'start', 'score_state', 'strain', 'average_heart_rate')
    list_filter = ('score_state', 'sport_name')


# ═══ GOUT & JOINT HEALTH ═══

@admin.register(GoutAttack)
class GoutAttackAdmin(admin.ModelAdmin):
    list_display = ('user', 'onset_date', 'joint', 'side', 'severity', 'medication', 'resolved_date')
    list_filter = ('joint', 'severity', 'medication')
    date_hierarchy = 'onset_date'

@admin.register(UricAcidReading)
class UricAcidReadingAdmin(admin.ModelAdmin):
    list_display = ('user', 'measured_at', 'value')
    date_hierarchy = 'measured_at'

@admin.register(MedicalProcedure)
class MedicalProcedureAdmin(admin.ModelAdmin):
    list_display = ('user', 'procedure_date', 'procedure_type', 'joint', 'doctor')
    list_filter = ('procedure_type',)
    date_hierarchy = 'procedure_date'


# ═══ UNIFIED DAILY TRACKING ═══

@admin.register(DailyLog)
class DailyLogAdmin(admin.ModelAdmin):
    list_display = ('profile', 'date', 'mood', 'energy', 'water_ml', 'dose_adherence_pct', 'wizard_completed')
    list_filter = ('wizard_completed', 'profile')
    date_hierarchy = 'date'


class SupplementScheduleInline(admin.TabularInline):
    model = SupplementSchedule
    extra = 0
    fields = ('profile', 'time_slot', 'dose_amount', 'dose_unit', 'split_count', 'condition', 'is_active')


@admin.register(Supplement)
class SupplementAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'form', 'strength', 'current_stock', 'is_active', 'is_prescription')
    list_filter = ('category', 'form', 'is_active', 'is_prescription')
    search_fields = ('name', 'manufacturer')
    inlines = [SupplementScheduleInline]


@admin.register(DoseLog)
class DoseLogAdmin(admin.ModelAdmin):
    list_display = ('schedule', 'date', 'taken', 'taken_at', 'skipped_reason')
    list_filter = ('taken', 'date')
    date_hierarchy = 'date'
