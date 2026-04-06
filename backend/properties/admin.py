from django.contrib import admin
from .models import PropertyOwner, Property, Unit
from .tax_models import PropertyTax, TaxReminder


@admin.register(PropertyOwner)
class PropertyOwnerAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'phone', 'email', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('full_name', 'email', 'phone')


@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'city', 'property_type', 'parent_property', 'purchase_price', 'created_at')
    list_filter = ('property_type', 'city')
    search_fields = ('name', 'address', 'city', 'owner__full_name')
    raw_id_fields = ('parent_property',)


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ('unit_number', 'property', 'floor', 'square_meters')
    search_fields = ('unit_number', 'property__name')


@admin.register(PropertyTax)
class PropertyTaxAdmin(admin.ModelAdmin):
    list_display = ('property', 'tax_type', 'amount', 'frequency', 'due_date', 'is_paid', 'is_current')
    list_filter = ('tax_type', 'frequency', 'is_paid', 'is_current')
    search_fields = ('property__name',)


@admin.register(TaxReminder)
class TaxReminderAdmin(admin.ModelAdmin):
    list_display = ('tax', 'remind_at', 'sent', 'sent_at')
    list_filter = ('sent',)