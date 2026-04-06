"""
# ═══ GOUT & JOINT HEALTH TRACKER ═══
# Tracks gout flare-ups, uric acid levels, triggers, and medical procedures.
# Pattern detection: correlates food/activity triggers with attacks.
#
# ┌─────────────┐   1:N   ┌──────────────┐
# │ HealthProfile│────────│  GoutAttack   │──── 1:N ──── AttackTrigger
# └─────────────┘         └──────────────┘
#        │ 1:N
#  ┌─────┴──────────┐     ┌──────────────────┐
#  │ UricAcidReading │     │ MedicalProcedure │
#  └────────────────┘     └──────────────────┘
"""

from django.db import models
from django.conf import settings


JOINT_CHOICES = [
    ('big_toe', 'Big Toe'),
    ('ankle', 'Ankle'),
    ('knee', 'Knee'),
    ('wrist', 'Wrist'),
    ('finger', 'Finger'),
    ('elbow', 'Elbow'),
    ('heel', 'Heel / Foot'),
    ('other', 'Other'),
]

JOINT_SIDE_CHOICES = [
    ('left', 'Left'),
    ('right', 'Right'),
    ('both', 'Both'),
]

TRIGGER_CATEGORY_CHOICES = [
    ('food', 'Food'),
    ('drink', 'Drink'),
    ('activity', 'Physical Activity'),
    ('stress', 'Stress'),
    ('weather', 'Weather'),
    ('medication', 'Medication'),
    ('other', 'Other'),
]

# Known high-purine / high-risk triggers
KNOWN_TRIGGERS = {
    'food': ['red_meat', 'organ_meat', 'seafood', 'processed_meat', 'sweets', 'pastry', 'high_fat'],
    'drink': ['beer', 'wine', 'spirits', 'sugary_drinks', 'soda'],
    'activity': ['squatting', 'heavy_lifting', 'long_driving', 'running', 'overexertion', 'impact'],
}

PROCEDURE_TYPE_CHOICES = [
    ('fluid_drainage', 'Fluid Drainage (Aspiration)'),
    ('injection', 'Corticosteroid Injection'),
    ('blood_test', 'Blood Test'),
    ('xray', 'X-Ray'),
    ('ultrasound', 'Ultrasound'),
    ('mri', 'MRI'),
    ('other', 'Other'),
]

MEDICATION_CHOICES = [
    ('colchicine', 'Colchicine'),
    ('allopurinol', 'Allopurinol'),
    ('febuxostat', 'Febuxostat'),
    ('nsaid', 'NSAID (Ibuprofen, Naproxen)'),
    ('prednisone', 'Prednisone'),
    ('other', 'Other'),
]


class GoutAttack(models.Model):
    """
    A single gout flare-up or joint inflammation episode.
    Tracks location, severity, duration, treatment, and linked triggers.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='gout_attacks'
    )
    profile = models.ForeignKey(
        'health.HealthProfile',
        on_delete=models.CASCADE,
        related_name='gout_attacks',
        null=True, blank=True,
    )

    # When
    onset_date = models.DateField(help_text='When the attack started')
    resolved_date = models.DateField(null=True, blank=True, help_text='When it resolved')

    # Where
    joint = models.CharField(max_length=20, choices=JOINT_CHOICES, default='big_toe')
    side = models.CharField(max_length=10, choices=JOINT_SIDE_CHOICES, default='right')

    # Severity
    severity = models.IntegerField(
        default=5,
        help_text='Pain severity 1-10'
    )
    swelling = models.BooleanField(default=True)
    redness = models.BooleanField(default=False)
    warmth = models.BooleanField(default=False)

    # Treatment
    medication = models.CharField(max_length=20, choices=MEDICATION_CHOICES, blank=True, default='')
    medication_dose = models.CharField(max_length=100, blank=True, default='', help_text='e.g. "2 on day 1, 1 on day 2"')

    # Uric acid at time of attack (if measured)
    uric_acid_level = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True,
        help_text='Uric acid level in µmol/L at time of attack'
    )

    # What happened before (free text for quick logging)
    day_before_food = models.TextField(blank=True, default='', help_text='What was eaten 24-48h before')
    day_before_activity = models.TextField(blank=True, default='', help_text='Physical activity before the attack')

    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-onset_date']
        indexes = [
            models.Index(fields=['user', '-onset_date']),
            models.Index(fields=['joint']),
        ]

    def __str__(self):
        return f"Gout attack — {self.get_joint_display()} ({self.onset_date})"

    def get_duration_days(self):
        if self.resolved_date:
            return (self.resolved_date - self.onset_date).days
        return None

    def get_is_resolved(self):
        return self.resolved_date is not None


class AttackTrigger(models.Model):
    """
    Specific trigger linked to an attack — food, drink, or activity.
    Used for pattern analysis across attacks.
    """
    attack = models.ForeignKey(
        GoutAttack,
        on_delete=models.CASCADE,
        related_name='triggers'
    )
    category = models.CharField(max_length=20, choices=TRIGGER_CATEGORY_CHOICES)
    name = models.CharField(max_length=100, help_text='e.g. "beer", "squatting", "processed meat"')
    notes = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        ordering = ['category', 'name']

    def __str__(self):
        return f"{self.get_category_display()}: {self.name}"


class UricAcidReading(models.Model):
    """
    Periodic uric acid blood test reading.
    Target: <360 µmol/L (6 mg/dL) for gout patients.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='uric_acid_readings'
    )
    profile = models.ForeignKey(
        'health.HealthProfile',
        on_delete=models.CASCADE,
        related_name='uric_acid_readings',
        null=True, blank=True,
    )
    measured_at = models.DateField()
    value = models.DecimalField(
        max_digits=5, decimal_places=1,
        help_text='Uric acid in µmol/L (normal: <360, your target: <300)'
    )
    notes = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-measured_at']
        indexes = [
            models.Index(fields=['user', '-measured_at']),
        ]

    def __str__(self):
        return f"UA {self.value} µmol/L ({self.measured_at})"

    def get_status(self):
        v = float(self.value)
        if v > 480:
            return 'critical'
        if v > 360:
            return 'high'
        if v > 300:
            return 'borderline'
        return 'normal'


class MedicalProcedure(models.Model):
    """
    Medical procedures related to gout/joint issues.
    e.g. knee fluid drainage, injections, imaging.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='gout_procedures'
    )
    profile = models.ForeignKey(
        'health.HealthProfile',
        on_delete=models.CASCADE,
        related_name='gout_procedures',
        null=True, blank=True,
    )
    procedure_date = models.DateField()
    procedure_type = models.CharField(max_length=20, choices=PROCEDURE_TYPE_CHOICES)
    joint = models.CharField(max_length=20, choices=JOINT_CHOICES, blank=True, default='')
    side = models.CharField(max_length=10, choices=JOINT_SIDE_CHOICES, blank=True, default='')
    doctor = models.CharField(max_length=200, blank=True, default='')
    findings = models.TextField(blank=True, default='', help_text='Results/findings from the procedure')
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-procedure_date']

    def __str__(self):
        return f"{self.get_procedure_type_display()} — {self.procedure_date}"
