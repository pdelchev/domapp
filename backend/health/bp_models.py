# ── health/bp_models.py ───────────────────────────────────────────────
# Blood pressure tracking: readings, sessions, medications, alerts.
# Schema: BPSession → BPReading, BPMedication → BPMedLog, BPAlert
#
# §NAV: bp_models → bp_serializers → bp_views → bp_urls → bp_services
# §OWNER: every model scoped by user FK (same pattern as all DomApp models)
# §AHA: staging follows American Heart Association 2017 guidelines

from django.db import models
from django.conf import settings

from .models import HealthProfile


# ── AHA blood pressure staging constants ────────────────────────────
# §AHA: Official thresholds from AHA/ACC 2017 Hypertension Guidelines
# Used by classify_bp() in bp_services.py and by model properties.

STAGE_NORMAL = 'normal'
STAGE_ELEVATED = 'elevated'
STAGE_1 = 'stage_1'
STAGE_2 = 'stage_2'
STAGE_CRISIS = 'crisis'

BP_STAGE_CHOICES = [
    (STAGE_NORMAL, 'Normal'),
    (STAGE_ELEVATED, 'Elevated'),
    (STAGE_1, 'Hypertension Stage 1'),
    (STAGE_2, 'Hypertension Stage 2'),
    (STAGE_CRISIS, 'Hypertensive Crisis'),
]

ARM_CHOICES = [
    ('left', 'Left'),
    ('right', 'Right'),
]

POSTURE_CHOICES = [
    ('sitting', 'Sitting'),
    ('standing', 'Standing'),
    ('lying', 'Lying'),
]

FREQUENCY_CHOICES = [
    ('daily', 'Daily'),
    ('twice_daily', 'Twice Daily'),
    ('as_needed', 'As Needed'),
    ('other', 'Other'),
]

ALERT_TYPE_CHOICES = [
    ('crisis', 'Hypertensive Crisis'),
    ('sustained_high', 'Sustained High BP'),
    ('stage_change', 'Stage Change'),
    ('morning_surge', 'Morning Surge'),
    ('white_coat', 'White Coat Hypertension'),
    ('masked_hypertension', 'Masked Hypertension'),
    ('high_variability', 'High Variability'),
    ('medication_effective', 'Medication Effective'),
]

ALERT_SEVERITY_CHOICES = [
    ('critical', 'Critical'),
    ('high', 'High'),
    ('medium', 'Medium'),
    ('low', 'Low'),
]


# ── BP session (groups 2-3 readings taken in one sitting) ───────────

class BPSession(models.Model):
    """
    §SESSION: Groups 2-3 sequential BP readings taken during one measurement event.
    AHA recommends taking 2-3 readings 1 minute apart and averaging them.
    If 3+ readings, the first is discarded (typically elevated due to anxiety).

    §AVG: avg_systolic/avg_diastolic/avg_pulse are cached on save for performance.
    §STAGE: Computed from averaged values using AHA thresholds.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='bp_sessions')
    profile = models.ForeignKey(HealthProfile, on_delete=models.CASCADE, related_name='bp_sessions')
    measured_at = models.DateTimeField()
    avg_systolic = models.FloatField(null=True, blank=True)
    avg_diastolic = models.FloatField(null=True, blank=True)
    avg_pulse = models.FloatField(null=True, blank=True)
    reading_count = models.IntegerField(default=0)
    stage = models.CharField(max_length=20, choices=BP_STAGE_CHOICES, default=STAGE_NORMAL)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-measured_at']
        indexes = [
            models.Index(fields=['user', 'profile', '-measured_at']),
        ]

    def __str__(self):
        sys_str = f"{self.avg_systolic:.0f}" if self.avg_systolic else '?'
        dia_str = f"{self.avg_diastolic:.0f}" if self.avg_diastolic else '?'
        return f"Session {sys_str}/{dia_str} — {self.measured_at:%Y-%m-%d %H:%M}"


# ── Individual BP reading ───────────────────────────────────────────

class BPReading(models.Model):
    """
    §READING: Single blood pressure measurement.
    Can be standalone or part of a BPSession.

    §CONTEXT: Boolean tags capture situational factors that affect BP:
    - caffeine: coffee/tea within 30 min
    - exercise: physical activity within 30 min
    - medication: taken BP meds recently
    - stressed: self-reported stress
    - clinic: taken in clinical setting (for white-coat detection)
    - fasting: no food within 2 hours

    §CALC: stage, pulse_pressure, mean_arterial_pressure are computed properties.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='bp_readings')
    profile = models.ForeignKey(HealthProfile, on_delete=models.CASCADE, related_name='bp_readings')
    session = models.ForeignKey(BPSession, on_delete=models.SET_NULL, null=True, blank=True, related_name='readings')

    # ── Core measurements ──
    systolic = models.IntegerField()        # mmHg (top number)
    diastolic = models.IntegerField()       # mmHg (bottom number)
    pulse = models.IntegerField(null=True, blank=True)  # BPM

    # ── Measurement conditions ──
    measured_at = models.DateTimeField()
    arm = models.CharField(max_length=10, choices=ARM_CHOICES, default='left')
    posture = models.CharField(max_length=10, choices=POSTURE_CHOICES, default='sitting')

    # ── Context tags ──
    is_after_caffeine = models.BooleanField(default=False)
    is_after_exercise = models.BooleanField(default=False)
    is_after_medication = models.BooleanField(default=False)
    is_stressed = models.BooleanField(default=False)
    is_clinic_reading = models.BooleanField(default=False)
    is_fasting = models.BooleanField(default=False)

    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-measured_at']
        indexes = [
            models.Index(fields=['user', 'profile', '-measured_at']),
            models.Index(fields=['session']),
        ]

    def __str__(self):
        return f"{self.systolic}/{self.diastolic} — {self.measured_at:%Y-%m-%d %H:%M}"

    @property
    def stage(self):
        """§CALC: AHA classification based on systolic and diastolic values."""
        from .bp_services import classify_bp
        return classify_bp(self.systolic, self.diastolic)

    @property
    def pulse_pressure(self):
        """§CALC: Pulse pressure = systolic - diastolic. Normal: 40-60 mmHg."""
        return self.systolic - self.diastolic

    @property
    def mean_arterial_pressure(self):
        """§CALC: MAP = diastolic + 1/3 * pulse_pressure. Normal: 70-100 mmHg."""
        from .bp_services import compute_map
        return compute_map(self.systolic, self.diastolic)


# ── BP medication tracking ──────────────────────────────────────────

class BPMedication(models.Model):
    """
    §MED: Tracked antihypertensive medication for a profile.
    Links to BPMedLog for daily adherence tracking.

    §EFFECTIVE: bp_services.get_medication_effectiveness() compares
    14-day avg BP before vs after started_at to assess impact.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='bp_medications')
    profile = models.ForeignKey(HealthProfile, on_delete=models.CASCADE, related_name='bp_medications')
    name = models.CharField(max_length=200)         # e.g., "Lisinopril"
    dose = models.CharField(max_length=100)          # e.g., "10mg"
    frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES, default='daily')
    started_at = models.DateField()
    ended_at = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default='')

    # ── Photos ──
    photo = models.ImageField(
        upload_to='health/bp_medications/pill/',
        null=True, blank=True,
        help_text='Photo of pill/package for visual identification'
    )
    photo_prescription = models.ImageField(
        upload_to='health/bp_medications/prescription/',
        null=True, blank=True,
        help_text='Photo of prescription/doctor document'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_active', '-started_at']

    def __str__(self):
        status = 'active' if self.is_active else 'ended'
        return f"{self.name} {self.dose} ({status})"


# ── Daily medication adherence log ──────────────────────────────────

class BPMedLog(models.Model):
    """
    §ADHERE: Daily medication adherence record.
    One row per medication per day. `taken=True` means dose was taken.
    `taken_at` optionally records exact time.
    """
    medication = models.ForeignKey(BPMedication, on_delete=models.CASCADE, related_name='logs')
    date = models.DateField()
    taken = models.BooleanField(default=False)
    taken_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ['medication', 'date']
        ordering = ['-date']

    def __str__(self):
        status = 'taken' if self.taken else 'missed'
        return f"{self.medication.name} — {self.date} ({status})"


# ── BP alert system ────────────────────────────────────────────────

class BPAlert(models.Model):
    """
    §ALERT: Auto-generated alerts from BP analysis.
    Created by bp_services.check_alerts() after each reading.

    §TYPES:
    - crisis: systolic >180 or diastolic >120 (immediate medical attention)
    - sustained_high: 3+ consecutive stage 2 readings
    - stage_change: BP stage changed from previous reading
    - morning_surge: elevated morning BP pattern detected
    - white_coat: clinic readings significantly higher than home
    - masked_hypertension: home readings higher than clinic
    - high_variability: systolic std dev >15 mmHg over 30 days
    - medication_effective: BP improved after starting medication
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='bp_alerts')
    profile = models.ForeignKey(HealthProfile, on_delete=models.CASCADE, related_name='bp_alerts')
    alert_type = models.CharField(max_length=30, choices=ALERT_TYPE_CHOICES)
    severity = models.CharField(max_length=10, choices=ALERT_SEVERITY_CHOICES, default='medium')
    title = models.CharField(max_length=200)
    title_bg = models.CharField(max_length=200, blank=True, default='')
    message = models.TextField()
    message_bg = models.TextField(blank=True, default='')
    related_reading = models.ForeignKey(BPReading, on_delete=models.SET_NULL, null=True, blank=True, related_name='alerts')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'profile', '-created_at']),
            models.Index(fields=['user', 'is_read']),
        ]

    def __str__(self):
        return f"[{self.severity}] {self.title}"
