from django.contrib import admin
from .models import Problem


@admin.register(Problem)
class ProblemAdmin(admin.ModelAdmin):
    list_display = ('title', 'property', 'category', 'priority', 'status', 'created_at')
    list_filter = ('status', 'priority', 'category')
    search_fields = ('title', 'description')
