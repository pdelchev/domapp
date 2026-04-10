"""
Health check for lease payment generation.

Monitors that weekly/biweekly leases have upcoming payments.
Called by monitoring system or as diagnostic tool.
"""

from datetime import date, timedelta
from django.db.models import Count, Q

from leases.models import Lease
from finance.models import RentPayment


def check_lease_health():
    """
    Verify all active recurring leases have upcoming payments.
    Returns dict with status and any issues found.
    """
    today = date.today()
    look_ahead = today + timedelta(days=30)

    issues = []

    # Check weekly leases
    weekly_leases = Lease.objects.filter(
        rent_frequency='weekly',
        status='active',
        auto_generate_payments=True
    )

    for lease in weekly_leases:
        upcoming = RentPayment.objects.filter(
            lease=lease,
            status='pending',
            due_date__gt=today,
            due_date__lte=look_ahead
        ).exists()

        if not upcoming:
            issues.append({
                'type': 'missing_payments',
                'frequency': 'weekly',
                'tenant': lease.tenant.full_name,
                'property': lease.property.name,
                'lease_id': lease.id,
                'message': f'No upcoming payments for {lease.tenant.full_name} (weekly) in next 30 days',
            })

    # Check biweekly leases
    biweekly_leases = Lease.objects.filter(
        rent_frequency='biweekly',
        status='active',
        auto_generate_payments=True
    )

    for lease in biweekly_leases:
        upcoming = RentPayment.objects.filter(
            lease=lease,
            status='pending',
            due_date__gt=today,
            due_date__lte=look_ahead + timedelta(days=7)
        ).exists()

        if not upcoming:
            issues.append({
                'type': 'missing_payments',
                'frequency': 'biweekly',
                'tenant': lease.tenant.full_name,
                'property': lease.property.name,
                'lease_id': lease.id,
                'message': f'No upcoming payments for {lease.tenant.full_name} (biweekly) in next 30 days',
            })

    # Check for disabled auto-generation on recurring leases (shouldn't happen now with save() safeguard)
    bad_leases = Lease.objects.filter(
        Q(rent_frequency='weekly') | Q(rent_frequency='biweekly'),
        status='active',
        auto_generate_payments=False
    )

    for lease in bad_leases:
        issues.append({
            'type': 'auto_generation_disabled',
            'frequency': lease.rent_frequency,
            'tenant': lease.tenant.full_name,
            'property': lease.property.name,
            'lease_id': lease.id,
            'message': f'auto_generate_payments is FALSE for {lease.tenant.full_name} ({lease.rent_frequency})',
        })

    return {
        'status': 'healthy' if not issues else 'warning',
        'timestamp': today.isoformat(),
        'weekly_leases_active': weekly_leases.count(),
        'biweekly_leases_active': biweekly_leases.count(),
        'issues': issues,
    }
