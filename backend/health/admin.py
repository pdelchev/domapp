from django.contrib import admin
from .models import Measurement, FoodEntry, DailyRitual

@admin.register(Measurement)
class MeasurementAdmin(admin.ModelAdmin):
    list_display = ['measurement_type', 'value', 'unit', 'measured_at']
    list_filter = ['measurement_type']

@admin.register(FoodEntry)
class FoodEntryAdmin(admin.ModelAdmin):
    list_display = ['name', 'meal_type', 'calories', 'eaten_at']
    list_filter = ['meal_type']

@admin.register(DailyRitual)
class DailyRitualAdmin(admin.ModelAdmin):
    list_display = ['date', 'water_liters', 'sleep_hours', 'exercise_minutes', 'supplements_taken']
