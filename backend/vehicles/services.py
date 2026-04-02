"""
# ═══ VEHICLES SERVICE LAYER ═══
# Business logic separated from views for testability and reuse.
# Handles: reminder generation, obligation renewal, cost reports, notifications.
#
# ENTRY POINTS:
#   sync_reminders(obligation)  — called on obligation save
#   renew_obligation(obligation, new_start, new_end, cost) — quick-renew flow
#   check_and_send_reminders()  — called daily by Celery beat
#   get_cost_report(user, year) — annual cost breakdown
#   get_compliance_summary(user) — dashboard overview
"""

from datetime import timedelta, date
from django.utils import timezone
from django.db.models import Sum, Count, Q, F

from .models import (
    Vehicle, VehicleObligation, VehicleReminder,
    OBLIGATION_TYPE_CHOICES, OBLIGATION_DEFAULT_MONTHS,
)
from notifications.services import notify


def sync_reminders(obligation):
    """
    Rebuild reminder records for an obligation based on its reminder_days.
    Called after obligation create/update.
    Idempotent: deletes old unsent reminders and recreates.

    ─── LOGIC ───
    For each day in reminder_days (e.g. [30, 7, 1]):
      remind_at = end_date - N days
      Skip if remind_at is in the past
      Skip if already sent (preserve sent=True records)
    """
    if not obligation.end_date or not obligation.is_current:
        return

    days = obligation.reminder_days or obligation.get_default_reminder_days()

    # Delete unsent reminders (preserve already-sent ones)
    VehicleReminder.objects.filter(
        obligation=obligation,
        sent=False
    ).delete()

    today = timezone.now().date()
    for d in days:
        remind_at = obligation.end_date - timedelta(days=d)
        if remind_at < today:
            continue
        # Don't duplicate already-sent reminders for the same date
        if VehicleReminder.objects.filter(obligation=obligation, remind_at=remind_at, sent=True).exists():
            continue
        VehicleReminder.objects.create(
            obligation=obligation,
            remind_at=remind_at,
        )


def renew_obligation(obligation, new_start_date, new_end_date, cost=None, provider=None, policy_number=None):
    """
    Quick-renew: marks the old obligation as historical and creates a new one.
    Copies provider/policy info from old if not provided.

    ─── FLOW ───
    1. Old obligation → is_current=False
    2. Create new obligation with same type, vehicle, and optionally new cost/provider
    3. Sync reminders on the new obligation
    4. Return new obligation
    """
    # Mark old as historical
    obligation.is_current = False
    obligation.save(update_fields=['is_current'])

    # Create renewed obligation
    new_ob = VehicleObligation.objects.create(
        vehicle=obligation.vehicle,
        obligation_type=obligation.obligation_type,
        custom_type_name=obligation.custom_type_name,
        start_date=new_start_date,
        end_date=new_end_date,
        provider=provider or obligation.provider,
        policy_number=policy_number or obligation.policy_number,
        cost=cost,
        currency=obligation.currency,
        reminder_days=obligation.reminder_days,
        is_current=True,
    )

    sync_reminders(new_ob)
    return new_ob


def check_and_send_reminders():
    """
    Daily Celery beat task entry point.
    Finds all pending reminders where remind_at ≤ today, fires notifications.

    ─── QUERY ───
    VehicleReminder.remind_at ≤ today, sent=False
    JOIN obligation → vehicle → user
    For each: create Notification, mark sent=True
    """
    today = timezone.now().date()
    pending = (
        VehicleReminder.objects
        .filter(remind_at__lte=today, sent=False)
        .select_related('obligation__vehicle__user', 'obligation__vehicle__linked_property')
    )

    sent_count = 0
    for reminder in pending:
        ob = reminder.obligation
        vehicle = ob.vehicle
        user = vehicle.user
        days_left = (ob.end_date - today).days if ob.end_date else 0

        # Build notification message
        ob_name = ob.display_name
        if days_left <= 0:
            title = f'{ob_name} изтече!'
            message = f'{ob_name} за {vehicle.plate_number} ({vehicle.make} {vehicle.model}) е изтекъл на {ob.end_date}.'
            notif_type = 'vehicle_expired'
        elif days_left <= 7:
            title = f'{ob_name} изтича скоро!'
            message = f'{ob_name} за {vehicle.plate_number} изтича след {days_left} дни ({ob.end_date}).'
            notif_type = 'vehicle_expiring'
        else:
            title = f'{ob_name} — напомняне'
            message = f'{ob_name} за {vehicle.plate_number} изтича на {ob.end_date} (след {days_left} дни).'
            notif_type = 'vehicle_reminder'

        notification = notify(
            user=user,
            notification_type=notif_type,
            title=title,
            message=message,
            related_property=vehicle.linked_property,
            related_object_id=ob.id,
        )

        reminder.sent = True
        reminder.sent_at = timezone.now()
        reminder.notification_id = notification.id
        reminder.save(update_fields=['sent', 'sent_at', 'notification_id'])
        sent_count += 1

    return sent_count


def create_bg_presets(vehicle):
    """
    One-click Bulgarian preset: creates all 7 standard obligation types
    for a vehicle with default reminder schedules.
    User fills in dates/costs later.

    ─── TYPES CREATED ───
    mtpl, kasko, vignette, mot, vehicle_tax, green_card, assistance
    """
    preset_types = ['mtpl', 'kasko', 'vignette', 'mot', 'vehicle_tax', 'green_card', 'assistance']
    created = []
    for ob_type in preset_types:
        # Skip if this type already exists for this vehicle
        if VehicleObligation.objects.filter(vehicle=vehicle, obligation_type=ob_type, is_current=True).exists():
            continue
        ob = VehicleObligation.objects.create(
            vehicle=vehicle,
            obligation_type=ob_type,
            start_date=timezone.now().date(),
            end_date=None,  # User fills in
            reminder_days=[30, 7, 1],
            is_current=True,
        )
        created.append(ob)
    return created


def get_cost_report(user, year=None):
    """
    Annual cost breakdown by vehicle and obligation type.
    Returns dict with per-vehicle costs and totals.

    ─── OUTPUT ───
    {
      year: 2026,
      total_cost: 3500.00,
      vehicles: [
        { id, plate, make_model, obligations: {mtpl: 450, vignette: 97, ...}, total: 1200 },
        ...
      ]
    }
    """
    if year is None:
        year = timezone.now().year

    vehicles = Vehicle.objects.filter(user=user, is_active=True)
    result = {
        'year': year,
        'total_cost': 0,
        'vehicles': [],
    }

    for v in vehicles:
        obligations = VehicleObligation.objects.filter(
            vehicle=v,
            start_date__year__lte=year,
            cost__isnull=False,
        ).filter(
            Q(end_date__year__gte=year) | Q(end_date__isnull=True) | Q(start_date__year=year)
        )

        by_type = {}
        vehicle_total = 0
        for ob in obligations:
            key = ob.custom_type_name if ob.obligation_type == 'custom' else ob.obligation_type
            cost_val = float(ob.cost) if ob.cost else 0
            by_type[key] = by_type.get(key, 0) + cost_val
            vehicle_total += cost_val

        result['vehicles'].append({
            'id': v.id,
            'plate_number': v.plate_number,
            'make_model': f'{v.make} {v.model}',
            'obligations': by_type,
            'total': vehicle_total,
        })
        result['total_cost'] += vehicle_total

    return result


def get_compliance_summary(user):
    """
    Dashboard compliance overview: counts of active/expiring/expired obligations.
    Also returns the next 10 upcoming expirations.

    ─── OUTPUT ───
    {
      total_vehicles: 3,
      total_obligations: 15,
      active: 10,
      expiring_soon: 3,
      expired: 2,
      upcoming: [{ id, type, vehicle_plate, end_date, days_left }, ...]
    }
    """
    today = timezone.now().date()
    soon = today + timedelta(days=30)

    obligations = VehicleObligation.objects.filter(
        vehicle__user=user,
        vehicle__is_active=True,
        is_current=True,
    ).select_related('vehicle')

    total = obligations.count()
    expired = obligations.filter(end_date__lt=today).count()
    expiring = obligations.filter(end_date__gte=today, end_date__lte=soon).count()
    active = obligations.filter(Q(end_date__gt=soon) | Q(end_date__isnull=True)).count()

    upcoming = (
        obligations
        .filter(end_date__gte=today)
        .order_by('end_date')[:10]
    )

    return {
        'total_vehicles': Vehicle.objects.filter(user=user, is_active=True).count(),
        'total_obligations': total,
        'active': active,
        'expiring_soon': expiring,
        'expired': expired,
        'upcoming': [
            {
                'id': ob.id,
                'obligation_type': ob.obligation_type,
                'display_name': ob.display_name,
                'vehicle_id': ob.vehicle_id,
                'vehicle_plate': ob.vehicle.plate_number,
                'vehicle_make_model': f'{ob.vehicle.make} {ob.vehicle.model}',
                'end_date': ob.end_date.isoformat() if ob.end_date else None,
                'days_left': (ob.end_date - today).days if ob.end_date else None,
            }
            for ob in upcoming
        ],
    }
