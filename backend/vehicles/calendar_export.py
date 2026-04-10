"""
Vehicle obligation calendar export (iCalendar format).

§PURPOSE: Export vehicle obligations as .ics file for import into
          calendar apps (Google Calendar, Apple Calendar, Outlook, etc.)

§FORMAT: RFC 5545 iCalendar format
         - Each obligation becomes an event
         - All-day event on expiration date
         - Reminder 7 days before
         - Color-coded by obligation type
         - Recurring annual obligations show as series

§USAGE: GET /api/vehicles/export-calendar/?vehicle=<id>&format=ics
        Returns .ics file for download
"""

from datetime import datetime, timedelta
from typing import List
from django.utils import timezone as _tz
from icalendar import Calendar, Event, vText


def obligation_to_event(obligation) -> Event:
    """
    Convert a VehicleObligation to an iCalendar Event.

    §LOGIC:
      - All-day event on end_date
      - Summary: "{vehicle.name} — {obligation_type} expires"
      - Description: links, policy number, provider
      - Alarm: 7 days before
      - Color: obligation-type specific
    """
    event = Event()

    # Summary
    event.add('summary', f'{obligation.vehicle.name} — {obligation.get_obligation_type_display()} expires')

    # Description
    desc_lines = []
    if obligation.vehicle.plate_number:
        desc_lines.append(f"Plate: {obligation.vehicle.plate_number}")
    if obligation.policy_number:
        desc_lines.append(f"Policy: {obligation.policy_number}")
    if obligation.provider:
        desc_lines.append(f"Provider: {obligation.provider}")
    if obligation.notes:
        desc_lines.append(f"Notes: {obligation.notes}")

    event.add('description', '\n'.join(desc_lines) if desc_lines else '')

    # Date: all-day event on end_date
    event.add('dtstart', obligation.end_date)
    event.add('dtend', obligation.end_date + timedelta(days=1))  # All-day events end next day

    # Unique ID
    event.add('uid', f'obligation-{obligation.id}@domapp.local')

    # Created/updated timestamps
    event.add('dtstamp', _tz.now())
    event.add('created', obligation.created_at if hasattr(obligation, 'created_at') else _tz.now())
    event.add('last-modified', obligation.updated_at if hasattr(obligation, 'updated_at') else _tz.now())

    # Alarm: 7 days before
    from icalendar import Alarm
    alarm = Alarm()
    alarm.add('action', 'DISPLAY')
    alarm.add('description', f'{obligation.vehicle.name} — {obligation.get_obligation_type_display()} expires in 7 days')
    alarm.add('trigger', timedelta(days=-7))
    event.add_component(alarm)

    # Category by obligation type (for color coding)
    category_map = {
        'mtpl': 'Insurance',
        'kasko': 'Insurance',
        'vignette': 'Tax',
        'mot': 'Inspection',
        'vehicle_tax': 'Tax',
        'green_card': 'Insurance',
        'assistance': 'Insurance',
        'custom': 'Other',
    }
    event.add('categories', [category_map.get(obligation.obligation_type, 'Other')])

    # Status
    event.add('status', 'CONFIRMED')

    return event


def export_calendar(obligations: List) -> str:
    """
    Export a list of VehicleObligation to iCalendar format.

    Returns: iCalendar .ics string
    """
    cal = Calendar()
    cal.add('prodid', '-//DomApp//Vehicle Obligations//EN')
    cal.add('version', '2.0')
    cal.add('calscale', 'GREGORIAN')
    cal.add('method', 'PUBLISH')
    cal.add('x-wr-calname', 'Vehicle Obligations')
    cal.add('x-wr-timezone', 'UTC')
    cal.add('x-wr-caldesc', 'Vehicle insurance, tax, MOT, and other recurring obligations')

    # Add events
    for obligation in obligations:
        event = obligation_to_event(obligation)
        cal.add_component(event)

    return cal.to_ical().decode('utf-8')


def export_calendar_for_vehicle(vehicle) -> str:
    """
    Export all obligations for a single vehicle.
    """
    obligations = vehicle.vehicleobligation_set.all().order_by('end_date')
    return export_calendar(obligations)


def export_calendar_for_user(user) -> str:
    """
    Export all obligations for all of user's vehicles.
    """
    from .models import VehicleObligation
    obligations = VehicleObligation.objects.filter(
        vehicle__user=user
    ).order_by('vehicle__name', 'end_date')
    return export_calendar(obligations)
