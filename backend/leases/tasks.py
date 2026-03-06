"""
Celery tasks for lease management.

Schedule via Celery Beat (add to settings or beat schedule):
  CELERY_BEAT_SCHEDULE = {
      'generate-rent-payments': {
          'task': 'leases.tasks.daily_payment_generation',
          'schedule': crontab(hour=6, minute=0),  # Run at 6 AM daily
      },
  }

Without Redis/Celery running, these can also be called directly:
  from leases.tasks import daily_payment_generation
  daily_payment_generation()  # synchronous fallback
"""

import logging

logger = logging.getLogger(__name__)


def daily_payment_generation():
    """
    Daily task: generate upcoming rent payment records and mark overdue ones.

    This is a plain function (not @shared_task) so it works without Celery.
    When Celery is available, register it in beat schedule.
    Can also be called from a management command or API endpoint.
    """
    from leases.services import generate_all_pending_payments, mark_overdue_payments

    # Step 1: Mark overdue
    overdue_count = mark_overdue_payments()
    logger.info(f'Marked {overdue_count} payments as overdue')

    # Step 2: Generate upcoming payments
    result = generate_all_pending_payments()
    logger.info(
        f'Processed {result["leases_processed"]} leases, '
        f'created {result["payments_created"]} payments'
    )

    return {
        'overdue_marked': overdue_count,
        **result,
    }
