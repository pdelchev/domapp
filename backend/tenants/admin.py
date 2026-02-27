from django.contrib import admin
from .models import Tenant


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'property', 'phone', 'start_date', 'end_date', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('full_name', 'email', 'phone', 'property__name')