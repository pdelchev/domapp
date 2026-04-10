"""
Daily health tracking models — the "spine" of the unified Health Hub.

Architecture:
  DailyLog ← one per (profile, date), aggregates all daily metrics
  Supplement ← user's pill/vitamin/medication catalog with photos
  SupplementSchedule ← when to take what (time slots + dosing)
  DoseLog ← daily adherence record per schedule item
  MetricTimeline ← denormalized read-optimized timeline for history page

Migration path from existing models:
  RitualItem → Supplement + SupplementSchedule (gradual, keep both during transition)
  RitualLog → DoseLog (new entries go to DoseLog, old data stays in RitualLog)
  BPMedication → Supplement with category='medication' (unify pill catalog)

# §NAV: daily_models.py → daily_services.py → daily_serializers.py → daily_views.py → daily_urls.py
# §REF: HealthProfile (models.py), BPReading (bp_models.py), WeightReading (weight_models.py)
"""

from django.conf import settings
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


# ──────────────────────────────────────────────────────────────
# §MODEL: DailyLog — one row per day per profile
# The wizard creates/updates this. All daily metrics attach here.
# ──────────────────────────────────────────────────────────────

class DailyLog(models.Model):
    """
    Single source of truth for one day's health data.
    Created by the wizard or auto-created at first metric entry.

    §UNIQUE: (profile, date) — exactly one log per day per person.
    §PERF: cached_summary JSON avoids JOINing dose/weight/bp tables on dashboard.
    §LINK: WeightReading.daily_log FK, BPReading via date correlation.
    """

    # ── ownership ──
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='daily_logs',
        help_text='Redundant with profile.user — denormalized for query speed'
    )
    profile = models.ForeignKey(
        'health.HealthProfile', on_delete=models.CASCADE,
        related_name='daily_logs'
    )
    date = models.DateField(
        help_text='Calendar date in user timezone'
    )

    # ── subjective metrics (wizard step 1) ──
    MOOD_CHOICES = [
        (5, 'great'), (4, 'good'), (3, 'okay'), (2, 'poor'), (1, 'bad'),
    ]
    mood = models.SmallIntegerField(
        choices=MOOD_CHOICES, null=True, blank=True,
        help_text='1-5 scale: bad to great'
    )
    energy = models.SmallIntegerField(
        null=True, blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text='1-5 scale: exhausted to energized'
    )
    sleep_hours = models.DecimalField(
        max_digits=3, decimal_places=1, null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(24)],
        help_text='Hours of sleep last night'
    )
    sleep_quality = models.SmallIntegerField(
        null=True, blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text='1-5 scale: terrible to excellent'
    )
    pain_level = models.SmallIntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(10)],
        help_text='0-10 pain scale (0 = no pain)'
    )
    stress_level = models.SmallIntegerField(
        null=True, blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text='1-5 scale: calm to very stressed'
    )

    # ── hydration (wizard step 4) ──
    water_ml = models.PositiveIntegerField(
        default=0,
        help_text='Water intake in ml (250ml per glass)'
    )

    # ── notes ──
    notes = models.TextField(
        blank=True, default='',
        help_text='Free-text daily notes'
    )

    # ── completion tracking ──
    wizard_completed = models.BooleanField(
        default=False,
        help_text='True when user finished the wizard (even with skips)'
    )
    completed_at = models.DateTimeField(
        null=True, blank=True,
        help_text='When wizard was completed'
    )
    dose_adherence_pct = models.SmallIntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text='Denormalized: % of scheduled doses taken today'
    )

    # ── denormalized summary for O(1) dashboard reads ──
    cached_summary = models.JSONField(
        default=dict, blank=True,
        help_text='Denormalized: {weight, bp_sys, bp_dia, doses_taken, doses_total, ...}'
    )

    # ── timestamps ──
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('profile', 'date')
        ordering = ['-date']
        indexes = [
            models.Index(fields=['user', 'profile', '-date']),
            models.Index(fields=['user', '-date']),
            models.Index(fields=['profile', '-date']),
        ]

    def __str__(self):
        return f'{self.profile} — {self.date}'


# ──────────────────────────────────────────────────────────────
# §MODEL: Supplement — the pill/vitamin/medication catalog
# One entry per physical product. Shared across profiles via Schedule.
# ──────────────────────────────────────────────────────────────

class Supplement(models.Model):
    """
    A pill, vitamin, medication, or injectable in the user's cabinet.

    §PHOTO: Two photos — package (for identification) + closeup (for the pill itself).
    §STOCK: pack_size + current_stock enable refill alerts.
    §LINK: linked_biomarkers connects to blood test results for closed-loop tracking.
    §MIGRATE: Replaces RitualItem for supplement/medication categories.
    """

    CATEGORY_CHOICES = [
        ('supplement', 'Supplement'),
        ('vitamin', 'Vitamin'),
        ('mineral', 'Mineral'),
        ('medication', 'Prescription Medication'),
        ('otc', 'Over-the-Counter Drug'),
        ('injection', 'Injection'),
        ('herb', 'Herbal/Natural'),
        ('probiotic', 'Probiotic'),
        ('protein', 'Protein/Amino Acid'),
        ('other', 'Other'),
    ]

    FORM_CHOICES = [
        ('tablet', 'Tablet'),
        ('capsule', 'Capsule'),
        ('softgel', 'Softgel'),
        ('liquid', 'Liquid'),
        ('powder', 'Powder'),
        ('drops', 'Drops'),
        ('injection', 'Injection'),
        ('patch', 'Patch'),
        ('spray', 'Spray'),
        ('gummy', 'Gummy'),
        ('lozenge', 'Lozenge'),
        ('other', 'Other'),
    ]

    # ── ownership ──
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='supplements'
    )

    # ── identification ──
    name = models.CharField(max_length=200, help_text='Product name (e.g., "Vitamin D3 2000IU")')
    name_bg = models.CharField(max_length=200, blank=True, default='', help_text='Bulgarian name')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='supplement')
    form = models.CharField(max_length=20, choices=FORM_CHOICES, default='tablet')

    # ── visual identification (critical for elderly users) ──
    color = models.CharField(
        max_length=50, blank=True, default='',
        help_text='Pill color (e.g., "white", "yellow", "brown")'
    )
    shape = models.CharField(
        max_length=50, blank=True, default='',
        help_text='Pill shape (e.g., "round", "oval", "oblong")'
    )
    size = models.CharField(
        max_length=50, blank=True, default='',
        help_text='Approximate size (e.g., "small", "large")'
    )
    photo = models.ImageField(
        upload_to='health/supplements/package/', null=True, blank=True,
        help_text='Package photo for identification'
    )
    photo_closeup = models.ImageField(
        upload_to='health/supplements/closeup/', null=True, blank=True,
        help_text='Close-up pill photo with scale reference'
    )

    # ── product details ──
    manufacturer = models.CharField(max_length=200, blank=True, default='')
    strength = models.CharField(
        max_length=50, blank=True, default='',
        help_text='Per-unit strength (e.g., "2000IU", "500mg", "10ml")'
    )
    strength_unit = models.CharField(
        max_length=20, blank=True, default='',
        help_text='Unit of strength (mg, IU, mcg, ml, g)'
    )
    barcode = models.CharField(max_length=50, blank=True, default='')

    # ── stock management ──
    pack_size = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Number of units in one package'
    )
    current_stock = models.PositiveIntegerField(
        default=0,
        help_text='Current units remaining'
    )
    low_stock_threshold = models.PositiveIntegerField(
        default=7,
        help_text='Alert when stock drops below this many days of supply'
    )

    # ── cost tracking ──
    cost = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text='Price paid for one pack (matching pack_size)'
    )
    currency = models.CharField(
        max_length=3, default='EUR',
        help_text='ISO 4217 currency code (EUR, BGN, USD, ...)'
    )
    purchase_date = models.DateField(
        null=True, blank=True,
        help_text='Date of last purchase'
    )

    # ── medical context ──
    is_prescription = models.BooleanField(default=False)
    prescribing_doctor = models.CharField(max_length=200, blank=True, default='')
    prescription_note = models.TextField(blank=True, default='')

    # ── biomarker linkage (closed-loop tracking) ──
    linked_biomarkers = models.JSONField(
        default=list, blank=True,
        help_text='List of biomarker slugs this supplement targets (e.g., ["vitamin_d", "calcium"])'
    )

    # ── interaction warnings ──
    interactions = models.JSONField(
        default=list, blank=True,
        help_text='Known interactions: [{"with": "iron", "type": "absorption", "note": "Take 2h apart"}]'
    )

    # ── state ──
    is_active = models.BooleanField(default=True)
    started_at = models.DateField(
        null=True, blank=True,
        help_text='When user started taking this (for before/after analysis)'
    )
    discontinued_at = models.DateField(null=True, blank=True)
    discontinue_reason = models.CharField(max_length=500, blank=True, default='')

    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['user', 'is_active']),
            models.Index(fields=['user', 'category']),
        ]

    def __str__(self):
        return f'{self.name} ({self.strength})' if self.strength else self.name

    @property
    def days_of_stock_remaining(self):
        """Estimate days until refill needed based on active schedules."""
        # §PERF: computed on read, not stored — schedules change infrequently
        if not self.current_stock or not self.is_active:
            return None
        daily_dose_count = self.schedules.filter(is_active=True).count()
        if daily_dose_count == 0:
            return None
        return self.current_stock // daily_dose_count

    @property
    def cost_per_unit(self):
        """Cost of a single pill/dose."""
        if not self.cost or not self.pack_size:
            return None
        return float(self.cost) / self.pack_size

    @property
    def monthly_cost(self):
        """Estimated 30-day cost based on active schedules."""
        per_unit = self.cost_per_unit
        if per_unit is None or not self.is_active:
            return None
        daily_doses = self.schedules.filter(is_active=True).count()
        if daily_doses == 0:
            return None
        return round(per_unit * daily_doses * 30, 2)


# ──────────────────────────────────────────────────────────────
# §MODEL: SupplementSchedule — when to take a supplement
# Links a Supplement to a Profile with timing + dosing details.
# ──────────────────────────────────────────────────────────────

class SupplementSchedule(models.Model):
    """
    Defines when and how much of a supplement to take.

    §TIMING: 8 time slots matching the existing RitualItem.timing values.
    §SPLIT: split_count enables "take half a pill" with visual indicator.
    §CONDITION: daily vs gym_day vs as_needed — same as RitualItem.condition.
    §MULTI-PROFILE: same Supplement can be scheduled for different profiles.
    """

    TIME_SLOT_CHOICES = [
        ('morning', 'Morning (wake up)'),
        ('fasted', 'Fasted (before food)'),
        ('breakfast', 'With Breakfast'),
        ('midday', 'Midday'),
        ('lunch', 'With Lunch'),
        ('afternoon', 'Afternoon'),
        ('dinner', 'With Dinner'),
        ('evening', 'Evening'),
        ('bedtime', 'Bedtime'),
    ]

    CONDITION_CHOICES = [
        ('daily', 'Every Day'),
        ('gym_day', 'Gym Days Only'),
        ('as_needed', 'As Needed'),
        ('alternate', 'Every Other Day'),
        ('weekdays', 'Weekdays Only'),
        ('custom', 'Custom Days'),
    ]

    DOSE_UNIT_CHOICES = [
        ('pill', 'Pill(s)'),
        ('capsule', 'Capsule(s)'),
        ('ml', 'ml'),
        ('drops', 'Drop(s)'),
        ('scoop', 'Scoop(s)'),
        ('spray', 'Spray(s)'),
        ('patch', 'Patch'),
        ('injection', 'Injection'),
    ]

    # ── ownership ──
    supplement = models.ForeignKey(
        Supplement, on_delete=models.CASCADE,
        related_name='schedules'
    )
    profile = models.ForeignKey(
        'health.HealthProfile', on_delete=models.CASCADE,
        related_name='supplement_schedules'
    )

    # ── timing ──
    time_slot = models.CharField(max_length=20, choices=TIME_SLOT_CHOICES, default='morning')
    preferred_time = models.TimeField(
        null=True, blank=True,
        help_text='Preferred time (for notifications). Null = use time_slot default.'
    )

    # ── dosing ──
    dose_amount = models.DecimalField(
        max_digits=5, decimal_places=2, default=1,
        help_text='Number of units per dose (e.g., 1, 0.5 for half pill, 2 for two pills)'
    )
    dose_unit = models.CharField(max_length=20, choices=DOSE_UNIT_CHOICES, default='pill')
    split_count = models.SmallIntegerField(
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(4)],
        help_text='How many pieces the unit is split into (1=whole, 2=half, 4=quarter)'
    )

    # ── food/water context ──
    take_with_food = models.BooleanField(default=False, help_text='Must be taken with food')
    take_with_water = models.BooleanField(default=True, help_text='Take with water')
    take_on_empty_stomach = models.BooleanField(default=False, help_text='Must be taken fasted')

    # ── recurrence ──
    condition = models.CharField(max_length=20, choices=CONDITION_CHOICES, default='daily')
    days_of_week = models.JSONField(
        default=list, blank=True,
        help_text='For custom condition: [0,1,2,3,4] = Mon-Fri. Empty = every day.'
    )

    # ── active period ──
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    # ── display ──
    sort_order = models.SmallIntegerField(default=0, help_text='Order within time slot')
    notes = models.CharField(max_length=500, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['time_slot', 'sort_order', 'supplement__name']
        indexes = [
            models.Index(fields=['profile', 'is_active']),
            models.Index(fields=['supplement', 'is_active']),
        ]

    def __str__(self):
        return f'{self.supplement.name} — {self.get_time_slot_display()} ({self.dose_amount} {self.dose_unit})'


# ──────────────────────────────────────────────────────────────
# §MODEL: DoseLog — daily adherence record
# One row per scheduled dose per day.
# ──────────────────────────────────────────────────────────────

class DoseLog(models.Model):
    """
    Records whether a scheduled dose was taken on a given day.

    §UNIQUE: (schedule, date) — one record per dose per day.
    §STOCK: on taken=True, decrements supplement.current_stock.
    §SPEED: bulk-created via wizard, not one-by-one.
    """

    SKIP_REASON_CHOICES = [
        ('forgot', 'Forgot'),
        ('side_effect', 'Side Effects'),
        ('out_of_stock', 'Out of Stock'),
        ('fasting', 'Fasting Today'),
        ('doctor_advised', 'Doctor Advised'),
        ('feeling_unwell', 'Feeling Unwell'),
        ('other', 'Other'),
    ]

    schedule = models.ForeignKey(
        SupplementSchedule, on_delete=models.CASCADE,
        related_name='dose_logs'
    )
    date = models.DateField()
    taken = models.BooleanField(default=False)
    taken_at = models.DateTimeField(null=True, blank=True)
    skipped_reason = models.CharField(
        max_length=20, choices=SKIP_REASON_CHOICES,
        blank=True, default=''
    )
    notes = models.CharField(max_length=500, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('schedule', 'date')
        ordering = ['-date']
        indexes = [
            models.Index(fields=['date', 'taken']),
            models.Index(fields=['schedule', '-date']),
        ]

    def __str__(self):
        status = 'taken' if self.taken else 'missed'
        return f'{self.schedule.supplement.name} — {self.date} — {status}'


# ──────────────────────────────────────────────────────────────
# §MODEL: MetricTimeline — denormalized read-optimized timeline
# Populated by signals on any metric write. Enables single-query
# history page across ALL metric types.
# ──────────────────────────────────────────────────────────────

class MetricTimeline(models.Model):
    """
    Flattened timeline of all health metrics for fast history queries.

    §PERF: One table, one query for "show me everything from Jan to Mar".
    §WRITE: Populated by post_save signals, not by user directly.
    §READ: The /timeline/ endpoint reads only this table.
    §DEDUP: unique_together prevents duplicate entries per metric per day.
    """

    METRIC_TYPE_CHOICES = [
        # vitals
        ('weight', 'Weight (kg)'),
        ('body_fat', 'Body Fat (%)'),
        ('bmi', 'BMI'),
        ('bp_systolic', 'BP Systolic'),
        ('bp_diastolic', 'BP Diastolic'),
        ('bp_pulse', 'Pulse'),
        # daily subjective
        ('mood', 'Mood (1-5)'),
        ('energy', 'Energy (1-5)'),
        ('sleep_hours', 'Sleep Hours'),
        ('sleep_quality', 'Sleep Quality (1-5)'),
        ('water_ml', 'Water (ml)'),
        ('pain', 'Pain (0-10)'),
        ('stress', 'Stress (1-5)'),
        # adherence
        ('dose_adherence', 'Dose Adherence (%)'),
        # wearable
        ('hrv', 'HRV (ms)'),
        ('rhr', 'Resting HR'),
        ('recovery_score', 'Recovery Score (%)'),
        ('strain', 'Strain (0-21)'),
        ('spo2', 'SpO2 (%)'),
        # blood
        ('health_score', 'Health Score (0-100)'),
        # gout
        ('uric_acid', 'Uric Acid'),
        # body measurements
        ('waist_cm', 'Waist (cm)'),
        ('hip_cm', 'Hip (cm)'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='metric_timeline'
    )
    profile = models.ForeignKey(
        'health.HealthProfile', on_delete=models.CASCADE,
        related_name='metric_timeline'
    )
    date = models.DateField()
    metric_type = models.CharField(max_length=30, choices=METRIC_TYPE_CHOICES)
    value = models.DecimalField(max_digits=10, decimal_places=2)
    unit = models.CharField(max_length=20, blank=True, default='')
    context = models.JSONField(
        default=dict, blank=True,
        help_text='Additional context (e.g., {source: "wizard", bp_stage: "elevated"})'
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('profile', 'date', 'metric_type')
        ordering = ['-date', 'metric_type']
        indexes = [
            models.Index(fields=['user', 'profile', '-date']),
            models.Index(fields=['user', '-date', 'metric_type']),
            models.Index(fields=['profile', 'metric_type', '-date']),
        ]

    def __str__(self):
        return f'{self.metric_type}: {self.value} ({self.date})'


# ──────────────────────────────────────────────────────────────
# §MODEL: EmergencyCard — offline-accessible medical info for first responders
# One per HealthProfile. Designed to render without network on /health/emergency.
# ──────────────────────────────────────────────────────────────

class EmergencyCard(models.Model):
    """
    Critical medical info for first responders / ER staff.
    Cached client-side so it works offline on a locked PWA.

    §SCOPE: One per HealthProfile (1:1).
    §OFFLINE: Frontend writes a copy to localStorage on every load and renders
              from cache when the API is unreachable.
    """

    BLOOD_TYPE_CHOICES = [
        ('A+', 'A+'), ('A-', 'A-'),
        ('B+', 'B+'), ('B-', 'B-'),
        ('AB+', 'AB+'), ('AB-', 'AB-'),
        ('O+', 'O+'), ('O-', 'O-'),
        ('unknown', 'Unknown'),
    ]

    profile = models.OneToOneField(
        'HealthProfile', on_delete=models.CASCADE, related_name='emergency_card'
    )

    # ── identification ──
    blood_type = models.CharField(max_length=10, choices=BLOOD_TYPE_CHOICES, default='unknown')

    # ── medical alerts (free text — doctors/paramedics need flexibility) ──
    allergies = models.TextField(
        blank=True, default='',
        help_text='Drugs, foods, environmental — anything that could trigger anaphylaxis.'
    )
    chronic_conditions = models.TextField(
        blank=True, default='',
        help_text='Diabetes, epilepsy, heart disease, etc.'
    )
    current_medications_text = models.TextField(
        blank=True, default='',
        help_text='Manual override. If empty, the frontend lists active Supplement items with category=medication.'
    )
    recent_surgeries = models.TextField(blank=True, default='')
    implants = models.TextField(
        blank=True, default='',
        help_text='Pacemaker, stents, prosthetics, metal screws (relevant for MRI).'
    )

    # ── directives ──
    organ_donor = models.BooleanField(default=False)
    dnr = models.BooleanField(
        default=False,
        help_text='Do Not Resuscitate'
    )
    advance_directive_url = models.URLField(blank=True, default='')

    # ── insurance ──
    insurance_provider = models.CharField(max_length=200, blank=True, default='')
    insurance_number = models.CharField(max_length=100, blank=True, default='')

    # ── ICE contacts: list of {name, relation, phone, primary?} ──
    emergency_contacts = models.JSONField(
        default=list, blank=True,
        help_text='In Case of Emergency contacts.'
    )

    # ── doctor contact ──
    primary_doctor_name = models.CharField(max_length=200, blank=True, default='')
    primary_doctor_phone = models.CharField(max_length=50, blank=True, default='')

    # ── free notes ──
    notes = models.TextField(blank=True, default='')

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Emergency Card — {self.profile.full_name}'


# ──────────────────────────────────────────────────────────────
# §MODEL: Achievement — persisted badge unlocks
# Badges/challenges are defined in code (health/gamification.py);
# this table only records the first time a user unlocked a given code
# so the UI can show a celebratory toast once.
# ──────────────────────────────────────────────────────────────

class Achievement(models.Model):
    """
    One row per (user, code) when the user first unlocks a badge.

    §SCOPE: user-wide (not per-profile) — gamification rewards the
            person managing data, not each tracked body.
    §CODE: matches a key in gamification.BADGES.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='achievements'
    )
    code = models.CharField(max_length=50)
    unlocked_at = models.DateTimeField(auto_now_add=True)
    seen = models.BooleanField(
        default=False,
        help_text='True after the toast was shown to the user.'
    )

    class Meta:
        unique_together = ('user', 'code')
        ordering = ['-unlocked_at']
        indexes = [
            models.Index(fields=['user', '-unlocked_at']),
        ]

    def __str__(self):
        return f'{self.user} — {self.code}'


# ──────────────────────────────────────────────────────────────
# §MODEL: FastingSession — intermittent / extended fasting tracker
# Reshuffles the supplement schedule while active: items that
# require food are deferred, fasted-friendly items are highlighted.
# ──────────────────────────────────────────────────────────────

class FastingSession(models.Model):
    """
    One fasting window per profile. Active if ends_at is in the future
    (or ends_at is null — open-ended fast).

    §SCOPE: per-profile (different household members can fast independently).
    §ACTIVE: at most one active session per profile is expected but not enforced
             so that overlapping planned sessions can be created.
    """

    PROTOCOL_CHOICES = [
        ('16_8', '16:8 (Leangains)'),
        ('18_6', '18:6'),
        ('20_4', '20:4 (Warrior)'),
        ('omad', 'OMAD (23:1)'),
        ('24h', '24-hour fast'),
        ('36h', '36-hour fast'),
        ('48h', '48-hour fast'),
        ('custom', 'Custom window'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='fasting_sessions',
    )
    profile = models.ForeignKey(
        'health.HealthProfile', on_delete=models.CASCADE,
        related_name='fasting_sessions',
    )

    protocol = models.CharField(max_length=20, choices=PROTOCOL_CHOICES, default='16_8')
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(
        null=True, blank=True,
        help_text='Planned break-fast time. Null = open-ended.'
    )
    ended_early_at = models.DateTimeField(
        null=True, blank=True,
        help_text='Set if user broke fast before ends_at.'
    )

    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-starts_at']
        indexes = [
            models.Index(fields=['user', 'profile', '-starts_at']),
        ]

    def __str__(self):
        return f'{self.profile} — {self.get_protocol_display()} @ {self.starts_at:%Y-%m-%d %H:%M}'

    @property
    def effective_end(self):
        return self.ended_early_at or self.ends_at


# ──────────────────────────────────────────────────────────────
# §MODEL: Symptom — timestamped health complaint log
# Feeds the correlation engine (symptom_correlations.py) which
# cross-references with DoseLog, DailyLog, and BP data to surface
# "headaches appear 3x more often on days you take X" style insights.
# ──────────────────────────────────────────────────────────────

class Symptom(models.Model):
    """
    One timestamped symptom occurrence. User may log multiple per day.

    §WHY_NOT_DAILY: Symptoms are event-based (exact time matters for
                    triggers like "2h after dose"), not daily aggregates.
    §TRIGGERS: free-form JSON list of user-suspected triggers — used as
               a nudge for the correlation engine, not the ground truth.
    """

    CATEGORY_CHOICES = [
        ('headache', 'Headache'),
        ('migraine', 'Migraine'),
        ('fatigue', 'Fatigue'),
        ('nausea', 'Nausea'),
        ('dizziness', 'Dizziness'),
        ('insomnia', 'Insomnia / Poor Sleep'),
        ('joint_pain', 'Joint Pain'),
        ('muscle_pain', 'Muscle Pain'),
        ('back_pain', 'Back Pain'),
        ('digestive', 'Digestive Upset'),
        ('bloating', 'Bloating'),
        ('skin', 'Skin Reaction'),
        ('allergy', 'Allergy Symptoms'),
        ('mood_low', 'Low Mood'),
        ('anxiety', 'Anxiety'),
        ('heart_palpitations', 'Heart Palpitations'),
        ('shortness_of_breath', 'Shortness of Breath'),
        ('brain_fog', 'Brain Fog'),
        ('other', 'Other'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='symptoms',
    )
    profile = models.ForeignKey(
        'health.HealthProfile', on_delete=models.CASCADE,
        related_name='symptoms',
    )

    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES)
    severity = models.SmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        help_text='1-10 scale, 10 = worst imaginable',
    )

    occurred_at = models.DateTimeField(
        help_text='When the symptom started (defaults to now on create).'
    )
    duration_minutes = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Total duration if known.'
    )

    body_location = models.CharField(
        max_length=200, blank=True, default='',
        help_text='Free-text body location (e.g., "right temple", "lower back").'
    )
    triggers = models.JSONField(
        default=list, blank=True,
        help_text='User-suspected triggers: ["skipped lunch", "stress", "iron pill"]'
    )
    notes = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-occurred_at']
        indexes = [
            models.Index(fields=['user', 'profile', '-occurred_at']),
            models.Index(fields=['user', 'category', '-occurred_at']),
        ]

    def __str__(self):
        return f'{self.get_category_display()} ({self.severity}/10) @ {self.occurred_at:%Y-%m-%d %H:%M}'


# ──────────────────────────────────────────────────────────────
# §MODEL: WeatherSnapshot — cached weather data for correlation analysis
# ──────────────────────────────────────────────────────────────

class WeatherSnapshot(models.Model):
    """
    Daily weather data cached from OpenWeatherMap or manually logged.
    Used in symptom correlation analysis to find weather-health patterns.

    §UNIQUE: (profile, date) — one weather record per day per person.
    §PURPOSE: Trigger index for symptom correlations (high/low pressure, temp shifts, etc.)
    """

    CONDITION_CHOICES = [
        ('clear', 'Clear'),
        ('cloudy', 'Cloudy'),
        ('rainy', 'Rainy'),
        ('snowy', 'Snowy'),
        ('stormy', 'Stormy'),
        ('fog', 'Fog'),
        ('unknown', 'Unknown'),
    ]

    DATA_SOURCE_CHOICES = [
        ('openweathermap', 'OpenWeatherMap'),
        ('manual', 'Manual Entry'),
        ('imported', 'Imported'),
    ]

    # ── ownership ──
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='weather_snapshots'
    )
    profile = models.ForeignKey(
        'health.HealthProfile', on_delete=models.CASCADE,
        related_name='weather_snapshots'
    )
    date = models.DateField()

    # ── location ──
    location = models.CharField(
        max_length=200, blank=True, default='',
        help_text='City or coordinates (e.g., "Sofia, Bulgaria" or "42.7°N, 23.3°E")'
    )

    # ── temperature ──
    temperature_celsius = models.FloatField(
        null=True, blank=True,
        help_text='Mean temperature in °C'
    )
    temp_min = models.FloatField(
        null=True, blank=True,
        help_text='Minimum temperature in °C'
    )
    temp_max = models.FloatField(
        null=True, blank=True,
        help_text='Maximum temperature in °C'
    )

    # ── atmospheric ──
    humidity_percent = models.PositiveIntegerField(
        null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text='Relative humidity 0-100%'
    )
    pressure_hpa = models.FloatField(
        null=True, blank=True,
        help_text='Atmospheric pressure in hPa'
    )
    wind_speed_kmh = models.FloatField(
        null=True, blank=True,
        help_text='Wind speed in km/h'
    )

    # ── precipitation & air quality ──
    precipitation_mm = models.FloatField(
        null=True, blank=True, default=0,
        help_text='Daily precipitation in mm (rain + snow water equivalent)'
    )
    air_quality_index = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='AQI 0-500+ (0=best, 300+=hazardous). None if not available.'
    )

    # ── conditions ──
    condition = models.CharField(
        max_length=20, choices=CONDITION_CHOICES, default='unknown',
        help_text='Summary of conditions'
    )
    condition_detail = models.CharField(
        max_length=200, blank=True, default='',
        help_text='Additional detail (e.g., "light rain", "scattered clouds")'
    )

    # ── metadata ──
    data_source = models.CharField(
        max_length=20, choices=DATA_SOURCE_CHOICES, default='openweathermap'
    )
    raw_data = models.JSONField(
        default=dict, blank=True,
        help_text='Raw JSON response from API (for future feature enhancement)'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date']
        unique_together = [('profile', 'date')]
        indexes = [
            models.Index(fields=['user', 'date']),
            models.Index(fields=['profile', '-date']),
        ]

    def __str__(self):
        return f'{self.location or "Unknown"} — {self.date} ({self.get_condition_display()})'


# ──────────────────────────────────────────────────────────────
# §MODEL: CaregiverRelationship — delegate health data access
# ──────────────────────────────────────────────────────────────

class CaregiverRelationship(models.Model):
    """
    Allows User A (primary) to grant User B (caregiver) access to their HealthProfile(s).

    §SCENARIO: Parent grants adult child access to their health data.
               Spouse manages other spouse's supplement schedule.
               Healthcare provider (nurse) monitors patient's daily logs.

    §PERMISSIONS: JSON list of allowed actions
      - 'view_all' — read all health data (daily logs, BP, weight, blood results)
      - 'log_doses' — log supplement doses
      - 'edit_schedules' — create/update supplement schedules
      - 'edit_supplements' — add/edit supplement details

    §STATUS: pending (awaiting caregiver acceptance) → accepted → revoked
    §OWNERSHIP: User A owns the relationship; User B accepts it
    """

    STATUS_CHOICES = [
        ('pending', 'Pending Acceptance'),
        ('accepted', 'Accepted'),
        ('revoked', 'Revoked'),
    ]

    # ── Ownership ──
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='caregiver_relationships_primary',
        help_text='The owner granting access (e.g., parent)'
    )
    profile = models.ForeignKey(
        'health.HealthProfile', on_delete=models.CASCADE,
        related_name='caregiver_relationships',
        help_text='Which profile the caregiver has access to'
    )
    caregiver_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='caregiver_relationships_assigned',
        help_text='The caregiver (e.g., adult child, spouse, healthcare provider)'
    )

    # ── Permissions ──
    permissions = models.JSONField(
        default=list, blank=True,
        help_text='List of allowed actions: ["view_all", "log_doses", "edit_schedules", "edit_supplements"]'
    )

    # ── Status & timestamps ──
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='pending'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    # ── Notes ──
    relationship_note = models.CharField(
        max_length=200, blank=True, default='',
        help_text='e.g., "My spouse", "My child", "My nurse"'
    )

    class Meta:
        ordering = ['-created_at']
        unique_together = [('user', 'profile', 'caregiver_user')]
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['caregiver_user', 'status']),
            models.Index(fields=['profile', 'status']),
        ]

    def __str__(self):
        return f'{self.caregiver_user.get_full_name() or self.caregiver_user.username} → {self.profile} ({self.get_status_display()})'

    def has_permission(self, action: str) -> bool:
        """Check if caregiver has a specific permission."""
        return action in (self.permissions or []) or 'view_all' in (self.permissions or [])

    @property
    def is_active(self) -> bool:
        """Is this relationship currently active?"""
        return self.status == 'accepted' and not self.revoked_at


# ──────────────────────────────────────────────────────────────
# §MODEL: MedicationReminder — smart reminders for medications/supplements
# ──────────────────────────────────────────────────────────────

class MedicationReminder(models.Model):
    """
    Structured reminder for taking medications or supplements.

    §PURPOSE: Remind user at specific time(s) to take a supplement/medication.
              Tracks adherence (taken/missed/snoozed).
              Supports recurring (daily, specific days) or one-time reminders.

    §SCENARIO: "Take vitamin D at 8am daily", "Take BP med at 6pm + 10pm"
    """

    FREQUENCY_CHOICES = [
        ('once', 'Once'),
        ('daily', 'Every day'),
        ('weekdays', 'Weekdays only'),
        ('weekends', 'Weekends only'),
        ('custom', 'Custom days'),
    ]

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('paused', 'Paused'),
        ('completed', 'Completed'),
    ]

    # ── Ownership ──
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='medication_reminders'
    )
    profile = models.ForeignKey(
        'health.HealthProfile', on_delete=models.CASCADE,
        related_name='medication_reminders'
    )

    # ── What & when ──
    supplement = models.ForeignKey(
        Supplement, on_delete=models.SET_NULL, null=True, blank=True,
        help_text='Link to supplement (optional, for context)'
    )
    medication_name = models.CharField(
        max_length=200,
        help_text='Name of medication (e.g., "Lisinopril 10mg", "Vitamin D 2000IU")'
    )
    reminder_time = models.TimeField(
        help_text='Time of day to be reminded (e.g., 08:00)'
    )

    # ── Recurrence ──
    frequency = models.CharField(
        max_length=20, choices=FREQUENCY_CHOICES, default='daily'
    )
    custom_days = models.JSONField(
        default=list, blank=True,
        help_text='Days of week if frequency=custom: [0=Mon, 1=Tue, ..., 6=Sun]'
    )
    start_date = models.DateField()
    end_date = models.DateField(
        null=True, blank=True,
        help_text='When reminder stops (null = ongoing)'
    )

    # ── Adherence tracking ──
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='active'
    )
    last_taken_at = models.DateTimeField(
        null=True, blank=True,
        help_text='When user last confirmed taking this medication'
    )
    skipped_count = models.PositiveIntegerField(
        default=0,
        help_text='Number of missed reminders'
    )
    taken_count = models.PositiveIntegerField(
        default=0,
        help_text='Number of confirmed taken'
    )

    # ── Context ──
    dosage = models.CharField(
        max_length=200, blank=True, default='',
        help_text='e.g., "1 tablet", "5ml", "1 capsule"'
    )
    instructions = models.TextField(
        blank=True, default='',
        help_text='e.g., "With food", "Before bed", "On empty stomach"'
    )
    notes = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['reminder_time', 'medication_name']
        indexes = [
            models.Index(fields=['user', 'status', '-updated_at']),
            models.Index(fields=['profile', 'status']),
            models.Index(fields=['user', 'reminder_time']),
        ]

    def __str__(self):
        return f'{self.medication_name} @ {self.reminder_time.strftime("%H:%M")} ({self.get_frequency_display()})'

    @property
    def adherence_rate(self) -> float:
        """Adherence percentage (taken / (taken + skipped))."""
        total = self.taken_count + self.skipped_count
        if total == 0:
            return 0.0
        return round(100 * self.taken_count / total, 1)

    def is_scheduled_for_today(self, today=None) -> bool:
        """Check if this reminder should fire today."""
        from datetime import date as date_class
        today = today or date_class.today()

        # Check date range
        if today < self.start_date:
            return False
        if self.end_date and today > self.end_date:
            return False

        # Check frequency
        weekday = today.weekday()  # 0=Mon, 6=Sun

        if self.frequency == 'once':
            return today == self.start_date
        elif self.frequency == 'daily':
            return True
        elif self.frequency == 'weekdays':
            return weekday < 5
        elif self.frequency == 'weekends':
            return weekday >= 5
        elif self.frequency == 'custom':
            return weekday in (self.custom_days or [])

        return False


class ReminderLog(models.Model):
    """
    Adherence log for a medication reminder on a specific date.
    """

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('taken', 'Taken'),
        ('snoozed', 'Snoozed'),
        ('skipped', 'Skipped'),
        ('dismissed', 'Dismissed'),
    ]

    reminder = models.ForeignKey(
        MedicationReminder, on_delete=models.CASCADE,
        related_name='logs'
    )
    date = models.DateField()
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='pending'
    )
    taken_at = models.DateTimeField(null=True, blank=True)
    snoozed_until = models.DateTimeField(
        null=True, blank=True,
        help_text='When snoozed reminder should fire again'
    )
    notes = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date']
        unique_together = [('reminder', 'date')]
        indexes = [
            models.Index(fields=['reminder', 'date']),
            models.Index(fields=['status', 'date']),
        ]

    def __str__(self):
        return f'{self.reminder.medication_name} @ {self.date} ({self.get_status_display()})'
