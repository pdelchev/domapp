from django.db import models
from properties.models import Property, Unit
from tenants.models import Tenant


class Lease(models.Model):
    """
    Connects a tenant to a property with rent terms.

    Supports multiple rent frequencies:
    - monthly: Traditional month-to-month rent (due on rent_due_day)
    - weekly: Rent due every 7 days from start_date
    - biweekly: Rent due every 14 days from start_date
    - one_time: Airbnb / random income — no auto-generation, manual entry only

    When auto_generate_payments=True and frequency is recurring,
    the system generates RentPayment records ahead of time.
    next_payment_date tracks where the generation cursor is.
    """

    FREQUENCY_CHOICES = [
        ('monthly', 'Monthly'),
        ('weekly', 'Weekly'),
        ('biweekly', 'Bi-weekly'),
        ('one_time', 'One-time / Airbnb'),
    ]

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('terminated', 'Terminated'),
        ('expired', 'Expired'),
    ]

    property = models.ForeignKey(
        Property, on_delete=models.CASCADE, related_name='leases'
    )
    unit = models.ForeignKey(
        Unit, on_delete=models.SET_NULL, related_name='leases',
        blank=True, null=True,
        help_text='Optional — which unit within the property this lease is for'
    )
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='leases'
    )

    start_date = models.DateField()
    end_date = models.DateField()

    # Rent terms — amount is per-period (per month, per week, etc.)
    monthly_rent = models.DecimalField(
        max_digits=10, decimal_places=2,
        help_text='Rent amount per period (monthly/weekly/biweekly/one-time)'
    )
    rent_frequency = models.CharField(
        max_length=20, choices=FREQUENCY_CHOICES, default='monthly'
    )
    rent_due_day = models.IntegerField(
        default=1,
        help_text='Day of month rent is due (1-28) for monthly leases'
    )

    deposit = models.DecimalField(
        max_digits=10, decimal_places=2, blank=True, null=True
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='active'
    )

    # Payment auto-generation control
    auto_generate_payments = models.BooleanField(
        default=True,
        help_text='Auto-create RentPayment records for recurring leases'
    )
    next_payment_date = models.DateField(
        blank=True, null=True,
        help_text='Next date a payment record will be generated for'
    )

    # Utility meter readings — recorded at move-in and move-out
    electricity_meter_in = models.DecimalField(
        max_digits=12, decimal_places=2, blank=True, null=True,
        help_text='Electricity meter reading at move-in'
    )
    electricity_meter_out = models.DecimalField(
        max_digits=12, decimal_places=2, blank=True, null=True,
        help_text='Electricity meter reading at move-out'
    )
    water_meter_in = models.DecimalField(
        max_digits=12, decimal_places=2, blank=True, null=True,
        help_text='Water meter reading at move-in'
    )
    water_meter_out = models.DecimalField(
        max_digits=12, decimal_places=2, blank=True, null=True,
        help_text='Water meter reading at move-out'
    )
    gas_meter_in = models.DecimalField(
        max_digits=12, decimal_places=2, blank=True, null=True,
        help_text='Gas meter reading at move-in'
    )
    gas_meter_out = models.DecimalField(
        max_digits=12, decimal_places=2, blank=True, null=True,
        help_text='Gas meter reading at move-out'
    )

    notes = models.TextField(blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=['status', 'auto_generate_payments']),
            models.Index(fields=['next_payment_date']),
        ]

    def __str__(self):
        return f"Lease: {self.tenant.full_name} → {self.property.name}"

    def is_recurring(self):
        return self.rent_frequency != 'one_time'
