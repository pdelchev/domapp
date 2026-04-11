# ── health/models.py ──────────────────────────────────────────────────
# Blood results tracking: profiles, reports, biomarkers, results, recommendations.
# Schema: HealthProfile → BloodReport → BloodResult → Biomarker → BiomarkerCategory
#
# §NAV: models → serializers → views → urls → parsers → services → recommendations
# §OWNER: every HealthProfile scoped by user FK (same pattern as all DomApp models)
# §SEED: BiomarkerCategory + Biomarker populated via `python manage.py seed_biomarkers`

from django.db import models
from django.conf import settings


# ── Category grouping for biomarkers (CBC, Lipid Panel, etc.) ────────

class BiomarkerCategory(models.Model):
    """
    §GRP: Groups biomarkers into clinical panels (e.g., "Lipid Panel", "CBC").
    Seeded — not user-editable. Used for frontend section headers + system scoring.
    """
    name = models.CharField(max_length=100)          # English
    name_bg = models.CharField(max_length=100)        # Bulgarian
    slug = models.SlugField(unique=True)              # URL/key: 'lipid_panel'
    icon = models.CharField(max_length=10, blank=True, default='')  # Emoji icon
    body_system = models.CharField(max_length=50, blank=True, default='')  # liver, kidney, heart, blood, thyroid, metabolic, immune, nutrition
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ['sort_order']
        verbose_name_plural = 'Biomarker categories'

    def __str__(self):
        return self.name


# ── Canonical biomarker reference data ───────────────────────────────

class Biomarker(models.Model):
    """
    §REF: Canonical biomarker definitions with reference ranges + educational content.
    Seeded via management command. One row per test type (e.g., "Hemoglobin").

    §RANGE: Reference ranges split by sex. `optimal_*` is tighter "ideal" range.
    §MATCH: `aliases` JSON array enables fuzzy matching from PDF text → canonical marker.
    §UNIT: `alt_units` stores conversion factors for labs using different units.
    """
    category = models.ForeignKey(BiomarkerCategory, on_delete=models.CASCADE, related_name='biomarkers')
    name = models.CharField(max_length=200)                    # "Hemoglobin"
    name_bg = models.CharField(max_length=200, blank=True, default='')  # "Хемоглобин"
    abbreviation = models.CharField(max_length=50, blank=True, default='')  # "Hgb", "HGB"
    aliases = models.JSONField(default=list, blank=True)       # ["Hb", "HGB", "Хемоглобин"] for PDF matching
    unit = models.CharField(max_length=50)                     # Primary unit: "g/L"
    alt_units = models.JSONField(default=list, blank=True)     # [{"unit": "g/dL", "factor": 0.1}]

    # ── Reference ranges (sex-specific) ──
    ref_min_male = models.FloatField(null=True, blank=True)
    ref_max_male = models.FloatField(null=True, blank=True)
    ref_min_female = models.FloatField(null=True, blank=True)
    ref_max_female = models.FloatField(null=True, blank=True)
    # Optimal = tighter "ideal" range (green zone vs just "normal")
    optimal_min = models.FloatField(null=True, blank=True)
    optimal_max = models.FloatField(null=True, blank=True)
    # Critical thresholds (immediate medical attention)
    critical_low = models.FloatField(null=True, blank=True)
    critical_high = models.FloatField(null=True, blank=True)

    # ── Educational content (bilingual) ──
    description = models.TextField(blank=True, default='')        # What this measures
    description_bg = models.TextField(blank=True, default='')
    high_meaning = models.TextField(blank=True, default='')       # What HIGH means
    high_meaning_bg = models.TextField(blank=True, default='')
    low_meaning = models.TextField(blank=True, default='')        # What LOW means
    low_meaning_bg = models.TextField(blank=True, default='')
    improve_tips = models.JSONField(default=list, blank=True)     # ["Eat more leafy greens", ...]
    improve_tips_bg = models.JSONField(default=list, blank=True)

    # ── Relationships ──
    related_biomarkers = models.ManyToManyField('self', blank=True, symmetrical=True)  # Iron ↔ Ferritin ↔ Hgb
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ['category__sort_order', 'sort_order']

    def __str__(self):
        return f"{self.abbreviation or self.name} ({self.unit})"

    def get_ref_range(self, sex='male'):
        """§CALC: Return (min, max) reference range for given sex."""
        if sex == 'female':
            return (self.ref_min_female or self.ref_min_male, self.ref_max_female or self.ref_max_male)
        return (self.ref_min_male, self.ref_max_male)


# ── Health profile (self + family members) ───────────────────────────

class HealthProfile(models.Model):
    """
    §PERSON: Represents a person whose blood results are tracked.
    One user can have multiple profiles (self, spouse, parent, child).
    `is_primary=True` marks the user's own profile (auto-created on first visit).
    """
    SEX_CHOICES = [('male', 'Male'), ('female', 'Female')]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='health_profiles')
    full_name = models.CharField(max_length=200)
    date_of_birth = models.DateField(null=True, blank=True)
    sex = models.CharField(max_length=10, choices=SEX_CHOICES, default='male')
    height_cm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)  # §BMI: needed for weight module (BMI + body comp)
    is_primary = models.BooleanField(default=False)  # Is this the logged-in user?
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_primary', 'full_name']

    def __str__(self):
        return f"{self.full_name} ({'primary' if self.is_primary else 'family'})"


# ── Blood report (one per lab visit) ────────────────────────────────

class BloodReport(models.Model):
    """
    §REPORT: One lab visit = one report. Contains N results (BloodResult rows).
    `file` stores the original PDF. `parsed_raw` stores raw parse output for debugging.

    §SCORE: `overall_score` (0-100) and `system_scores` computed by services.py after results saved.
    §PARSE: `lab_type` determines which parser to use. Auto-detected from PDF content.
    """
    LAB_CHOICES = [
        ('ramus', 'Ramus'),
        ('lina', 'LINA'),
        ('acibadem', 'Acibadem'),
        ('cibalab', 'Cibalab'),
        ('other', 'Other'),
        ('manual', 'Manual Entry'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='blood_reports')
    profile = models.ForeignKey(HealthProfile, on_delete=models.CASCADE, related_name='reports')
    test_date = models.DateField()
    lab_name = models.CharField(max_length=200, blank=True, default='')
    lab_type = models.CharField(max_length=20, choices=LAB_CHOICES, default='other')
    file = models.FileField(upload_to='health/reports/%Y/%m/', null=True, blank=True)
    file_name = models.CharField(max_length=255, blank=True, default='')
    notes = models.TextField(blank=True, default='')

    # Computed health scores (set by services.compute_report_scores)
    overall_score = models.IntegerField(null=True, blank=True)   # 0-100 composite
    system_scores = models.JSONField(default=dict, blank=True)   # {"liver": 85, "kidney": 92, ...}

    # Parse metadata
    parsed_raw = models.JSONField(default=dict, blank=True)      # Raw parser output for debugging
    parse_warnings = models.JSONField(default=list, blank=True)  # ["Could not match: XYZ"]

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-test_date', '-created_at']
        indexes = [
            models.Index(fields=['user', 'profile', '-test_date']),
            models.Index(fields=['user', '-test_date']),
        ]

    def __str__(self):
        return f"{self.profile.full_name} — {self.test_date} ({self.lab_name or self.lab_type})"

    def save(self, *args, **kwargs):
        if self.file and not self.file_name:
            self.file_name = self.file.name.split('/')[-1]
        super().save(*args, **kwargs)


# ── Individual blood result (one per biomarker per report) ───────────

class BloodResult(models.Model):
    """
    §RESULT: Single biomarker reading within a report.
    `flag` computed by services.classify_result() based on value vs reference range.
    `deviation_pct` shows how far outside range (0 = in range, 15 = 15% above max).

    §TREND: Query all BloodResults for same biomarker + profile ordered by report date
             to build history/trend for that marker.
    """
    FLAG_CHOICES = [
        ('optimal', 'Optimal'),
        ('normal', 'Normal'),
        ('borderline_high', 'Borderline High'),
        ('borderline_low', 'Borderline Low'),
        ('high', 'High'),
        ('low', 'Low'),
        ('critical_high', 'Critical High'),
        ('critical_low', 'Critical Low'),
    ]

    report = models.ForeignKey(BloodReport, on_delete=models.CASCADE, related_name='results')
    biomarker = models.ForeignKey(Biomarker, on_delete=models.CASCADE, related_name='results')
    value = models.FloatField()
    unit = models.CharField(max_length=50)
    flag = models.CharField(max_length=20, choices=FLAG_CHOICES, default='normal')
    deviation_pct = models.FloatField(null=True, blank=True)     # % outside reference range
    ref_range_text = models.CharField(max_length=100, blank=True, default='')  # Original from PDF

    class Meta:
        unique_together = ['report', 'biomarker']
        ordering = ['biomarker__category__sort_order', 'biomarker__sort_order']
        indexes = [
            models.Index(fields=['biomarker', 'report']),
        ]

    def __str__(self):
        return f"{self.biomarker.abbreviation or self.biomarker.name}: {self.value} {self.unit} [{self.flag}]"


# ── Generated health recommendations ────────────────────────────────

class HealthRecommendation(models.Model):
    """
    §ADVICE: Auto-generated lifestyle recommendations based on blood results.
    Generated by recommendations.py engine after report scoring.

    §PRIORITY: high = needs attention now, medium = should improve, low = optimization
    §CATEGORY: diet/exercise/supplement/medical/lifestyle — for frontend grouping
    """
    CATEGORY_CHOICES = [
        ('diet', 'Diet'),
        ('exercise', 'Exercise'),
        ('supplement', 'Supplement'),
        ('medical', 'Medical'),
        ('lifestyle', 'Lifestyle'),
    ]
    PRIORITY_CHOICES = [
        ('high', 'High'),
        ('medium', 'Medium'),
        ('low', 'Low'),
    ]

    report = models.ForeignKey(BloodReport, on_delete=models.CASCADE, related_name='recommendations')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium')
    title = models.CharField(max_length=200)
    title_bg = models.CharField(max_length=200, blank=True, default='')
    description = models.TextField()
    description_bg = models.TextField(blank=True, default='')
    related_biomarkers = models.JSONField(default=list, blank=True)  # Biomarker IDs that triggered this
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['priority', 'category']

    def __str__(self):
        return f"[{self.priority}] {self.title}"


# ── Unified HealthScore snapshots ────────────────────────────────────

class HealthScoreSnapshot(models.Model):
    """
    §SCORE: Daily snapshot of the composite HealthScore (0-100) + sub-scores.
    One row per (user, profile, date) — enables deltas, sparklines, trend analysis
    without recomputing from raw data every request.

    §BLEND: composite = weighted mean of present sub-scores.
       weights: blood .30 | bp .30 | recovery .25 | lifestyle .15
       missing components: their weight redistributes over present ones.
       `confidence` = fraction of total weight that had data (0-1).

    §INPUTS: `inputs` JSON stores the raw values used — for audit/debug and so
    deltas stay explainable ("score dropped because systolic avg rose 8 mmHg").
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='health_snapshots')
    profile = models.ForeignKey(HealthProfile, on_delete=models.CASCADE, related_name='snapshots')
    date = models.DateField()

    composite_score = models.IntegerField(null=True, blank=True)   # 0-100
    blood_score = models.IntegerField(null=True, blank=True)
    bp_score = models.IntegerField(null=True, blank=True)
    recovery_score = models.IntegerField(null=True, blank=True)
    lifestyle_score = models.IntegerField(null=True, blank=True)

    confidence = models.FloatField(default=0.0)                    # 0-1, fraction of weight present
    inputs = models.JSONField(default=dict, blank=True)            # raw values used
    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date']
        unique_together = ('user', 'profile', 'date')
        indexes = [models.Index(fields=['user', 'profile', '-date'])]

    def __str__(self):
        return f"{self.profile.full_name} · {self.date} · {self.composite_score}"


# ── Intervention log (user-tracked changes for before/after analysis) ─

class Intervention(models.Model):
    """
    §LOG: User-logged change to test against biometrics. Supplement starts, med changes,
    diet shifts, new habits. System can compute before/after deltas on target_metrics
    using HealthScoreSnapshot + raw data around `started_on` / `ended_on`.

    §EVIDENCE: `evidence_grade` asks the user how confident the underlying research is.
    App shows this grade on recommendations — honesty is the moat vs influencer health.

    §TARGET: `target_metrics` is a free JSON list of metric keys (e.g. "bp_systolic",
    "hrv", "sleep_efficiency", "ldl") — kept flexible so we can add new metrics later
    without a migration.
    """
    CATEGORY_CHOICES = [
        ('supplement', 'Supplement'),
        ('medication', 'Medication'),
        ('diet', 'Diet'),
        ('exercise', 'Exercise'),
        ('sleep', 'Sleep'),
        ('habit', 'Habit'),
        ('other', 'Other'),
    ]
    EVIDENCE_CHOICES = [
        ('A', 'A — Strong (RCTs / meta-analysis)'),
        ('B', 'B — Moderate (small trials / consistent observational)'),
        ('C', 'C — Preliminary (animal / mechanistic / early human)'),
        ('anecdote', 'Anecdote / self-experiment'),
    ]
    FREQUENCY_CHOICES = [
        ('daily', 'Once daily'),
        ('twice_daily', 'Twice daily'),
        ('three_daily', 'Three times daily'),
        ('weekly', 'Weekly'),
        ('as_needed', 'As needed'),
        ('one_time', 'One-time'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='interventions')
    profile = models.ForeignKey(HealthProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='interventions')
    name = models.CharField(max_length=200)                         # "Magnesium glycinate 400mg"
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    dose = models.CharField(max_length=100, blank=True, default='') # "400 mg/day"
    frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES, default='daily')
    reminder_times = models.JSONField(default=list, blank=True)     # ["08:00", "20:00"] — times to remind

    started_on = models.DateField()
    ended_on = models.DateField(null=True, blank=True)              # null = still ongoing

    hypothesis = models.TextField(blank=True, default='')           # what do you expect to change?
    target_metrics = models.JSONField(default=list, blank=True)     # ["bp_systolic", "hrv"]
    evidence_grade = models.CharField(max_length=10, choices=EVIDENCE_CHOICES, default='B')
    source_url = models.URLField(blank=True, default='')
    notes = models.TextField(blank=True, default='')

    # ── Photos ──
    photo = models.ImageField(
        upload_to='health/interventions/pill/',
        null=True, blank=True,
        help_text='Photo of pill/package for visual identification'
    )
    photo_prescription = models.ImageField(
        upload_to='health/interventions/prescription/',
        null=True, blank=True,
        help_text='Photo of prescription/doctor document'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-started_on', '-created_at']
        indexes = [models.Index(fields=['user', '-started_on'])]

    def __str__(self):
        active = '' if self.ended_on else ' · active'
        return f"{self.name} ({self.category}){active}"

    @property
    def is_active(self):
        return self.ended_on is None


# ── InterventionLog (daily adherence tracking) ───────────────────────

class InterventionLog(models.Model):
    """
    §ADHERENCE: one row per (intervention, date). Logged from the
    morning ritual checklist; enables correlation of interventions
    against biometrics (BP, HRV, recovery) on taken vs skipped days.
    §UNIQUE: (intervention, date) — re-logging replaces the prior row.
    """
    intervention = models.ForeignKey(
        Intervention, on_delete=models.CASCADE, related_name='logs'
    )
    date = models.DateField()
    taken = models.BooleanField(default=True)
    notes = models.CharField(max_length=200, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']
        indexes = [models.Index(fields=['intervention', '-date'])]
        constraints = [
            models.UniqueConstraint(
                fields=['intervention', 'date'],
                name='uniq_intervention_log_per_day',
            ),
        ]

    def __str__(self):
        mark = '✓' if self.taken else '✗'
        return f"{mark} {self.intervention.name} · {self.date}"


# ── PROTOCOL ENGINE ─────────────────────────────────────────────────────
# Genetic-driven personalized health protocols with smart daily logging


class GeneticProfile(models.Model):
    """
    用户的遗传学概况 (User's genetic profile)

    Stores genetic variants from LINA/Ramus lab files:
    - Cardiovascular risk (APOE4, LPA variants)
    - Metabolic risk (TCF7L2, FTO variants)
    - Nutrient absorption capacity (MTHFR, etc)
    - CYP450 metabolizer status
    - Supplement recommendations derived from genetics
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='genetic_profile'
    )

    # Risk scoring (0-100)
    cardiovascular_risk = models.IntegerField(
        default=50,
        help_text="APOE4, LPA, 9p21 variants"
    )
    metabolic_risk = models.IntegerField(
        default=50,
        help_text="TCF7L2, FTO, PPARG variants"
    )
    inflammation_risk = models.IntegerField(
        default=50,
        help_text="IL6, CRP, TNF-α genetic predisposition"
    )
    longevity_potential = models.IntegerField(
        default=50,
        help_text="FOXO3, APOE, Klotho variants"
    )

    # Nutrient absorption capacity
    nutrient_absorption = models.JSONField(
        default=dict,
        help_text="{'folate': 'MTHFR slow → need 5-MTHF', ...}"
    )

    # Drug/supplement metabolism
    cyp_metabolizer_status = models.JSONField(
        default=dict,
        help_text="{'CYP2D6': 'poor', 'CYP3A4': 'normal', ...}"
    )

    # Supplement recommendations generated from genetics
    recommended_supplements = models.JSONField(
        default=list,
        help_text="[{'supplement': 'Folate (5-MTHF)', 'dose': '1000 mcg', 'reason': 'MTHFR slow'}, ...]"
    )

    # Raw genetic data for future analysis
    raw_genetic_data = models.JSONField(
        default=dict,
        help_text="Full SNP dataset from lab file"
    )

    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "genetic profiles"

    def __str__(self):
        return f"{self.user.username} genetic profile"


class HealthProtocol(models.Model):
    """
    個人化した健康プロトコル (Personalized health protocol)

    Generated from:
    - Genetic risk assessment
    - Current biomarker status
    - User preferences & past adherence
    - Clinical evidence

    Example: "LDL Reduction Protocol"
    - Baseline LDL: 180 mg/dL
    - Target: 100 mg/dL in 12 weeks
    - Interventions: Red Yeast Rice + Mediterranean diet + cardio
    """

    STATUS_CHOICES = [
        ('active', 'Active - Currently following'),
        ('paused', 'Paused - Temporarily not following'),
        ('completed', 'Completed - Finished and evaluated'),
        ('archived', 'Archived - No longer relevant'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='health_protocols'
    )

    # Metadata
    name = models.CharField(
        max_length=255,
        help_text="e.g., 'LDL Reduction Protocol'"
    )
    description = models.TextField(
        help_text="Why this protocol? What's the goal?"
    )

    # What triggered creation?
    triggered_by = models.JSONField(
        default=dict,
        help_text="{'biomarker': 'LDL high', 'genetic_risk': 'APOE4', ...}"
    )

    # Timeline
    start_date = models.DateField(auto_now_add=True)
    end_date = models.DateField(
        null=True,
        blank=True,
        help_text="When should we retest?"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active'
    )

    # What to do daily
    daily_requirements = models.JSONField(
        default=dict,
        help_text="{'supplements': [...], 'diet': [...], 'exercise': '...', 'sleep': '...'}"
    )

    # Which fields to ask in daily log (smart form)
    daily_log_fields = models.JSONField(
        default=list,
        help_text="['mood', 'supplements_taken', 'exercise_type', 'diet_notes']"
    )

    # Tracking
    adherence_percentage = models.FloatField(
        default=0.0,
        help_text="% of days user completed protocol"
    )

    # Baseline & goals
    baseline_biomarkers = models.JSONField(
        default=dict,
        help_text="{'LDL': 180, 'HDL': 35, ...}"
    )
    expected_outcomes = models.JSONField(
        default=dict,
        help_text="{'LDL': {'baseline': 180, 'target': 100, 'timeline_weeks': 12}, ...}"
    )

    # Confidence & evidence
    confidence_score = models.FloatField(
        default=0.7,
        help_text="0-1 confidence this protocol will work"
    )
    evidence_sources = models.JSONField(
        default=list,
        help_text="['Mediterranean diet RCT', 'User genetics', ...]"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "health protocols"
        ordering = ['-start_date']
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['user', 'start_date']),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.name}"


class DailyProtocolLog(models.Model):
    """
    日常プロトコルログ (Daily protocol log)

    Smart daily log that only asks for fields relevant to active protocols.
    Auto-calculates adherence% based on completed fields.

    Example:
    - Mon (LDL Protocol): ask [mood, supplements, exercise, diet]
    - Wed (Sleep Protocol): ask [mood, sleep_hours, sleep_quality, supplements]
    - Adherence calculated as: (completed_fields / required_fields) * 100
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='daily_protocol_logs'
    )
    protocol = models.ForeignKey(
        HealthProtocol,
        on_delete=models.SET_NULL,
        null=True,
        related_name='daily_logs'
    )
    date = models.DateField(db_index=True)

    # --- MOOD & ENERGY (always logged) ---
    mood = models.IntegerField(null=True, blank=True, help_text="1-10")
    energy_level = models.IntegerField(null=True, blank=True, help_text="1-10")
    stress_level = models.IntegerField(null=True, blank=True, help_text="1-10")

    # --- BIOMETRICS ---
    weight_kg = models.FloatField(null=True, blank=True)
    systolic_bp = models.IntegerField(null=True, blank=True)
    diastolic_bp = models.IntegerField(null=True, blank=True)
    resting_heart_rate = models.IntegerField(null=True, blank=True)

    # --- SLEEP & RECOVERY ---
    sleep_hours = models.FloatField(null=True, blank=True)
    sleep_quality = models.IntegerField(null=True, blank=True, help_text="1-10")
    sleep_notes = models.TextField(blank=True)
    whoop_recovery_score = models.IntegerField(null=True, blank=True, help_text="0-100 from WHOOP")

    # --- SUPPLEMENTS ---
    supplements_taken = models.JSONField(
        default=dict,
        help_text="{'Red Yeast Rice': {'taken': True, 'time': '08:00'}, ...}"
    )
    supplement_notes = models.TextField(blank=True)

    # --- NUTRITION ---
    meals = models.JSONField(
        default=list,
        help_text="[{'meal': 'breakfast', 'items': ['oatmeal', 'berries']}, ...]"
    )
    diet_notes = models.TextField(blank=True)
    water_intake_ml = models.IntegerField(null=True, blank=True)

    # --- EXERCISE & MOVEMENT ---
    exercise_type = models.CharField(max_length=50, blank=True, help_text="cardio, yoga, etc")
    exercise_duration_min = models.IntegerField(null=True, blank=True)
    exercise_intensity = models.CharField(max_length=20, blank=True, help_text="low/moderate/high")
    whoop_strain_score = models.IntegerField(null=True, blank=True, help_text="0-21 from WHOOP")

    # --- PROTOCOL ADHERENCE ---
    protocol_adherence_pct = models.FloatField(
        default=0.0,
        help_text="% of protocol requirements completed"
    )
    protocol_notes = models.TextField(blank=True, help_text="Why deviated? What was hard?")

    # --- SYMPTOMS & SIDE EFFECTS ---
    symptoms = models.JSONField(default=list, help_text="['headache', 'bloating']")
    side_effects = models.TextField(blank=True)

    # --- AI METADATA ---
    is_complete = models.BooleanField(default=False)
    ai_insights = models.JSONField(default=dict)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'protocol', 'date')
        indexes = [
            models.Index(fields=['user', 'date']),
            models.Index(fields=['protocol', 'date']),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.date} - {self.protocol_adherence_pct}%"


class ProtocolRecommendation(models.Model):
    """
    AI-生成的建議 (AI-generated recommendations)

    Examples:
    - "Your HRV dropped 10%. Increase Magnesium to 400mg."
    - "LDL trending down! You're on track. Keep it up."
    - "Adherence dropped on weekends. Try habit stacking."
    """

    CATEGORY_CHOICES = [
        ('supplement_adjust', 'Supplement dose/timing adjustment'),
        ('diet_change', 'Diet or food suggestion'),
        ('exercise_intensity', 'Exercise intensity or type change'),
        ('sleep_protocol', 'Sleep optimization'),
        ('stress_management', 'Stress reduction'),
        ('biomarker_warning', 'Biomarker risk alert'),
        ('adherence_help', 'Help improving adherence'),
        ('medication_interaction', 'Potential supplement-medication issue'),
    ]

    PRIORITY_CHOICES = [
        ('critical', '⚠️ Critical'),
        ('high', '🔴 High'),
        ('medium', '🟡 Medium'),
        ('low', '🟢 Low'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='protocol_recommendations'
    )
    protocol = models.ForeignKey(
        HealthProtocol,
        on_delete=models.CASCADE,
        related_name='recommendations'
    )

    # What's the recommendation?
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES)
    title = models.CharField(max_length=255)
    description = models.TextField()
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium')

    # Evidence & impact
    evidence = models.JSONField(
        default=dict,
        help_text="{'data_points': ['HRV down 10%'], 'source': 'last 14 days', ...}"
    )
    actionable_steps = models.JSONField(default=list)
    expected_impact = models.JSONField(default=dict)

    # User engagement
    is_accepted = models.BooleanField(default=False)
    is_implemented = models.BooleanField(default=False)
    implementation_date = models.DateField(null=True, blank=True)
    implementation_notes = models.TextField(blank=True)
    outcome = models.CharField(
        max_length=20,
        null=True,
        blank=True,
        choices=[('success', 'Worked!'), ('neutral', 'No change'), ('negative', 'Made worse')]
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-priority', '-created_at']
        indexes = [
            models.Index(fields=['user', 'is_accepted']),
            models.Index(fields=['protocol', 'priority']),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.title}"
