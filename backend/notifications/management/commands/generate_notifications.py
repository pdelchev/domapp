"""Generate sample notifications for testing."""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from accounts.models import User
from properties.models import Property
from notifications.models import Notification


class Command(BaseCommand):
    help = 'Generate sample notifications for the first superuser'

    def handle(self, *args, **options):
        user = User.objects.filter(is_superuser=True).first()
        if not user:
            self.stderr.write('No superuser found')
            return

        props = list(Property.objects.filter(user=user)[:3])
        prop = props[0] if props else None
        now = timezone.now()

        samples = [
            {
                'type': 'overdue',
                'title': 'Overdue: Ivan Petrov',
                'message': 'Payment of 850.00 EUR for Downtown Apartment was due on 2026-03-01.',
                'related_property': prop,
                'created_at': now - timedelta(hours=2),
            },
            {
                'type': 'rent_due',
                'title': 'Rent due: Maria Ivanova',
                'message': 'Payment of 650.00 EUR for Villa Boyana is due on 2026-03-10.',
                'related_property': props[1] if len(props) > 1 else prop,
                'created_at': now - timedelta(hours=5),
            },
            {
                'type': 'lease_expiry',
                'title': 'Lease expiring: Ivan Petrov',
                'message': 'Lease for Downtown Apartment expires on 2026-04-01.',
                'related_property': prop,
                'created_at': now - timedelta(days=1),
            },
            {
                'type': 'document_expiry',
                'title': 'Document expiring: Insurance',
                'message': 'Insurance for Downtown Apartment expires on 2026-04-15.',
                'related_property': prop,
                'created_at': now - timedelta(days=2),
            },
            {
                'type': 'payment_received',
                'title': 'Payment received: Georgi Dimitrov',
                'message': '500.00 EUR received for Studio Center.',
                'related_property': props[2] if len(props) > 2 else prop,
                'created_at': now - timedelta(days=3),
            },
            {
                'type': 'overdue',
                'title': 'Overdue: Stefan Nikolov',
                'message': 'Payment of 1200.00 EUR for Office Space was due on 2026-02-25.',
                'related_property': prop,
                'created_at': now - timedelta(days=5),
            },
            {
                'type': 'info',
                'title': 'Welcome to DomApp',
                'message': 'Your property management dashboard is ready. Start by adding properties and tenants.',
                'related_property': None,
                'created_at': now - timedelta(days=7),
                'read_status': True,
            },
        ]

        created = 0
        for s in samples:
            read_status = s.pop('read_status', False)
            created_at = s.pop('created_at')
            notif = Notification.objects.create(user=user, read_status=read_status, **s)
            # Override auto_now_add
            Notification.objects.filter(pk=notif.pk).update(created_at=created_at)
            created += 1

        self.stdout.write(self.style.SUCCESS(f'Created {created} sample notifications'))
