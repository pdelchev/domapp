from django.db import models
from django.conf import settings


class Tenant(models.Model):
    """
    A person who rents properties. Contact record only.

    Property assignment, lease dates, deposit, and active status
    all live on the Lease model. A tenant can have multiple leases
    across different properties over time.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tenants',
        help_text='The property manager who manages this tenant'
    )
    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    id_number = models.CharField(max_length=50, blank=True, null=True)

    def __str__(self):
        return self.full_name


class TenantLog(models.Model):
    """Lightweight communication/event log for a tenant."""

    LOG_TYPE_CHOICES = [
        ('call', 'Phone Call'),
        ('email', 'Email'),
        ('sms', 'SMS'),
        ('visit', 'Visit'),
        ('reminder', 'Reminder Sent'),
        ('note', 'Note'),
        ('payment', 'Payment Related'),
        ('maintenance', 'Maintenance'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tenant_logs',
    )
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='logs',
    )
    log_type = models.CharField(max_length=20, choices=LOG_TYPE_CHOICES, default='note')
    message = models.TextField()
    logged_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-logged_at']

    def __str__(self):
        return f"{self.tenant.full_name} — {self.log_type} — {self.logged_at:%Y-%m-%d}"
