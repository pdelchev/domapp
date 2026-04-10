"""
Periodic health check for lease payment generation.

Usage:
  python manage.py check_lease_health

Verifies:
  - All weekly/biweekly leases have auto_generate_payments=True
  - All weekly/biweekly leases have upcoming payments (next 30 days)
  - Alerts if issues found
"""

from django.core.management.base import BaseCommand
from leases.health_check import check_lease_health


class Command(BaseCommand):
    help = 'Health check: verify weekly/biweekly lease payments are being generated'

    def handle(self, *args, **options):
        result = check_lease_health()

        if result['status'] == 'healthy':
            self.stdout.write(
                self.style.SUCCESS('✅ All lease payments healthy!')
            )
            self.stdout.write(f"\nActive weekly leases: {result['weekly_leases_active']}")
            self.stdout.write(f"Active biweekly leases: {result['biweekly_leases_active']}")
        else:
            self.stdout.write(
                self.style.ERROR('⚠️  Issues found with lease payments:')
            )
            self.stdout.write(f"\nActive weekly leases: {result['weekly_leases_active']}")
            self.stdout.write(f"Active biweekly leases: {result['biweekly_leases_active']}")
            self.stdout.write(f"\n{len(result['issues'])} issue(s):\n")

            for issue in result['issues']:
                self.stdout.write(
                    self.style.WARNING(f"  ⚠️  {issue['message']}")
                )
                if issue['type'] == 'missing_payments':
                    self.stdout.write(
                        f"     → Run: python manage.py fix_weekly_payments --fix\n"
                    )
