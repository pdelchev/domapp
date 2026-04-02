"""
# ═══ VEHICLES MODULE ═══
# Tracks vehicle ownership and recurring obligations (insurance, vignette, MOT, tax).
# Bulgarian-first: preset obligation types match BG regulatory requirements.
# Multi-vehicle per user, optional property linking, cost analytics.
#
# ┌─────────┐    1:N    ┌───────────────────┐    1:N    ┌─────────────────┐
# │ Vehicle │──────────│ VehicleObligation │──────────│ ObligationFile  │
# └─────────┘          └───────────────────┘          └─────────────────┘
#                              │ 1:N
#                      ┌──────┴──────────┐
#                      │ VehicleReminder │
#                      └─────────────────┘
#
# KEY: user FK scopes all data. Property FK is optional (company car linking).
# PATTERN: follows DomApp standard — ModelViewSet, user-scoped queryset, DRF serializers.
"""

from django.db import models
from django.conf import settings
from properties.models import Property


class Vehicle(models.Model):
    """
    A vehicle owned/managed by the user.
    Stores registration info and links optionally to a property.
    """
    FUEL_CHOICES = [
        ('petrol', 'Petrol'),
        ('diesel', 'Diesel'),
        ('lpg', 'LPG'),
        ('electric', 'Electric'),
        ('hybrid', 'Hybrid'),
        ('plugin_hybrid', 'Plug-in Hybrid'),
        ('cng', 'CNG'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='vehicles'
    )
    # Optional: link to a property (company car, service vehicle)
    linked_property = models.ForeignKey(
        Property,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='vehicles',
        help_text='Optional: assign this vehicle to a property'
    )

    # --- Core vehicle info ---
    plate_number = models.CharField(
        max_length=20,
        help_text='Registration plate, e.g. CB1234AB'
    )
    make = models.CharField(max_length=100, help_text='Manufacturer, e.g. Toyota')
    model = models.CharField(max_length=100, help_text='Model, e.g. Corolla')
    year = models.PositiveIntegerField(null=True, blank=True, help_text='Year of manufacture')
    color = models.CharField(max_length=50, blank=True, default='')
    fuel_type = models.CharField(max_length=20, choices=FUEL_CHOICES, blank=True, default='')

    # --- Extended info (optional) ---
    vin = models.CharField(max_length=17, blank=True, default='', help_text='Vehicle Identification Number')
    engine_cc = models.PositiveIntegerField(null=True, blank=True, help_text='Engine displacement in cc')
    first_registration_date = models.DateField(null=True, blank=True)

    # --- Status ---
    is_active = models.BooleanField(default=True, help_text='False = sold/scrapped, hidden from active views')
    notes = models.TextField(blank=True, default='')

    # --- Timestamps ---
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_active']),
            models.Index(fields=['plate_number']),
        ]

    def __str__(self):
        return f"{self.make} {self.model} ({self.plate_number})"

    def get_current_obligations(self):
        """Returns all current (active) obligations for this vehicle."""
        return self.obligations.filter(is_current=True)


# ═══ OBLIGATION TYPES ═══
# These are the Bulgarian regulatory obligations every vehicle owner must track.
# 'custom' allows user-defined obligation types beyond the presets.
OBLIGATION_TYPE_CHOICES = [
    ('mtpl', 'Гражданска застраховка'),       # MTPL — mandatory, annual
    ('kasko', 'Каско'),                        # Comprehensive insurance — optional
    ('vignette', 'Винетка'),                   # E-vignette — annual/monthly/weekly
    ('mot', 'Технически преглед'),             # MOT / ГТП — annual or biannual
    ('vehicle_tax', 'Данък МПС'),              # Annual vehicle tax to municipality
    ('green_card', 'Зелена карта'),            # Green card — for travel outside BG
    ('assistance', 'Асистанс'),                # Roadside assistance — optional, annual
    ('custom', 'Друго'),                       # User-defined
]

# Default renewal periods (months) for auto-suggesting next renewal date
OBLIGATION_DEFAULT_MONTHS = {
    'mtpl': 12,
    'kasko': 12,
    'vignette': 12,    # annual vignette; user can override for shorter
    'mot': 12,         # new cars: 36 months, then annual; user overrides
    'vehicle_tax': 12,
    'green_card': 12,
    'assistance': 12,
    'custom': 12,
}


class VehicleObligation(models.Model):
    """
    A single obligation instance for a vehicle (e.g., MTPL for 2026).
    Each renewal creates a new record — old ones stay as history.
    is_current=True marks the active/latest obligation of that type.

    ─── LIFECYCLE ───
    active (end_date > today) → expiring_soon (≤30d) → expired (past end_date)
    User renews → old.is_current=False, new record created with is_current=True
    """
    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.CASCADE,
        related_name='obligations'
    )
    obligation_type = models.CharField(max_length=20, choices=OBLIGATION_TYPE_CHOICES)
    custom_type_name = models.CharField(
        max_length=100, blank=True, default='',
        help_text='Only used when obligation_type="custom"'
    )

    # --- Dates ---
    start_date = models.DateField(help_text='When this obligation starts / was purchased')
    end_date = models.DateField(
        null=True, blank=True,
        help_text='When this obligation expires. Null = no expiry (e.g., one-time registration)'
    )

    # --- Provider / policy info ---
    provider = models.CharField(
        max_length=200, blank=True, default='',
        help_text='Insurance company, service center, etc.'
    )
    policy_number = models.CharField(max_length=100, blank=True, default='')

    # --- Cost ---
    cost = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text='Amount paid for this obligation'
    )
    currency = models.CharField(max_length=3, default='BGN')

    # --- Reminders ---
    # JSON array of days-before-expiry to send reminders, e.g. [30, 7, 1]
    reminder_days = models.JSONField(
        default=list,
        blank=True,
        help_text='Days before end_date to trigger reminders, e.g. [30, 7, 1]'
    )

    # --- History tracking ---
    is_current = models.BooleanField(
        default=True,
        help_text='True = the active/latest obligation of this type for this vehicle'
    )

    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-end_date', '-start_date']
        indexes = [
            models.Index(fields=['vehicle', 'obligation_type', 'is_current']),
            models.Index(fields=['end_date']),
            models.Index(fields=['is_current']),
        ]

    def __str__(self):
        label = self.custom_type_name if self.obligation_type == 'custom' else self.get_obligation_type_display()
        return f"{label} — {self.vehicle.plate_number} (→ {self.end_date})"

    @property
    def display_name(self):
        """Returns the human-readable obligation name (handles custom types)."""
        if self.obligation_type == 'custom' and self.custom_type_name:
            return self.custom_type_name
        return self.get_obligation_type_display()

    @property
    def status(self):
        """Computed expiry status: expired / expiring_soon / active / no_expiry."""
        if not self.end_date:
            return 'no_expiry'
        from django.utils import timezone
        from datetime import timedelta
        today = timezone.now().date()
        if self.end_date < today:
            return 'expired'
        if self.end_date <= today + timedelta(days=30):
            return 'expiring_soon'
        return 'active'

    def get_default_reminder_days(self):
        """Returns default reminder schedule if none set."""
        return [30, 7, 1]


class ObligationFile(models.Model):
    """
    File attachment for an obligation (policy scan, receipt, certificate).
    Stored under media/vehicle_docs/<user_id>/<filename>.
    """
    obligation = models.ForeignKey(
        VehicleObligation,
        on_delete=models.CASCADE,
        related_name='files'
    )
    file = models.FileField(upload_to='vehicle_docs/')
    label = models.CharField(max_length=200, blank=True, default='')
    file_size = models.PositiveIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.label or self.file.name} ({self.obligation})"

    def save(self, *args, **kwargs):
        if self.file and not self.file_size:
            self.file_size = self.file.size
        super().save(*args, **kwargs)


class VehicleReminder(models.Model):
    """
    Scheduled reminder for an obligation expiry.
    Created when obligation is saved; Celery beat checks daily and fires notifications.

    ─── FLOW ───
    Obligation saved → service layer creates VehicleReminder records
    Daily task → find reminders where remind_at ≤ today AND sent=False → fire notification → sent=True
    """
    obligation = models.ForeignKey(
        VehicleObligation,
        on_delete=models.CASCADE,
        related_name='reminders'
    )
    remind_at = models.DateField(help_text='Date to send this reminder')
    sent = models.BooleanField(default=False)
    sent_at = models.DateTimeField(null=True, blank=True)
    notification_id = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='FK to Notification record once sent'
    )

    class Meta:
        ordering = ['remind_at']
        indexes = [
            models.Index(fields=['remind_at', 'sent']),
        ]
        unique_together = [('obligation', 'remind_at')]

    def __str__(self):
        status = 'sent' if self.sent else 'pending'
        return f"Reminder {self.remind_at} ({status}) — {self.obligation}"
