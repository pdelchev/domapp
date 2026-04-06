from django.db import models
from django.conf import settings


class Notification(models.Model):
    TYPE_CHOICES = [
        ('rent_due', 'Rent Due'),
        ('overdue', 'Overdue'),
        ('lease_expiry', 'Lease Expiry'),
        ('document_expiry', 'Document Expiry'),
        ('payment_received', 'Payment Received'),
        ('info', 'Info'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    title = models.CharField(max_length=200, default='')
    message = models.TextField()
    related_object_id = models.IntegerField(blank=True, null=True)
    related_property = models.ForeignKey(
        'properties.Property', on_delete=models.SET_NULL, null=True, blank=True, related_name='notifications'
    )
    read_status = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.type} — {'Read' if self.read_status else 'Unread'}"