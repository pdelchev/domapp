"""
§NAV: Celery tasks for Health Hub automation.
§SCHEDULE: Configured in core/celery.py beat_schedule.

Tasks:
  1. dose_reminders — fires notifications at time-slot boundaries (8am, 1pm, 8pm, 10pm)
  2. daily_wizard_reminder — nudge users who haven't done their check-in by 9pm
  3. stock_alerts — daily check for low supplement stock
  4. streak_maintenance — update streak badges
"""

from celery import shared_task
from datetime import date, timedelta
from django.utils import timezone


@shared_task(name='health.dose_reminders')
def dose_reminders():
    """
    §WHEN: Runs 4x/day (8am, 1pm, 8pm, 10pm) via beat_schedule.
    §LOGIC: Finds uncompleted doses for the current time slot and sends notifications.
    """
    from .daily_models import SupplementSchedule, DoseLog
    from notifications.services import notify

    now = timezone.localtime()
    hour = now.hour

    # Map current hour to time slot
    if hour < 9:
        slots = ['morning', 'fasted']
    elif hour < 14:
        slots = ['breakfast', 'midday', 'lunch']
    elif hour < 20:
        slots = ['afternoon', 'dinner']
    else:
        slots = ['evening', 'bedtime']

    today = date.today()

    # Find active schedules for this time slot
    schedules = (
        SupplementSchedule.objects
        .filter(is_active=True, time_slot__in=slots)
        .select_related('supplement', 'profile', 'supplement__user')
    )

    for schedule in schedules:
        # Check if already logged today
        already_logged = DoseLog.objects.filter(
            schedule=schedule, date=today
        ).exists()
        if already_logged:
            continue

        # Send notification
        user = schedule.supplement.user
        slot_label = schedule.get_time_slot_display()
        notify(
            user=user,
            notification_type='health',
            title=f'{slot_label}: {schedule.supplement.name}',
            message=f'Time to take {schedule.dose_amount} {schedule.dose_unit} of {schedule.supplement.name}',
        )


@shared_task(name='health.daily_wizard_reminder')
def daily_wizard_reminder():
    """
    §WHEN: Runs daily at 9pm.
    §LOGIC: Nudges users who haven't completed their daily check-in.
    """
    from .daily_models import DailyLog, SupplementSchedule
    from django.contrib.auth import get_user_model
    from notifications.services import notify

    User = get_user_model()
    today = date.today()

    # Find users with active supplement schedules but no wizard completion today
    users_with_schedules = (
        SupplementSchedule.objects
        .filter(is_active=True)
        .values_list('supplement__user', flat=True)
        .distinct()
    )

    completed_users = (
        DailyLog.objects
        .filter(date=today, wizard_completed=True)
        .values_list('user_id', flat=True)
    )

    missing = set(users_with_schedules) - set(completed_users)

    for user_id in missing:
        try:
            user = User.objects.get(id=user_id)
            notify(
                user=user,
                notification_type='health',
                title='Daily check-in',
                message="You haven't done your daily health check-in yet.",
            )
        except User.DoesNotExist:
            continue


@shared_task(name='health.stock_alerts')
def stock_alerts():
    """
    §WHEN: Runs daily at 10am.
    §LOGIC: Checks supplement stock levels and fires refill notifications.
    """
    from .daily_services import get_low_stock_supplements
    from django.contrib.auth import get_user_model
    from notifications.services import notify

    User = get_user_model()

    # Only check users with active supplements that track stock
    from .daily_models import Supplement
    user_ids = (
        Supplement.objects
        .filter(is_active=True, pack_size__isnull=False)
        .values_list('user_id', flat=True)
        .distinct()
    )

    for user_id in user_ids:
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            continue

        low = get_low_stock_supplements(user)
        for item in low:
            notify(
                user=user,
                notification_type='health',
                title=f'{item["name"]} running low',
                message=f'Only {item["days_remaining"]} days of {item["name"]} remaining. Time to reorder.',
            )
