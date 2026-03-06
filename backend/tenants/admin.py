from django.contrib import admin
from .models import Tenant


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'phone', 'email', 'id_number')
    search_fields = ('full_name', 'email', 'phone')
