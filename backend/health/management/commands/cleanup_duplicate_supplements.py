from django.core.management.base import BaseCommand
from health.daily_models import Supplement
from django.db.models import Count


class Command(BaseCommand):
    help = 'Remove duplicate supplements, keeping only one of each per user'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be deleted without actually deleting',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        # Find duplicates: supplements with same name for the same user
        duplicates_by_user = {}

        for supplement in Supplement.objects.all():
            key = (supplement.user_id, supplement.name)
            if key not in duplicates_by_user:
                duplicates_by_user[key] = []
            duplicates_by_user[key].append(supplement)

        total_deleted = 0
        total_duplicates = 0

        for (user_id, name), supplements in duplicates_by_user.items():
            if len(supplements) > 1:
                total_duplicates += len(supplements) - 1
                # Keep the first one, delete the rest
                to_delete = supplements[1:]

                self.stdout.write(
                    self.style.WARNING(
                        f'\n{name} (User {user_id}): {len(supplements)} copies found'
                    )
                )

                for supp in to_delete:
                    self.stdout.write(f'  - Deleting ID {supp.id}')
                    if not dry_run:
                        supp.delete()
                    total_deleted += 1

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'\n[DRY RUN] Would delete {total_deleted} duplicate supplement records'
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'\n✓ Deleted {total_deleted} duplicate supplement records'
                )
            )

        # Show final count
        remaining = Supplement.objects.count()
        self.stdout.write(
            self.style.SUCCESS(
                f'✓ Total supplements remaining: {remaining}'
            )
        )
