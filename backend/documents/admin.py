from django.contrib import admin

# Register your models here.
from django.contrib import admin
from .models import Document


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ('property', 'document_type', 'expiry_date', 'reminder_30_days', 'reminder_5_days')
    list_filter = ('document_type',)
    search_fields = ('property__name',)