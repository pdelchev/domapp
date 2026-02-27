from django.db import models

# Create your models here.
from django.db import models
from properties.models import Property


class Document(models.Model):
    DOCUMENT_TYPES = [
        ('insurance', 'Insurance'),
        ('mortgage', 'Mortgage'),
        ('lease', 'Lease'),
        ('tax', 'Tax'),
    ]

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='documents')
    file = models.FileField(upload_to='documents/')
    document_type = models.CharField(max_length=20, choices=DOCUMENT_TYPES)
    expiry_date = models.DateField(blank=True, null=True)
    reminder_30_days = models.BooleanField(default=False, help_text='Has 30-day reminder been sent?')
    reminder_5_days = models.BooleanField(default=False, help_text='Has 5-day reminder been sent?')
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.document_type} — {self.property.name}"