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
