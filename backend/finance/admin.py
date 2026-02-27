from django.contrib import admin
from .models import RentPayment, Expense


@admin.register(RentPayment)
class RentPaymentAdmin(admin.ModelAdmin):
    list_display = ('lease', 'due_date', 'amount_due', 'amount_paid', 'status', 'method')
    list_filter = ('status', 'method')
    search_fields = ('lease__tenant__full_name',)


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ('property', 'category', 'amount', 'due_date', 'paid_date', 'recurring')
    list_filter = ('category', 'recurring')
    search_fields = ('property__name', 'description')