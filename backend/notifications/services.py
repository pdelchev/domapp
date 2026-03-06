"""
Notification creation helpers.
Call these from views/tasks when events occur.
"""
from .models import Notification


def notify(user, notification_type, title, message, related_property=None, related_object_id=None):
    """Create a notification for a user."""
    return Notification.objects.create(
        user=user,
        type=notification_type,
        title=title,
        message=message,
        related_property=related_property,
        related_object_id=related_object_id,
    )


def notify_overdue(user, payment):
    """Create an overdue rent notification."""
    prop = payment.lease.property
    return notify(
        user=user,
        notification_type='overdue',
        title=f'Overdue: {payment.lease.tenant.full_name}',
        message=f'Payment of {payment.amount_due} EUR for {prop.name} was due on {payment.due_date}.',
        related_property=prop,
        related_object_id=payment.id,
    )


def notify_rent_due(user, payment):
    """Create a rent due notification."""
    prop = payment.lease.property
    return notify(
        user=user,
        notification_type='rent_due',
        title=f'Rent due: {payment.lease.tenant.full_name}',
        message=f'Payment of {payment.amount_due} EUR for {prop.name} is due on {payment.due_date}.',
        related_property=prop,
        related_object_id=payment.id,
    )


def notify_lease_expiry(user, lease):
    """Create a lease expiry notification."""
    prop = lease.property
    return notify(
        user=user,
        notification_type='lease_expiry',
        title=f'Lease expiring: {lease.tenant.full_name}',
        message=f'Lease for {prop.name} expires on {lease.end_date}.',
        related_property=prop,
        related_object_id=lease.id,
    )


def notify_document_expiry(user, document):
    """Create a document expiry notification."""
    prop = document.property
    return notify(
        user=user,
        notification_type='document_expiry',
        title=f'Document expiring: {document.get_document_type_display()}',
        message=f'{document.get_document_type_display()} for {prop.name} expires on {document.expiry_date}.',
        related_property=prop,
        related_object_id=document.id,
    )


def notify_payment_received(user, payment):
    """Create a payment received notification."""
    prop = payment.lease.property
    return notify(
        user=user,
        notification_type='payment_received',
        title=f'Payment received: {payment.lease.tenant.full_name}',
        message=f'{payment.amount_paid} EUR received for {prop.name}.',
        related_property=prop,
        related_object_id=payment.id,
    )
