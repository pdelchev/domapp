"""
Medication reminder services.

§PURPOSE: Create, manage, and track medication reminders.
          Check adherence, trigger reminders, log taken/skipped status.

§FLOW:
  1. User creates reminder (med name, time, frequency)
  2. Daily Celery task checks which reminders should fire today
  3. Create ReminderLog entry with status='pending'
  4. Frontend shows pending reminders
  5. User marks taken/snoozed/skipped → updates ReminderLog
  6. Adherence tracking aggregates logs into taken_count/skipped_count
"""

from datetime import date as date_class, datetime, timedelta
from django.utils import timezone as _tz

from .daily_models import MedicationReminder, ReminderLog


def create_reminder(
    user,
    profile,
    medication_name: str,
    reminder_time,  # datetime.time
    frequency: str = 'daily',
    custom_days: list = None,
    start_date: date_class = None,
    end_date: date_class = None,
    dosage: str = '',
    instructions: str = '',
    supplement=None,
    notes: str = '',
) -> MedicationReminder:
    """
    Create a new medication reminder.
    Returns: created MedicationReminder.
    """
    if start_date is None:
        start_date = date_class.today()

    reminder = MedicationReminder.objects.create(
        user=user,
        profile=profile,
        medication_name=medication_name,
        reminder_time=reminder_time,
        frequency=frequency,
        custom_days=custom_days or [],
        start_date=start_date,
        end_date=end_date,
        dosage=dosage,
        instructions=instructions,
        supplement=supplement,
        notes=notes,
        status='active',
    )
    return reminder


def check_and_create_logs(user, profile=None, today: date_class = None) -> list:
    """
    Check which reminders should fire today and create ReminderLog entries if missing.
    Returns: list of created ReminderLog objects.
    """
    today = today or date_class.today()

    # Get user's active reminders
    qs = MedicationReminder.objects.filter(user=user, status='active')
    if profile:
        qs = qs.filter(profile=profile)

    created = []
    for reminder in qs:
        if reminder.is_scheduled_for_today(today):
            # Check if log already exists for today
            log, was_created = ReminderLog.objects.get_or_create(
                reminder=reminder,
                date=today,
                defaults={'status': 'pending'}
            )
            if was_created:
                created.append(log)

    return created


def mark_reminder_taken(log: ReminderLog, notes: str = '') -> ReminderLog:
    """
    Mark a reminder as taken.
    Updates log + parent reminder's taken_count.
    """
    log.status = 'taken'
    log.taken_at = _tz.now()
    log.notes = notes
    log.save()

    # Update parent reminder stats
    reminder = log.reminder
    reminder.last_taken_at = _tz.now()
    reminder.taken_count = ReminderLog.objects.filter(
        reminder=reminder, status='taken'
    ).count()
    reminder.save()

    return log


def mark_reminder_skipped(log: ReminderLog, notes: str = '') -> ReminderLog:
    """
    Mark a reminder as skipped (missed).
    Updates log + parent reminder's skipped_count.
    """
    log.status = 'skipped'
    log.notes = notes
    log.save()

    # Update parent reminder stats
    reminder = log.reminder
    reminder.skipped_count = ReminderLog.objects.filter(
        reminder=reminder, status='skipped'
    ).count()
    reminder.save()

    return log


def snooze_reminder(log: ReminderLog, minutes: int = 30) -> ReminderLog:
    """
    Snooze a reminder by N minutes.
    Updates snoozed_until timestamp.
    """
    log.status = 'snoozed'
    log.snoozed_until = _tz.now() + timedelta(minutes=minutes)
    log.save()
    return log


def dismiss_reminder(log: ReminderLog) -> ReminderLog:
    """
    Dismiss a reminder without marking taken/skipped (lost reminder).
    """
    log.status = 'dismissed'
    log.save()
    return log


def pause_reminder(reminder: MedicationReminder) -> MedicationReminder:
    """
    Pause a reminder (stops creating new logs).
    """
    reminder.status = 'paused'
    reminder.save()
    return reminder


def resume_reminder(reminder: MedicationReminder) -> MedicationReminder:
    """
    Resume a paused reminder.
    """
    reminder.status = 'active'
    reminder.save()
    return reminder


def complete_reminder(reminder: MedicationReminder) -> MedicationReminder:
    """
    Mark a reminder as completed (e.g., short-term antibiotic course).
    """
    reminder.status = 'completed'
    reminder.save()
    return reminder


def get_todays_reminders(user, profile=None, today: date_class = None) -> dict:
    """
    Get all reminders and their logs for today.
    Returns: {
        'date': today,
        'reminders': [
            {
                'reminder': MedicationReminder,
                'log': ReminderLog or None,
                'status': 'pending' | 'taken' | 'skipped' | 'snoozed' | 'dismissed',
                'is_overdue': bool,
            },
            ...
        ],
        'stats': {
            'total': int,
            'taken': int,
            'pending': int,
            'skipped': int,
            'adherence_rate': float,
        }
    }
    """
    today = today or date_class.today()

    # Ensure all logs exist for today
    check_and_create_logs(user, profile, today)

    # Get all active reminders for user
    qs = MedicationReminder.objects.filter(user=user, status='active')
    if profile:
        qs = qs.filter(profile=profile)

    reminders_data = []
    stats = {'total': 0, 'taken': 0, 'pending': 0, 'skipped': 0}

    for reminder in qs:
        if reminder.is_scheduled_for_today(today):
            log = ReminderLog.objects.filter(reminder=reminder, date=today).first()
            status = log.status if log else 'pending'

            # Check if overdue (current time > reminder time)
            is_overdue = False
            if status in ['pending', 'snoozed']:
                now = _tz.now()
                reminder_dt = datetime.combine(today, reminder.reminder_time)
                is_overdue = now > reminder_dt

            reminders_data.append({
                'reminder': reminder,
                'log': log,
                'status': status,
                'is_overdue': is_overdue,
            })

            stats['total'] += 1
            if status == 'taken':
                stats['taken'] += 1
            elif status == 'pending':
                stats['pending'] += 1
            elif status == 'skipped':
                stats['skipped'] += 1

    # Compute adherence rate
    if stats['total'] > 0 and stats['taken'] + stats['skipped'] > 0:
        stats['adherence_rate'] = round(
            100 * stats['taken'] / (stats['taken'] + stats['skipped']), 1
        )
    else:
        stats['adherence_rate'] = 0.0

    return {
        'date': today,
        'reminders': reminders_data,
        'stats': stats,
    }


def get_reminder_history(reminder: MedicationReminder, days: int = 30) -> dict:
    """
    Get adherence history for a reminder.
    Returns: aggregated stats over the last N days.
    """
    start = date_class.today() - timedelta(days=days)
    logs = ReminderLog.objects.filter(
        reminder=reminder, date__gte=start
    ).order_by('-date')

    taken = logs.filter(status='taken').count()
    skipped = logs.filter(status='skipped').count()
    total = taken + skipped

    return {
        'reminder': reminder,
        'window_days': days,
        'logs': list(logs),
        'taken': taken,
        'skipped': skipped,
        'total_scheduled': len(logs),  # All logs (pending, snoozed count as scheduled)
        'adherence_rate': round(100 * taken / total, 1) if total > 0 else 0.0,
    }
