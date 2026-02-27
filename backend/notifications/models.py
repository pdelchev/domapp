from django.db import models

# Create your models here.
from django.db import models
from django.conf import settings


class Notification(models.Model):
    TYPE_CHOICES = [
        ('rent_due', 'Rent Due'),
        ('overdue', 'Overdue'),
        ('document_expiry', 'Document Expiry'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    related_object_id = models.IntegerField(blank=True, null=True)
    message = models.TextField()
    read_status = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.type} — {'Read' if self.read_status else 'Unread'}"