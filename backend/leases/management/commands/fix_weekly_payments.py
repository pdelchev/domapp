"""
Management command to diagnose and fix missing weekly lease payments.

Usage:
  python manage.py fix_weekly_payments --diagnose   # Show issue
  python manage.py fix_weekly_payments --fix         # Enable auto-gen + trigger
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import date, timedelta

from leases.models import Lease
from finance.models import RentPayment
from leases.services import generate_payments_for_lease


class Command(BaseCommand):
    help = 'Diagnose and fix missing weekly lease payment generation'

    def add_arguments(self, parser):
        parser.add_argument(
            '--diagnose',
            action='store_true',
            help='Show diagnostic info about weekly leases',
        )
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Enable auto-generation and trigger payment creation',
        )

    def handle(self, *args, **options):
        if options['diagnose']:
            self.diagnose()
        elif options['fix']:
            self.fix()
        else:
            self.stdout.write('Usage: manage.py fix_weekly_payments --diagnose OR --fix')

    def diagnose(self):
        """Show diagnostic info about weekly leases."""
        self.stdout.write(self.style.SUCCESS('\n=== WEEKLY LEASE DIAGNOSTIC ===\n'))

        weekly_leases = Lease.objects.filter(rent_frequency='weekly', status='active')
        self.stdout.write(f'Active weekly leases: {weekly_leases.count()}\n')

        if not weekly_leases.exists():
            self.stdout.write(self.style.WARNING('No active weekly leases found.'))
            return

        today = date.today()

        for lease in weekly_leases:
            self.stdout.write(f'\n✓ {lease.tenant.full_name} @ {lease.property.name}')
            self.stdout.write(f'  Amount: €{lease.monthly_rent}/week')
            self.stdout.write(f'  Dates: {lease.start_date} → {lease.end_date}')
            self.stdout.write(f'  auto_generate_payments: {lease.auto_generate_payments}')
            self.stdout.write(f'  next_payment_date: {lease.next_payment_date}')

            # Total payments
            all_payments = RentPayment.objects.filter(lease=lease)
            self.stdout.write(f'  Total payments in DB: {all_payments.count()}')

            # Upcoming payments (next 30 days)
            upcoming = RentPayment.objects.filter(
                lease=lease,
                status='pending',
                due_date__gt=today,
                due_date__lte=today + timedelta(days=30)
            )
            self.stdout.write(f'  Upcoming (next 30d): {upcoming.count()}')

            if upcoming.count() == 0:
                self.stdout.write(
                    self.style.WARNING(f'  ⚠️  NO UPCOMING PAYMENTS - This is the bug!'),
                )

            # Show next 3 due dates if they exist
            recent = all_payments.order_by('-due_date')[:3]
            if recent.exists():
                self.stdout.write(f'  Last 3 payments:')
                for p in recent:
                    status_icon = '✓' if p.status == 'paid' else '○'
                    self.stdout.write(
                        f'    {status_icon} Due {p.due_date}: €{p.amount_due} ({p.status})'
                    )

    def fix(self):
        """Enable auto-generation and trigger payment creation."""
        self.stdout.write(self.style.SUCCESS('\n=== FIXING WEEKLY PAYMENT GENERATION ===\n'))

        weekly_leases = Lease.objects.filter(rent_frequency='weekly', status='active')
        self.stdout.write(f'Processing {weekly_leases.count()} active weekly leases...\n')

        total_created = 0

        for lease in weekly_leases:
            # Ensure auto-generation is enabled
            if not lease.auto_generate_payments:
                lease.auto_generate_payments = True
                lease.save()
                self.stdout.write(f'  ✓ Enabled auto-generation for {lease.tenant.full_name}')

            # Trigger payment generation
            count = generate_payments_for_lease(lease)
            total_created += count

            if count > 0:
                self.stdout.write(
                    self.style.SUCCESS(f'  ✓ {lease.tenant.full_name}: Generated {count} payments')
                )
            else:
                self.stdout.write(f'  • {lease.tenant.full_name}: No new payments (up-to-date)')

        self.stdout.write(
            self.style.SUCCESS(f'\n✅ Complete! Created {total_created} new payment records.')
        )
