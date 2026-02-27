from django.db import models

# Create your models here.
from django.db import models
from properties.models import Property
from leases.models import Lease


class RentPayment(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('overdue', 'Overdue'),
    ]
    METHOD_CHOICES = [
        ('bank', 'Bank Transfer'),
        ('cash', 'Cash'),
        ('revolut', 'Revolut'),
    ]

    lease = models.ForeignKey(Lease, on_delete=models.CASCADE, related_name='rent_payments')
    due_date = models.DateField()
    amount_due = models.DecimalField(max_digits=10, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payment_date = models.DateField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Rent {self.due_date} — {self.lease.tenant.full_name} ({self.status})"


class Expense(models.Model):
    CATEGORY_CHOICES = [
        ('mortgage', 'Mortgage'),
        ('electricity', 'Electricity'),
        ('water', 'Water'),
        ('internet', 'Internet'),
        ('insurance', 'Insurance'),
        ('maintenance', 'Maintenance'),
        ('tax', 'Tax'),
    ]
    RECURRENCE_CHOICES = [
        ('monthly', 'Monthly'),
        ('yearly', 'Yearly'),
    ]

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='expenses')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    description = models.CharField(max_length=255, blank=True, null=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    due_date = models.DateField(blank=True, null=True)
    paid_date = models.DateField(blank=True, null=True)
    recurring = models.BooleanField(default=False)
    recurrence_frequency = models.CharField(max_length=20, choices=RECURRENCE_CHOICES, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.category} — {self.property.name} ({self.amount})"