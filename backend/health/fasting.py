"""
Fasting mode service.

§PURPOSE: Manage active fasting windows and reshuffle the supplement
          schedule so the user knows which items to take now vs defer
          to after the fast breaks.

§RULES:
  - `take_on_empty_stomach` → 'fast_friendly' — take during fast.
  - `take_with_food` → 'deferred' — skip until fast ends.
  - neither flag set → 'ok' — water-only timing is fine either way,
    but we still flag it 'caution' when the supplement category is
    'medication' so the user double-checks with a doctor.

§NAV: daily_models.FastingSession → fasting.py → daily_views.fasting_*
"""

from datetime import timedelta
from typing import Optional

from django.db.models import Q
from django.utils import timezone

from .daily_models import FastingSession, SupplementSchedule


PROTOCOL_HOURS = {
    '16_8': 16,
    '18_6': 18,
    '20_4': 20,
    'omad': 23,
    '24h': 24,
    '36h': 36,
    '48h': 48,
}


def get_active_fast(user, profile) -> Optional[FastingSession]:
    """Return the currently-active fasting session for this profile, or None."""
    now = timezone.now()
    return (
        FastingSession.objects
        .filter(user=user, profile=profile, starts_at__lte=now)
        .filter(ended_early_at__isnull=True)
        .filter(Q(ends_at__isnull=True) | Q(ends_at__gt=now))
        .order_by('-starts_at')
        .first()
    )


def start_fast(user, profile, protocol: str = '16_8', starts_at=None,
               ends_at=None, hours: Optional[float] = None,
               notes: str = '') -> FastingSession:
    """
    Start a fasting session.
    §INPUT:
      - protocol: one of PROTOCOL_HOURS keys or 'custom'.
      - hours: duration — overrides protocol default if given.
      - ends_at: explicit end — wins over protocol + hours.
    §EFFECT: Marks any currently-active session as ended_early_at=now
             so there is exactly one active fast per profile.
    """
    now = timezone.now()
    starts_at = starts_at or now

    # Close any currently-active session
    active = get_active_fast(user, profile)
    if active:
        active.ended_early_at = now
        active.save(update_fields=['ended_early_at'])

    # Resolve end
    if ends_at is None:
        duration_hours = hours if hours is not None else PROTOCOL_HOURS.get(protocol)
        if duration_hours:
            ends_at = starts_at + timedelta(hours=duration_hours)

    return FastingSession.objects.create(
        user=user, profile=profile,
        protocol=protocol,
        starts_at=starts_at,
        ends_at=ends_at,
        notes=notes,
    )


def end_fast(user, profile) -> Optional[FastingSession]:
    """End the active fast now."""
    active = get_active_fast(user, profile)
    if not active:
        return None
    active.ended_early_at = timezone.now()
    active.save(update_fields=['ended_early_at'])
    return active


# ──────────────────────────────────────────────────────────────
# §SCHEDULE annotation
# ──────────────────────────────────────────────────────────────

def fast_status_for_schedule(schedule: SupplementSchedule) -> str:
    """
    Classify a schedule item against an active fast.
    Returns one of: 'fast_friendly', 'deferred', 'ok', 'caution'.
    """
    if schedule.take_on_empty_stomach:
        return 'fast_friendly'
    if schedule.take_with_food:
        return 'deferred'
    if schedule.supplement.category in ('medication',):
        return 'caution'
    return 'ok'


def fast_status_for_item(item: dict) -> str:
    """Same classifier, but for the dict form produced by get_todays_schedule."""
    if item.get('take_on_empty_stomach'):
        return 'fast_friendly'
    if item.get('take_with_food'):
        return 'deferred'
    if item.get('category') == 'medication':
        return 'caution'
    return 'ok'


def annotate_schedule_for_fast(schedule_groups: list, active_fast: Optional[FastingSession]) -> dict:
    """
    Tag every schedule item with `fast_status`. When a fast is active,
    also split groups into `during_fast` / `after_fast` buckets.

    §OUTPUT: {
        groups: [...],            # original groups, items tagged
        fasting: bool,
        active_fast: {...} | null,
        summary: {deferred, fast_friendly, caution, ok}
    }
    """
    counts = {'deferred': 0, 'fast_friendly': 0, 'caution': 0, 'ok': 0}
    for group in schedule_groups:
        for item in group.get('items', []):
            status = fast_status_for_item(item) if active_fast else 'ok'
            item['fast_status'] = status
            counts[status] += 1

    payload: dict = {
        'groups': schedule_groups,
        'fasting': active_fast is not None,
        'summary': counts,
        'active_fast': None,
    }

    if active_fast:
        payload['active_fast'] = {
            'id': active_fast.id,
            'protocol': active_fast.protocol,
            'starts_at': active_fast.starts_at.isoformat(),
            'ends_at': active_fast.ends_at.isoformat() if active_fast.ends_at else None,
            'hours_elapsed': round(
                (timezone.now() - active_fast.starts_at).total_seconds() / 3600, 1
            ),
            'hours_remaining': round(
                (active_fast.ends_at - timezone.now()).total_seconds() / 3600, 1
            ) if active_fast.ends_at else None,
        }

    return payload
