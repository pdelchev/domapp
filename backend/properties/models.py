from django.db import models
from django.conf import settings


class PropertyOwner(models.Model):
    """
    The person who owns the property.
    The manager (User) creates these records for each client.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='owners',
        help_text='The manager who manages this owner'
    )
    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    id_number = models.CharField(max_length=50, blank=True, null=True, help_text='National ID or passport')
    address = models.TextField(blank=True, null=True)
    bank_name = models.CharField(max_length=255, blank=True, null=True)
    bank_iban = models.CharField(max_length=50, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.full_name


class Property(models.Model):
    """
    A property managed by the user on behalf of an owner.
    """
    PROPERTY_TYPES = [
        ('apartment', 'Apartment'),
        ('house', 'House'),
        ('studio', 'Studio'),
        ('commercial', 'Commercial'),
        ('parking', 'Parking'),
        ('garage', 'Garage'),
        ('storage', 'Storage'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='properties',
        help_text='The manager'
    )
    owner = models.ForeignKey(
        PropertyOwner,
        on_delete=models.CASCADE,
        related_name='properties',
        help_text='The property owner'
    )
    name = models.CharField(max_length=255, help_text='Friendly name, e.g. "Sofia Central Apt"')
    address = models.TextField()
    city = models.CharField(max_length=100)
    country = models.CharField(max_length=100, default='Bulgaria')
    property_type = models.CharField(max_length=20, choices=PROPERTY_TYPES, default='apartment')

    # --- Parent link (for auxiliary properties like parking, garage, storage) ---
    parent_property = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='linked_properties',
        help_text='Parent property this is linked to (e.g. apartment for a parking spot)'
    )

    # --- Land Registry & Acquisition ---
    cadastral_number = models.CharField(max_length=100, blank=True, null=True, help_text='Кадастрален номер')
    square_meters = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    purchase_date = models.DateField(blank=True, null=True)
    current_value = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)

    @property
    def price_per_sqm(self):
        """Auto-calculated: purchase_price / square_meters"""
        if self.purchase_price and self.square_meters and self.square_meters > 0:
            return round(self.purchase_price / self.square_meters, 2)
        return None

    # --- Mortgage ---
    mortgage_provider = models.CharField(max_length=255, blank=True, null=True)
    mortgage_account_number = models.CharField(max_length=100, blank=True, null=True)
    mortgage_monthly_payment = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)

    # --- Electricity ---
    electricity_provider = models.CharField(max_length=255, blank=True, null=True)
    electricity_account_number = models.CharField(max_length=100, blank=True, null=True)

    # --- Water ---
    water_provider = models.CharField(max_length=255, blank=True, null=True)
    water_account_number = models.CharField(max_length=100, blank=True, null=True)

    # --- Gas ---
    gas_provider = models.CharField(max_length=255, blank=True, null=True)
    gas_account_number = models.CharField(max_length=100, blank=True, null=True)

    # --- Heating (Топлофикация) ---
    heating_provider = models.CharField(max_length=255, blank=True, null=True)
    heating_account_number = models.CharField(max_length=100, blank=True, null=True)

    # --- Internet ---
    internet_provider = models.CharField(max_length=255, blank=True, null=True)
    internet_account_number = models.CharField(max_length=100, blank=True, null=True)

    # --- Insurance ---
    insurance_provider = models.CharField(max_length=255, blank=True, null=True)
    insurance_policy_number = models.CharField(max_length=100, blank=True, null=True)
    annual_insurance_cost = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)

    # --- Building Management / HOA ---
    building_management_provider = models.CharField(max_length=255, blank=True, null=True)
    building_management_account_number = models.CharField(max_length=100, blank=True, null=True)
    building_management_monthly_fee = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)

    # --- Security / Alarm ---
    security_provider = models.CharField(max_length=255, blank=True, null=True)
    security_account_number = models.CharField(max_length=100, blank=True, null=True)

    # --- Access ---
    front_door_code = models.CharField(max_length=50, blank=True, null=True, help_text='Front door access code')
    lock_box_code = models.CharField(max_length=50, blank=True, null=True, help_text='Lock box access code')

    # --- Notes ---
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = 'Properties'

    def __str__(self):
        return f"{self.name} ({self.city})"


class Unit(models.Model):
    """
    Optional — for multi-unit buildings.
    A property can have multiple units (e.g. a building with 5 apartments).
    """
    property = models.ForeignKey(
        Property,
        on_delete=models.CASCADE,
        related_name='units'
    )
    unit_number = models.CharField(max_length=20)
    floor = models.IntegerField(blank=True, null=True)
    square_meters = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Unit {self.unit_number} — {self.property.name}"