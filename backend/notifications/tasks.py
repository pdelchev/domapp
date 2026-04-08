# ── notifications/tasks.py ─────────────────────────────────────────
# Weekly summary notification — auto-generated every Sunday.
# Aggregates health, property, and vehicle stats for the past week.

import logging
from datetime import timedelta
from django.utils import timezone
from django.db.models import Avg, Sum, Count, Q
from celery import shared_task

from accounts.models import User
from .services import notify

logger = logging.getLogger(__name__)


def _build_weekly_summary(user) -> dict:
    """Build weekly summary data for a user. Returns {title, message, sections}."""
    today = timezone.now().date()
    week_ago = today - timedelta(days=7)
    sections = []

    # ── Health Stats ──
    health_lines = []
    try:
        from health.bp_models import BPReading
        bp_avg = BPReading.objects.filter(
            user=user, measured_at__date__gte=week_ago
        ).aggregate(avg_sys=Avg('systolic'), avg_dia=Avg('diastolic'), count=Count('id'))
        if bp_avg['count'] and bp_avg['count'] > 0:
            health_lines.append(f"BP avg: {bp_avg['avg_sys']:.0f}/{bp_avg['avg_dia']:.0f} ({bp_avg['count']} readings)")
    except ImportError:
        pass

    try:
        from health.weight_models import WeightReading
        weights = WeightReading.objects.filter(
            user=user, measured_at__date__gte=week_ago
        ).order_by('measured_at')
        if weights.count() >= 2:
            first_w = weights.first().weight_kg
            last_w = weights.last().weight_kg
            delta = float(last_w - first_w)
            arrow = '↓' if delta < 0 else '↑' if delta > 0 else '→'
            health_lines.append(f"Weight: {last_w}kg ({arrow}{abs(delta):.1f}kg this week)")
        elif weights.count() == 1:
            health_lines.append(f"Weight: {weights.first().weight_kg}kg")
    except ImportError:
        pass

    try:
        from health.ritual_models import RitualItem, RitualLog
        total_items = RitualItem.objects.filter(user=user, is_active=True, condition='daily').count()
        if total_items > 0:
            logs = RitualLog.objects.filter(
                item__user=user, item__is_active=True, item__condition='daily',
                date__gte=week_ago, date__lte=today, completed=True
            ).count()
            days = 7
            possible = total_items * days
            pct = round(logs / possible * 100) if possible > 0 else 0
            health_lines.append(f"Supplement adherence: {pct}% ({logs}/{possible})")
    except ImportError:
        pass

    if health_lines:
        sections.append(('🏥 Health', health_lines))

    # ── Property Stats ──
    property_lines = []
    try:
        from finance.models import RentPayment, Expense
        from properties.models import Property

        # Payments collected this week
        collected = RentPayment.objects.filter(
            lease__property__user=user, status='paid',
            payment_date__gte=week_ago, payment_date__lte=today
        )
        collected_sum = collected.aggregate(total=Sum('amount_paid'))['total'] or 0
        collected_count = collected.count()
        if collected_count > 0:
            property_lines.append(f"Collected: €{collected_sum:.0f} ({collected_count} payments)")

        # Overdue
        overdue = RentPayment.objects.filter(
            lease__property__user=user, status__in=['pending', 'overdue'],
            due_date__lt=today
        )
        overdue_count = overdue.count()
        overdue_sum = overdue.aggregate(total=Sum('amount_due'))['total'] or 0
        if overdue_count > 0:
            property_lines.append(f"⚠️ Overdue: {overdue_count} payments (€{overdue_sum:.0f})")

        # Due next week
        next_week = today + timedelta(days=7)
        upcoming = RentPayment.objects.filter(
            lease__property__user=user, status='pending',
            due_date__gte=today, due_date__lte=next_week
        )
        upcoming_count = upcoming.count()
        upcoming_sum = upcoming.aggregate(total=Sum('amount_due'))['total'] or 0
        if upcoming_count > 0:
            property_lines.append(f"Due next week: {upcoming_count} payments (€{upcoming_sum:.0f})")

        # Expenses this week
        expenses = Expense.objects.filter(
            property__user=user, paid_date__gte=week_ago, paid_date__lte=today
        ).aggregate(total=Sum('amount'))['total'] or 0
        if expenses > 0:
            property_lines.append(f"Expenses this week: €{expenses:.0f}")
    except ImportError:
        pass

    if property_lines:
        sections.append(('🏠 Properties', property_lines))

    # ── Upcoming Obligations ──
    obligation_lines = []
    try:
        from vehicles.models import VehicleObligation
        expiring = VehicleObligation.objects.filter(
            vehicle__user=user, is_current=True,
            end_date__gte=today, end_date__lte=today + timedelta(days=14)
        ).select_related('vehicle')
        for obl in expiring[:5]:
            obligation_lines.append(f"{obl.vehicle.plate_number}: {obl.get_obligation_type_display()} expires {obl.end_date}")
    except ImportError:
        pass

    try:
        from documents.models import Document
        exp_docs = Document.objects.filter(
            property__user=user,
            expiry_date__gte=today, expiry_date__lte=today + timedelta(days=14)
        ).select_related('property')
        for doc in exp_docs[:5]:
            obligation_lines.append(f"{doc.property.name}: {doc.get_document_type_display()} expires {doc.expiry_date}")
    except ImportError:
        pass

    if obligation_lines:
        sections.append(('📋 Expiring Soon', obligation_lines))

    # Build message
    if not sections:
        return None

    title = f"Weekly Summary — {week_ago.strftime('%d %b')} to {today.strftime('%d %b %Y')}"
    lines = []
    for section_title, items in sections:
        lines.append(f"\n{section_title}")
        for item in items:
            lines.append(f"  • {item}")

    return {
        'title': title,
        'message': '\n'.join(lines).strip(),
    }


@shared_task(name='notifications.weekly_summary')
def weekly_summary_notification():
    """Generate weekly summary notifications for all users. Run every Sunday."""
    users = User.objects.filter(is_active=True)
    sent = 0
    for user in users:
        try:
            summary = _build_weekly_summary(user)
            if summary:
                notify(
                    user=user,
                    notification_type='info',
                    title=summary['title'],
                    message=summary['message'],
                )
                sent += 1
        except Exception as e:
            logger.error(f'Weekly summary failed for {user.username}: {e}')
    logger.info(f'Weekly summary: sent {sent}/{users.count()} notifications')
    return {'sent': sent, 'total': users.count()}
