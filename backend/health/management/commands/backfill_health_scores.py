"""
Backfill HealthScoreSnapshot rows for the last N days per profile.

Usage:
    python manage.py backfill_health_scores                 # default 90 days, all users
    python manage.py backfill_health_scores --days 180
    python manage.py backfill_health_scores --user petko
    python manage.py backfill_health_scores --user 1 --days 30

Idempotent — uses update_or_create, so re-running is safe.
"""

from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model

from health.models import HealthProfile
from health.life_services import compute_health_score


class Command(BaseCommand):
    help = 'Compute HealthScoreSnapshot rows for the last N days per profile.'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=90, help='How many days back to backfill (default 90).')
        parser.add_argument('--user', type=str, default=None, help='Limit to this user (username or id).')

    def handle(self, *args, **opts):
        User = get_user_model()
        days = opts['days']
        user_filter = opts.get('user')

        profiles = HealthProfile.objects.select_related('user').all()
        if user_filter:
            if user_filter.isdigit():
                profiles = profiles.filter(user_id=int(user_filter))
            else:
                profiles = profiles.filter(user__username=user_filter)

        total_profiles = profiles.count()
        if not total_profiles:
            self.stdout.write(self.style.WARNING('No matching profiles found.'))
            return

        today = timezone.localdate()
        dates = [today - timedelta(days=n) for n in range(days, -1, -1)]  # oldest → today

        written = 0
        for profile in profiles:
            self.stdout.write(f'Backfilling {profile.full_name} (user={profile.user.username}) — {len(dates)} days…')
            for d in dates:
                result = compute_health_score(profile.user, profile, date=d, save=True)
                if result['composite_score'] is not None:
                    written += 1

        self.stdout.write(self.style.SUCCESS(
            f'Done. Wrote/updated {written} snapshots across {total_profiles} profile(s).'
        ))
