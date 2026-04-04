# ── health/life_services.py ───────────────────────────────────────────
# §SCORE: Compute the unified HealthScore (composite + sub-scores) from
# existing blood, BP, and WHOOP data. Stores one HealthScoreSnapshot per
# (user, profile, date) for history + deltas.
#
# §BLEND: weighted mean of present sub-scores
#     weights: blood .30 | bp .30 | recovery .25 | lifestyle .15
#     missing components → their weight redistributes across present ones
#     `confidence` = fraction of total weight that had data (0-1)
#
# §NAV: called by views.LifeSummaryView + (future) daily Celery task

from datetime import timedelta, datetime, time
from django.db.models import Avg
from django.utils import timezone

from .models import HealthProfile, BloodReport, HealthScoreSnapshot
from .bp_models import BPReading


def _end_of_day(d):
    """Return a timezone-aware datetime at the END of the given date (23:59:59.999)."""
    naive = datetime.combine(d, time.max)
    tz = timezone.get_current_timezone()
    return timezone.make_aware(naive, tz)


# ── sub-score weights (tune by evidence strength) ────────────────────
WEIGHTS = {
    'blood': 0.30,
    'bp': 0.30,
    'recovery': 0.25,
    'lifestyle': 0.15,
}

# ── freshness windows — stale data → null sub-score ──────────────────
BLOOD_MAX_AGE_DAYS = 365
BP_WINDOW_DAYS = 30
RECOVERY_WINDOW_DAYS = 7


# ── blood sub-score ──────────────────────────────────────────────────
def _blood_score(profile, as_of_date):
    """Most-recent BloodReport.overall_score on or before as_of_date (within 1 year). None if stale/missing."""
    cutoff = as_of_date - timedelta(days=BLOOD_MAX_AGE_DAYS)
    report = (
        BloodReport.objects
        .filter(profile=profile, test_date__gte=cutoff, test_date__lte=as_of_date, overall_score__isnull=False)
        .order_by('-test_date')
        .first()
    )
    if not report:
        return None, {}
    return int(report.overall_score), {
        'blood_report_id': report.id,
        'blood_test_date': report.test_date.isoformat(),
    }


# ── BP sub-score ─────────────────────────────────────────────────────
# AHA 2017 staging → score
_AHA_STAGE_TO_SCORE = {
    'crisis': 15,
    'stage_2': 40,
    'stage_1': 60,
    'elevated': 80,
    'normal': 95,
}


def _bp_stage_from_avg(sys_avg, dia_avg):
    """Classify AVERAGE BP into AHA stage (mirrors bp_services.classify_bp)."""
    if sys_avg >= 180 or dia_avg >= 120:
        return 'crisis'
    if sys_avg >= 140 or dia_avg >= 90:
        return 'stage_2'
    if sys_avg >= 130 or dia_avg >= 80:
        return 'stage_1'
    if sys_avg >= 120:
        return 'elevated'
    return 'normal'


def _bp_score(user, profile, as_of_date):
    """30-day avg systolic/diastolic (ending at as_of_date) → AHA stage → score. None if no readings."""
    end = _end_of_day(as_of_date)
    start = end - timedelta(days=BP_WINDOW_DAYS)
    qs = BPReading.objects.filter(user=user, profile=profile, measured_at__gte=start, measured_at__lte=end)
    agg = qs.aggregate(sys_avg=Avg('systolic'), dia_avg=Avg('diastolic'))
    sys_avg = agg['sys_avg']
    dia_avg = agg['dia_avg']
    if sys_avg is None or dia_avg is None:
        return None, {}
    count = qs.count()
    stage = _bp_stage_from_avg(sys_avg, dia_avg)
    return _AHA_STAGE_TO_SCORE[stage], {
        'bp_window_days': BP_WINDOW_DAYS,
        'bp_sys_avg': round(sys_avg, 1),
        'bp_dia_avg': round(dia_avg, 1),
        'bp_reading_count': count,
        'bp_stage': stage,
    }


# ── WHOOP recovery sub-score ─────────────────────────────────────────
def _recovery_score(user, as_of_date):
    """7-day avg WHOOP recovery_score (ending at as_of_date). None if no data."""
    # import here to avoid hard dep at module-load time if WHOOP not set up
    from .whoop_models import WhoopRecovery
    end = _end_of_day(as_of_date)
    start = end - timedelta(days=RECOVERY_WINDOW_DAYS)
    qs = WhoopRecovery.objects.filter(
        user=user,
        cycle__start__gte=start,
        cycle__start__lte=end,
        recovery_score__isnull=False,
    )
    agg = qs.aggregate(rec_avg=Avg('recovery_score'))
    rec_avg = agg['rec_avg']
    if rec_avg is None:
        return None, {}
    return int(round(rec_avg)), {
        'recovery_window_days': RECOVERY_WINDOW_DAYS,
        'recovery_avg': round(rec_avg, 1),
        'recovery_samples': qs.count(),
    }


# ── composite blend ──────────────────────────────────────────────────
def _composite(sub_scores):
    """
    Weighted mean of present sub-scores. Missing sub-scores: weight redistributes.
    Returns (composite_int_or_none, confidence_float).
    """
    present = [(k, v) for k, v in sub_scores.items() if v is not None]
    if not present:
        return None, 0.0
    total_w = sum(WEIGHTS[k] for k, _ in present)
    composite = sum(v * WEIGHTS[k] for k, v in present) / total_w
    confidence = total_w / sum(WEIGHTS.values())  # sum = 1.0 but keep explicit
    return int(round(composite)), round(confidence, 2)


# ── public entry point ───────────────────────────────────────────────
def compute_health_score(user, profile, date=None, save=True):
    """
    Compute + (optionally) persist one HealthScoreSnapshot.

    Returns the snapshot dict (not the ORM obj) so callers can serialize freely.
    If a snapshot for (user, profile, date) already exists, it is updated in place.
    """
    date = date or timezone.localdate()

    blood, blood_inputs = _blood_score(profile, as_of_date=date)
    bp, bp_inputs = _bp_score(user, profile, as_of_date=date)
    recovery, recovery_inputs = _recovery_score(user, as_of_date=date)
    lifestyle = None  # reserved for v2 (intervention adherence)

    sub_scores = {
        'blood': blood,
        'bp': bp,
        'recovery': recovery,
        'lifestyle': lifestyle,
    }
    composite, confidence = _composite(sub_scores)

    inputs = {**blood_inputs, **bp_inputs, **recovery_inputs}

    snapshot = None
    if save:
        snapshot, _ = HealthScoreSnapshot.objects.update_or_create(
            user=user, profile=profile, date=date,
            defaults={
                'composite_score': composite,
                'blood_score': blood,
                'bp_score': bp,
                'recovery_score': recovery,
                'lifestyle_score': lifestyle,
                'confidence': confidence,
                'inputs': inputs,
            },
        )

    return {
        'date': date.isoformat(),
        'composite_score': composite,
        'blood_score': blood,
        'bp_score': bp,
        'recovery_score': recovery,
        'lifestyle_score': lifestyle,
        'confidence': confidence,
        'inputs': inputs,
        'snapshot_id': snapshot.id if snapshot else None,
    }


def get_deltas(user, profile, today=None, lookbacks=(7, 30)):
    """
    For each lookback, return the diff between today's composite and the snapshot
    closest to (today - N days). Returns {lookback_days: {composite_delta, blood_delta, ...}}.
    """
    today = today or timezone.localdate()
    current = HealthScoreSnapshot.objects.filter(user=user, profile=profile, date__lte=today).order_by('-date').first()
    if not current:
        return {}

    out = {}
    fields = ['composite_score', 'blood_score', 'bp_score', 'recovery_score']
    for n in lookbacks:
        target_date = today - timedelta(days=n)
        prior = (
            HealthScoreSnapshot.objects
            .filter(user=user, profile=profile, date__lte=target_date)
            .order_by('-date')
            .first()
        )
        if not prior:
            out[n] = None
            continue
        deltas = {}
        for f in fields:
            a = getattr(current, f)
            b = getattr(prior, f)
            deltas[f] = (a - b) if (a is not None and b is not None) else None
        out[n] = {
            'prior_date': prior.date.isoformat(),
            **deltas,
        }
    return out
