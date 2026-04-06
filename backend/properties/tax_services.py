"""
# ═══ PROPERTY TAX SERVICE LAYER ═══
# Business logic for tax reminders, country presets, and compliance.
# Follows the VehicleObligation service pattern.
"""

from datetime import timedelta
from django.utils import timezone

from .tax_models import PropertyTax, TaxReminder, COUNTRY_TAX_PRESETS
from notifications.services import notify


def sync_reminders(tax):
    """
    Rebuild reminder records for a tax based on its reminder_days and due_date.
    Called after tax create/update. Idempotent.
    """
    if not tax.due_date or not tax.is_current or tax.is_paid:
        return

    days = tax.reminder_days or tax.get_default_reminder_days()

    # Delete unsent reminders (preserve already-sent ones)
    TaxReminder.objects.filter(tax=tax, sent=False).delete()

    today = timezone.now().date()
    for d in days:
        remind_at = tax.due_date - timedelta(days=d)
        if remind_at < today:
            continue
        if TaxReminder.objects.filter(tax=tax, remind_at=remind_at, sent=True).exists():
            continue
        TaxReminder.objects.create(tax=tax, remind_at=remind_at)


def create_country_presets(prop):
    """
    Create tax entries based on the property's country.
    Returns list of created PropertyTax objects.
    """
    country = prop.country
    presets = COUNTRY_TAX_PRESETS.get(country, [])
    created = []

    for preset in presets:
        # Skip if this tax type already exists for this property
        if PropertyTax.objects.filter(
            property=prop, tax_type=preset['tax_type'], is_current=True
        ).exists():
            continue

        tax = PropertyTax.objects.create(
            property=prop,
            tax_type=preset['tax_type'],
            frequency=preset['frequency'],
            helper_text=preset.get('helper_text', ''),
            authority=preset.get('authority_hint', ''),
            reminder_days=[30, 7, 1],
            is_current=True,
        )
        created.append(tax)

    return created


def mark_paid(tax, paid_until=None):
    """Mark a tax as paid for the current period."""
    tax.is_paid = True
    if paid_until:
        tax.paid_until = paid_until
    tax.save(update_fields=['is_paid', 'paid_until', 'updated_at'])
    # Clear pending reminders
    TaxReminder.objects.filter(tax=tax, sent=False).delete()


def check_and_send_reminders():
    """
    Daily task: find all pending tax reminders and fire notifications.
    Same pattern as vehicles.
    """
    today = timezone.now().date()
    pending = (
        TaxReminder.objects
        .filter(remind_at__lte=today, sent=False)
        .select_related('tax__property__user', 'tax__property')
    )

    sent_count = 0
    for reminder in pending:
        tax = reminder.tax
        prop = tax.property
        user = prop.user
        days_left = (tax.due_date - today).days if tax.due_date else 0

        tax_name = tax.get_display_name()
        if days_left <= 0:
            title = f'{tax_name} — просрочен!'
            message = f'{tax_name} за {prop.name} е просрочен (краен срок: {tax.due_date}).'
            notif_type = 'tax_overdue'
        elif days_left <= 7:
            title = f'{tax_name} — изтича скоро!'
            message = f'{tax_name} за {prop.name} е дължим след {days_left} дни ({tax.due_date}).'
            notif_type = 'tax_due_soon'
        else:
            title = f'{tax_name} — напомняне'
            message = f'{tax_name} за {prop.name} е дължим на {tax.due_date} (след {days_left} дни).'
            notif_type = 'tax_reminder'

        notification = notify(
            user=user,
            notification_type=notif_type,
            title=title,
            message=message,
            related_property=prop,
            related_object_id=tax.id,
        )

        reminder.sent = True
        reminder.sent_at = timezone.now()
        reminder.notification_id = notification.id
        reminder.save(update_fields=['sent', 'sent_at', 'notification_id'])
        sent_count += 1

    return sent_count


def get_tax_summary(user):
    """
    Tax compliance summary across all properties.
    """
    today = timezone.now().date()
    soon = today + timedelta(days=30)

    taxes = PropertyTax.objects.filter(
        property__user=user,
        is_current=True,
    ).select_related('property')

    total = taxes.count()
    overdue = taxes.filter(due_date__lt=today, is_paid=False).count()
    due_soon = taxes.filter(due_date__gte=today, due_date__lte=soon, is_paid=False).count()
    paid = taxes.filter(is_paid=True).count()
    upcoming = taxes.filter(due_date__gt=soon, is_paid=False).count()

    # Annual cost estimate
    annual_total = 0
    for tax in taxes.filter(amount__isnull=False):
        amount = float(tax.amount)
        freq_multiplier = {
            'monthly': 12,
            'quarterly': 4,
            'biannual': 2,
            'annual': 1,
            'one_time': 0,
        }
        annual_total += amount * freq_multiplier.get(tax.frequency, 1)

    return {
        'total': total,
        'overdue': overdue,
        'due_soon': due_soon,
        'paid': paid,
        'upcoming': upcoming,
        'annual_estimate': round(annual_total, 2),
    }
