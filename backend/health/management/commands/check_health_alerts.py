"""
Management command to check all health alerts for all users.
Run daily via cron or Celery beat.

Usage: python manage.py check_health_alerts
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Check health data and create smart notifications for all users'

    def handle(self, *args, **options):
        from health.health_notifications import check_all_health_alerts

        users = User.objects.filter(is_active=True)
        count = 0
        for user in users:
            try:
                check_all_health_alerts(user)
                count += 1
            except Exception as e:
                self.stderr.write(f'Error for user {user.username}: {e}')

        self.stdout.write(self.style.SUCCESS(f'Checked health alerts for {count} users'))
