from django.contrib import admin
from .models import Vehicle, VehicleObligation, ObligationFile, VehicleReminder


class VehicleObligationInline(admin.TabularInline):
    model = VehicleObligation
    extra = 0
    fields = ('obligation_type', 'custom_type_name', 'start_date', 'end_date', 'cost', 'provider', 'is_current')


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ('plate_number', 'make', 'model', 'year', 'user', 'is_active')
    list_filter = ('is_active', 'fuel_type')
    search_fields = ('plate_number', 'make', 'model', 'vin')
    inlines = [VehicleObligationInline]


@admin.register(VehicleObligation)
class VehicleObligationAdmin(admin.ModelAdmin):
    list_display = ('vehicle', 'obligation_type', 'start_date', 'end_date', 'cost', 'is_current')
    list_filter = ('obligation_type', 'is_current')
    search_fields = ('vehicle__plate_number', 'provider', 'policy_number')


@admin.register(ObligationFile)
class ObligationFileAdmin(admin.ModelAdmin):
    list_display = ('label', 'obligation', 'file_size', 'uploaded_at')


@admin.register(VehicleReminder)
class VehicleReminderAdmin(admin.ModelAdmin):
    list_display = ('obligation', 'remind_at', 'sent', 'sent_at')
    list_filter = ('sent',)
