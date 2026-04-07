from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_user_data_owner'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='allowed_modules',
            field=models.JSONField(blank=True, default=list, help_text='List of module keys this user can access. Empty = all modules.'),
        ),
        migrations.AddField(
            model_name='user',
            name='own_health_data',
            field=models.BooleanField(default=True, help_text='If true, health data (measurements, food, rituals) is private to this user.'),
        ),
        migrations.AddField(
            model_name='user',
            name='avatar_color',
            field=models.CharField(default='indigo', help_text='Color for avatar circle in UI', max_length=20),
        ),
    ]
