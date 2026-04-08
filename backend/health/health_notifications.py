"""
Smart health notifications — checks health data and creates alerts.

Call `check_all_health_alerts(user)` from a Celery task or management command.
Each check is idempotent: it won't create duplicate notifications for the same event.
"""
from datetime import timedelta
from django.utils import timezone
from django.db.models import Avg
from notifications.services import notify


def _already_notified(user, title_prefix, days=7):
    """Check if a similar notification was sent recently."""
    from notifications.models import Notification
    cutoff = timezone.now() - timedelta(days=days)
    return Notification.objects.filter(
        user=user, type='health', title__startswith=title_prefix,
        created_at__gte=cutoff,
    ).exists()


def check_bp_trending_up(user):
    """Alert if average BP has been rising for 7+ consecutive days."""
    from health.bp_models import BPReading

    readings = list(
        BPReading.objects.filter(user=user)
        .order_by('-measured_at')[:14]
        .values('systolic', 'diastolic', 'measured_at')
    )
    if len(readings) < 7:
        return

    # Split into two halves: recent 7 vs older 7
    recent = readings[:7]
    older = readings[7:14]
    if len(older) < 3:
        return

    avg_recent_sys = sum(r['systolic'] for r in recent) / len(recent)
    avg_older_sys = sum(r['systolic'] for r in older) / len(older)
    avg_recent_dia = sum(r['diastolic'] for r in recent) / len(recent)
    avg_older_dia = sum(r['diastolic'] for r in older) / len(older)

    # Alert if systolic rose by 5+ or diastolic by 3+
    sys_delta = avg_recent_sys - avg_older_sys
    dia_delta = avg_recent_dia - avg_older_dia

    if sys_delta >= 5 or dia_delta >= 3:
        prefix = '⚠️ BP Trending Up'
        if _already_notified(user, prefix):
            return
        notify(
            user=user,
            notification_type='health',
            title=f'{prefix}',
            message=(
                f'Your blood pressure has been rising over the past 7 days. '
                f'Recent average: {avg_recent_sys:.0f}/{avg_recent_dia:.0f} mmHg '
                f'(was {avg_older_sys:.0f}/{avg_older_dia:.0f}). '
                f'Consider checking your medication, salt intake, and stress levels.'
            ),
        )


def check_weight_plateau(user):
    """Alert if weight hasn't changed meaningfully in 14+ days."""
    from health.weight_models import WeightReading

    readings = list(
        WeightReading.objects.filter(user=user)
        .order_by('-measured_at')[:30]
        .values('weight_kg', 'measured_at')
    )
    if len(readings) < 5:
        return

    # Check last 14 days
    cutoff = timezone.now() - timedelta(days=14)
    recent = [r for r in readings if r['measured_at'] >= cutoff]
    if len(recent) < 3:
        return

    weights = [float(r['weight_kg']) for r in recent]
    weight_range = max(weights) - min(weights)

    # Plateau = less than 0.3kg variation over 14 days with 3+ readings
    if weight_range < 0.3:
        prefix = '📊 Weight Plateau'
        if _already_notified(user, prefix, days=14):
            return
        notify(
            user=user,
            notification_type='health',
            title=prefix,
            message=(
                f'Your weight has been stable at {weights[0]:.1f} kg for the past 2 weeks '
                f'(range: {weight_range:.1f} kg). If you\'re trying to lose weight, '
                f'consider adjusting your calorie intake or exercise routine.'
            ),
        )


def check_supplement_streak(user):
    """Alert if supplement adherence dropped (streak broken)."""
    from health.ritual_models import RitualLog, RitualItem

    # Check if there are any ritual items
    active_items = RitualItem.objects.filter(user=user, is_active=True).count()
    if active_items == 0:
        return

    today = timezone.now().date()
    yesterday = today - timedelta(days=1)

    # Check yesterday's adherence
    yesterday_logs = RitualLog.objects.filter(
        item__user=user,
        date=yesterday,
        completed=True,
    ).count()

    yesterday_total = RitualItem.objects.filter(
        user=user, is_active=True,
        condition='daily',
    ).count()

    if yesterday_total == 0:
        return

    adherence_pct = (yesterday_logs / yesterday_total) * 100

    if adherence_pct < 50:
        prefix = '💊 Supplement Streak'
        if _already_notified(user, prefix, days=1):
            return
        notify(
            user=user,
            notification_type='health',
            title=f'{prefix} Broken',
            message=(
                f'You completed only {yesterday_logs}/{yesterday_total} '
                f'({adherence_pct:.0f}%) of your daily supplements yesterday. '
                f'Consistency is key — try to get back on track today!'
            ),
        )


def check_blood_test_overdue(user):
    """Alert if blood test is overdue based on test panel schedule."""
    from health.test_panel import get_recommended_panel
    from health.models import HealthProfile

    profile = HealthProfile.objects.filter(user=user, is_primary=True).first()
    if not profile:
        return

    try:
        panel = get_recommended_panel(user, profile)
    except Exception:
        return

    if panel.get('is_overdue'):
        days_overdue = abs(panel.get('days_until_next', 0))
        prefix = '🧪 Blood Test Overdue'
        if _already_notified(user, prefix, days=7):
            return
        notify(
            user=user,
            notification_type='health',
            title=prefix,
            message=(
                f'Your quarterly blood test is {days_overdue} days overdue. '
                f'Last test was on {panel.get("last_test_date", "unknown")}. '
                f'Schedule your next test soon — you have {panel.get("total_tests", 0)} '
                f'tests recommended.'
            ),
        )


def check_all_health_alerts(user):
    """Run all health checks for a user. Call from Celery task or management command."""
    check_bp_trending_up(user)
    check_weight_plateau(user)
    check_supplement_streak(user)
    check_blood_test_overdue(user)
