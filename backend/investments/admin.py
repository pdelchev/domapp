from django.contrib import admin
from .models import Investment


@admin.register(Investment)
class InvestmentAdmin(admin.ModelAdmin):
    list_display = ['title', 'property', 'investment_type', 'status', 'amount_invested', 'investment_date']
    list_filter = ['status', 'investment_type']
    search_fields = ['title', 'description']
