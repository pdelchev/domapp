"""
§BRIEFING — Rule-based daily synthesis: "what does today look like for you?"

Pulls:
  - yesterday's WHOOP recovery (if connected)
  - last 7-day BP average
  - active interventions
  - recent BP alerts (unread)

Outputs:
  { headline, advice: [str], metrics: {recovery, bp_sys_avg, bp_dia_avg}, date }

This is rule-based v1 — NOT an LLM call — so it ships fast and is explainable.
Upgrade path: swap rules for Claude API once we have more history per user.
"""

from datetime import timedelta
from django.db.models import Avg
from django.utils import timezone

from .models import Intervention
from .bp_models import BPReading, BPAlert


def _latest_recovery(user):
    """Most recent WhoopRecovery.recovery_score in the last 2 days. None if not found."""
    try:
        from .whoop_models import WhoopRecovery
    except Exception:
        return None
    cutoff = timezone.now() - timedelta(days=2)
    rec = (
        WhoopRecovery.objects
        .filter(user=user, cycle__start__gte=cutoff, recovery_score__isnull=False)
        .order_by('-cycle__start')
        .first()
    )
    return rec.recovery_score if rec else None


def _bp_7day_avg(user, profile):
    """Return (sys_avg, dia_avg, count) over the last 7 days, or (None, None, 0)."""
    cutoff = timezone.now() - timedelta(days=7)
    qs = BPReading.objects.filter(user=user, profile=profile, measured_at__gte=cutoff)
    agg = qs.aggregate(s=Avg('systolic'), d=Avg('diastolic'))
    return agg['s'], agg['d'], qs.count()


def _unread_alerts(user, profile):
    return list(
        BPAlert.objects
        .filter(user=user, profile=profile, is_read=False)
        .order_by('-created_at')[:3]
    )


def compute_briefing(user, profile):
    """
    Build today's briefing. Returns dict (never raises — if a data source is
    missing, that rule is simply skipped).
    """
    advice = []
    today = timezone.localdate().isoformat()

    # --- Recovery-driven advice ---
    recovery = _latest_recovery(user)
    if recovery is not None:
        if recovery < 34:
            advice.append(
                f"Recovery is low ({recovery}%) — keep today easy. Zone 2 only, no heavy lifting. "
                "Prioritise sleep and hydration."
            )
        elif recovery < 67:
            advice.append(
                f"Recovery is moderate ({recovery}%). Training OK but don't push to failure; "
                "leave 2 reps in the tank."
            )
        else:
            advice.append(
                f"Recovery is high ({recovery}%) — good day for hard training or a PR attempt."
            )

    # --- BP-driven advice ---
    sys_avg, dia_avg, bp_count = _bp_7day_avg(user, profile)
    if sys_avg and dia_avg:
        if sys_avg >= 140 or dia_avg >= 90:
            advice.append(
                f"7-day BP avg is {sys_avg:.0f}/{dia_avg:.0f} — Stage 2. "
                "Limit sodium, skip alcohol today, discuss with your GP if sustained."
            )
        elif sys_avg >= 130 or dia_avg >= 80:
            advice.append(
                f"7-day BP avg is {sys_avg:.0f}/{dia_avg:.0f} — Stage 1. "
                "Focus on sleep, potassium-rich foods, and cut alcohol today."
            )
        elif sys_avg >= 120:
            advice.append(
                f"7-day BP avg is {sys_avg:.0f}/{dia_avg:.0f} — elevated. "
                "Small lifestyle nudges now can keep you out of Stage 1."
            )
        else:
            advice.append(f"7-day BP avg is {sys_avg:.0f}/{dia_avg:.0f} — in range. Nice.")
    elif bp_count == 0:
        advice.append("No BP readings in the last 7 days — log a morning reading today.")

    # --- Intervention reminders ---
    active = list(
        Intervention.objects
        .filter(user=user, ended_on__isnull=True)
        .order_by('-started_on')[:5]
    )
    if active:
        names = ', '.join(i.name for i in active[:3])
        extra = f' (+{len(active) - 3} more)' if len(active) > 3 else ''
        advice.append(f"Active interventions — don't skip: {names}{extra}.")

    # --- Alerts ---
    alerts = _unread_alerts(user, profile)
    if alerts:
        top = alerts[0]
        advice.append(f"⚠️ BP alert: {top.title}")

    # --- Headline ---
    if recovery is not None and sys_avg:
        headline = f"Recovery {recovery}% · BP 7d {sys_avg:.0f}/{dia_avg:.0f}"
    elif recovery is not None:
        headline = f"Recovery {recovery}%"
    elif sys_avg:
        headline = f"BP 7d avg {sys_avg:.0f}/{dia_avg:.0f}"
    else:
        headline = "Today — no recent data yet"

    return {
        'date': today,
        'headline': headline,
        'advice': advice,
        'metrics': {
            'recovery': recovery,
            'bp_sys_avg': round(sys_avg, 1) if sys_avg else None,
            'bp_dia_avg': round(dia_avg, 1) if dia_avg else None,
            'bp_reading_count_7d': bp_count,
            'active_interventions': len(active),
        },
    }
