# ── health/bp_services.py ─────────────────────────────────────────────
# Business logic for blood pressure tracking: classification, statistics,
# pattern detection, risk assessment, alerting, and recommendations.
#
# §NAV: bp_models → bp_serializers → bp_views → bp_urls → [bp_services]
# §FLOW: reading saved → classify_bp → check_alerts → (dashboard refreshes stats)
#
# This is the "brain" of BP tracking — all computation happens here.

import logging
import math
from datetime import timedelta, time as dt_time
from collections import defaultdict

from django.db.models import Avg, StdDev, Min, Max, Count, Q, F
from django.utils import timezone

logger = logging.getLogger(__name__)


# ── AHA classification ──────────────────────────────────────────────

def classify_bp(systolic: int, diastolic: int) -> str:
    """
    §AHA: Classify blood pressure using American Heart Association 2017 guidelines.
    Returns stage string: 'normal', 'elevated', 'stage_1', 'stage_2', 'crisis'.

    Thresholds:
    - NORMAL: sys < 120 AND dia < 80
    - ELEVATED: 120 <= sys <= 129 AND dia < 80
    - STAGE_1: 130 <= sys <= 139 OR 80 <= dia <= 89
    - STAGE_2: sys >= 140 OR dia >= 90
    - CRISIS: sys > 180 OR dia > 120

    When systolic and diastolic fall into different categories,
    the HIGHER (worse) category is assigned per AHA guidelines.
    """
    # §CRISIS: Check hypertensive crisis first (most urgent)
    if systolic > 180 or diastolic > 120:
        return 'crisis'

    # §STAGE2: Stage 2 hypertension
    if systolic >= 140 or diastolic >= 90:
        return 'stage_2'

    # §STAGE1: Stage 1 hypertension
    if (130 <= systolic <= 139) or (80 <= diastolic <= 89):
        return 'stage_1'

    # §ELEVATED: Elevated (systolic only — diastolic still normal)
    if 120 <= systolic <= 129 and diastolic < 80:
        return 'elevated'

    # §NORMAL: Normal
    return 'normal'


# ── Simple computed values ──────────────────────────────────────────

def compute_pulse_pressure(systolic: int, diastolic: int) -> int:
    """
    §CALC: Pulse pressure = systolic - diastolic.
    Normal range: 40-60 mmHg. Wide PP (>60) indicates arterial stiffness.
    Narrow PP (<25) may indicate low cardiac output.
    """
    return systolic - diastolic


def compute_map(systolic: int, diastolic: int) -> float:
    """
    §CALC: Mean Arterial Pressure = diastolic + 1/3 * (systolic - diastolic).
    Normal range: 70-100 mmHg. MAP < 60 indicates inadequate organ perfusion.
    """
    return round(diastolic + (systolic - diastolic) / 3.0, 1)


# ── Session averaging ──────────────────────────────────────────────

def compute_session_averages(session) -> None:
    """
    §AVG: Compute and save averaged readings for a BPSession.
    Per AHA guidelines: if 3+ readings, discard the first (anxiety effect)
    and average the remaining. If 2 readings, average both.

    Updates session.avg_systolic, avg_diastolic, avg_pulse, reading_count, stage.
    """
    readings = list(session.readings.order_by('measured_at'))
    session.reading_count = len(readings)

    if not readings:
        session.avg_systolic = None
        session.avg_diastolic = None
        session.avg_pulse = None
        session.stage = 'normal'
        session.save()
        return

    # §DISCARD: Skip first reading if 3+ (elevated due to measurement anxiety)
    if len(readings) >= 3:
        readings_to_avg = readings[1:]
    else:
        readings_to_avg = readings

    count = len(readings_to_avg)
    session.avg_systolic = round(sum(r.systolic for r in readings_to_avg) / count, 1)
    session.avg_diastolic = round(sum(r.diastolic for r in readings_to_avg) / count, 1)

    pulse_readings = [r.pulse for r in readings_to_avg if r.pulse is not None]
    session.avg_pulse = round(sum(pulse_readings) / len(pulse_readings), 1) if pulse_readings else None

    # §STAGE: Classify from averaged values
    session.stage = classify_bp(round(session.avg_systolic), round(session.avg_diastolic))
    session.save()


# ── Deep statistics ─────────────────────────────────────────────────

def get_bp_statistics(profile, days: int = 30) -> dict:
    """
    §STATS: Comprehensive BP statistics for a profile over N days.
    Includes averages, ranges, time-of-day patterns, variability metrics,
    stage distribution, and linear regression trends.

    Returns dict with all computed metrics.
    """
    from .bp_models import BPReading

    cutoff = timezone.now() - timedelta(days=days)
    readings = BPReading.objects.filter(
        profile=profile,
        measured_at__gte=cutoff,
    ).order_by('measured_at')

    count = readings.count()
    if count == 0:
        return {
            'reading_count': 0,
            'avg_sys': None, 'avg_dia': None, 'avg_pulse': None,
            'min_sys': None, 'max_sys': None, 'min_dia': None, 'max_dia': None,
            'morning_avg': None, 'evening_avg': None,
            'stage_distribution': {},
            'variability': None, 'coefficient_of_variation': None,
            'pulse_pressure_avg': None, 'map_avg': None,
            'trend_systolic': None, 'trend_diastolic': None,
        }

    # §AGG: Aggregate statistics via Django ORM
    agg = readings.aggregate(
        avg_sys=Avg('systolic'), avg_dia=Avg('diastolic'), avg_pulse=Avg('pulse'),
        min_sys=Min('systolic'), max_sys=Max('systolic'),
        min_dia=Min('diastolic'), max_dia=Max('diastolic'),
        stddev_sys=StdDev('systolic'),
    )

    # §MORNING: Morning average (5am-12pm)
    morning_agg = readings.filter(
        measured_at__time__gte=dt_time(5, 0),
        measured_at__time__lt=dt_time(12, 0),
    ).aggregate(avg_sys=Avg('systolic'), avg_dia=Avg('diastolic'))
    morning_avg = None
    if morning_agg['avg_sys'] is not None:
        morning_avg = {
            'systolic': round(morning_agg['avg_sys'], 1),
            'diastolic': round(morning_agg['avg_dia'], 1),
        }

    # §EVENING: Evening average (6pm-11pm)
    evening_agg = readings.filter(
        measured_at__time__gte=dt_time(18, 0),
        measured_at__time__lt=dt_time(23, 0),
    ).aggregate(avg_sys=Avg('systolic'), avg_dia=Avg('diastolic'))
    evening_avg = None
    if evening_agg['avg_sys'] is not None:
        evening_avg = {
            'systolic': round(evening_agg['avg_sys'], 1),
            'diastolic': round(evening_agg['avg_dia'], 1),
        }

    # §STAGE_DIST: Count readings per AHA stage
    stage_distribution = defaultdict(int)
    reading_list = list(readings.values_list('systolic', 'diastolic'))
    for sys_val, dia_val in reading_list:
        stage = classify_bp(sys_val, dia_val)
        stage_distribution[stage] += 1

    # §PP_MAP: Average pulse pressure and MAP
    pp_values = [compute_pulse_pressure(s, d) for s, d in reading_list]
    map_values = [compute_map(s, d) for s, d in reading_list]
    pp_avg = round(sum(pp_values) / len(pp_values), 1) if pp_values else None
    map_avg_val = round(sum(map_values) / len(map_values), 1) if map_values else None

    # §VARIABILITY: Standard deviation and coefficient of variation
    stddev_sys = agg['stddev_sys']
    cv = None
    if stddev_sys is not None and agg['avg_sys']:
        cv = round((stddev_sys / agg['avg_sys']) * 100, 1)

    # §TREND: Linear regression (slope per day) for systolic and diastolic
    trend_sys = _compute_linear_trend(readings, 'systolic')
    trend_dia = _compute_linear_trend(readings, 'diastolic')

    return {
        'reading_count': count,
        'avg_sys': round(agg['avg_sys'], 1) if agg['avg_sys'] else None,
        'avg_dia': round(agg['avg_dia'], 1) if agg['avg_dia'] else None,
        'avg_pulse': round(agg['avg_pulse'], 1) if agg['avg_pulse'] else None,
        'min_sys': agg['min_sys'],
        'max_sys': agg['max_sys'],
        'min_dia': agg['min_dia'],
        'max_dia': agg['max_dia'],
        'morning_avg': morning_avg,
        'evening_avg': evening_avg,
        'stage_distribution': dict(stage_distribution),
        'variability': round(stddev_sys, 1) if stddev_sys is not None else None,
        'coefficient_of_variation': cv,
        'pulse_pressure_avg': pp_avg,
        'map_avg': map_avg_val,
        'trend_systolic': trend_sys,
        'trend_diastolic': trend_dia,
    }


def _compute_linear_trend(readings_qs, field: str) -> float | None:
    """
    §REGRESSION: Simple linear regression for BP trend over time.
    Returns slope per day (positive = rising, negative = falling).
    Uses least squares: slope = (n*sum(xy) - sum(x)*sum(y)) / (n*sum(x^2) - sum(x)^2)
    where x = day offset from first reading, y = BP value.
    """
    readings = list(readings_qs.values_list('measured_at', field))
    if len(readings) < 3:
        return None

    first_time = readings[0][0]
    xs = []
    ys = []
    for measured_at, value in readings:
        day_offset = (measured_at - first_time).total_seconds() / 86400.0
        xs.append(day_offset)
        ys.append(float(value))

    n = len(xs)
    sum_x = sum(xs)
    sum_y = sum(ys)
    sum_xy = sum(x * y for x, y in zip(xs, ys))
    sum_x2 = sum(x * x for x in xs)

    denominator = n * sum_x2 - sum_x * sum_x
    if denominator == 0:
        return 0.0

    slope = (n * sum_xy - sum_x * sum_y) / denominator
    return round(slope, 3)


# ── Circadian pattern detection ─────────────────────────────────────

def detect_circadian_pattern(profile, days: int = 30) -> dict:
    """
    §CIRCADIAN: Analyze time-of-day BP patterns.
    Morning surge = morning avg systolic - nighttime avg systolic > 20 mmHg.
    Non-dipper = nighttime avg dip < 10% from daytime average.

    Time windows:
    - Morning: 5:00 - 11:59
    - Daytime: 12:00 - 17:59
    - Evening: 18:00 - 22:59
    - Nighttime: 23:00 - 4:59
    """
    from .bp_models import BPReading

    cutoff = timezone.now() - timedelta(days=days)
    readings = BPReading.objects.filter(
        profile=profile,
        measured_at__gte=cutoff,
    )

    def _avg_for_times(qs, start_hour, end_hour):
        """Average BP for readings in a time window."""
        if start_hour < end_hour:
            filtered = qs.filter(
                measured_at__time__gte=dt_time(start_hour, 0),
                measured_at__time__lt=dt_time(end_hour, 0),
            )
        else:
            # Spans midnight (e.g., 23:00-4:59)
            filtered = qs.filter(
                Q(measured_at__time__gte=dt_time(start_hour, 0)) |
                Q(measured_at__time__lt=dt_time(end_hour, 0))
            )
        agg = filtered.aggregate(
            avg_sys=Avg('systolic'), avg_dia=Avg('diastolic'), count=Count('id'),
        )
        if agg['avg_sys'] is None:
            return None
        return {
            'avg_sys': round(agg['avg_sys'], 1),
            'avg_dia': round(agg['avg_dia'], 1),
            'count': agg['count'],
        }

    morning = _avg_for_times(readings, 5, 12)
    daytime = _avg_for_times(readings, 12, 18)
    evening = _avg_for_times(readings, 18, 23)
    nighttime = _avg_for_times(readings, 23, 5)

    # §SURGE: Morning surge detection
    has_morning_surge = False
    surge_magnitude = None
    if morning and nighttime:
        surge_magnitude = round(morning['avg_sys'] - nighttime['avg_sys'], 1)
        has_morning_surge = surge_magnitude > 20

    # §DIPPER: Non-dipper detection (nighttime dip < 10% of daytime)
    is_non_dipper = False
    if daytime and nighttime and daytime['avg_sys'] > 0:
        dip_pct = ((daytime['avg_sys'] - nighttime['avg_sys']) / daytime['avg_sys']) * 100
        is_non_dipper = dip_pct < 10

    return {
        'morning_avg_sys': morning['avg_sys'] if morning else None,
        'morning_avg_dia': morning['avg_dia'] if morning else None,
        'evening_avg_sys': evening['avg_sys'] if evening else None,
        'evening_avg_dia': evening['avg_dia'] if evening else None,
        'nighttime_avg_sys': nighttime['avg_sys'] if nighttime else None,
        'nighttime_avg_dia': nighttime['avg_dia'] if nighttime else None,
        'has_morning_surge': has_morning_surge,
        'surge_magnitude': surge_magnitude,
        'is_non_dipper': is_non_dipper,
        'morning_count': morning['count'] if morning else 0,
        'evening_count': evening['count'] if evening else 0,
        'nighttime_count': nighttime['count'] if nighttime else 0,
    }


# ── White coat hypertension detection ───────────────────────────────

def detect_white_coat(profile) -> dict:
    """
    §WHITECOAT: Detect white coat hypertension.
    Defined as: clinic readings consistently higher than home readings.
    Threshold: clinic avg systolic > home avg systolic by >= 20 mmHg.

    Requires at least 5 clinic and 5 home readings for reliable detection.
    """
    from .bp_models import BPReading

    clinic_agg = BPReading.objects.filter(
        profile=profile,
        is_clinic_reading=True,
    ).aggregate(
        avg_sys=Avg('systolic'), avg_dia=Avg('diastolic'), count=Count('id'),
    )

    home_agg = BPReading.objects.filter(
        profile=profile,
        is_clinic_reading=False,
    ).aggregate(
        avg_sys=Avg('systolic'), avg_dia=Avg('diastolic'), count=Count('id'),
    )

    clinic_count = clinic_agg['count'] or 0
    home_count = home_agg['count'] or 0

    if clinic_count < 5 or home_count < 5:
        return {
            'detected': False,
            'clinic_avg': None,
            'home_avg': None,
            'difference': None,
            'insufficient_data': True,
            'clinic_count': clinic_count,
            'home_count': home_count,
        }

    clinic_avg = {'systolic': round(clinic_agg['avg_sys'], 1), 'diastolic': round(clinic_agg['avg_dia'], 1)}
    home_avg = {'systolic': round(home_agg['avg_sys'], 1), 'diastolic': round(home_agg['avg_dia'], 1)}
    difference = round(clinic_avg['systolic'] - home_avg['systolic'], 1)

    return {
        'detected': difference >= 20,
        'clinic_avg': clinic_avg,
        'home_avg': home_avg,
        'difference': difference,
        'insufficient_data': False,
        'clinic_count': clinic_count,
        'home_count': home_count,
    }


# ── Masked hypertension detection ──────────────────────────────────

def detect_masked_hypertension(profile) -> dict:
    """
    §MASKED: Detect masked hypertension.
    Defined as: normal clinic readings but elevated home readings.
    Home avg systolic >= 130 while clinic avg systolic < 130.

    Requires at least 5 clinic and 5 home readings.
    """
    from .bp_models import BPReading

    clinic_agg = BPReading.objects.filter(
        profile=profile,
        is_clinic_reading=True,
    ).aggregate(
        avg_sys=Avg('systolic'), avg_dia=Avg('diastolic'), count=Count('id'),
    )

    home_agg = BPReading.objects.filter(
        profile=profile,
        is_clinic_reading=False,
    ).aggregate(
        avg_sys=Avg('systolic'), avg_dia=Avg('diastolic'), count=Count('id'),
    )

    clinic_count = clinic_agg['count'] or 0
    home_count = home_agg['count'] or 0

    if clinic_count < 5 or home_count < 5:
        return {
            'detected': False,
            'clinic_avg': None,
            'home_avg': None,
            'insufficient_data': True,
            'clinic_count': clinic_count,
            'home_count': home_count,
        }

    clinic_avg = {'systolic': round(clinic_agg['avg_sys'], 1), 'diastolic': round(clinic_agg['avg_dia'], 1)}
    home_avg = {'systolic': round(home_agg['avg_sys'], 1), 'diastolic': round(home_agg['avg_dia'], 1)}

    detected = (clinic_avg['systolic'] < 130 and home_avg['systolic'] >= 130)

    return {
        'detected': detected,
        'clinic_avg': clinic_avg,
        'home_avg': home_avg,
        'insufficient_data': False,
        'clinic_count': clinic_count,
        'home_count': home_count,
    }


# ── Context tag correlations ────────────────────────────────────────

def get_context_correlations(profile, min_readings: int = 30) -> list:
    """
    §CONTEXT: Analyze how context tags correlate with BP readings.
    For each tag (caffeine, exercise, stress, medication, clinic, fasting),
    computes average BP with tag present vs absent and the difference.

    Returns list of correlation dicts sorted by absolute systolic difference.
    Requires minimum total readings for reliable analysis.
    """
    from .bp_models import BPReading

    all_readings = BPReading.objects.filter(profile=profile)
    total_count = all_readings.count()

    if total_count < min_readings:
        return []

    tags = [
        ('caffeine', 'is_after_caffeine'),
        ('exercise', 'is_after_exercise'),
        ('medication', 'is_after_medication'),
        ('stress', 'is_stressed'),
        ('clinic', 'is_clinic_reading'),
        ('fasting', 'is_fasting'),
    ]

    correlations = []
    for tag_name, field_name in tags:
        with_tag = all_readings.filter(**{field_name: True}).aggregate(
            avg_sys=Avg('systolic'), avg_dia=Avg('diastolic'), count=Count('id'),
        )
        without_tag = all_readings.filter(**{field_name: False}).aggregate(
            avg_sys=Avg('systolic'), avg_dia=Avg('diastolic'), count=Count('id'),
        )

        with_count = with_tag['count'] or 0
        without_count = without_tag['count'] or 0

        if with_count < 3 or without_count < 3:
            continue

        with_avg = {
            'systolic': round(with_tag['avg_sys'], 1),
            'diastolic': round(with_tag['avg_dia'], 1),
        }
        without_avg = {
            'systolic': round(without_tag['avg_sys'], 1),
            'diastolic': round(without_tag['avg_dia'], 1),
        }
        diff = {
            'systolic': round(with_avg['systolic'] - without_avg['systolic'], 1),
            'diastolic': round(with_avg['diastolic'] - without_avg['diastolic'], 1),
        }

        correlations.append({
            'tag': tag_name,
            'with_avg': with_avg,
            'without_avg': without_avg,
            'difference': diff,
            'sample_size': {'with': with_count, 'without': without_count},
        })

    # Sort by absolute systolic difference (most impactful first)
    correlations.sort(key=lambda c: abs(c['difference']['systolic']), reverse=True)
    return correlations


# ── Cardiovascular risk assessment ──────────────────────────────────

def compute_cardiovascular_risk(profile) -> dict:
    """
    §CVR: Combined cardiovascular risk using BP data + blood biomarkers.
    Uses simplified Framingham-like scoring based on:
    - Average systolic BP (last 30 days)
    - Blood biomarkers: LDL, HDL, CRP, glucose (from latest BloodReport)
    - Age and sex (from HealthProfile)

    Returns 10-year risk percentage, risk level, contributing factors,
    and whether blood data was available.
    """
    from .bp_models import BPReading
    from .models import BloodReport, BloodResult

    # §BP: Get 30-day average BP
    cutoff = timezone.now() - timedelta(days=30)
    bp_agg = BPReading.objects.filter(
        profile=profile,
        measured_at__gte=cutoff,
    ).aggregate(avg_sys=Avg('systolic'), avg_dia=Avg('diastolic'), count=Count('id'))

    bp_count = bp_agg['count'] or 0
    if bp_count == 0:
        return {
            'risk_pct': None,
            'risk_level': None,
            'factors': [],
            'has_blood_data': False,
            'insufficient_bp_data': True,
        }

    avg_sys = bp_agg['avg_sys']
    avg_dia = bp_agg['avg_dia']

    # §BLOOD: Get latest blood biomarker values
    latest_report = (
        BloodReport.objects
        .filter(profile=profile)
        .prefetch_related('results__biomarker')
        .order_by('-test_date')
        .first()
    )

    blood_values = {}
    has_blood_data = False
    if latest_report:
        for result in latest_report.results.select_related('biomarker'):
            abbr = result.biomarker.abbreviation.upper()
            blood_values[abbr] = result.value
        has_blood_data = bool(blood_values)

    # §SCORING: Simplified Framingham-like risk calculation
    risk_points = 0
    factors = []

    # Age factor
    age = None
    if profile.date_of_birth:
        from datetime import date
        today = date.today()
        age = today.year - profile.date_of_birth.year
        if (today.month, today.day) < (profile.date_of_birth.month, profile.date_of_birth.day):
            age -= 1

        if age >= 65:
            risk_points += 8
            factors.append({'factor': 'age', 'detail': f'Age {age} (65+)', 'points': 8})
        elif age >= 55:
            risk_points += 5
            factors.append({'factor': 'age', 'detail': f'Age {age} (55-64)', 'points': 5})
        elif age >= 45:
            risk_points += 3
            factors.append({'factor': 'age', 'detail': f'Age {age} (45-54)', 'points': 3})

    # Sex factor (male sex adds baseline risk)
    if profile.sex == 'male':
        risk_points += 2
        factors.append({'factor': 'sex', 'detail': 'Male sex', 'points': 2})

    # Systolic BP factor
    if avg_sys >= 160:
        risk_points += 8
        factors.append({'factor': 'bp_systolic', 'detail': f'Avg systolic {avg_sys:.0f} (>=160)', 'points': 8})
    elif avg_sys >= 140:
        risk_points += 5
        factors.append({'factor': 'bp_systolic', 'detail': f'Avg systolic {avg_sys:.0f} (140-159)', 'points': 5})
    elif avg_sys >= 130:
        risk_points += 3
        factors.append({'factor': 'bp_systolic', 'detail': f'Avg systolic {avg_sys:.0f} (130-139)', 'points': 3})
    elif avg_sys >= 120:
        risk_points += 1
        factors.append({'factor': 'bp_systolic', 'detail': f'Avg systolic {avg_sys:.0f} (120-129)', 'points': 1})

    # Blood biomarker factors
    ldl = blood_values.get('LDL') or blood_values.get('LDL-C')
    if ldl is not None:
        if ldl > 4.1:  # mmol/L
            risk_points += 5
            factors.append({'factor': 'ldl', 'detail': f'LDL {ldl:.1f} mmol/L (high)', 'points': 5})
        elif ldl > 3.4:
            risk_points += 2
            factors.append({'factor': 'ldl', 'detail': f'LDL {ldl:.1f} mmol/L (borderline)', 'points': 2})

    hdl = blood_values.get('HDL') or blood_values.get('HDL-C')
    if hdl is not None:
        if hdl < 1.0:  # mmol/L (low HDL is bad)
            risk_points += 4
            factors.append({'factor': 'hdl', 'detail': f'HDL {hdl:.1f} mmol/L (low)', 'points': 4})
        elif hdl >= 1.6:
            risk_points -= 2
            factors.append({'factor': 'hdl', 'detail': f'HDL {hdl:.1f} mmol/L (protective)', 'points': -2})

    crp = blood_values.get('CRP') or blood_values.get('HS-CRP')
    if crp is not None:
        if crp > 3.0:  # mg/L
            risk_points += 3
            factors.append({'factor': 'crp', 'detail': f'CRP {crp:.1f} mg/L (elevated inflammation)', 'points': 3})

    glu = blood_values.get('GLU') or blood_values.get('GLUCOSE')
    if glu is not None:
        if glu > 7.0:  # mmol/L (diabetic range)
            risk_points += 5
            factors.append({'factor': 'glucose', 'detail': f'Glucose {glu:.1f} mmol/L (diabetic)', 'points': 5})
        elif glu > 5.6:
            risk_points += 2
            factors.append({'factor': 'glucose', 'detail': f'Glucose {glu:.1f} mmol/L (pre-diabetic)', 'points': 2})

    # §WHOOP: Incorporate WHOOP wearable data if available (resting HR, HRV, strain)
    has_whoop_data = False
    try:
        from .whoop_models import WhoopConnection, WhoopCycle, WhoopRecovery
        whoop_conn = WhoopConnection.objects.filter(user=profile.user, is_active=True).first()
        if whoop_conn:
            # Resting HR from recovery data (best source) or avg HR from cycles
            recovery_agg = WhoopRecovery.objects.filter(
                user=profile.user, score_state='SCORED',
                cycle__start__gte=cutoff,
            ).aggregate(
                avg_rhr=Avg('resting_heart_rate'),
                avg_hrv=Avg('hrv_rmssd_milli'),
            )
            rhr = recovery_agg.get('avg_rhr')
            hrv = recovery_agg.get('avg_hrv')

            # Fall back to cycle avg HR if no recovery data
            if rhr is None:
                cycle_agg = WhoopCycle.objects.filter(
                    user=profile.user, score_state='SCORED',
                    start__gte=cutoff,
                ).aggregate(avg_hr=Avg('average_heart_rate'))
                rhr = cycle_agg.get('avg_hr')

            if rhr is not None:
                has_whoop_data = True
                if rhr > 80:
                    risk_points += 3
                    factors.append({'factor': 'resting_hr', 'detail': f'Resting HR {rhr:.0f} BPM (elevated, WHOOP)', 'points': 3})
                elif rhr > 70:
                    risk_points += 1
                    factors.append({'factor': 'resting_hr', 'detail': f'Resting HR {rhr:.0f} BPM (above optimal, WHOOP)', 'points': 1})
                elif rhr <= 60:
                    risk_points -= 2
                    factors.append({'factor': 'resting_hr', 'detail': f'Resting HR {rhr:.0f} BPM (athletic, WHOOP)', 'points': -2})

            if hrv is not None:
                has_whoop_data = True
                if hrv < 20:
                    risk_points += 3
                    factors.append({'factor': 'hrv', 'detail': f'HRV {hrv:.0f} ms (very low, WHOOP)', 'points': 3})
                elif hrv < 40:
                    risk_points += 1
                    factors.append({'factor': 'hrv', 'detail': f'HRV {hrv:.0f} ms (below average, WHOOP)', 'points': 1})
                elif hrv >= 80:
                    risk_points -= 2
                    factors.append({'factor': 'hrv', 'detail': f'HRV {hrv:.0f} ms (excellent, WHOOP)', 'points': -2})
    except ImportError:
        pass  # WHOOP module not installed

    # §CONVERT: Convert points to approximate 10-year risk percentage
    # Simplified mapping: points → risk %
    risk_pct = min(max(risk_points * 1.5, 1), 50)  # Clamp between 1% and 50%
    risk_pct = round(risk_pct, 1)

    # Risk level classification
    if risk_pct >= 20:
        risk_level = 'very_high'
    elif risk_pct >= 10:
        risk_level = 'high'
    elif risk_pct >= 5:
        risk_level = 'moderate'
    else:
        risk_level = 'low'

    return {
        'risk_pct': risk_pct,
        'risk_level': risk_level,
        'factors': factors,
        'has_blood_data': has_blood_data,
        'has_whoop_data': has_whoop_data,
        'insufficient_bp_data': False,
        'avg_systolic': round(avg_sys, 1),
        'avg_diastolic': round(avg_dia, 1),
        'bp_reading_count': bp_count,
    }


# ── Alert checking ──────────────────────────────────────────────────

def check_alerts(reading) -> list:
    """
    §ALERT: Run alert checks after each BP reading.
    Creates BPAlert objects for any triggered conditions.

    Checks performed:
    1. Hypertensive crisis (sys >180 or dia >120)
    2. Sustained high (3+ consecutive stage 2 readings)
    3. Stage change from previous reading
    4. Morning surge pattern
    5. White coat hypertension
    6. Masked hypertension
    7. High variability (systolic stddev >15 over 30 days)

    Returns list of created BPAlert objects.
    """
    from .bp_models import BPReading, BPAlert

    alerts_created = []
    profile = reading.profile
    user = reading.user

    # §CHECK1: Hypertensive crisis
    stage = classify_bp(reading.systolic, reading.diastolic)
    if stage == 'crisis':
        alert = BPAlert.objects.create(
            user=user,
            profile=profile,
            alert_type='crisis',
            severity='critical',
            title='Hypertensive Crisis Detected',
            title_bg='Открита хипертонична криза',
            message=(
                f'Your blood pressure reading of {reading.systolic}/{reading.diastolic} mmHg '
                f'exceeds crisis thresholds (>180/>120). Seek immediate medical attention.'
            ),
            message_bg=(
                f'Вашето кръвно налягане {reading.systolic}/{reading.diastolic} mmHg '
                f'надвишава кризисните прагове (>180/>120). Потърсете незабавна медицинска помощ.'
            ),
            related_reading=reading,
        )
        alerts_created.append(alert)

    # §CHECK2: Sustained high BP (3+ consecutive stage 2 readings)
    recent = list(
        BPReading.objects
        .filter(profile=profile)
        .order_by('-measured_at')[:3]
        .values_list('systolic', 'diastolic')
    )
    if len(recent) >= 3:
        all_stage_2_or_worse = all(
            classify_bp(s, d) in ('stage_2', 'crisis') for s, d in recent
        )
        if all_stage_2_or_worse:
            # Only create if no recent sustained_high alert (within 24 hours)
            recent_alert = BPAlert.objects.filter(
                profile=profile,
                alert_type='sustained_high',
                created_at__gte=timezone.now() - timedelta(hours=24),
            ).exists()
            if not recent_alert:
                alert = BPAlert.objects.create(
                    user=user,
                    profile=profile,
                    alert_type='sustained_high',
                    severity='high',
                    title='Sustained High Blood Pressure',
                    title_bg='Устойчиво високо кръвно налягане',
                    message=(
                        f'Your last 3 readings are all Stage 2 or higher. '
                        f'Latest: {reading.systolic}/{reading.diastolic} mmHg. '
                        f'Please consult your doctor.'
                    ),
                    message_bg=(
                        f'Последните ви 3 измервания са Stage 2 или по-високо. '
                        f'Последно: {reading.systolic}/{reading.diastolic} mmHg. '
                        f'Моля, консултирайте се с лекар.'
                    ),
                    related_reading=reading,
                )
                alerts_created.append(alert)

    # §CHECK3: Stage change from previous reading
    previous = (
        BPReading.objects
        .filter(profile=profile)
        .exclude(id=reading.id)
        .order_by('-measured_at')
        .first()
    )
    if previous:
        prev_stage = classify_bp(previous.systolic, previous.diastolic)
        curr_stage = stage
        if prev_stage != curr_stage:
            stage_order = {'normal': 0, 'elevated': 1, 'stage_1': 2, 'stage_2': 3, 'crisis': 4}
            direction = 'worsened' if stage_order.get(curr_stage, 0) > stage_order.get(prev_stage, 0) else 'improved'
            severity = 'high' if direction == 'worsened' else 'low'
            alert = BPAlert.objects.create(
                user=user,
                profile=profile,
                alert_type='stage_change',
                severity=severity,
                title=f'BP Stage Changed: {prev_stage} -> {curr_stage}',
                title_bg=f'Промяна на етап: {prev_stage} -> {curr_stage}',
                message=(
                    f'Your BP classification has {direction} from {prev_stage} to {curr_stage}. '
                    f'Previous: {previous.systolic}/{previous.diastolic}, '
                    f'Current: {reading.systolic}/{reading.diastolic}.'
                ),
                message_bg=(
                    f'Вашата класификация на КН се {direction} от {prev_stage} до {curr_stage}. '
                    f'Предишно: {previous.systolic}/{previous.diastolic}, '
                    f'Текущо: {reading.systolic}/{reading.diastolic}.'
                ),
                related_reading=reading,
            )
            alerts_created.append(alert)

    # §CHECK4: High variability (stddev >15 over recent readings)
    from .bp_models import BPReading as BPR
    cutoff_30d = timezone.now() - timedelta(days=30)
    variability = BPR.objects.filter(
        profile=profile,
        measured_at__gte=cutoff_30d,
    ).aggregate(stddev_sys=StdDev('systolic'))
    stddev_val = variability.get('stddev_sys')
    if stddev_val is not None and stddev_val > 15:
        recent_var_alert = BPAlert.objects.filter(
            profile=profile,
            alert_type='high_variability',
            created_at__gte=timezone.now() - timedelta(days=7),
        ).exists()
        if not recent_var_alert:
            alert = BPAlert.objects.create(
                user=user,
                profile=profile,
                alert_type='high_variability',
                severity='medium',
                title='High BP Variability Detected',
                title_bg='Открита висока вариабилност на КН',
                message=(
                    f'Your systolic BP standard deviation over the past 30 days is {stddev_val:.1f} mmHg '
                    f'(threshold: 15 mmHg). High variability is an independent cardiovascular risk factor.'
                ),
                message_bg=(
                    f'Стандартното отклонение на систоличното КН за последните 30 дни е {stddev_val:.1f} mmHg '
                    f'(праг: 15 mmHg). Високата вариабилност е независим сърдечно-съдов рисков фактор.'
                ),
                related_reading=reading,
            )
            alerts_created.append(alert)

    return alerts_created


# ── Medication effectiveness ────────────────────────────────────────

def get_medication_effectiveness(medication) -> dict:
    """
    §MEDEFF: Compare average BP 14 days before medication start vs 14 days after.
    Helps users and doctors assess whether a medication is working.

    Returns before/after averages, change, and effectiveness assessment.
    """
    from .bp_models import BPReading

    start = medication.started_at
    before_start = start - timedelta(days=14)
    after_end = start + timedelta(days=14)

    before_agg = BPReading.objects.filter(
        profile=medication.profile,
        measured_at__date__gte=before_start,
        measured_at__date__lt=start,
    ).aggregate(
        avg_sys=Avg('systolic'), avg_dia=Avg('diastolic'), count=Count('id'),
    )

    after_agg = BPReading.objects.filter(
        profile=medication.profile,
        measured_at__date__gte=start,
        measured_at__date__lte=after_end,
    ).aggregate(
        avg_sys=Avg('systolic'), avg_dia=Avg('diastolic'), count=Count('id'),
    )

    before_count = before_agg['count'] or 0
    after_count = after_agg['count'] or 0

    if before_count < 3 or after_count < 3:
        return {
            'before_avg': None,
            'after_avg': None,
            'change': None,
            'effective': None,
            'insufficient_data': True,
            'before_count': before_count,
            'after_count': after_count,
        }

    before_avg = {
        'systolic': round(before_agg['avg_sys'], 1),
        'diastolic': round(before_agg['avg_dia'], 1),
    }
    after_avg = {
        'systolic': round(after_agg['avg_sys'], 1),
        'diastolic': round(after_agg['avg_dia'], 1),
    }
    change = {
        'systolic': round(after_avg['systolic'] - before_avg['systolic'], 1),
        'diastolic': round(after_avg['diastolic'] - before_avg['diastolic'], 1),
    }

    # Effective if systolic dropped by at least 5 mmHg
    effective = change['systolic'] <= -5

    return {
        'before_avg': before_avg,
        'after_avg': after_avg,
        'change': change,
        'effective': effective,
        'insufficient_data': False,
        'before_count': before_count,
        'after_count': after_count,
    }


# ── Trend projection ───────────────────────────────────────────────

def get_trend_projection(profile, days: int = 30) -> dict:
    """
    §PROJECT: Linear regression on recent systolic readings to project
    when the user might cross into the next AHA stage.

    Uses slope from get_bp_statistics to extrapolate future values.
    Returns current trend direction, slope, and projected stage transition.
    """
    from .bp_models import BPReading

    stats = get_bp_statistics(profile, days=days)
    if stats['reading_count'] < 5 or stats['trend_systolic'] is None:
        return {
            'current_trend': None,
            'slope_per_day': None,
            'days_to_next_stage': None,
            'projected_stage': None,
            'insufficient_data': True,
        }

    slope = stats['trend_systolic']
    avg_sys = stats['avg_sys']

    # §DIRECTION: Classify trend
    if abs(slope) < 0.05:
        direction = 'stable'
    elif slope > 0:
        direction = 'up'
    else:
        direction = 'down'

    # §THRESHOLD: Stage boundaries (systolic thresholds for next worse stage)
    current_stage = classify_bp(round(avg_sys), round(stats['avg_dia']))
    stage_thresholds = {
        'normal': 120,
        'elevated': 130,
        'stage_1': 140,
        'stage_2': 180,
        'crisis': None,  # Already at worst
    }
    next_stages = {
        'normal': 'elevated',
        'elevated': 'stage_1',
        'stage_1': 'stage_2',
        'stage_2': 'crisis',
        'crisis': None,
    }

    days_to_next = None
    projected_stage = None

    if direction == 'up' and slope > 0:
        threshold = stage_thresholds.get(current_stage)
        if threshold and avg_sys < threshold:
            days_to_next = round((threshold - avg_sys) / slope)
            projected_stage = next_stages.get(current_stage)

    return {
        'current_trend': direction,
        'slope_per_day': slope,
        'days_to_next_stage': days_to_next,
        'projected_stage': projected_stage,
        'current_stage': current_stage,
        'avg_systolic': avg_sys,
        'insufficient_data': False,
    }


# ── BP recommendations ──────────────────────────────────────────────

def generate_bp_recommendations(profile) -> list:
    """
    §RECS: Generate personalized BP recommendations based on current stats,
    patterns, and blood data. Returns list of recommendation dicts.

    Categories: diet, exercise, supplement, medical, lifestyle.
    Priority: high (action needed), medium (should improve), low (optimization).
    """
    stats = get_bp_statistics(profile, days=30)
    if stats['reading_count'] == 0:
        return []

    recommendations = []
    avg_sys = stats['avg_sys']
    avg_dia = stats['avg_dia']
    stage = classify_bp(round(avg_sys), round(avg_dia))

    # §DIET: Sodium and DASH diet recommendations
    if stage in ('stage_1', 'stage_2', 'crisis'):
        recommendations.append({
            'title': 'Reduce Sodium Intake',
            'title_bg': 'Намалете приема на натрий',
            'description': (
                f'With average BP {avg_sys:.0f}/{avg_dia:.0f} ({stage}), reducing sodium to '
                f'<2,300mg/day (ideally <1,500mg) can lower systolic BP by 5-6 mmHg. '
                f'Avoid processed foods, canned soups, and restaurant meals.'
            ),
            'description_bg': (
                f'При средно КН {avg_sys:.0f}/{avg_dia:.0f} ({stage}), намаляването на натрия до '
                f'<2300 mg/ден (идеално <1500 mg) може да понижи систоличното КН с 5-6 mmHg. '
                f'Избягвайте преработени храни, консерви и ресторантска храна.'
            ),
            'category': 'diet',
            'priority': 'high',
        })

    if stage != 'normal':
        recommendations.append({
            'title': 'Follow DASH Diet Pattern',
            'title_bg': 'Следвайте диетата DASH',
            'description': (
                'The DASH diet (rich in fruits, vegetables, whole grains, lean protein) '
                'can reduce systolic BP by 8-14 mmHg. Focus on potassium-rich foods: '
                'bananas, spinach, sweet potatoes, avocado.'
            ),
            'description_bg': (
                'Диетата DASH (богата на плодове, зеленчуци, пълнозърнести, постни протеини) '
                'може да намали систоличното КН с 8-14 mmHg. Фокусирайте се на храни богати '
                'на калий: банани, спанак, сладки картофи, авокадо.'
            ),
            'category': 'diet',
            'priority': 'medium',
        })

    # §EXERCISE: Activity recommendations
    if stage in ('elevated', 'stage_1', 'stage_2'):
        recommendations.append({
            'title': 'Regular Aerobic Exercise',
            'title_bg': 'Редовни аеробни упражнения',
            'description': (
                'Aim for 150 minutes/week of moderate aerobic exercise (brisk walking, cycling, swimming). '
                'Regular exercise can lower systolic BP by 5-8 mmHg. Start gradually and increase over weeks.'
            ),
            'description_bg': (
                'Целете 150 минути/седмица умерена аеробна активност (бързо ходене, колоездене, плуване). '
                'Редовните упражнения могат да понижат систоличното КН с 5-8 mmHg. Започнете постепенно.'
            ),
            'category': 'exercise',
            'priority': 'high' if stage in ('stage_1', 'stage_2') else 'medium',
        })

    # §LIFESTYLE: Weight, alcohol, stress
    if stage != 'normal':
        recommendations.append({
            'title': 'Limit Alcohol Consumption',
            'title_bg': 'Ограничете приема на алкохол',
            'description': (
                'Limit to 1 drink/day for women, 2/day for men. Reducing alcohol '
                'can lower systolic BP by 2-4 mmHg.'
            ),
            'description_bg': (
                'Ограничете до 1 питие/ден за жени, 2/ден за мъже. Намаляването на алкохола '
                'може да понижи систоличното КН с 2-4 mmHg.'
            ),
            'category': 'lifestyle',
            'priority': 'low',
        })

    # §STRESS: Stress management if stressed readings are common
    correlations = get_context_correlations(profile, min_readings=10)
    stress_corr = next((c for c in correlations if c['tag'] == 'stress'), None)
    if stress_corr and stress_corr['difference']['systolic'] > 10:
        recommendations.append({
            'title': 'Stress Management',
            'title_bg': 'Управление на стреса',
            'description': (
                f'Your BP is {stress_corr["difference"]["systolic"]:.0f} mmHg higher when stressed. '
                f'Consider meditation, deep breathing, yoga, or progressive muscle relaxation. '
                f'Even 10 minutes daily can help.'
            ),
            'description_bg': (
                f'Вашето КН е {stress_corr["difference"]["systolic"]:.0f} mmHg по-високо при стрес. '
                f'Обмислете медитация, дълбоко дишане, йога или прогресивна мускулна релаксация. '
                f'Дори 10 минути дневно помагат.'
            ),
            'category': 'lifestyle',
            'priority': 'medium',
        })

    # §SUPPLEMENT: Supplements for borderline/elevated
    if stage in ('elevated', 'stage_1'):
        recommendations.append({
            'title': 'Consider Magnesium Supplementation',
            'title_bg': 'Обмислете прием на магнезий',
            'description': (
                'Magnesium (300-500mg/day) may help lower BP by 2-5 mmHg. '
                'Food sources: dark chocolate, nuts, seeds, leafy greens. '
                'Consult your doctor before starting supplements.'
            ),
            'description_bg': (
                'Магнезий (300-500 mg/ден) може да помогне за понижаване на КН с 2-5 mmHg. '
                'Хранителни източници: черен шоколад, ядки, семена, зелени листни зеленчуци. '
                'Консултирайте се с лекар преди прием на добавки.'
            ),
            'category': 'supplement',
            'priority': 'low',
        })

    # §MEDICAL: Medical recommendations for high stages
    if stage in ('stage_2', 'crisis'):
        recommendations.append({
            'title': 'Consult Your Doctor',
            'title_bg': 'Консултирайте се с лекар',
            'description': (
                f'Your average BP of {avg_sys:.0f}/{avg_dia:.0f} mmHg indicates {stage}. '
                f'Medication may be necessary in addition to lifestyle changes. '
                f'Schedule an appointment with your healthcare provider.'
            ),
            'description_bg': (
                f'Средното ви КН от {avg_sys:.0f}/{avg_dia:.0f} mmHg показва {stage}. '
                f'Може да е необходимо медикаментозно лечение в допълнение към промени в начина на живот. '
                f'Запишете час при Вашия лекар.'
            ),
            'category': 'medical',
            'priority': 'high',
        })

    # §MONITOR: Monitoring recommendations
    if stats['variability'] and stats['variability'] > 12:
        recommendations.append({
            'title': 'Consistent Measurement Routine',
            'title_bg': 'Последователна рутина за измерване',
            'description': (
                f'Your BP variability is {stats["variability"]:.1f} mmHg (ideal: <12). '
                f'Measure at the same time daily, sit quietly for 5 minutes first, '
                f'avoid caffeine and exercise 30 minutes before measuring.'
            ),
            'description_bg': (
                f'Вариабилността на КН е {stats["variability"]:.1f} mmHg (идеал: <12). '
                f'Измервайте по едно и също време дневно, седнете спокойно 5 минути преди, '
                f'избягвайте кафе и упражнения 30 минути преди измерване.'
            ),
            'category': 'lifestyle',
            'priority': 'medium',
        })

    # §PP: Wide pulse pressure warning
    if stats['pulse_pressure_avg'] and stats['pulse_pressure_avg'] > 60:
        recommendations.append({
            'title': 'Wide Pulse Pressure Detected',
            'title_bg': 'Открито широко пулсово налягане',
            'description': (
                f'Your average pulse pressure is {stats["pulse_pressure_avg"]:.0f} mmHg (normal: 40-60). '
                f'Wide pulse pressure may indicate arterial stiffness and is an independent '
                f'risk factor for cardiovascular events. Discuss with your doctor.'
            ),
            'description_bg': (
                f'Средното ви пулсово налягане е {stats["pulse_pressure_avg"]:.0f} mmHg (норма: 40-60). '
                f'Широко пулсово налягане може да означава артериална скованост и е независим '
                f'рисков фактор за сърдечно-съдови инциденти. Обсъдете с лекар.'
            ),
            'category': 'medical',
            'priority': 'medium',
        })

    # §WHOOP: WHOOP-informed recommendations if data available
    try:
        from .whoop_models import WhoopConnection, WhoopCycle
        whoop_conn = WhoopConnection.objects.filter(user=profile.user, is_active=True).first()
        if whoop_conn:
            recent_cutoff = timezone.now() - timedelta(days=7)
            avg_strain = WhoopCycle.objects.filter(
                user=profile.user, score_state='SCORED', start__gte=recent_cutoff,
            ).aggregate(avg=Avg('strain'))['avg']

            if avg_strain is not None:
                if avg_strain < 8 and stage in ('elevated', 'stage_1', 'stage_2'):
                    recommendations.append({
                        'title': 'Increase Physical Activity (WHOOP data)',
                        'title_bg': 'Увеличете физическата активност (данни от WHOOP)',
                        'description': (
                            f'Your 7-day average strain is {avg_strain:.1f} (low). With {stage} BP, '
                            f'increasing to moderate strain (10-14) through Zone 2 cardio can lower '
                            f'systolic BP by 5-8 mmHg. Aim for 30+ min brisk walking or cycling daily.'
                        ),
                        'description_bg': (
                            f'Средният ви стрейн за 7 дни е {avg_strain:.1f} (нисък). При {stage} КН, '
                            f'увеличаването до умерен стрейн (10-14) чрез зона 2 кардио може да понижи '
                            f'систоличното КН с 5-8 mmHg. Целете 30+ мин бързо ходене или колоездене дневно.'
                        ),
                        'category': 'exercise',
                        'priority': 'high',
                    })
                elif avg_strain > 16 and stage in ('stage_1', 'stage_2'):
                    recommendations.append({
                        'title': 'Reduce Exercise Intensity (WHOOP data)',
                        'title_bg': 'Намалете интензивността на упражненията (данни от WHOOP)',
                        'description': (
                            f'Your 7-day average strain is {avg_strain:.1f} (very high). With {stage} BP, '
                            f'excessive high-intensity exercise can temporarily spike BP dangerously. '
                            f'Focus on moderate Zone 2 cardio and avoid heavy lifting until BP is controlled.'
                        ),
                        'description_bg': (
                            f'Средният ви стрейн за 7 дни е {avg_strain:.1f} (много висок). При {stage} КН, '
                            f'прекомерните високоинтензивни упражнения могат временно опасно да покачат КН. '
                            f'Фокусирайте се на умерено зона 2 кардио и избягвайте тежки тежести.'
                        ),
                        'category': 'exercise',
                        'priority': 'high',
                    })
    except ImportError:
        pass

    return recommendations
