from django.db import models

# Create your models here.
from django.db import models
from properties.models import Property


class Tenant(models.Model):
    """
    A person renting a property.
    """
    property = models.ForeignKey(
        Property,
        on_delete=models.CASCADE,
        related_name='tenants'
    )
    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    id_number = models.CharField(max_length=50, blank=True, null=True)
    start_date = models.DateField()
    end_date = models.DateField(blank=True, null=True)
    deposit_amount = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    deposit_held = models.BooleanField(default=True, help_text='Is the deposit still held?')
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.full_name} — {self.property.name}"