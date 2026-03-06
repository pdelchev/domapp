from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model — the property manager.
    Extends Django's built-in user with phone number and role.
    """
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('manager', 'Manager'),
        ('viewer', 'Viewer'),
    ]

    phone = models.CharField(max_length=20, blank=True, null=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='manager')
    data_owner = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='delegates',
        help_text='If set, this user sees and manages data belonging to the data_owner user.',
    )

    def get_data_owner(self):
        """Return the user whose data this user manages (self if no delegation)."""
        return self.data_owner or self

    def __str__(self):
        return self.email or self.username