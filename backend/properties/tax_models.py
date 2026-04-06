"""
# ═══ PROPERTY TAX TRACKING ═══
# Tracks property tax obligations by country (UK, Bulgaria, UAE).
# Each tax type has amount, frequency, due date, and automated reminders.
#
# ┌──────────┐    1:N    ┌──────────────┐    1:N    ┌─────────────┐
# │ Property │──────────│ PropertyTax  │──────────│ TaxReminder │
# └──────────┘          └──────────────┘          └─────────────┘
#
# PATTERN: follows VehicleObligation — is_current for history, reminder_days for alerts.
"""

from django.db import models
from django.conf import settings
from datetime import timedelta
from django.utils import timezone


# ═══ TAX TYPE CHOICES ═══
# Country-specific property tax types.
TAX_TYPE_CHOICES = [
    # Bulgaria
    ('bg_property_tax', 'Данък недвижими имоти'),           # Annual property tax to municipality
    ('bg_waste_tax', 'Такса битови отпадъци'),              # Annual waste collection fee (ТБО)
    # UK
    ('uk_council_tax', 'Council Tax'),                       # Monthly to local council
    ('uk_stamp_duty', 'Stamp Duty Land Tax'),               # One-time on purchase
    ('uk_capital_gains', 'Capital Gains Tax'),               # On sale profit
    ('uk_income_tax', 'Income Tax (rental)'),               # Annual on rental income
    # UAE
    ('uae_municipality_fee', 'Municipality Fee'),            # 5% of annual rent (tenant) or 2% (owner)
    ('uae_housing_fee', 'Housing Fee (DEWA)'),              # 5% of annual rent via DEWA bills
    ('uae_service_charge', 'Service Charge'),                # Annual to developer/RERA
    # Generic
    ('custom', 'Other'),
]

# Frequency choices for tax payments
FREQUENCY_CHOICES = [
    ('one_time', 'One-time'),
    ('monthly', 'Monthly'),
    ('quarterly', 'Quarterly'),
    ('biannual', 'Biannual'),
    ('annual', 'Annual'),
]

# Country → applicable tax types mapping
COUNTRY_TAX_PRESETS = {
    'Bulgaria': [
        {
            'tax_type': 'bg_property_tax',
            'frequency': 'annual',
            'helper_text': 'Данък имот — платим до 30 юни (с отстъпка до 30 април). Ставка: 0.1‰–4.5‰ от данъчната оценка. Плаща се в общината по местонахождение.',
            'helper_text_en': 'Property tax — due by June 30 (discount if paid by April 30). Rate: 0.1‰–4.5‰ of tax assessment. Paid to the municipality.',
            'authority_hint': 'Община (Municipality)',
        },
        {
            'tax_type': 'bg_waste_tax',
            'frequency': 'annual',
            'helper_text': 'ТБО — такса смет, платима заедно с данък имот. Ставка зависи от общината (обикновено 1‰–10‰ от данъчната оценка).',
            'helper_text_en': 'Waste collection fee — paid with property tax. Rate depends on municipality (typically 1‰–10‰ of tax assessment).',
            'authority_hint': 'Община (Municipality)',
        },
    ],
    'UK': [
        {
            'tax_type': 'uk_council_tax',
            'frequency': 'monthly',
            'helper_text': 'Council Tax is paid monthly (Apr-Mar) to your local council. Band A-H based on property value. 10 monthly payments (Feb-Mar off). Check your council\'s website for exact band.',
            'helper_text_en': 'Council Tax is paid monthly (Apr-Mar) to your local council. Band A-H based on property value.',
            'authority_hint': 'Local Council',
        },
        {
            'tax_type': 'uk_income_tax',
            'frequency': 'annual',
            'helper_text': 'If renting out the property, rental income is taxable. Basic rate 20%, higher 40%. Self Assessment deadline: 31 January. Register with HMRC.',
            'helper_text_en': 'Rental income tax — Self Assessment deadline: 31 January.',
            'authority_hint': 'HMRC',
        },
    ],
    'UAE': [
        {
            'tax_type': 'uae_municipality_fee',
            'frequency': 'annual',
            'helper_text': 'Municipality fee is 2% of annual rent for owners (Dubai). Paid via Ejari registration or directly to municipality.',
            'helper_text_en': 'Municipality fee — 2% of annual rent for owners in Dubai.',
            'authority_hint': 'Dubai Municipality / DLD',
        },
        {
            'tax_type': 'uae_housing_fee',
            'frequency': 'monthly',
            'helper_text': 'Housing fee is 5% of annual rent, split into 12 monthly payments on DEWA bills. Only applies to rented properties.',
            'helper_text_en': 'Housing fee — 5% of annual rent via DEWA monthly bills.',
            'authority_hint': 'DEWA',
        },
        {
            'tax_type': 'uae_service_charge',
            'frequency': 'annual',
            'helper_text': 'Service charge is set by the developer / RERA. Paid annually. Covers building maintenance, security, shared areas.',
            'helper_text_en': 'Service charge — annual fee set by developer/RERA for building maintenance.',
            'authority_hint': 'Developer / RERA',
        },
    ],
}


class PropertyTax(models.Model):
    """
    A tax obligation for a property.
    Each renewal or new tax year creates a new record — old ones stay as history.
    is_current=True marks the active/latest tax entry of that type.
    """
    property = models.ForeignKey(
        'Property',
        on_delete=models.CASCADE,
        related_name='taxes'
    )
    tax_type = models.CharField(max_length=30, choices=TAX_TYPE_CHOICES)
    custom_tax_name = models.CharField(
        max_length=100, blank=True, default='',
        help_text='Only used when tax_type="custom"'
    )

    # --- Payment info ---
    amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text='Tax amount per period'
    )
    currency = models.CharField(max_length=3, default='EUR')
    frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES, default='annual')

    # --- Due date tracking ---
    due_date = models.DateField(
        null=True, blank=True,
        help_text='Next due date for this tax payment'
    )
    paid_until = models.DateField(
        null=True, blank=True,
        help_text='Tax is paid up to this date'
    )

    # --- Authority info ---
    authority = models.CharField(
        max_length=200, blank=True, default='',
        help_text='Tax authority / municipality / council name'
    )
    reference_number = models.CharField(
        max_length=100, blank=True, default='',
        help_text='Tax reference / account number'
    )

    # --- Helper text (pre-filled from country presets) ---
    helper_text = models.TextField(
        blank=True, default='',
        help_text='Explanatory text about this tax type'
    )

    # --- Reminders ---
    reminder_days = models.JSONField(
        default=list,
        blank=True,
        help_text='Days before due_date to trigger reminders, e.g. [30, 7, 1]'
    )

    # --- History ---
    is_current = models.BooleanField(
        default=True,
        help_text='True = the active/latest tax entry of this type for this property'
    )
    is_paid = models.BooleanField(
        default=False,
        help_text='Whether the current period is paid'
    )

    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['tax_type', '-due_date']
        indexes = [
            models.Index(fields=['property', 'tax_type', 'is_current']),
            models.Index(fields=['due_date']),
        ]
        verbose_name_plural = 'Property taxes'

    def __str__(self):
        label = self.custom_tax_name if self.tax_type == 'custom' else self.get_tax_type_display()
        return f"{label} — {self.property.name}"

    def get_display_name(self):
        if self.tax_type == 'custom' and self.custom_tax_name:
            return self.custom_tax_name
        return self.get_tax_type_display()

    def get_status(self):
        """Computed status: overdue / due_soon / paid / upcoming / no_due_date."""
        if self.is_paid:
            return 'paid'
        if not self.due_date:
            return 'no_due_date'
        today = timezone.now().date()
        if self.due_date < today:
            return 'overdue'
        if self.due_date <= today + timedelta(days=30):
            return 'due_soon'
        return 'upcoming'

    def get_default_reminder_days(self):
        return [30, 7, 1]

    def get_monthly_equivalent(self):
        """Calculate monthly cost equivalent for display."""
        if not self.amount:
            return None
        multipliers = {
            'monthly': 1,
            'quarterly': 1 / 3,
            'biannual': 1 / 6,
            'annual': 1 / 12,
            'one_time': None,
        }
        mult = multipliers.get(self.frequency)
        if mult is None:
            return None
        return round(float(self.amount) * mult, 2)


class TaxReminder(models.Model):
    """
    Scheduled reminder for a tax due date.
    Same pattern as VehicleReminder.
    """
    tax = models.ForeignKey(
        PropertyTax,
        on_delete=models.CASCADE,
        related_name='reminders'
    )
    remind_at = models.DateField(help_text='Date to send this reminder')
    sent = models.BooleanField(default=False)
    sent_at = models.DateTimeField(null=True, blank=True)
    notification_id = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ['remind_at']
        indexes = [
            models.Index(fields=['remind_at', 'sent']),
        ]
        unique_together = [('tax', 'remind_at')]

    def __str__(self):
        status = 'sent' if self.sent else 'pending'
        return f"Tax reminder {self.remind_at} ({status}) — {self.tax}"
