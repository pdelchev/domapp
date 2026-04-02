"""
# ═══ VEHICLES CELERY TASKS ═══
# Daily beat task to check and fire vehicle obligation reminders.
# Works without Celery too — can be called from management command.
"""

from .services import check_and_send_reminders


def daily_vehicle_reminders():
    """
    Called by Celery beat or management command daily.
    Scans all VehicleReminder records and fires notifications.
    """
    count = check_and_send_reminders()
    return f'Sent {count} vehicle reminders'
