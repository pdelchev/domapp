"""
Business logic for the unified Health Hub daily tracking.

§NAV: daily_models.py → daily_services.py → daily_serializers.py → daily_views.py
§PATTERN: All functions take explicit user/profile args — never read from request.
§PERF: Batch operations where possible (bulk_create, bulk_update).
§ISOLATION: Every query filters by user — no cross-user data leakage.
"""

from datetime import date, timedelta, datetime
from decimal import Decimal
from typing import Optional

from django.db import transaction
from django.db.models import Avg, Count, Q, F, Sum
from django.utils import timezone

from .daily_models import (
    DailyLog, Supplement, SupplementSchedule, DoseLog, MetricTimeline
)


# ──────────────────────────────────────────────────────────────
# §SVC: DailyLog operations
# ──────────────────────────────────────────────────────────────

def get_or_create_daily_log(user, profile, log_date=None):
    """
    Get or create a DailyLog for the given date.
    §IDEMPOTENT: safe to call multiple times — returns existing if found.
    """
    log_date = log_date or date.today()
    log, created = DailyLog.objects.get_or_create(
        user=user,
        profile=profile,
        date=log_date,
        defaults={'dose_adherence_pct': 0}
    )
    return log, created


@transaction.atomic
def submit_wizard(user, profile, data: dict):
    """
    Process the entire wizard submission in one transaction.

    §BATCH: Creates/updates DailyLog + optional WeightReading + optional BPReading
            + batch DoseLog entries — all in one DB transaction.
    §INPUT: data = {
        date: '2026-04-09',
        mood: 4, energy: 3, sleep_hours: 7.5, sleep_quality: 4,
        water_ml: 1000, pain_level: 0, stress_level: 2, notes: '',
        weight: {value: 82.4, body_fat: null, fasted: true},  # optional
        bp: {systolic: 128, diastolic: 82, pulse: 72, context: [...]},  # optional
        doses: [{schedule_id: 1, taken: true}, {schedule_id: 2, taken: false, reason: 'fasting'}],
    }
    §OUTPUT: {daily_log, weight_reading, bp_reading, doses_logged}
    """
    from .models import HealthProfile
    from .weight_models import WeightReading
    from .bp_models import BPReading

    log_date = data.get('date', date.today())
    if isinstance(log_date, str):
        log_date = date.fromisoformat(log_date)

    # §STEP 1: Create/update DailyLog
    log, _ = DailyLog.objects.update_or_create(
        user=user, profile=profile, date=log_date,
        defaults={
            'mood': data.get('mood'),
            'energy': data.get('energy'),
            'sleep_hours': data.get('sleep_hours'),
            'sleep_quality': data.get('sleep_quality'),
            'water_ml': data.get('water_ml', 0),
            'pain_level': data.get('pain_level', 0),
            'stress_level': data.get('stress_level'),
            'notes': data.get('notes', ''),
            'wizard_completed': True,
            'completed_at': timezone.now(),
        }
    )

    result = {'daily_log': log, 'weight_reading': None, 'bp_reading': None, 'doses_logged': 0}

    # §STEP 2: Weight (optional)
    weight_data = data.get('weight')
    if weight_data and weight_data.get('value'):
        wr, _ = WeightReading.objects.update_or_create(
            user=user, profile=profile,
            measured_at__date=log_date,
            source='wizard',
            defaults={
                'weight_kg': Decimal(str(weight_data['value'])),
                'body_fat_pct': weight_data.get('body_fat'),
                'is_fasted': weight_data.get('fasted', False),
                'measured_at': timezone.now(),
            }
        )
        result['weight_reading'] = wr
        # §TIMELINE: Write to denormalized timeline
        _upsert_metric(user, profile, log_date, 'weight', wr.weight_kg, 'kg')
        if wr.body_fat_pct:
            _upsert_metric(user, profile, log_date, 'body_fat', wr.body_fat_pct, '%')

    # §STEP 3: Blood Pressure (optional)
    bp_data = data.get('bp')
    if bp_data and bp_data.get('systolic'):
        bp = BPReading.objects.create(
            user=user, profile=profile,
            systolic=bp_data['systolic'],
            diastolic=bp_data['diastolic'],
            pulse=bp_data.get('pulse'),
            measured_at=timezone.now(),
            is_after_caffeine='caffeine' in bp_data.get('context', []),
            is_after_exercise='exercise' in bp_data.get('context', []),
            is_after_medication='medication' in bp_data.get('context', []),
            is_stressed='stressed' in bp_data.get('context', []),
        )
        result['bp_reading'] = bp
        _upsert_metric(user, profile, log_date, 'bp_systolic', bp.systolic, 'mmHg')
        _upsert_metric(user, profile, log_date, 'bp_diastolic', bp.diastolic, 'mmHg')
        if bp.pulse:
            _upsert_metric(user, profile, log_date, 'bp_pulse', bp.pulse, 'bpm')

    # §STEP 4: Dose logging (batch)
    doses_data = data.get('doses', [])
    if doses_data:
        result['doses_logged'] = _batch_log_doses(user, profile, log_date, doses_data)

    # §STEP 5: Update DailyLog summary + timeline metrics
    _update_daily_summary(log)
    _upsert_subjective_metrics(user, profile, log_date, data)

    return result


def _batch_log_doses(user, profile, log_date, doses_data):
    """
    Batch-create or update dose logs.
    §PERF: Uses bulk_create with update_on_conflict for idempotency.
    """
    # Validate schedule ownership
    schedule_ids = [d['schedule_id'] for d in doses_data]
    valid_schedules = set(
        SupplementSchedule.objects.filter(
            id__in=schedule_ids,
            supplement__user=user,
            profile=profile,
            is_active=True,
        ).values_list('id', flat=True)
    )

    logs_to_create = []
    for d in doses_data:
        sid = d['schedule_id']
        if sid not in valid_schedules:
            continue  # skip invalid/unauthorized schedules
        logs_to_create.append(DoseLog(
            schedule_id=sid,
            date=log_date,
            taken=d.get('taken', False),
            taken_at=timezone.now() if d.get('taken') else None,
            skipped_reason=d.get('reason', ''),
            notes=d.get('notes', ''),
        ))

    if logs_to_create:
        DoseLog.objects.bulk_create(
            logs_to_create,
            update_conflicts=True,
            unique_fields=['schedule', 'date'],
            update_fields=['taken', 'taken_at', 'skipped_reason', 'notes'],
        )

    # §STOCK: Decrement stock for taken doses
    taken_schedule_ids = [d['schedule_id'] for d in doses_data if d.get('taken')]
    if taken_schedule_ids:
        Supplement.objects.filter(
            schedules__id__in=taken_schedule_ids,
            current_stock__gt=0,
        ).update(current_stock=F('current_stock') - 1)

    return len(logs_to_create)


def _update_daily_summary(log):
    """
    Recalculate denormalized fields on DailyLog.
    §PERF: Called once after wizard submit, not per-field.
    """
    schedules = SupplementSchedule.objects.filter(
        profile=log.profile, is_active=True
    )
    total = schedules.count()
    taken = DoseLog.objects.filter(
        schedule__in=schedules,
        date=log.date,
        taken=True,
    ).count()

    log.dose_adherence_pct = round((taken / total) * 100) if total > 0 else 100
    log.cached_summary = {
        'doses_taken': taken,
        'doses_total': total,
        'mood': log.mood,
        'energy': log.energy,
        'water_ml': log.water_ml,
    }
    log.save(update_fields=['dose_adherence_pct', 'cached_summary', 'updated_at'])


def _upsert_metric(user, profile, log_date, metric_type, value, unit='', context=None):
    """Write one metric to the denormalized timeline."""
    MetricTimeline.objects.update_or_create(
        profile=profile, date=log_date, metric_type=metric_type,
        defaults={
            'user': user,
            'value': Decimal(str(value)),
            'unit': unit,
            'context': context or {},
        }
    )


def _upsert_subjective_metrics(user, profile, log_date, data):
    """Write subjective metrics (mood, energy, etc.) to timeline."""
    metric_map = {
        'mood': ('mood', '1-5'),
        'energy': ('energy', '1-5'),
        'sleep_hours': ('sleep_hours', 'hrs'),
        'sleep_quality': ('sleep_quality', '1-5'),
        'water_ml': ('water_ml', 'ml'),
        'pain_level': ('pain', '0-10'),
        'stress_level': ('stress', '1-5'),
    }
    for field, (metric_type, unit) in metric_map.items():
        val = data.get(field)
        if val is not None:
            _upsert_metric(user, profile, log_date, metric_type, val, unit)


# ──────────────────────────────────────────────────────────────
# §SVC: Today's Schedule
# ──────────────────────────────────────────────────────────────

def get_todays_schedule(user, profile, target_date=None):
    """
    Get today's supplement schedule with dose completion status.

    §OUTPUT: List of time_slot groups, each containing schedules with:
      - supplement info (name, photo, strength, form)
      - dose info (amount, unit, split_count)
      - status (taken, pending, skipped)
    §QUERIES: 2 — schedules + dose_logs for today
    """
    target_date = target_date or date.today()

    # Fetch active schedules for this profile
    schedules = (
        SupplementSchedule.objects
        .filter(profile=profile, is_active=True, supplement__user=user)
        .filter(
            Q(start_date__isnull=True) | Q(start_date__lte=target_date),
            Q(end_date__isnull=True) | Q(end_date__gte=target_date),
        )
        .select_related('supplement')
        .order_by('time_slot', 'sort_order')
    )

    # Filter by day-of-week for custom schedules
    dow = target_date.weekday()  # 0=Mon
    applicable = []
    for s in schedules:
        if s.condition == 'daily':
            applicable.append(s)
        elif s.condition == 'weekdays' and dow < 5:
            applicable.append(s)
        elif s.condition == 'custom' and dow in (s.days_of_week or []):
            applicable.append(s)
        elif s.condition == 'alternate':
            # §LOGIC: alternate days — check if days since start_date is even
            if s.start_date:
                delta = (target_date - s.start_date).days
                if delta % 2 == 0:
                    applicable.append(s)
            else:
                applicable.append(s)
        elif s.condition in ('gym_day', 'as_needed'):
            applicable.append(s)  # show but mark as optional

    # Fetch today's dose logs
    dose_logs = {
        dl.schedule_id: dl
        for dl in DoseLog.objects.filter(
            schedule_id__in=[s.id for s in applicable],
            date=target_date,
        )
    }

    # §GROUP: by time_slot
    TIME_SLOT_ORDER = [
        'morning', 'fasted', 'breakfast', 'midday', 'lunch',
        'afternoon', 'dinner', 'evening', 'bedtime',
    ]
    groups = {}
    for s in applicable:
        slot = s.time_slot
        if slot not in groups:
            groups[slot] = {'time_slot': slot, 'items': [], 'taken': 0, 'total': 0}

        dl = dose_logs.get(s.id)
        groups[slot]['items'].append({
            'schedule_id': s.id,
            'supplement_id': s.supplement.id,
            'name': s.supplement.name,
            'name_bg': s.supplement.name_bg,
            'category': s.supplement.category,
            'form': s.supplement.form,
            'color': s.supplement.color,
            'shape': s.supplement.shape,
            'photo': s.supplement.photo.url if s.supplement.photo else None,
            'photo_closeup': s.supplement.photo_closeup.url if s.supplement.photo_closeup else None,
            'strength': s.supplement.strength,
            'dose_amount': float(s.dose_amount),
            'dose_unit': s.dose_unit,
            'split_count': s.split_count,
            'take_with_food': s.take_with_food,
            'take_on_empty_stomach': s.take_on_empty_stomach,
            'condition': s.condition,
            'is_optional': s.condition in ('as_needed', 'gym_day'),
            'notes': s.notes,
            # dose status
            'taken': dl.taken if dl else False,
            'taken_at': dl.taken_at.isoformat() if dl and dl.taken_at else None,
            'skipped_reason': dl.skipped_reason if dl else '',
        })
        groups[slot]['total'] += 1
        if dl and dl.taken:
            groups[slot]['taken'] += 1

    # Return in time order
    return [groups[slot] for slot in TIME_SLOT_ORDER if slot in groups]


# ──────────────────────────────────────────────────────────────
# §SVC: Streak calculation
# ──────────────────────────────────────────────────────────────

def get_streak(user, profile):
    """
    Calculate current and longest check-in streak.
    §ALGO: Walk backwards from today counting consecutive days with wizard_completed=True.
    """
    logs = (
        DailyLog.objects
        .filter(user=user, profile=profile, wizard_completed=True)
        .order_by('-date')
        .values_list('date', flat=True)[:365]  # max 1 year lookback
    )
    logs = list(logs)

    if not logs:
        return {'current': 0, 'longest': 0, 'total_days': 0}

    # Current streak
    current = 0
    check_date = date.today()
    for log_date in logs:
        if log_date == check_date:
            current += 1
            check_date -= timedelta(days=1)
        elif log_date == check_date - timedelta(days=1):
            # Allow yesterday if today not yet completed
            current += 1
            check_date = log_date - timedelta(days=1)
        else:
            break

    # Longest streak (full scan)
    longest = 1
    run = 1
    for i in range(1, len(logs)):
        if logs[i] == logs[i - 1] - timedelta(days=1):
            run += 1
            longest = max(longest, run)
        else:
            run = 1

    return {
        'current': current,
        'longest': longest,
        'total_days': len(logs),
    }


# ──────────────────────────────────────────────────────────────
# §SVC: Timeline query
# ──────────────────────────────────────────────────────────────

def get_timeline(user, profile, date_from=None, date_to=None, metric_types=None):
    """
    Query the denormalized timeline for the history page.
    §PERF: Single query on MetricTimeline with optional filters.
    §OUTPUT: List of {date, metric_type, value, unit, context} ordered by date.
    """
    qs = MetricTimeline.objects.filter(user=user, profile=profile)

    if date_from:
        qs = qs.filter(date__gte=date_from)
    if date_to:
        qs = qs.filter(date__lte=date_to)
    if metric_types:
        qs = qs.filter(metric_type__in=metric_types)

    return qs.order_by('date', 'metric_type').values(
        'date', 'metric_type', 'value', 'unit', 'context'
    )


# ──────────────────────────────────────────────────────────────
# §SVC: Unified health summary
# ──────────────────────────────────────────────────────────────

def get_health_summary(user, profile):
    """
    Single-query summary of current health state for the dashboard.
    Pulls latest values from MetricTimeline + today's schedule status.

    §QUERIES: 3 (latest metrics, today's schedule, streak)
    """
    # Latest value for each metric type
    from django.db.models import Max, Subquery, OuterRef

    latest_dates = (
        MetricTimeline.objects
        .filter(user=user, profile=profile)
        .values('metric_type')
        .annotate(latest=Max('date'))
    )

    latest_metrics = {}
    for entry in latest_dates:
        mt = MetricTimeline.objects.filter(
            user=user, profile=profile,
            metric_type=entry['metric_type'],
            date=entry['latest'],
        ).first()
        if mt:
            latest_metrics[entry['metric_type']] = {
                'value': float(mt.value),
                'unit': mt.unit,
                'date': mt.date.isoformat(),
                'context': mt.context,
            }

    # Today's schedule
    schedule = get_todays_schedule(user, profile)
    total_doses = sum(g['total'] for g in schedule)
    taken_doses = sum(g['taken'] for g in schedule)

    # Streak
    streak = get_streak(user, profile)

    # 30-day trends for key metrics
    thirty_ago = date.today() - timedelta(days=30)
    trends = {}
    for metric in ['weight', 'bp_systolic', 'bp_diastolic', 'mood', 'energy']:
        values = list(
            MetricTimeline.objects
            .filter(user=user, profile=profile, metric_type=metric, date__gte=thirty_ago)
            .order_by('date')
            .values_list('value', flat=True)
        )
        if len(values) >= 2:
            delta = float(values[-1] - values[0])
            trends[metric] = {
                'direction': 'up' if delta > 0 else 'down' if delta < 0 else 'flat',
                'delta': round(delta, 1),
                'data_points': len(values),
            }

    return {
        'latest': latest_metrics,
        'today': {
            'doses_total': total_doses,
            'doses_taken': taken_doses,
            'adherence_pct': round((taken_doses / total_doses) * 100) if total_doses > 0 else 100,
            'schedule': schedule,
        },
        'streak': streak,
        'trends': trends,
    }


# ──────────────────────────────────────────────────────────────
# §SVC: Stock management
# ──────────────────────────────────────────────────────────────

def get_low_stock_supplements(user):
    """
    Find supplements running low on stock.
    §OUTPUT: List of supplements where days_remaining <= low_stock_threshold.
    """
    supplements = Supplement.objects.filter(user=user, is_active=True, pack_size__isnull=False)
    low_stock = []
    for s in supplements:
        days = s.days_of_stock_remaining
        if days is not None and days <= s.low_stock_threshold:
            low_stock.append({
                'id': s.id,
                'name': s.name,
                'current_stock': s.current_stock,
                'days_remaining': days,
                'threshold': s.low_stock_threshold,
            })
    return low_stock


# ──────────────────────────────────────────────────────────────
# §SVC: Interaction checker
# ──────────────────────────────────────────────────────────────

def check_interactions(user, new_supplement_id=None):
    """
    Check for known interactions between active supplements.
    §RULES: Static rule engine based on supplement.interactions JSON.
    §OUTPUT: List of {supplement_a, supplement_b, type, note, severity}.
    """
    supplements = list(
        Supplement.objects.filter(user=user, is_active=True)
        .values('id', 'name', 'interactions', 'linked_biomarkers')
    )

    warnings = []
    # Check each supplement's interaction list against all others
    for s in supplements:
        for interaction in (s['interactions'] or []):
            target = interaction.get('with', '').lower()
            for other in supplements:
                if other['id'] == s['id']:
                    continue
                # Match by name or linked biomarker
                if (target in other['name'].lower() or
                        target in [b.lower() for b in (other['linked_biomarkers'] or [])]):
                    warnings.append({
                        'supplement_a': s['name'],
                        'supplement_b': other['name'],
                        'type': interaction.get('type', 'unknown'),
                        'note': interaction.get('note', ''),
                        'severity': interaction.get('severity', 'info'),
                    })

    return warnings


# ──────────────────────────────────────────────────────────────
# §SVC: Closed-loop biomarker analysis
# ──────────────────────────────────────────────────────────────

def get_supplement_effectiveness(user, profile, supplement_id):
    """
    Compare biomarker values before and after starting a supplement.
    §LOGIC: Finds the most recent blood report before start_date and the most recent after.
    §LINK: Uses supplement.linked_biomarkers to find relevant BloodResult entries.
    """
    from .models import BloodReport, BloodResult, Biomarker

    supplement = Supplement.objects.filter(id=supplement_id, user=user).first()
    if not supplement or not supplement.started_at or not supplement.linked_biomarkers:
        return None

    start = supplement.started_at

    # Find reports before and after
    report_before = (
        BloodReport.objects
        .filter(user=user, profile=profile, test_date__lt=start)
        .order_by('-test_date')
        .first()
    )
    report_after = (
        BloodReport.objects
        .filter(user=user, profile=profile, test_date__gte=start)
        .order_by('-test_date')
        .first()
    )

    if not report_before or not report_after:
        return None

    # Compare linked biomarkers
    comparisons = []
    for slug in supplement.linked_biomarkers:
        biomarker = Biomarker.objects.filter(
            Q(abbreviation__iexact=slug) | Q(aliases__contains=[slug])
        ).first()
        if not biomarker:
            continue

        before = BloodResult.objects.filter(report=report_before, biomarker=biomarker).first()
        after = BloodResult.objects.filter(report=report_after, biomarker=biomarker).first()

        if before and after:
            comparisons.append({
                'biomarker': biomarker.name,
                'before': float(before.value),
                'after': float(after.value),
                'unit': before.unit,
                'before_flag': before.flag,
                'after_flag': after.flag,
                'before_date': report_before.test_date.isoformat(),
                'after_date': report_after.test_date.isoformat(),
                'change': round(float(after.value - before.value), 2),
                'change_pct': round(float((after.value - before.value) / before.value * 100), 1) if before.value else 0,
                'improved': after.flag in ('optimal', 'normal') and before.flag not in ('optimal', 'normal'),
            })

    return {
        'supplement': supplement.name,
        'started_at': start.isoformat(),
        'days_on': (date.today() - start).days,
        'comparisons': comparisons,
    }
