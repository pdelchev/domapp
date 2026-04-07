from django.db import models
from django.conf import settings


class Measurement(models.Model):
    """Daily health measurements — blood pressure, weight, uric acid, glucose, etc."""
    TYPE_CHOICES = [
        ('blood_pressure', 'Blood Pressure'),
        ('weight', 'Weight'),
        ('glucose', 'Glucose'),
        ('uric_acid', 'Uric Acid'),
        ('heart_rate', 'Heart Rate'),
        ('temperature', 'Temperature'),
        ('oxygen', 'Blood Oxygen'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='measurements')
    measurement_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    value = models.DecimalField(max_digits=8, decimal_places=2)
    value2 = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True,
                                  help_text='Secondary value (e.g. diastolic for blood pressure)')
    unit = models.CharField(max_length=20, default='')
    measured_at = models.DateTimeField()
    notes = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-measured_at']
        indexes = [
            models.Index(fields=['user', 'measurement_type', '-measured_at']),
        ]

    def __str__(self):
        return f"{self.get_measurement_type_display()} {self.value} {self.unit}"


class FoodEntry(models.Model):
    """Food intake log for calorie/macro tracking."""
    MEAL_CHOICES = [
        ('breakfast', 'Breakfast'),
        ('lunch', 'Lunch'),
        ('dinner', 'Dinner'),
        ('snack', 'Snack'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='food_entries')
    name = models.CharField(max_length=255)
    meal_type = models.CharField(max_length=20, choices=MEAL_CHOICES, default='snack')
    calories = models.PositiveIntegerField(default=0)
    protein = models.DecimalField(max_digits=6, decimal_places=1, default=0)
    carbs = models.DecimalField(max_digits=6, decimal_places=1, default=0)
    fat = models.DecimalField(max_digits=6, decimal_places=1, default=0)
    fiber = models.DecimalField(max_digits=6, decimal_places=1, default=0)
    serving_size = models.CharField(max_length=50, blank=True, default='')
    eaten_at = models.DateTimeField()
    notes = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-eaten_at']
        indexes = [
            models.Index(fields=['user', '-eaten_at']),
        ]

    def __str__(self):
        return f"{self.name} ({self.calories} kcal)"


class DailyRitual(models.Model):
    """Daily ritual checklist items — water, supplements, exercise, sleep, etc."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='daily_rituals')
    date = models.DateField()
    water_liters = models.DecimalField(max_digits=4, decimal_places=1, default=0)
    sleep_hours = models.DecimalField(max_digits=4, decimal_places=1, default=0)
    exercise_minutes = models.PositiveIntegerField(default=0)
    exercise_type = models.CharField(max_length=100, blank=True, default='')
    supplements_taken = models.BooleanField(default=False)
    no_alcohol = models.BooleanField(default=True)
    no_sugar = models.BooleanField(default=True)
    meditation_minutes = models.PositiveIntegerField(default=0)
    steps = models.PositiveIntegerField(default=0)
    mood = models.PositiveSmallIntegerField(default=3, help_text='1-5 scale')
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']
        unique_together = ['user', 'date']
        indexes = [
            models.Index(fields=['user', '-date']),
        ]

    def __str__(self):
        return f"Ritual {self.date}"
