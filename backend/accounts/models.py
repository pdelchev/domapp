from django.contrib.auth.models import AbstractUser
from django.db import models

# All available modules — used for permission checking
ALL_MODULES = ['health', 'properties', 'finance', 'music', 'dashboard', 'notifications']


class User(AbstractUser):
    """
    Custom user model — the property manager.
    Extends Django's built-in user with phone number, role, and module permissions.

    Health data isolation: each user has their own health data (measurements, food, rituals)
    stored under their own user FK, regardless of data_owner setting.
    Property/finance data uses data_owner for shared access.
    """
    ROLE_CHOICES = [
        ('admin', 'Admin'),        # Full access to everything, can manage sub-accounts
        ('manager', 'Manager'),    # Access to assigned modules
        ('viewer', 'Viewer'),      # Read-only access to assigned modules
    ]

    phone = models.CharField(max_length=20, blank=True, null=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='manager')
    data_owner = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='delegates',
        help_text='If set, this user sees and manages data belonging to the data_owner user.',
    )
    # Module-level permissions — JSON list of allowed module keys
    # Admin role ignores this (has all). Empty list = all modules for backwards compat.
    allowed_modules = models.JSONField(
        default=list, blank=True,
        help_text='List of module keys this user can access. Empty = all modules.',
    )
    # Whether this user has their own separate health data (always true for new accounts)
    own_health_data = models.BooleanField(
        default=True,
        help_text='If true, health data (measurements, food, rituals) is private to this user.',
    )
    avatar_color = models.CharField(max_length=20, default='indigo',
        help_text='Color for avatar circle in UI')

    def get_data_owner(self):
        """Return the user whose data this user manages (self if no delegation)."""
        return self.data_owner or self

    def get_health_owner(self):
        """Health data is always per-user (never shared via data_owner)."""
        return self

    def has_module_access(self, module_key: str) -> bool:
        """Check if user can access a specific module."""
        if self.role == 'admin':
            return True
        if not self.allowed_modules:
            return True  # backwards compat — empty = all
        return module_key in self.allowed_modules

    def get_allowed_modules(self):
        """Return list of accessible module keys."""
        if self.role == 'admin' or not self.allowed_modules:
            return ALL_MODULES
        return self.allowed_modules

    def __str__(self):
        return self.email or self.username