# ── health/whoop_tasks.py ──────────────────────────────────────────────
# Celery tasks for periodic WHOOP data synchronization.
#
# §NAV: whoop_models → whoop_serializers → whoop_views → whoop_urls → whoop_services → [whoop_tasks]
# §SCHEDULE: daily_whoop_sync runs every 4 hours via Celery Beat.
# §RESILIENT: Handles token refresh failures by marking connections inactive.

import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name='health.whoop.daily_sync', bind=True, max_retries=1)
def daily_whoop_sync(self):
    """
    §SYNC: Periodic WHOOP data sync for all active connections.

    Runs every 4 hours (configured in Celery Beat schedule).
    For each active WhoopConnection:
    1. Attempts to sync last 2 days of data (overlap ensures no gaps)
    2. On token refresh failure, marks connection as inactive
    3. Logs sync results for monitoring

    Schedule configuration (add to settings.py CELERY_BEAT_SCHEDULE):
        'whoop-sync-every-4h': {
            'task': 'health.whoop.daily_sync',
            'schedule': crontab(minute=0, hour='*/4'),
        }
    """
    from .whoop_models import WhoopConnection
    from .whoop_services import sync_whoop_data, refresh_tokens

    connections = WhoopConnection.objects.filter(is_active=True).select_related('user')
    total = connections.count()
    success_count = 0
    failure_count = 0

    logger.info('Starting WHOOP sync for %d active connections.', total)

    for connection in connections:
        user = connection.user
        try:
            # §TOKEN: Pre-check token validity before sync
            if connection.is_token_expired:
                if not refresh_tokens(connection):
                    logger.warning(
                        'WHOOP token refresh failed for user %s. Marking inactive.',
                        user.id,
                    )
                    connection.is_active = False
                    connection.sync_error = 'Token refresh failed during periodic sync. Please reconnect.'
                    connection.save(update_fields=['is_active', 'sync_error'])
                    failure_count += 1
                    continue

            # §SYNC: Pull last 2 days (overlap ensures no missed data)
            result = sync_whoop_data(user, days=2)

            if result.get('error'):
                logger.warning(
                    'WHOOP sync failed for user %s: %s',
                    user.id, result['error'],
                )
                failure_count += 1
                continue

            errors = result.get('errors', [])
            if errors:
                logger.warning(
                    'WHOOP sync partial errors for user %s: %s',
                    user.id, '; '.join(errors),
                )

            synced_total = (
                result.get('cycles_synced', 0)
                + result.get('recoveries_synced', 0)
                + result.get('sleeps_synced', 0)
                + result.get('workouts_synced', 0)
            )
            logger.info(
                'WHOOP sync OK for user %s: %d records synced.',
                user.id, synced_total,
            )
            success_count += 1

        except Exception as e:
            logger.exception(
                'Unexpected error during WHOOP sync for user %s: %s',
                user.id, e,
            )
            # §ERR: Record the error on the connection
            connection.sync_error = f'Sync error: {str(e)[:500]}'
            connection.last_sync_at = timezone.now()
            connection.save(update_fields=['sync_error', 'last_sync_at'])
            failure_count += 1

    logger.info(
        'WHOOP sync complete: %d/%d success, %d failures.',
        success_count, total, failure_count,
    )

    return {
        'total': total,
        'success': success_count,
        'failures': failure_count,
    }
