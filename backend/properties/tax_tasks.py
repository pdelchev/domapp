"""
# ═══ PROPERTY TAX CELERY TASKS ═══
# Daily beat task to check and fire tax payment reminders.
# Works without Celery too — can be called from management command.
"""

from .tax_services import check_and_send_reminders


def daily_tax_reminders():
    """
    Called by Celery beat or management command daily.
    Scans all TaxReminder records and fires notifications.
    """
    count = check_and_send_reminders()
    return f'Sent {count} tax reminders'
