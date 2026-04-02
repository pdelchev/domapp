# ── health/services.py ────────────────────────────────────────────────
# Core business logic: biomarker matching, result classification, score computation.
#
# §NAV: models → serializers → views → urls → parsers → [services] → recommendations
# §FLOW: parse_pdf → match_biomarkers → classify_results → compute_scores → generate_recommendations
#
# This is the "brain" of the health tracker — all computation happens here.

import logging
from datetime import date
from difflib import SequenceMatcher

from .models import (
    Biomarker, BloodReport, BloodResult,
    HealthProfile, HealthRecommendation,
)

logger = logging.getLogger(__name__)


# ── Biomarker matching ───────────────────────────────────────────────

def match_biomarker(parsed_name: str, parsed_unit: str = '') -> tuple:
    """
    §MATCH: Match parsed text from PDF to canonical Biomarker in DB.
    Uses exact alias match first, then fuzzy matching.
    Returns (Biomarker, confidence_score) or (None, 0).

    Strategy:
    1. Exact match on abbreviation (case-insensitive)
    2. Exact match in aliases array
    3. Fuzzy match on name/name_bg (threshold 0.7)
    """
    name_clean = parsed_name.strip()
    name_lower = name_clean.lower()

    all_biomarkers = list(Biomarker.objects.select_related('category').all())

    # §PASS1: Exact abbreviation match
    for bm in all_biomarkers:
        if bm.abbreviation.lower() == name_lower:
            return (bm, 1.0)

    # §PASS2: Exact alias match
    for bm in all_biomarkers:
        for alias in bm.aliases:
            if alias.lower() == name_lower:
                return (bm, 0.95)

    # §PASS3: Partial alias match (parsed name contains alias or vice versa)
    for bm in all_biomarkers:
        for alias in bm.aliases:
            alias_l = alias.lower()
            if alias_l in name_lower or name_lower in alias_l:
                return (bm, 0.85)

    # §PASS4: Fuzzy match on name fields
    best_match = None
    best_score = 0
    for bm in all_biomarkers:
        for candidate in [bm.name.lower(), bm.name_bg.lower(), bm.abbreviation.lower()]:
            if not candidate:
                continue
            score = SequenceMatcher(None, name_lower, candidate).ratio()
            if score > best_score:
                best_score = score
                best_match = bm

    if best_score >= 0.7:
        return (best_match, best_score)

    return (None, 0)


def match_all_biomarkers(parsed_results: list[dict]) -> list[dict]:
    """
    §MATCH_ALL: Match a list of parsed PDF results to canonical biomarkers.
    Returns enriched list with biomarker_id and confidence, plus unmatched warnings.
    """
    matched = []
    warnings = []

    for item in parsed_results:
        bm, confidence = match_biomarker(item['name'], item.get('unit', ''))
        if bm:
            matched.append({
                **item,
                'biomarker_id': bm.id,
                'biomarker_name': bm.name,
                'biomarker_abbr': bm.abbreviation,
                'confidence': confidence,
                'canonical_unit': bm.unit,
            })
        else:
            warnings.append(f"Could not match: '{item['name']}'")

    return matched, warnings


# ── Unit conversion ──────────────────────────────────────────────────

def convert_to_canonical_unit(value: float, from_unit: str, biomarker: Biomarker) -> float:
    """
    §CONVERT: Convert value from PDF unit to biomarker's canonical unit.
    Uses alt_units conversion factors, then common BG lab equivalences.
    """
    if not from_unit or from_unit == biomarker.unit:
        return value

    from_unit_clean = from_unit.strip().lower()
    canonical_clean = biomarker.unit.strip().lower()

    if from_unit_clean == canonical_clean:
        return value

    # §EQUIV: Handle known equivalent units from Bulgarian labs
    # These are the same thing, just different Unicode or notation
    EQUIVALENT_UNITS = {
        # µ (micro sign U+00B5) == μ (Greek mu U+03BC) — same thing
        ('µmol/l', 'μmol/l'): 1, ('µmol/l', 'μmol/L'): 1,
        ('umol/l', 'μmol/l'): 1, ('umol/l', 'μmol/L'): 1,
        # G/L == ×10⁹/L for WBC/PLT
        ('g/l', '×10⁹/l'): 1,
        # T/L == ×10¹²/L for RBC
        ('t/l', '×10¹²/l'): 1,
        # L/L → % for HCT (multiply by 100)
        ('l/l', '%'): 100,
        # uIU/ml == mIU/L for TSH
        ('uiu/ml', 'miu/l'): 1,
        # Common case variations
        ('mmol/l', 'mmol/l'): 1,
        ('ng/ml', 'ng/ml'): 1,
        ('u/l', 'u/l'): 1,
    }

    pair = (from_unit_clean, canonical_clean)
    if pair in EQUIVALENT_UNITS:
        factor = EQUIVALENT_UNITS[pair]
        return value * factor

    # Check alt_units for conversion factor
    for alt in biomarker.alt_units:
        if alt.get('unit', '').lower() == from_unit_clean:
            factor = alt.get('factor', 1)
            if factor:
                return value / factor

    # If still no match, try stripping Unicode and comparing
    import unicodedata
    norm_from = unicodedata.normalize('NFKC', from_unit_clean)
    norm_canon = unicodedata.normalize('NFKC', canonical_clean)
    if norm_from == norm_canon:
        return value

    # Last resort: return as-is (unit difference is cosmetic, not numeric)
    logger.warning(f"No conversion for {biomarker.name}: {from_unit} → {biomarker.unit}")
    return value


# ── Result classification ────────────────────────────────────────────

def classify_result(value: float, biomarker: Biomarker, sex: str = 'male') -> tuple:
    """
    §CLASSIFY: Determine flag and deviation for a blood result.
    Returns (flag: str, deviation_pct: float).

    §TIERS:
    - critical_low/high → critical flags (immediate concern)
    - below ref_min / above ref_max → low/high flags
    - between ref and optimal → borderline flags
    - within optimal → optimal flag
    - within ref but no optimal defined → normal flag

    deviation_pct: 0 = in range, positive = % above max, negative = % below min
    """
    ref_min, ref_max = biomarker.get_ref_range(sex)

    # Handle missing ranges
    if ref_min is None and ref_max is None:
        return ('normal', 0)

    # §CRITICAL: Check critical thresholds first
    if biomarker.critical_low is not None and value < biomarker.critical_low:
        deviation = ((biomarker.critical_low - value) / biomarker.critical_low) * 100 if biomarker.critical_low else 0
        return ('critical_low', -round(deviation, 1))

    if biomarker.critical_high is not None and value > biomarker.critical_high:
        deviation = ((value - biomarker.critical_high) / biomarker.critical_high) * 100 if biomarker.critical_high else 0
        return ('critical_high', round(deviation, 1))

    # §RANGE: Check against reference range
    if ref_min is not None and value < ref_min:
        deviation = ((ref_min - value) / ref_min) * 100 if ref_min else 0
        return ('low', -round(deviation, 1))

    if ref_max is not None and value > ref_max:
        deviation = ((value - ref_max) / ref_max) * 100 if ref_max else 0
        return ('high', round(deviation, 1))

    # §OPTIMAL: Within reference range — check optimal
    opt_min = biomarker.optimal_min
    opt_max = biomarker.optimal_max

    if opt_min is not None and opt_max is not None:
        if opt_min <= value <= opt_max:
            return ('optimal', 0)
        elif value < opt_min:
            return ('borderline_low', 0)
        elif value > opt_max:
            return ('borderline_high', 0)

    return ('normal', 0)


# ── Score computation ────────────────────────────────────────────────

# §WEIGHT: Flag-to-score mapping for composite calculations
FLAG_SCORES = {
    'optimal': 100,
    'normal': 85,
    'borderline_low': 70,
    'borderline_high': 70,
    'low': 40,
    'high': 40,
    'critical_low': 10,
    'critical_high': 10,
}


def compute_report_scores(report: BloodReport) -> dict:
    """
    §SCORE: Compute overall and per-system scores for a blood report.
    Each biomarker contributes to its category's body_system score.
    Overall = weighted average of all system scores.

    Returns {overall: int, systems: {system_name: int, ...}}
    """
    results = report.results.select_related('biomarker__category').all()

    if not results.exists():
        return {'overall': None, 'systems': {}}

    # Group scores by body system
    system_scores = {}  # {system: [score1, score2, ...]}

    for result in results:
        system = result.biomarker.category.body_system or 'other'
        score = FLAG_SCORES.get(result.flag, 85)
        system_scores.setdefault(system, []).append(score)

    # Average each system
    systems = {}
    for system, scores in system_scores.items():
        systems[system] = round(sum(scores) / len(scores))

    # Overall = weighted average of systems (more results = more weight)
    total_weight = sum(len(scores) for scores in system_scores.values())
    overall = sum(
        avg * len(system_scores[sys]) for sys, avg in systems.items()
    ) / total_weight if total_weight else 0

    return {
        'overall': round(overall),
        'systems': systems,
    }


# ── Process report (full pipeline) ──────────────────────────────────

def process_parsed_results(report: BloodReport, parsed_results: list[dict], sex: str = 'male') -> list:
    """
    §PIPELINE: Full processing of parsed PDF data → saved BloodResult objects.
    1. Match each parsed result to canonical biomarker
    2. Convert units if needed
    3. Classify (flag + deviation)
    4. Create BloodResult objects
    5. Compute and save report scores
    6. Generate recommendations

    Returns list of created BloodResult objects.
    """
    from .recommendations import generate_recommendations  # Avoid circular import

    matched, warnings = match_all_biomarkers(parsed_results)

    # Save parse warnings on report
    report.parse_warnings = warnings
    report.save(update_fields=['parse_warnings'])

    created_results = []
    seen_biomarkers = set()

    for item in matched:
        biomarker_id = item['biomarker_id']

        # Skip duplicates (same biomarker matched twice)
        if biomarker_id in seen_biomarkers:
            continue
        seen_biomarkers.add(biomarker_id)

        biomarker = Biomarker.objects.get(id=biomarker_id)

        # Convert to canonical unit
        value = convert_to_canonical_unit(item['value'], item.get('unit', ''), biomarker)

        # Classify
        flag, deviation = classify_result(value, biomarker, sex)

        result, created = BloodResult.objects.update_or_create(
            report=report,
            biomarker=biomarker,
            defaults={
                'value': round(value, 2),
                'unit': biomarker.unit,
                'flag': flag,
                'deviation_pct': deviation,
                'ref_range_text': item.get('ref_range', ''),
            }
        )
        created_results.append(result)

    # Compute and save report scores
    scores = compute_report_scores(report)
    report.overall_score = scores['overall']
    report.system_scores = scores['systems']
    report.save(update_fields=['overall_score', 'system_scores'])

    # Generate recommendations
    generate_recommendations(report)

    return created_results


# ── Trend analysis ───────────────────────────────────────────────────

def get_biomarker_history(profile: HealthProfile, biomarker_id: int) -> list[dict]:
    """
    §TREND: Get historical values for a biomarker across all reports for a profile.
    Returns list sorted by date with trend indicators.
    """
    results = (
        BloodResult.objects
        .filter(
            report__profile=profile,
            biomarker_id=biomarker_id,
        )
        .select_related('report', 'biomarker')
        .order_by('report__test_date')
    )

    history = []
    prev_value = None

    for r in results:
        entry = {
            'report_id': r.report_id,
            'test_date': r.report.test_date.isoformat(),
            'value': r.value,
            'unit': r.unit,
            'flag': r.flag,
            'deviation_pct': r.deviation_pct,
        }

        # §TREND: Calculate change from previous
        if prev_value is not None:
            change = r.value - prev_value
            change_pct = (change / prev_value * 100) if prev_value else 0
            entry['change'] = round(change, 2)
            entry['change_pct'] = round(change_pct, 1)
            entry['direction'] = 'up' if change > 0 else ('down' if change < 0 else 'stable')
        else:
            entry['change'] = None
            entry['change_pct'] = None
            entry['direction'] = None

        prev_value = r.value
        history.append(entry)

    return history


# ── Fasting validation ───────────────────────────────────────────────

def check_fasting_validity(report: BloodReport) -> list[str]:
    """
    §FASTING: Detect if glucose/lipid values suggest non-fasting sample.
    Non-fasting glucose >7.8 or TG >2.3 triggers warning.
    """
    warnings = []
    results = {r.biomarker.abbreviation: r.value for r in report.results.select_related('biomarker')}

    glucose = results.get('GLU')
    tg = results.get('TG')

    if glucose and glucose > 7.8:
        warnings.append('Glucose level suggests this may be a non-fasting sample. Fasting glucose should be <6.1 mmol/L.')

    if tg and tg > 2.3:
        warnings.append('Triglyceride level suggests this may be a non-fasting sample. Fasting TG should be <1.7 mmol/L.')

    return warnings


# ── Compare reports ──────────────────────────────────────────────────

def compare_reports(report_a: BloodReport, report_b: BloodReport) -> list[dict]:
    """
    §COMPARE: Side-by-side comparison of two reports.
    Returns list of biomarkers present in either report with values and changes.
    """
    results_a = {r.biomarker_id: r for r in report_a.results.select_related('biomarker')}
    results_b = {r.biomarker_id: r for r in report_b.results.select_related('biomarker')}

    all_biomarker_ids = set(results_a.keys()) | set(results_b.keys())
    comparison = []

    for bm_id in all_biomarker_ids:
        ra = results_a.get(bm_id)
        rb = results_b.get(bm_id)
        biomarker = (ra or rb).biomarker

        entry = {
            'biomarker_id': bm_id,
            'biomarker_name': biomarker.name,
            'biomarker_name_bg': biomarker.name_bg,
            'abbreviation': biomarker.abbreviation,
            'unit': biomarker.unit,
            'category': biomarker.category.name,
            'value_a': ra.value if ra else None,
            'flag_a': ra.flag if ra else None,
            'value_b': rb.value if rb else None,
            'flag_b': rb.flag if rb else None,
        }

        if ra and rb:
            change = rb.value - ra.value
            change_pct = (change / ra.value * 100) if ra.value else 0
            entry['change'] = round(change, 2)
            entry['change_pct'] = round(change_pct, 1)
            entry['direction'] = 'up' if change > 0 else ('down' if change < 0 else 'stable')
            # Did the flag improve or worsen?
            score_a = FLAG_SCORES.get(ra.flag, 85)
            score_b = FLAG_SCORES.get(rb.flag, 85)
            entry['flag_change'] = 'improved' if score_b > score_a else ('worsened' if score_b < score_a else 'same')
        else:
            entry['change'] = None
            entry['change_pct'] = None
            entry['direction'] = None
            entry['flag_change'] = None

        comparison.append(entry)

    return sorted(comparison, key=lambda x: x['biomarker_name'])
