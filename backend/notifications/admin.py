from django.contrib import admin

# Register your models here.
from django.contrib import admin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'type', 'read_status', 'created_at')
    list_filter = ('type', 'read_status')
    search_fields = ('message',)