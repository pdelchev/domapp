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

    # Per-object permissions — JSON lists of IDs
    # Empty list = all objects (if module access granted). None = not set yet.
    allowed_property_ids = models.JSONField(
        default=list, blank=True,
        help_text='List of property IDs this user can access. Empty = all properties.',
    )
    allowed_vehicle_ids = models.JSONField(
        default=list, blank=True,
        help_text='List of vehicle IDs this user can access. Empty = all vehicles.',
    )
    allowed_tenant_ids = models.JSONField(
        default=list, blank=True,
        help_text='List of tenant IDs this user can access. Empty = all tenants.',
    )
    allowed_lease_ids = models.JSONField(
        default=list, blank=True,
        help_text='List of lease IDs this user can access. Empty = all leases.',
    )

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

    def has_object_access(self, object_type: str, object_id: int) -> bool:
        """Check if user can access a specific object (property, vehicle, etc.)."""
        if self.role == 'admin':
            return True

        # Map object types to permission fields
        perms_map = {
            'property': self.allowed_property_ids,
            'vehicle': self.allowed_vehicle_ids,
            'tenant': self.allowed_tenant_ids,
            'lease': self.allowed_lease_ids,
        }

        allowed_ids = perms_map.get(object_type, [])
        if not allowed_ids:  # Empty = all objects (backwards compat)
            return True
        return object_id in allowed_ids

    def __str__(self):
        return self.email or self.username