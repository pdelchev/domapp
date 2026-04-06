"""
# ═══ DAILY RITUAL / HEALTH PROTOCOL ═══
# Time-blocked daily routine with medication, supplement, activity, and life blocks.
# Each item can be checked off daily. Tracks adherence streaks.
# Body measurements tracked separately for progress over time.
#
# ┌─────────────┐   1:N   ┌──────────────┐   1:N   ┌──────────────┐
# │ HealthProfile│────────│ RitualItem   │────────│ RitualLog    │
# └─────────────┘         └──────────────┘         └──────────────┘
#        │ 1:N
#  ┌─────┴─────────────┐
#  │ BodyMeasurement    │
#  └───────────────────┘
"""

from django.db import models
from django.conf import settings


ITEM_CATEGORY_CHOICES = [
    ('medication', 'Medication'),
    ('supplement', 'Supplement'),
    ('injection', 'Injection'),
    ('meal', 'Meal'),
    ('exercise', 'Exercise'),
    ('work', 'Work'),
    ('social', 'Social / Family'),
    ('sleep', 'Sleep'),
    ('hydration', 'Hydration'),
    ('other', 'Other'),
]

TIMING_CHOICES = [
    ('morning', 'Morning'),
    ('fasted', 'Fasted Window'),
    ('with_meal_1', 'With First Meal'),
    ('pre_workout', 'Pre-Workout'),
    ('with_meal_2', 'With Last Meal'),
    ('evening', 'Evening'),
    ('bedtime', 'Bedtime'),
    ('anytime', 'Anytime'),
]

CONDITION_CHOICES = [
    ('daily', 'Every Day'),
    ('gym_day', 'Gym Days Only'),
    ('sex_day', 'Sex Day Only'),
    ('gout_flare_pause', 'Pause During Gout Flare'),
    ('as_needed', 'As Needed'),
]

MEASUREMENT_SITE_CHOICES = [
    ('belly_under', 'Under Belly (Navel)'),
    ('belly_mid', 'Mid Belly'),
    ('chest', 'Chest (Nipple Line)'),
    ('bicep_right', 'Right Bicep'),
    ('bicep_left', 'Left Bicep'),
    ('waist', 'Waist'),
    ('hips', 'Hips'),
    ('thigh_right', 'Right Thigh'),
    ('thigh_left', 'Left Thigh'),
    ('neck', 'Neck'),
    ('forearm_right', 'Right Forearm'),
    ('forearm_left', 'Left Forearm'),
]


class RitualItem(models.Model):
    """
    A single item in the daily ritual — medication, supplement, activity, or life block.
    Pre-loaded with the user's protocol, can be customized.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='ritual_items'
    )
    profile = models.ForeignKey(
        'health.HealthProfile',
        on_delete=models.CASCADE,
        related_name='ritual_items',
        null=True, blank=True,
    )

    # What
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=20, choices=ITEM_CATEGORY_CHOICES)
    dose = models.CharField(max_length=100, blank=True, default='', help_text='e.g. "80mg", "250-500mg", "half tablet"')
    instructions = models.CharField(max_length=300, blank=True, default='', help_text='e.g. "with food", "fasted", "30min before gym"')

    # When
    scheduled_time = models.TimeField(null=True, blank=True, help_text='Suggested time (HH:MM)')
    timing = models.CharField(max_length=20, choices=TIMING_CHOICES, default='anytime')
    condition = models.CharField(max_length=20, choices=CONDITION_CHOICES, default='daily')

    # Interaction warnings
    warning = models.CharField(max_length=500, blank=True, default='', help_text='Interaction or caution note')

    # Display
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    color = models.CharField(max_length=20, blank=True, default='', help_text='Badge color hint')

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'scheduled_time']
        indexes = [
            models.Index(fields=['user', 'is_active']),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_category_display()})"


class RitualLog(models.Model):
    """
    Daily completion log for a ritual item.
    One record per item per day.
    """
    item = models.ForeignKey(
        RitualItem,
        on_delete=models.CASCADE,
        related_name='logs'
    )
    date = models.DateField()
    completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    skipped = models.BooleanField(default=False, help_text='Intentionally skipped (e.g. gout flare)')
    notes = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        unique_together = [('item', 'date')]
        ordering = ['-date']
        indexes = [
            models.Index(fields=['date', 'completed']),
        ]

    def __str__(self):
        status = 'done' if self.completed else ('skipped' if self.skipped else 'pending')
        return f"{self.item.name} — {self.date} ({status})"


class BodyMeasurement(models.Model):
    """
    Body measurement at a specific point in time.
    Track multiple sites for progress monitoring.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='body_measurements'
    )
    profile = models.ForeignKey(
        'health.HealthProfile',
        on_delete=models.CASCADE,
        related_name='body_measurements',
        null=True, blank=True,
    )
    measured_at = models.DateField()
    site = models.CharField(max_length=20, choices=MEASUREMENT_SITE_CHOICES)
    value_cm = models.DecimalField(max_digits=5, decimal_places=1, help_text='Measurement in cm')
    notes = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-measured_at', 'site']
        indexes = [
            models.Index(fields=['user', '-measured_at']),
        ]
        unique_together = [('user', 'measured_at', 'site')]

    def __str__(self):
        return f"{self.get_site_display()}: {self.value_cm}cm ({self.measured_at})"
