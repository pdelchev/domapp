# ── health/weight_services.py ─────────────────────────────────────────
# Business logic for weight + vitals fusion.
#
# §NAV: weight_models → weight_services → weight_views
# §PUBLIC: functions below are callable from views, tasks, mgmt commands.
# §PURE: no request context — take profile_id + params, return plain dicts.
# §ALGO_VERSION: bump when changing a formula; old insights stay intact.
# §V1: P0 scope — osmotic spike, BP-per-kg slope, stage regression forecast,
#      cardiometabolic age, goal progress. V2: med attribution, plateau/whoosh.

from datetime import timedelta
from decimal import Decimal
from statistics import mean

from django.db.models import Avg
from django.utils import timezone

from .weight_models import (
    WeightReading, VitalsSession, WeightGoal, VitalsInsight,
)

ALGO_VERSION = 'v1'


# ── EWMA trend (helper) ───────────────────────────────────────────────
# §PERF: O(n) one-pass; can be incrementalized to O(1) per reading in V2.
# §WHY: EWMA > simple moving average for weight — reacts faster to real
#       trends while still smoothing daily hydration noise.
#       alpha=0.1 ≈ ~20-day half-life (matches Hacker's Diet convention).

def ewma_series(readings, alpha=0.1):
    """Return list of (measured_at, raw_kg, ewma_kg) in ascending order.
    §INPUT: readings must be iterable of WeightReading sorted ascending.
    """
    out = []
    s = None
    for r in readings:
        kg = float(r.weight_kg)
        s = kg if s is None else alpha * kg + (1 - alpha) * s
        out.append((r.measured_at, kg, round(s, 2)))
    return out


def current_ewma(profile_id, days=30):
    """§HELPER: return latest EWMA value or None if insufficient data."""
    cutoff = timezone.now() - timedelta(days=days)
    window = list(WeightReading.objects
                  .filter(profile_id=profile_id, measured_at__gte=cutoff)
                  .order_by('measured_at'))
    if len(window) < 3:
        return None
    return ewma_series(window)[-1][2]


# ── Osmotic spike detector ────────────────────────────────────────────
# §INNOV #4: Δ>1.5% vs 3-day EWMA → likely salt/water, not fat.
# §TRIGGER: called from WeightReadingViewSet.perform_create() on each save.
# §PAYLOAD: {delta_pct, delta_kg, baseline_ewma_kg, direction, likely_cause}

def detect_osmotic_spike(profile_id, new_reading):
    """Detect fluid/sodium spikes; return dict payload or None."""
    cutoff = new_reading.measured_at - timedelta(days=3)
    window = list(WeightReading.objects
                  .filter(profile_id=profile_id,
                          measured_at__gte=cutoff,
                          measured_at__lt=new_reading.measured_at)
                  .order_by('measured_at'))
    if len(window) < 3:
        return None
    baseline = ewma_series(window)[-1][2]
    if baseline == 0:
        return None
    delta_kg = float(new_reading.weight_kg) - baseline
    delta_pct = delta_kg / baseline * 100
    if abs(delta_pct) < 1.5:
        return None
    return {
        'delta_pct': round(delta_pct, 2),
        'delta_kg': round(delta_kg, 2),
        'baseline_ewma_kg': baseline,
        'direction': 'up' if delta_pct > 0 else 'down',
        'likely_cause': 'sodium/water' if delta_pct > 0 else 'dehydration/glycogen',
    }


# ── BP-per-kg slope (personalized OLS regression) ────────────────────
# §INNOV #2: rolling 90-day linear regression over paired daily averages.
# §WHY: simple OLS beats fancy ML here — interpretable, auditable,
#       works with 20-40 paired points which most users have.
# §PAYLOAD: {status, slope_mmhg_per_kg, intercept_mmhg, r_squared,
#            paired_days, window_days, confidence}

def compute_bp_per_kg_slope(profile_id, days=90):
    """OLS slope: Δsystolic per Δkg. Requires ≥20 paired days."""
    # Local import: bp_models must not be imported at module level to avoid
    # circular import chains when weight_services is loaded early.
    from .bp_models import BPReading

    end = timezone.now()
    start = end - timedelta(days=days)

    wt_rows = list(WeightReading.objects
                   .filter(profile_id=profile_id, measured_at__range=(start, end))
                   .values('measured_at', 'weight_kg'))
    bp_rows = list(BPReading.objects
                   .filter(profile_id=profile_id, measured_at__range=(start, end))
                   .values('measured_at', 'systolic'))

    if not wt_rows or not bp_rows:
        return {'status': 'insufficient_data', 'paired_days': 0, 'need': 20,
                'window_days': days}

    # bucket by date (local) → average per day
    wts, bps = {}, {}
    for r in wt_rows:
        d = r['measured_at'].date()
        wts.setdefault(d, []).append(float(r['weight_kg']))
    for b in bp_rows:
        d = b['measured_at'].date()
        bps.setdefault(d, []).append(b['systolic'])

    pairs = [(mean(wts[d]), mean(bps[d])) for d in (set(wts) & set(bps))]

    if len(pairs) < 20:
        return {'status': 'insufficient_data', 'paired_days': len(pairs),
                'need': 20, 'window_days': days}

    # §ALGO: OLS — sys = slope * weight + intercept
    xs = [p[0] for p in pairs]
    ys = [p[1] for p in pairs]
    mx, my = mean(xs), mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = sum((x - mx) ** 2 for x in xs)
    if den == 0:
        return {'status': 'zero_variance', 'paired_days': len(pairs),
                'window_days': days}

    slope = num / den
    intercept = my - slope * mx
    ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys))
    ss_tot = sum((y - my) ** 2 for y in ys)
    r2 = 1 - (ss_res / ss_tot) if ss_tot else 0.0
    r2 = max(0.0, min(1.0, r2))  # clamp (handles pathological negative R²)

    return {
        'status': 'ok',
        'slope_mmhg_per_kg': round(slope, 2),
        'intercept_mmhg': round(intercept, 1),
        'r_squared': round(r2, 3),
        'paired_days': len(pairs),
        'window_days': days,
        'confidence': round(r2, 2),
    }


# ── Stage-regression forecast ─────────────────────────────────────────
# §INNOV #3: back-solve kg-needed to hit target systolic given personal slope.
# §COMPOSES: bp_per_kg_slope + current weight + active goal's weekly_rate.

def stage_regression_forecast(profile_id, target_systolic=120):
    """Return forecast dict with kg_to_lose + eta_date, or status why not."""
    from .bp_models import BPReading

    slope_insight = compute_bp_per_kg_slope(profile_id)
    if slope_insight.get('status') != 'ok':
        return {'status': 'no_slope', 'reason': slope_insight.get('status')}

    slope = slope_insight['slope_mmhg_per_kg']
    # §GUARD: slope must be positive (more weight → higher BP) for loss to help
    if slope <= 0:
        return {'status': 'slope_unfavorable', 'slope_mmhg_per_kg': slope}

    latest_w = (WeightReading.objects.filter(profile_id=profile_id)
                .order_by('-measured_at').first())
    latest_bp = (BPReading.objects.filter(profile_id=profile_id)
                 .order_by('-measured_at').first())
    if not latest_w or not latest_bp:
        return {'status': 'insufficient_data'}

    sys_drop_needed = latest_bp.systolic - target_systolic
    if sys_drop_needed <= 0:
        return {'status': 'already_at_target',
                'current_systolic': latest_bp.systolic,
                'target_systolic': target_systolic}

    kg_needed = sys_drop_needed / slope
    target_kg = float(latest_w.weight_kg) - kg_needed

    active_goal = WeightGoal.objects.filter(
        profile_id=profile_id, is_active=True).first()
    weekly = abs(float(active_goal.weekly_rate_kg)) if active_goal else 0.4
    weeks = kg_needed / weekly if weekly else None
    eta = timezone.now().date() + timedelta(weeks=weeks) if weeks else None

    return {
        'status': 'ok',
        'current_weight_kg': float(latest_w.weight_kg),
        'kg_to_lose': round(kg_needed, 1),
        'target_weight_kg': round(target_kg, 1),
        'target_systolic': target_systolic,
        'current_systolic': latest_bp.systolic,
        'weekly_rate_kg': weekly,
        'weeks': round(weeks, 1) if weeks else None,
        'eta_date': eta.isoformat() if eta else None,
        'slope_mmhg_per_kg': slope,
    }


# ── Cardiometabolic Age (4-signal composite) ─────────────────────────
# §INNOV #7: DomApp's moat — only platform with weight + BP + blood + HRV native.
# §WEIGHTS: derived from published biomarker aging literature (MetAge / PhenoAge
#           adjacent). Heuristic in V1; V2 will calibrate against chrono_age cohort.
# §INPUTS: latest BMI, 30-day avg systolic, latest BloodReport heart score,
#          latest WhoopRecovery score. Missing inputs simply don't contribute.

def compute_cardiometabolic_age(profile_id, chronological_age):
    """Return dict with cardiometabolic_age + delta_years + inputs audit."""
    from .bp_models import BPReading
    from .models import BloodReport

    score = float(chronological_age)
    inputs = {'chronological_age': chronological_age}

    # ── Signal 1: BMI from latest weight reading ──
    w = (WeightReading.objects.filter(profile_id=profile_id)
         .order_by('-measured_at').first())
    bmi = w.bmi if w else None
    inputs['bmi'] = bmi
    if bmi:
        if bmi >= 35:   score += 6
        elif bmi >= 30: score += 4
        elif bmi >= 27: score += 2
        elif bmi >= 25: score += 0.5
        elif bmi < 18.5: score += 1      # underweight also ages
        else:           score -= 1       # healthy range

    # ── Signal 2: 30-day average systolic ──
    bp_agg = BPReading.objects.filter(
        profile_id=profile_id,
        measured_at__gte=timezone.now() - timedelta(days=30)
    ).aggregate(s=Avg('systolic'), d=Avg('diastolic'))
    sys_avg = float(bp_agg['s']) if bp_agg['s'] else None
    inputs['avg_systolic_30d'] = round(sys_avg, 1) if sys_avg else None
    if sys_avg:
        if sys_avg >= 160:   score += 7
        elif sys_avg >= 140: score += 5
        elif sys_avg >= 130: score += 2
        elif sys_avg >= 120: score += 0.5
        elif sys_avg < 115:  score -= 2

    # ── Signal 3: latest BloodReport heart/cardio system score ──
    br = (BloodReport.objects.filter(profile_id=profile_id)
          .order_by('-test_date').first())
    heart_score = None
    if br and br.system_scores:
        # DomApp blood scores: 0-100 where higher = healthier
        heart_score = br.system_scores.get('heart') or br.system_scores.get('cardio')
    inputs['blood_heart_score'] = heart_score
    if heart_score is not None:
        # 70 = neutral; each 10 pts = ±2 years
        score += (70 - float(heart_score)) / 5

    # ── Signal 4: latest WHOOP recovery score (optional) ──
    whoop_score = None
    try:
        from .whoop_models import WhoopRecovery
        rec = (WhoopRecovery.objects
               .filter(user_id=w.user_id if w else None)
               .order_by('-cycle__start').first())
        if rec and rec.recovery_score is not None:
            whoop_score = float(rec.recovery_score)
    except Exception:
        whoop_score = None
    inputs['whoop_recovery_score'] = whoop_score
    if whoop_score is not None:
        score += (70 - whoop_score) / 6

    # §BOUND: clamp to reasonable range (no-one is 0 or 150)
    score = max(18, min(100, score))

    signals_present = sum(1 for v in [bmi, sys_avg, heart_score, whoop_score] if v is not None)
    confidence = round(signals_present / 4, 2)

    return {
        'chronological_age': chronological_age,
        'cardiometabolic_age': round(score, 1),
        'delta_years': round(score - chronological_age, 1),
        'signals_present': signals_present,
        'confidence': confidence,
        'inputs': inputs,
        'algo_version': ALGO_VERSION,
    }


# ── Goal progress ─────────────────────────────────────────────────────
# §PROGRESS: actual vs needed weekly rate, % complete, on-track bool.

def get_goal_progress(goal):
    """Return progress dict or None if no weight data."""
    latest = (WeightReading.objects.filter(profile_id=goal.profile_id)
              .order_by('-measured_at').first())
    if not latest:
        return None

    today = timezone.now().date()
    elapsed_days = max((today - goal.started_at).days, 1)
    elapsed_weeks = elapsed_days / 7

    total_delta = float(goal.target_weight_kg) - float(goal.start_weight_kg)
    done_delta = float(latest.weight_kg) - float(goal.start_weight_kg)

    # §CALC: % toward target; clamp 0..100 (overshoot possible, cap at 100)
    pct = 0.0
    if total_delta != 0:
        pct = (done_delta / total_delta) * 100
        pct = max(0.0, min(100.0, pct))

    actual_rate = done_delta / elapsed_weeks if elapsed_weeks else 0.0

    days_remaining = max((goal.target_date - today).days, 1)
    weeks_remaining = days_remaining / 7
    remaining_delta = float(goal.target_weight_kg) - float(latest.weight_kg)
    needed_rate = remaining_delta / weeks_remaining if weeks_remaining else 0.0

    # §ON_TRACK: achieving 80% of needed velocity counts as on-track
    on_track = True
    if abs(needed_rate) > 0.05:  # tiny rates always "on track"
        on_track = abs(actual_rate) >= abs(needed_rate) * 0.8
        # direction must match
        if needed_rate != 0 and actual_rate != 0:
            on_track = on_track and (actual_rate * needed_rate > 0)

    return {
        'percent_complete': round(pct, 1),
        'current_weight_kg': float(latest.weight_kg),
        'actual_weekly_rate_kg': round(actual_rate, 2),
        'needed_weekly_rate_kg': round(needed_rate, 2),
        'days_remaining': days_remaining,
        'on_track': on_track,
    }


# ── Vitals session finalize ───────────────────────────────────────────
# §FUSION: called when user completes a dual-capture ritual. Computes
# averages from linked BP readings, caches summary, returns dict.

def finalize_vitals_session(session):
    """Compute averages from session's BP readings + weight reading, cache summary."""
    from .bp_models import BPReading
    from .bp_services import classify_bp

    # §JOIN: find BP readings tagged with this session's time window.
    #        BPReading has no vitals_session FK in V1 — we match by profile
    #        + time window (session start -10min .. +30min).
    window_start = session.started_at - timedelta(minutes=10)
    window_end = session.started_at + timedelta(minutes=30)
    bp_readings = list(BPReading.objects.filter(
        profile=session.profile,
        measured_at__range=(window_start, window_end),
    ).order_by('measured_at'))

    weight_reading = session.weight_readings.order_by('-measured_at').first()

    summary = {}
    if weight_reading:
        summary['weight_kg'] = float(weight_reading.weight_kg)
        summary['bmi'] = weight_reading.bmi
        summary['waist_hip_ratio'] = weight_reading.waist_hip_ratio

    if bp_readings:
        # §AVG: AHA rule — discard first reading if 3+ (anxiety effect)
        to_avg = bp_readings[1:] if len(bp_readings) >= 3 else bp_readings
        avg_sys = mean(r.systolic for r in to_avg)
        avg_dia = mean(r.diastolic for r in to_avg)
        pulses = [r.pulse for r in to_avg if r.pulse is not None]
        avg_pulse = mean(pulses) if pulses else None
        summary.update({
            'avg_systolic': round(avg_sys, 1) if avg_sys else None,
            'avg_diastolic': round(avg_dia, 1) if avg_dia else None,
            'avg_pulse': round(avg_pulse, 1) if avg_pulse else None,
            'stage': classify_bp(avg_sys, avg_dia) if avg_sys and avg_dia else None,
            'reading_count': len(bp_readings),
        })

    session.cached_summary = summary
    session.weight_captured = weight_reading is not None
    session.bp_reading_count = len(bp_readings)
    session.completed = bool(weight_reading or bp_readings)
    session.finalized_at = timezone.now()
    session.save(update_fields=['cached_summary', 'weight_captured',
                                'bp_reading_count', 'completed', 'finalized_at'])
    return summary


# ── Persist insight helper ────────────────────────────────────────────
# §DERIVED: append-only — supersede previous active insight of same type.

def persist_insight(user_id, profile_id, insight_type, payload,
                    confidence=0.8, window_start=None, window_end=None):
    """Create new VitalsInsight; supersede prior active one of same type."""
    prev = (VitalsInsight.objects
            .filter(profile_id=profile_id, insight_type=insight_type,
                    superseded_by__isnull=True)
            .first())
    new = VitalsInsight.objects.create(
        user_id=user_id, profile_id=profile_id,
        insight_type=insight_type, payload=payload,
        confidence=Decimal(str(round(confidence, 2))),
        algo_version=ALGO_VERSION,
        window_start=window_start, window_end=window_end,
    )
    if prev and prev.id != new.id:
        prev.superseded_by = new
        prev.save(update_fields=['superseded_by'])
    return new


def latest_insights(profile_id):
    """§QUERY: latest active (not superseded) insight per type."""
    return list(VitalsInsight.objects
                .filter(profile_id=profile_id, superseded_by__isnull=True)
                .order_by('insight_type', '-computed_at'))
