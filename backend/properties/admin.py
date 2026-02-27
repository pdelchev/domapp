from django.contrib import admin
from .models import PropertyOwner, Property, Unit


@admin.register(PropertyOwner)
class PropertyOwnerAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'phone', 'email', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('full_name', 'email', 'phone')


@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'city', 'property_type', 'purchase_price', 'created_at')
    list_filter = ('property_type', 'city')
    search_fields = ('name', 'address', 'city', 'owner__full_name')


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ('unit_number', 'property', 'floor', 'square_meters')
    search_fields = ('unit_number', 'property__name')