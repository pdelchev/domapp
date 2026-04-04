"""
§PHENOAGE — Levine et al. 2018 biological age (PhenoAge).

Computes a single "biological age" from 9 standard blood markers + chronological age.
"Age accel" = PhenoAge − chronological age.  Negative = younger than your birthdate.

Paper: https://www.aging-us.com/article/101414  (Levine 2018, Aging-US)

Required biomarkers (abbreviation → unit):
    ALB    g/L       Albumin
    CREA   μmol/L    Creatinine
    GLU    mmol/L    Fasting glucose
    CRP    mg/L      hs-CRP (natural log)
    LYM%   %         Lymphocyte percent (derived from LYM/WBC * 100 if needed)
    MCV    fL        Mean corpuscular volume
    RDW    %         Red cell distribution width
    ALP    U/L       Alkaline phosphatase
    WBC    ×10⁹/L    White blood cells (≡ 10³/μL)
  + chronological age (years)

If any required marker is missing from the latest report, returns None with a
missing_markers list — do NOT guess defaults, the formula is sensitive.
"""

from math import log, exp
from datetime import date as date_cls

from .models import BloodReport, BloodResult


# Min CRP floor (avoid ln(0); common in high-sensitivity assays)
_CRP_FLOOR_MG_L = 0.01


def _age_years(dob):
    if not dob:
        return None
    today = date_cls.today()
    years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return years


def _latest_results_map(profile):
    """Return {biomarker_abbreviation: value} from the profile's most recent report."""
    report = (
        BloodReport.objects
        .filter(profile=profile)
        .order_by('-test_date')
        .first()
    )
    if not report:
        return None, {}
    results = BloodResult.objects.filter(report=report).select_related('biomarker')
    out = {}
    for r in results:
        abbr = r.biomarker.abbreviation
        if abbr and r.value is not None:
            out[abbr] = float(r.value)
    return report, out


def compute_phenoage(profile):
    """
    Compute PhenoAge for a HealthProfile using their latest BloodReport.

    Returns dict:
      {
        'phenoage': float | None,
        'chronological_age': float | None,
        'age_accel': float | None,
        'mortality_score': float | None,
        'report_id': int | None,
        'test_date': str | None,
        'inputs_used': {marker: value, ...},
        'missing_markers': [...],
        'note': str | None,
      }
    """
    out = {
        'phenoage': None,
        'chronological_age': None,
        'age_accel': None,
        'mortality_score': None,
        'report_id': None,
        'test_date': None,
        'inputs_used': {},
        'missing_markers': [],
        'note': None,
    }

    age = _age_years(profile.date_of_birth)
    if age is None:
        out['note'] = 'Chronological age unknown — set date_of_birth on the profile.'
        out['missing_markers'].append('date_of_birth')
        return out
    out['chronological_age'] = age

    report, results = _latest_results_map(profile)
    if not report:
        out['note'] = 'No blood report found for this profile.'
        return out
    out['report_id'] = report.id
    out['test_date'] = report.test_date.isoformat() if report.test_date else None

    # Pull required markers
    needed = ['ALB', 'CREA', 'GLU', 'CRP', 'MCV', 'RDW', 'ALP', 'WBC']
    values = {}
    for m in needed:
        if m in results:
            values[m] = results[m]
        else:
            out['missing_markers'].append(m)

    # Lymphocyte percent: prefer LYM% if present, else derive from LYM / WBC * 100
    lym_pct = results.get('LYM%') or results.get('LYMF%')
    if lym_pct is None and 'LYM' in results and 'WBC' in results and results['WBC']:
        lym_pct = results['LYM'] / results['WBC'] * 100.0
    if lym_pct is None:
        out['missing_markers'].append('LYM%')
    else:
        values['LYM%'] = lym_pct

    # Bail if anything missing
    if out['missing_markers']:
        out['note'] = (
            f"Missing {len(out['missing_markers'])} marker(s) for PhenoAge: "
            f"{', '.join(out['missing_markers'])}. Need all 9 + age."
        )
        out['inputs_used'] = values
        return out

    # ── Levine 2018 linear combination (units: as documented above) ──
    crp = max(values['CRP'], _CRP_FLOOR_MG_L)
    xb = (
        -19.907
        - 0.0336 * values['ALB']
        + 0.0095 * values['CREA']
        + 0.1953 * values['GLU']
        + 0.0954 * log(crp)
        - 0.0120 * values['LYM%']
        + 0.0268 * values['MCV']
        + 0.3306 * values['RDW']
        + 0.00188 * values['ALP']
        + 0.0554 * values['WBC']
        + 0.0804 * age
    )

    # 10-year mortality score from proportional hazards
    gamma = 0.0076927
    mortality_score = 1.0 - exp(-exp(xb) * (exp(gamma * 120.0) - 1.0) / gamma)
    mortality_score = max(min(mortality_score, 1 - 1e-9), 1e-9)  # clamp to avoid log(0)

    # Convert to age
    phenoage = 141.50225 + log(-0.00553 * log(1.0 - mortality_score)) / 0.09165

    out['mortality_score'] = round(mortality_score, 6)
    out['phenoage'] = round(phenoage, 1)
    out['age_accel'] = round(phenoage - age, 1)
    out['inputs_used'] = {k: round(v, 2) for k, v in values.items()}
    return out
