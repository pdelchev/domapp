from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model — the property manager.
    Extends Django's built-in user with phone number.
    """
    phone = models.CharField(max_length=20, blank=True, null=True)

    def __str__(self):
        return self.email or self.username