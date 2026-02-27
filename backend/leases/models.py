from django.db import models

# Create your models here.
from django.db import models
from properties.models import Property
from tenants.models import Tenant


class Lease(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('terminated', 'Terminated'),
        ('expired', 'Expired'),
    ]

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='leases')
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='leases')
    start_date = models.DateField()
    end_date = models.DateField()
    monthly_rent = models.DecimalField(max_digits=10, decimal_places=2)
    rent_due_day = models.IntegerField(default=1, help_text='Day of month rent is due (1-28)')
    deposit = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Lease: {self.tenant.full_name} → {self.property.name}"