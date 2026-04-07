from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Measurement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('measurement_type', models.CharField(choices=[('blood_pressure', 'Blood Pressure'), ('weight', 'Weight'), ('glucose', 'Glucose'), ('uric_acid', 'Uric Acid'), ('heart_rate', 'Heart Rate'), ('temperature', 'Temperature'), ('oxygen', 'Blood Oxygen')], max_length=20)),
                ('value', models.DecimalField(decimal_places=2, max_digits=8)),
                ('value2', models.DecimalField(blank=True, decimal_places=2, help_text='Secondary value (e.g. diastolic for blood pressure)', max_digits=8, null=True)),
                ('unit', models.CharField(default='', max_length=20)),
                ('measured_at', models.DateTimeField()),
                ('notes', models.CharField(blank=True, default='', max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='measurements', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-measured_at'],
                'indexes': [models.Index(fields=['user', 'measurement_type', '-measured_at'], name='health_meas_user_type_idx')],
            },
        ),
        migrations.CreateModel(
            name='FoodEntry',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('meal_type', models.CharField(choices=[('breakfast', 'Breakfast'), ('lunch', 'Lunch'), ('dinner', 'Dinner'), ('snack', 'Snack')], default='snack', max_length=20)),
                ('calories', models.PositiveIntegerField(default=0)),
                ('protein', models.DecimalField(decimal_places=1, default=0, max_digits=6)),
                ('carbs', models.DecimalField(decimal_places=1, default=0, max_digits=6)),
                ('fat', models.DecimalField(decimal_places=1, default=0, max_digits=6)),
                ('fiber', models.DecimalField(decimal_places=1, default=0, max_digits=6)),
                ('serving_size', models.CharField(blank=True, default='', max_length=50)),
                ('eaten_at', models.DateTimeField()),
                ('notes', models.CharField(blank=True, default='', max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='food_entries', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-eaten_at'],
                'indexes': [models.Index(fields=['user', '-eaten_at'], name='health_food_user_eaten_idx')],
            },
        ),
        migrations.CreateModel(
            name='DailyRitual',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('water_liters', models.DecimalField(decimal_places=1, default=0, max_digits=4)),
                ('sleep_hours', models.DecimalField(decimal_places=1, default=0, max_digits=4)),
                ('exercise_minutes', models.PositiveIntegerField(default=0)),
                ('exercise_type', models.CharField(blank=True, default='', max_length=100)),
                ('supplements_taken', models.BooleanField(default=False)),
                ('no_alcohol', models.BooleanField(default=True)),
                ('no_sugar', models.BooleanField(default=True)),
                ('meditation_minutes', models.PositiveIntegerField(default=0)),
                ('steps', models.PositiveIntegerField(default=0)),
                ('mood', models.PositiveSmallIntegerField(default=3, help_text='1-5 scale')),
                ('notes', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='daily_rituals', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-date'],
                'unique_together': {('user', 'date')},
                'indexes': [models.Index(fields=['user', '-date'], name='health_ritual_user_date_idx')],
            },
        ),
    ]
