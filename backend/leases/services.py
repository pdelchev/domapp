"""
Lease payment generation service layer.

Core business logic for auto-generating RentPayment records from active leases.
Separated from views/models so it can be called from:
  - API endpoints (on-demand generation)
  - Celery tasks (scheduled daily)
  - Management commands (manual runs)

Design decisions:
  - Generate payments up to a configurable look-ahead window
    (default: 1 month for monthly, 2 weeks for weekly/biweekly)
  - Use next_payment_date as a cursor to avoid duplicate generation
  - Idempotent: calling generate twice produces no duplicates
  - one_time leases are skipped entirely (manual entry only)
"""

from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from finance.models import RentPayment


def calculate_first_payment_date(lease) -> date:
    """
    Determine the first payment due date for a lease.

    Monthly: first rent_due_day on or after start_date
    Weekly/Biweekly: start_date itself (rent is due from day one)
    """
    if lease.rent_frequency == 'monthly':
        # Find the first rent_due_day on or after start_date
        due_day = min(lease.rent_due_day, 28)  # cap at 28 to avoid month-end issues
        first = lease.start_date.replace(day=due_day)
        if first < lease.start_date:
            first += relativedelta(months=1)
        return first
    else:
        # Weekly/biweekly: first payment on start_date
        return lease.start_date


def calculate_next_date(current_date: date, frequency: str) -> date:
    """Advance a date by one period based on frequency."""
    if frequency == 'monthly':
        return current_date + relativedelta(months=1)
    elif frequency == 'weekly':
        return current_date + timedelta(weeks=1)
    elif frequency == 'biweekly':
        return current_date + timedelta(weeks=2)
    else:
        raise ValueError(f'Cannot advance date for frequency: {frequency}')


def get_look_ahead_date(frequency: str) -> date:
    """
    How far ahead to generate payments.
    Monthly: 2 months ahead (so next month is always visible)
    Weekly: 4 weeks ahead
    Biweekly: 6 weeks ahead
    """
    today = date.today()
    if frequency == 'monthly':
        return today + relativedelta(months=2)
    elif frequency == 'weekly':
        return today + timedelta(weeks=4)
    elif frequency == 'biweekly':
        return today + timedelta(weeks=6)
    return today


def generate_payments_for_lease(lease, up_to_date: date = None) -> int:
    """
    Generate RentPayment records for a single lease up to the look-ahead date.

    Returns the number of new payments created.
    Skips one_time leases and inactive leases.
    """
    if lease.rent_frequency == 'one_time':
        return 0

    if lease.status != 'active':
        return 0

    if not lease.auto_generate_payments:
        return 0

    # Determine the generation window
    if up_to_date is None:
        up_to_date = get_look_ahead_date(lease.rent_frequency)

    # Don't generate past the lease end date
    end_limit = min(up_to_date, lease.end_date)

    # Where to start generating from
    cursor = lease.next_payment_date
    if cursor is None:
        cursor = calculate_first_payment_date(lease)

    created_count = 0

    while cursor <= end_limit:
        # Check for existing payment on this date (idempotency)
        exists = RentPayment.objects.filter(
            lease=lease, due_date=cursor
        ).exists()

        if not exists:
            RentPayment.objects.create(
                lease=lease,
                due_date=cursor,
                amount_due=lease.monthly_rent,
                amount_paid=0,
                status='pending',
            )
            created_count += 1

        # Advance cursor
        cursor = calculate_next_date(cursor, lease.rent_frequency)

    # Update the lease's cursor so we don't re-scan these dates
    lease.next_payment_date = cursor
    lease.save(update_fields=['next_payment_date'])

    return created_count


def generate_all_pending_payments() -> dict:
    """
    Generate payments for ALL active recurring leases.
    Called by the daily Celery task.

    Returns summary: { 'leases_processed': N, 'payments_created': N }
    """
    from leases.models import Lease

    active_leases = Lease.objects.filter(
        status='active',
        auto_generate_payments=True,
    ).exclude(
        rent_frequency='one_time'
    ).select_related('tenant', 'property')

    total_created = 0
    leases_processed = 0

    for lease in active_leases:
        count = generate_payments_for_lease(lease)
        if count > 0:
            total_created += count
        leases_processed += 1

    return {
        'leases_processed': leases_processed,
        'payments_created': total_created,
    }


def mark_overdue_payments():
    """
    Mark any pending payments past their due date as overdue.
    Called alongside generate_all_pending_payments in the daily task.
    """
    today = date.today()
    updated = RentPayment.objects.filter(
        status='pending',
        due_date__lt=today,
    ).update(status='overdue')
    return updated
