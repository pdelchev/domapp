from django.db import models
from django.conf import settings
from properties.models import Property


class Investment(models.Model):
    """
    Tracks an investment tied to a property (or standalone).
    Examples: renovation, solar panels, new appliance, land purchase.
    """
    TYPE_CHOICES = [
        ('renovation', 'Renovation'),
        ('equipment', 'Equipment'),
        ('expansion', 'Expansion'),
        ('energy', 'Energy Efficiency'),
        ('land', 'Land Purchase'),
        ('furniture', 'Furniture'),
        ('security', 'Security System'),
        ('stock', 'Stock'),
        ('crypto', 'Cryptocurrency'),
        ('bond', 'Bond'),
        ('mutual_fund', 'Mutual Fund'),
        ('other', 'Other'),
    ]

    STATUS_CHOICES = [
        ('planned', 'Planned'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='investments'
    )
    property = models.ForeignKey(
        Property,
        on_delete=models.CASCADE,
        related_name='investments',
        blank=True,
        null=True
    )

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    investment_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='other')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planned')

    # Financial
    amount_invested = models.DecimalField(max_digits=12, decimal_places=2)
    expected_return = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    actual_return = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)

    # Dates
    investment_date = models.DateField()
    completion_date = models.DateField(blank=True, null=True)

    # Market investment fields (stocks, crypto, bonds, etc.)
    ticker_symbol = models.CharField(max_length=20, blank=True, default='')
    quantity = models.DecimalField(max_digits=14, decimal_places=4, blank=True, null=True)
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    current_price = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)

    notes = models.TextField(blank=True, default='')

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-investment_date']
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['investment_type']),
            models.Index(fields=['-investment_date']),
        ]

    def __str__(self):
        prop = self.property.name if self.property else 'General'
        return f"{self.title} — {prop} ({self.status})"
