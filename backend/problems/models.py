from django.db import models
from django.conf import settings
from properties.models import Property


class Problem(models.Model):
    """
    A reported problem/emergency at a property that needs resolution.

    Lifecycle: open -> in_progress -> resolved | closed
    Examples: water leak, broken appliance, tenant complaint, roof damage,
    electrical issue, pest infestation, emergency repair.
    """
    PRIORITY_CHOICES = [
        ('emergency', 'Emergency'),
        ('high', 'High'),
        ('medium', 'Medium'),
        ('low', 'Low'),
    ]

    STATUS_CHOICES = [
        ('open', 'Open'),
        ('in_progress', 'In Progress'),
        ('resolved', 'Resolved'),
        ('closed', 'Closed'),
    ]

    CATEGORY_CHOICES = [
        ('plumbing', 'Plumbing'),
        ('electrical', 'Electrical'),
        ('appliance', 'Appliance'),
        ('structural', 'Structural'),
        ('pest', 'Pest Control'),
        ('hvac', 'Heating / AC'),
        ('security', 'Security'),
        ('cleaning', 'Cleaning'),
        ('noise', 'Noise Complaint'),
        ('damage', 'Property Damage'),
        ('tenant', 'Tenant Issue'),
        ('other', 'Other'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='problems'
    )
    property = models.ForeignKey(
        Property,
        on_delete=models.CASCADE,
        related_name='problems'
    )

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='other')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')

    # Contact / reporter
    reported_by = models.CharField(
        max_length=255, blank=True, default='',
        help_text='Who reported this (tenant name, neighbor, etc.)'
    )

    # Cost tracking
    estimated_cost = models.DecimalField(
        max_digits=10, decimal_places=2, blank=True, null=True
    )
    actual_cost = models.DecimalField(
        max_digits=10, decimal_places=2, blank=True, null=True
    )

    # Vendor/contractor assigned
    assigned_to = models.CharField(
        max_length=255, blank=True, default='',
        help_text='Contractor or person assigned to fix this'
    )

    # Resolution
    resolution_notes = models.TextField(blank=True, default='')
    resolved_at = models.DateTimeField(blank=True, null=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['property', 'status']),
            models.Index(fields=['priority']),
            models.Index(fields=['-created_at']),
        ]

    def __str__(self):
        return f"{self.title} — {self.property.name} ({self.status})"
