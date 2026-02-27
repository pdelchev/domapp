from django.contrib import admin
from .models import Lease


@admin.register(Lease)
class LeaseAdmin(admin.ModelAdmin):
    list_display = ('tenant', 'property', 'monthly_rent', 'start_date', 'end_date', 'status')
    list_filter = ('status',)
    search_fields = ('tenant__full_name', 'property__name')