"""
Symptom correlation engine.

§PURPOSE: Given a user's logged Symptoms, look back over the last N days
          and find which candidate triggers (supplements, sleep deficit,
          high stress, dehydration, low mood, fasting, etc.) appear more
          often on days WHERE the symptom occurred than on days where it
          didn't.

§METHOD:
  - For each symptom category with enough occurrences (>= 3 in window),
    build a contingency table:
      symptom_present_rate_when_trigger = P(symptom | trigger)
      symptom_absent_rate_when_no_trigger = P(symptom | ~trigger)
    and the lift = present_rate - absent_rate.
  - A trigger is "flagged" if:
      - lift >= 0.25 (25 pct-point absolute increase)
      - trigger was present on >= 3 days (enough signal)
      - lift > 0 direction only — we surface risk factors, not protectors.
  - Sort by lift descending, take top K.

§LIMITS: This is descriptive / hypothesis-generating, NOT causal. The UI
         must frame these as "look into" not "proof". Small samples are
         noisy. Confounders are rampant.

§DATA SOURCES:
  - DoseLog (supplement intake per day)
  - DailyLog (sleep/stress/water/mood/pain)
  - FastingSession (was fasting active on that day)
"""

from collections import defaultdict
from datetime import date, timedelta
from typing import Optional

from .daily_models import Symptom, DailyLog, DoseLog, FastingSession, WeatherSnapshot


WINDOW_DAYS_DEFAULT = 90
MIN_SYMPTOM_OCCURRENCES = 3
MIN_TRIGGER_DAYS = 3
MIN_LIFT = 0.25


# ──────────────────────────────────────────────────────────────
# §CORE
# ──────────────────────────────────────────────────────────────

def analyze(user, profile, days: int = WINDOW_DAYS_DEFAULT) -> dict:
    """
    Compute correlations for every symptom category with enough data.

    §OUTPUT: {
        window_days,
        total_symptoms,
        by_category: {
            'headache': {
                'occurrences': 7,
                'days_with_symptom': 5,
                'top_triggers': [
                    {
                        'trigger_type': 'supplement',
                        'trigger_id': 42,
                        'trigger_label': 'Iron Bisglycinate',
                        'days_with_symptom_when_present': 4,
                        'days_with_symptom_when_absent': 1,
                        'present_rate': 0.80,
                        'absent_rate': 0.20,
                        'lift': 0.60,
                    },
                    ...
                ],
            },
            ...
        }
    }
    """
    today = date.today()
    start = today - timedelta(days=days - 1)

    symptoms = list(
        Symptom.objects
        .filter(user=user, profile=profile, occurred_at__date__gte=start)
        .values('category', 'occurred_at', 'severity')
    )

    if not symptoms:
        return {
            'window_days': days,
            'total_symptoms': 0,
            'by_category': {},
        }

    # Group: category → set of dates where it occurred
    by_cat_dates: dict[str, set] = defaultdict(set)
    for s in symptoms:
        by_cat_dates[s['category']].add(s['occurred_at'].date())

    # Build trigger presence per date across the window
    trigger_index = _build_trigger_index(user, profile, start, today)

    by_category = {}
    for cat, symptom_dates in by_cat_dates.items():
        if len(symptom_dates) < MIN_SYMPTOM_OCCURRENCES:
            continue
        by_category[cat] = _analyze_category(cat, symptom_dates, trigger_index, start, today)

    return {
        'window_days': days,
        'total_symptoms': len(symptoms),
        'by_category': by_category,
    }


# ──────────────────────────────────────────────────────────────
# §TRIGGERS: Build per-day presence map
# ──────────────────────────────────────────────────────────────

def _build_trigger_index(user, profile, start: date, end: date) -> dict:
    """
    Return a dict of `trigger_key → {dates_present: set, label: str, type: str, ref_id: int|None}`.
    Trigger keys are stable strings so we can map them back in the output.
    """
    index: dict[str, dict] = {}

    # ── Supplement doses taken (one trigger per supplement) ──
    doses = (
        DoseLog.objects
        .filter(
            schedule__supplement__user=user,
            schedule__profile=profile,
            taken=True,
            date__gte=start, date__lte=end,
        )
        .values('date', 'schedule__supplement__id', 'schedule__supplement__name')
    )
    for d in doses:
        sup_id = d['schedule__supplement__id']
        key = f'supplement:{sup_id}'
        if key not in index:
            index[key] = {
                'type': 'supplement',
                'ref_id': sup_id,
                'label': d['schedule__supplement__name'],
                'dates_present': set(),
            }
        index[key]['dates_present'].add(d['date'])

    # ── DailyLog-derived lifestyle triggers ──
    logs = list(
        DailyLog.objects
        .filter(user=user, profile=profile, date__gte=start, date__lte=end)
        .values('date', 'sleep_hours', 'stress_level', 'water_ml', 'mood', 'pain_level')
    )

    def _add(key, type_, label, condition):
        entries = {log['date'] for log in logs if condition(log)}
        if entries:
            index[key] = {
                'type': type_,
                'ref_id': None,
                'label': label,
                'dates_present': entries,
            }

    _add('lifestyle:low_sleep', 'lifestyle', 'Sleep < 6h',
         lambda r: r.get('sleep_hours') is not None and float(r['sleep_hours']) < 6)
    _add('lifestyle:high_stress', 'lifestyle', 'Stress ≥ 4/5',
         lambda r: r.get('stress_level') is not None and r['stress_level'] >= 4)
    _add('lifestyle:dehydration', 'lifestyle', 'Water < 1500 ml',
         lambda r: r.get('water_ml') is not None and r['water_ml'] < 1500)
    _add('lifestyle:low_mood', 'lifestyle', 'Mood ≤ 2/5',
         lambda r: r.get('mood') is not None and r['mood'] <= 2)

    # ── Fasting windows — a day "has fasting" if a session overlapped it ──
    fasts = FastingSession.objects.filter(
        user=user, profile=profile,
        starts_at__date__lte=end,
    ).filter(
        # ended after window start (or still open)
        ends_at__date__gte=start,
    ).values('starts_at', 'ends_at', 'ended_early_at')

    fasting_dates = set()
    for f in fasts:
        s = f['starts_at'].date()
        e_end = f['ended_early_at'] or f['ends_at']
        e = e_end.date() if e_end else end
        cursor = max(s, start)
        stop = min(e, end)
        while cursor <= stop:
            fasting_dates.add(cursor)
            cursor += timedelta(days=1)
    if fasting_dates:
        index['lifestyle:fasting'] = {
            'type': 'lifestyle',
            'ref_id': None,
            'label': 'Fasting day',
            'dates_present': fasting_dates,
        }

    # ── Weather triggers ──
    weather_snapshots = list(
        WeatherSnapshot.objects
        .filter(profile=profile, date__gte=start, date__lte=end)
        .values('date', 'pressure_hpa', 'temperature_celsius', 'humidity_percent',
                'air_quality_index', 'condition')
    )

    if weather_snapshots:
        # Compute baselines for relative comparisons
        pressures = [w['pressure_hpa'] for w in weather_snapshots if w['pressure_hpa'] is not None]
        temps = [w['temperature_celsius'] for w in weather_snapshots if w['temperature_celsius'] is not None]

        # Weather conditions present on each date
        def _add_weather(key, type_, label, condition_fn):
            dates = {w['date'] for w in weather_snapshots if condition_fn(w)}
            if dates and len(dates) >= MIN_TRIGGER_DAYS:
                index[key] = {
                    'type': type_,
                    'ref_id': None,
                    'label': label,
                    'dates_present': dates,
                }

        # High/low pressure (>1020 hPa / <1000 hPa)
        _add_weather('weather:high_pressure', 'weather', 'Pressure > 1020 hPa',
                     lambda w: w.get('pressure_hpa') and w['pressure_hpa'] > 1020)
        _add_weather('weather:low_pressure', 'weather', 'Pressure < 1000 hPa',
                     lambda w: w.get('pressure_hpa') and w['pressure_hpa'] < 1000)

        # Temperature extremes (<10°C / >28°C)
        _add_weather('weather:cold_temp', 'weather', 'Temperature < 10°C',
                     lambda w: w.get('temperature_celsius') is not None and w['temperature_celsius'] < 10)
        _add_weather('weather:hot_temp', 'weather', 'Temperature > 28°C',
                     lambda w: w.get('temperature_celsius') is not None and w['temperature_celsius'] > 28)

        # Humidity extremes (>70% / <30%)
        _add_weather('weather:high_humidity', 'weather', 'Humidity > 70%',
                     lambda w: w.get('humidity_percent') is not None and w['humidity_percent'] > 70)
        _add_weather('weather:low_humidity', 'weather', 'Humidity < 30%',
                     lambda w: w.get('humidity_percent') is not None and w['humidity_percent'] < 30)

        # Air quality (AQI > 150 = unhealthy)
        _add_weather('weather:poor_aqi', 'weather', 'Air Quality Index > 150',
                     lambda w: w.get('air_quality_index') and w['air_quality_index'] > 150)

        # Rainy days
        _add_weather('weather:rainy', 'weather', 'Rainy',
                     lambda w: w.get('condition') in ['rainy', 'stormy'])

        # Temperature swings (compute day-to-day deltas)
        if len(temps) >= 2:
            sorted_weathers = sorted(weather_snapshots, key=lambda w: w['date'])
            temp_swing_dates = set()
            for i in range(1, len(sorted_weathers)):
                prev_temp = sorted_weathers[i-1].get('temperature_celsius')
                curr_temp = sorted_weathers[i].get('temperature_celsius')
                if prev_temp is not None and curr_temp is not None and abs(curr_temp - prev_temp) >= 5:
                    temp_swing_dates.add(sorted_weathers[i]['date'])
            if temp_swing_dates and len(temp_swing_dates) >= MIN_TRIGGER_DAYS:
                index['weather:temperature_swing'] = {
                    'type': 'weather',
                    'ref_id': None,
                    'label': 'Temperature shift ≥ 5°C',
                    'dates_present': temp_swing_dates,
                }

    return index


# ──────────────────────────────────────────────────────────────
# §SCORE: Per-category contingency analysis
# ──────────────────────────────────────────────────────────────

def _analyze_category(category: str, symptom_dates: set, trigger_index: dict,
                      start: date, end: date) -> dict:
    all_days = _date_range(start, end)
    total_days = len(all_days)

    findings = []
    for key, info in trigger_index.items():
        present_days = info['dates_present']
        absent_days = all_days - present_days

        if len(present_days) < MIN_TRIGGER_DAYS:
            continue

        present_with_symptom = len(present_days & symptom_dates)
        absent_with_symptom = len(absent_days & symptom_dates)

        present_rate = present_with_symptom / len(present_days)
        absent_rate = absent_with_symptom / max(len(absent_days), 1)
        lift = present_rate - absent_rate

        if lift < MIN_LIFT:
            continue

        findings.append({
            'trigger_type': info['type'],
            'trigger_id': info['ref_id'],
            'trigger_label': info['label'],
            'trigger_key': key,
            'days_with_symptom_when_present': present_with_symptom,
            'days_when_present': len(present_days),
            'days_with_symptom_when_absent': absent_with_symptom,
            'days_when_absent': len(absent_days),
            'present_rate': round(present_rate, 2),
            'absent_rate': round(absent_rate, 2),
            'lift': round(lift, 2),
        })

    findings.sort(key=lambda f: f['lift'], reverse=True)

    return {
        'occurrences': sum(1 for d in symptom_dates if d),
        'days_with_symptom': len(symptom_dates),
        'window_days': total_days,
        'top_triggers': findings[:5],
    }


def _date_range(start: date, end: date) -> set:
    out = set()
    cursor = start
    while cursor <= end:
        out.add(cursor)
        cursor += timedelta(days=1)
    return out
