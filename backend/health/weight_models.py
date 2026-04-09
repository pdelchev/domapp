# ── health/weight_models.py ───────────────────────────────────────────
# Weight tracking fused with BP: readings, dual-capture vitals sessions,
# goals, medication-effect knowledge base, append-only insight log.
#
# §NAV: weight_models → weight_serializers → weight_views → weight_urls → weight_services
# §OWNER: every row scoped by user FK (DomApp standard)
# §JOIN:  HealthProfile (shared w/ BP + blood + WHOOP), BPReading (via VitalsSession),
#         BPMedication (via attribution KB), BloodReport + WhoopRecovery (via insights)
# §WHY:   weight stands alone OR joins BP in a VitalsSession. Fusion is OPTIONAL
#         because users adopt incrementally — a morning weigh-in need not include BP.
# §V1:    P0 scope — no device sync, no menstrual overlay, no whoosh/plateau yet.
#         Those are stubbed in VitalsInsight.insight_type for forward compatibility.

from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator

from .models import HealthProfile


# ── Source + ritual enums ────────────────────────────────────────────
# §WHY: source tracks device provenance for idempotent webhook ingestion
#       and future trend-break detection when user switches scales.
#       V1 is manual/csv only; device sources kept in enum for forward compat.

SOURCE_MANUAL = 'manual'
SOURCE_CSV = 'csv'
SOURCE_WIZARD = 'wizard'
SOURCE_WITHINGS = 'withings'
SOURCE_APPLE = 'apple_health'
SOURCE_GARMIN = 'garmin'
SOURCE_RENPHO = 'renpho'

SOURCE_CHOICES = [
    (SOURCE_MANUAL, 'Manual'),
    (SOURCE_CSV, 'CSV Import'),
    (SOURCE_WIZARD, 'Daily Wizard'),
    (SOURCE_WITHINGS, 'Withings'),
    (SOURCE_APPLE, 'Apple Health'),
    (SOURCE_GARMIN, 'Garmin'),
    (SOURCE_RENPHO, 'Renpho'),
]

RITUAL_MORNING = 'morning'
RITUAL_EVENING = 'evening'
RITUAL_PRE_MEAL = 'pre_meal'
RITUAL_DOCTOR = 'doctor_visit'
RITUAL_CUSTOM = 'custom'

RITUAL_CHOICES = [
    (RITUAL_MORNING, 'Morning'),
    (RITUAL_EVENING, 'Evening'),
    (RITUAL_PRE_MEAL, 'Pre-Meal'),
    (RITUAL_DOCTOR, 'Doctor Visit'),
    (RITUAL_CUSTOM, 'Custom'),
]

# §GOAL: bp_driven back-solves target weight from desired systolic × personal slope
GOAL_LOSE = 'lose'
GOAL_GAIN = 'gain'
GOAL_MAINTAIN = 'maintain'
GOAL_BP_DRIVEN = 'bp_driven'

GOAL_TYPE_CHOICES = [
    (GOAL_LOSE, 'Lose'),
    (GOAL_GAIN, 'Gain'),
    (GOAL_MAINTAIN, 'Maintain'),
    (GOAL_BP_DRIVEN, 'BP-Driven'),
]

# §INSIGHT: append-only log types. V1 emits the first 4; rest stubbed.
INSIGHT_TYPE_CHOICES = [
    ('bp_per_kg_slope', 'BP per kg Slope'),
    ('cardiometabolic_age', 'Cardiometabolic Age'),
    ('osmotic_spike', 'Osmotic Spike'),
    ('stage_regression_forecast', 'Stage Regression Forecast'),
    ('goal_progress', 'Goal Progress'),
    # §V2: these types are reserved; emission deferred
    ('plateau', 'Plateau'),
    ('whoosh', 'Whoosh'),
    ('med_attribution', 'Medication Attribution'),
    ('trend_break', 'Trend Break'),
    ('smart_sampling', 'Smart Sampling'),
]


# ── WeightReading ────────────────────────────────────────────────────

class WeightReading(models.Model):
    """
    §READING: single scale capture (manual, CSV, or future device sync).
    §CONTEXT: context_flags JSON captures fasted/post_toilet/clothed tags.
              Powers smart-sampling analysis ("weigh fasted + post-toilet
              gives your cleanest trend"). V1 stores them; V2 analyzes.
    §IMPEDANCE: body_fat/muscle/water/visceral/bone optional — only set if
                user has a bioimpedance scale. Enables hydration-adjusted
                trend weight (V2).
    §IDEMP: (user, source, source_ref) unique WHERE source_ref≠'' guarantees
            webhook retries are safe (no double-counting).
    §INDEX: (profile, -measured_at) covers 99% of queries (trend, dashboard).
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='weight_readings')
    profile = models.ForeignKey(HealthProfile, on_delete=models.CASCADE,
                                related_name='weight_readings')
    session = models.ForeignKey('VitalsSession', on_delete=models.SET_NULL,
                                null=True, blank=True, related_name='weight_readings')

    measured_at = models.DateTimeField()
    weight_kg = models.DecimalField(
        max_digits=5, decimal_places=2,
        validators=[MinValueValidator(Decimal('20')), MaxValueValidator(Decimal('400'))],
    )

    # ── Bioimpedance (optional, device-only) ──
    body_fat_pct = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    muscle_mass_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    body_water_pct = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    visceral_fat_rating = models.SmallIntegerField(null=True, blank=True)  # 1-30 (Tanita/Renpho scale)
    bone_mass_kg = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)

    # ── Anthropometrics (manual tape) ──
    # §WHY: waist/hip correlate with visceral fat better than BMI alone
    waist_cm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    hip_cm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)

    # §CONTEXT: {fasted, post_toilet, post_workout, clothed, evening}
    context_flags = models.JSONField(default=dict, blank=True)

    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default=SOURCE_MANUAL)
    source_ref = models.CharField(max_length=120, blank=True, default='')  # external device reading UUID
    notes = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-measured_at']
        indexes = [
            models.Index(fields=['profile', '-measured_at']),  # §PERF: trend queries
            models.Index(fields=['user', '-measured_at']),
        ]
        constraints = [
            # §IDEMP: same device, same external reading → single row
            models.UniqueConstraint(
                fields=['user', 'source', 'source_ref'],
                condition=models.Q(source_ref__gt=''),
                name='uniq_weight_source_ref',
            ),
        ]

    def __str__(self):
        return f'{self.profile.full_name} {self.weight_kg}kg @ {self.measured_at:%Y-%m-%d}'

    @property
    def bmi(self):
        """§CALC: BMI from profile.height_cm. Returns None if height missing."""
        h = self.profile.height_cm
        if not h:
            return None
        h_m = float(h) / 100
        return round(float(self.weight_kg) / (h_m * h_m), 1)

    @property
    def waist_hip_ratio(self):
        """§CALC: WHR — cardiovascular risk marker (>0.9M/>0.85F = elevated)."""
        if self.waist_cm and self.hip_cm:
            return round(float(self.waist_cm) / float(self.hip_cm), 2)
        return None


# ── VitalsSession (fuses weight + BP into one ritual) ────────────────

class VitalsSession(models.Model):
    """
    §FUSION: joins a single WeightReading with N BPReadings captured in one
    sitting. Enables paired-data regressions (BP-per-kg slope).
    §OPTIONAL: BP-only sessions (no weight) and weight-only readings (no session)
    both valid. Session is a fusion affordance, not a gate.
    §CACHED: cached_summary denormalizes {weight_kg, sys, dia, pulse, stage, bmi}
    for O(1) dashboard reads. Populated on finalize(), never on save().
    §TTL: draft sessions older than 24h swept by celery task (future).
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='vitals_sessions')
    profile = models.ForeignKey(HealthProfile, on_delete=models.CASCADE,
                                related_name='vitals_sessions')

    started_at = models.DateTimeField()
    finalized_at = models.DateTimeField(null=True, blank=True)
    ritual_type = models.CharField(max_length=20, choices=RITUAL_CHOICES, default=RITUAL_MORNING)

    completed = models.BooleanField(default=False)
    weight_captured = models.BooleanField(default=False)
    bp_reading_count = models.SmallIntegerField(default=0)

    # §CACHED: {weight_kg, bmi, avg_systolic, avg_diastolic, avg_pulse, stage,
    #           waist_hip_ratio}. Recomputed by VitalsSessionService.finalize().
    cached_summary = models.JSONField(default=dict, blank=True)

    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-started_at']
        indexes = [models.Index(fields=['profile', '-started_at'])]

    def __str__(self):
        return f'{self.ritual_type} ritual @ {self.started_at:%Y-%m-%d %H:%M}'


# ── WeightGoal ───────────────────────────────────────────────────────

class WeightGoal(models.Model):
    """
    §GOAL: one active goal per profile (enforced in service layer, not DB —
    soft rule so users can experiment without migration pain).
    §BP_DRIVEN: if goal_type='bp_driven', target_weight_kg is back-solved
                from linked_bp_target.target_systolic × personal BP-per-kg slope.
                The derived number is stored on the goal for stability.
    §GUARDRAIL: weekly_rate_kg should be |0.25%..1.0%| of body weight.
                Validated at serializer level, not DB (medical advice nuance).
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='weight_goals')
    profile = models.ForeignKey(HealthProfile, on_delete=models.CASCADE,
                                related_name='weight_goals')

    goal_type = models.CharField(max_length=20, choices=GOAL_TYPE_CHOICES, default=GOAL_LOSE)

    start_weight_kg = models.DecimalField(max_digits=5, decimal_places=2)
    target_weight_kg = models.DecimalField(max_digits=5, decimal_places=2)
    weekly_rate_kg = models.DecimalField(max_digits=4, decimal_places=2)  # signed: neg = loss

    started_at = models.DateField()
    target_date = models.DateField()
    achieved_at = models.DateField(null=True, blank=True)

    # §BP_DRIVEN: {target_systolic, target_diastolic, slope_used, derived_kg}
    linked_bp_target = models.JSONField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_active', '-created_at']
        indexes = [models.Index(fields=['profile', 'is_active'])]

    def __str__(self):
        return f'{self.profile.full_name}: {self.start_weight_kg}→{self.target_weight_kg}kg by {self.target_date}'


# ── WeightMedicationEffect (curated KB) ──────────────────────────────

class WeightMedicationEffect(models.Model):
    """
    §KB: pre-seeded lookup table — drug → expected weight delta at steady state.
    §JOIN: matched fuzzily to BPMedication.name (case-insensitive + aliases)
           by weight_services.compute_medication_attribution().
    §ATTRIBUTION: lets user separate drug-attributable kg from behavior kg —
                  major anti-guilt feature. Not shown as medical advice.
    §BG: aliases include Bulgarian trade names (Concor, Lorista, Prestarium...).
    """
    EVIDENCE_CHOICES = [
        ('strong', 'Strong'),
        ('moderate', 'Moderate'),
        ('anecdotal', 'Anecdotal'),
    ]

    medication_name = models.CharField(max_length=120, unique=True)  # canonical INN name
    aliases = models.JSONField(default=list, blank=True)  # ['concor', 'bisoblock', 'bisoprolol']
    drug_class = models.CharField(max_length=60, blank=True, default='')  # beta_blocker, sglt2, etc.
    avg_weight_delta_kg = models.DecimalField(max_digits=3, decimal_places=1)  # signed steady-state
    onset_weeks = models.SmallIntegerField(default=8)
    evidence_level = models.CharField(max_length=10, choices=EVIDENCE_CHOICES, default='moderate')
    mechanism = models.TextField(blank=True, default='')      # EN — 1-sentence explainer
    mechanism_bg = models.TextField(blank=True, default='')   # BG

    class Meta:
        ordering = ['medication_name']

    def __str__(self):
        sign = '+' if self.avg_weight_delta_kg > 0 else ''
        return f'{self.medication_name} ({sign}{self.avg_weight_delta_kg}kg)'


# ── VitalsInsight (append-only derived data log) ─────────────────────

class VitalsInsight(models.Model):
    """
    §DERIVED: append-only log of all computed insights (slopes, spikes, ages).
    §WHY: never mutate — supersede via superseded_by_id. Enables audit,
          safe recomputation, and A/B comparison of algorithm versions.
    §ALGO_VERSION: lets us re-run old data with new logic without destroying
                   historical insights. Bump string when algorithm changes.
    §INDEX: (profile, insight_type, -computed_at) + superseded_by IS NULL
            covers the hot "latest active insight per type" query.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='vitals_insights')
    profile = models.ForeignKey(HealthProfile, on_delete=models.CASCADE,
                                related_name='vitals_insights')

    insight_type = models.CharField(max_length=40, choices=INSIGHT_TYPE_CHOICES)
    computed_at = models.DateTimeField(auto_now_add=True)
    window_start = models.DateField(null=True, blank=True)
    window_end = models.DateField(null=True, blank=True)

    payload = models.JSONField()  # type-specific; see weight_services for shape
    confidence = models.DecimalField(max_digits=3, decimal_places=2, default=Decimal('0.50'))
    algo_version = models.CharField(max_length=10, default='v1')

    superseded_by = models.ForeignKey('self', on_delete=models.SET_NULL,
                                      null=True, blank=True, related_name='supersedes')

    class Meta:
        ordering = ['-computed_at']
        indexes = [
            models.Index(fields=['profile', 'insight_type', '-computed_at']),
            models.Index(fields=['profile', '-computed_at']),
        ]

    def __str__(self):
        return f'{self.insight_type} @ {self.computed_at:%Y-%m-%d} (conf={self.confidence})'
