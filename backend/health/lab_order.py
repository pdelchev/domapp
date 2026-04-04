"""
§LAB-ORDER — Generate a printable follow-up lab order document from the latest
BloodReport. Maps abnormal biomarkers → recommended follow-up tests (EN + BG),
groups by priority, adds pattern-based suggestions (metabolic syndrome,
liver stress, anemia). Output is pure data — rendering happens on the client.

Usage: lab_order.generate_lab_order(profile) -> dict
"""

from datetime import date as date_cls

from .models import BloodReport, BloodResult


# ── which flag values count as "abnormal" (trigger a follow-up) ──────
ABNORMAL_FLAGS = {'borderline_high', 'borderline_low', 'high', 'low', 'critical_high', 'critical_low'}

PRIORITY_ORDER = {'high': 0, 'medium': 1, 'low': 2}


# ── per-biomarker follow-up test map ─────────────────────────────────
# Each key is a biomarker abbreviation. Value is a list of suggested tests.
# Tests are deduped by `code` across all triggering biomarkers (highest
# priority wins). Rationale references the actual value at render time.
FOLLOWUPS = {
    'GLU': [
        {
            'code': 'HBA1C', 'category': 'blood', 'priority': 'high', 'fasting_required': False,
            'name_en': 'HbA1c (Glycated Hemoglobin)',
            'name_bg': 'Гликиран хемоглобин (HbA1c)',
            'rationale_en': '3-month average glucose — essential when fasting glucose is elevated.',
            'rationale_bg': 'Средна кръвна захар за 3 месеца — задължително при повишена глюкоза на гладно.',
        },
        {
            'code': 'GLU_REPEAT', 'category': 'blood', 'priority': 'high', 'fasting_required': True,
            'name_en': 'Fasting glucose (repeat)',
            'name_bg': 'Кръвна захар на гладно (контрол)',
            'rationale_en': 'Confirm whether lifestyle changes have moved glucose toward normal.',
            'rationale_bg': 'Контрол дали промените в начина на живот са върнали глюкозата към нормата.',
        },
        {
            'code': 'INS', 'category': 'blood', 'priority': 'high', 'fasting_required': True,
            'name_en': 'Fasting insulin',
            'name_bg': 'Инсулин на гладно',
            'rationale_en': 'Together with glucose → HOMA-IR (insulin resistance).',
            'rationale_bg': 'Заедно с глюкозата → HOMA-IR (инсулинова резистентност).',
        },
    ],
    'HBA1C': [
        {
            'code': 'HBA1C_REPEAT', 'category': 'blood', 'priority': 'high', 'fasting_required': False,
            'name_en': 'HbA1c (repeat)',
            'name_bg': 'Гликиран хемоглобин (контрол)',
            'rationale_en': 'Track glycemic control response to intervention.',
            'rationale_bg': 'Проследяване на контрола на кръвната захар.',
        },
    ],
    'ALT': [
        {
            'code': 'LIVER_PANEL', 'category': 'blood', 'priority': 'high', 'fasting_required': True,
            'name_en': 'Full liver panel (ALT, AST, GGT, ALP, Total + Direct Bilirubin)',
            'name_bg': 'Пълен чернодробен панел (АЛТ, АСТ, ГГТ, АФ, общ и директен билирубин)',
            'rationale_en': 'Rule out obstruction and get a complete picture of liver health.',
            'rationale_bg': 'Изключване на обструкция и пълна оценка на черния дроб.',
        },
    ],
    'AST': [
        {
            'code': 'LIVER_PANEL', 'category': 'blood', 'priority': 'high', 'fasting_required': True,
            'name_en': 'Full liver panel (ALT, AST, GGT, ALP, Total + Direct Bilirubin)',
            'name_bg': 'Пълен чернодробен панел (АЛТ, АСТ, ГГТ, АФ, общ и директен билирубин)',
            'rationale_en': 'Rule out obstruction and get a complete picture of liver health.',
            'rationale_bg': 'Изключване на обструкция и пълна оценка на черния дроб.',
        },
    ],
    'GGT': [
        {
            'code': 'LIVER_PANEL', 'category': 'blood', 'priority': 'high', 'fasting_required': True,
            'name_en': 'Full liver panel (ALT, AST, GGT, ALP, Total + Direct Bilirubin)',
            'name_bg': 'Пълен чернодробен панел (АЛТ, АСТ, ГГТ, АФ, общ и директен билирубин)',
            'rationale_en': 'Distinguish liver vs bone origin; track alcohol/medication effect.',
            'rationale_bg': 'Отличава чернодробен от костен произход; проследява ефект от алкохол/лекарства.',
        },
    ],
    'URIC': [
        {
            'code': 'URIC_REPEAT', 'category': 'blood', 'priority': 'medium', 'fasting_required': True,
            'name_en': 'Uric acid (repeat)',
            'name_bg': 'Пикочна киселина (контрол)',
            'rationale_en': 'Track response to dietary changes (reduced purines, less fructose, more water).',
            'rationale_bg': 'Проследяване след диетични промени (по-малко пурини, по-малко фруктоза, повече вода).',
        },
    ],
    'LDL': [
        {
            'code': 'LIPID_PANEL', 'category': 'blood', 'priority': 'medium', 'fasting_required': True,
            'name_en': 'Lipid panel (Total, LDL, HDL, Triglycerides)',
            'name_bg': 'Липиден профил (Общ холестерол, LDL, HDL, Триглицериди)',
            'rationale_en': 'Cardiovascular risk assessment.',
            'rationale_bg': 'Оценка на сърдечно-съдов риск.',
        },
    ],
    'TG': [
        {
            'code': 'LIPID_PANEL', 'category': 'blood', 'priority': 'medium', 'fasting_required': True,
            'name_en': 'Lipid panel (Total, LDL, HDL, Triglycerides)',
            'name_bg': 'Липиден профил (Общ холестерол, LDL, HDL, Триглицериди)',
            'rationale_en': 'Cardiovascular risk assessment.',
            'rationale_bg': 'Оценка на сърдечно-съдов риск.',
        },
    ],
    'HDL': [
        {
            'code': 'LIPID_PANEL', 'category': 'blood', 'priority': 'medium', 'fasting_required': True,
            'name_en': 'Lipid panel (Total, LDL, HDL, Triglycerides)',
            'name_bg': 'Липиден профил (Общ холестерол, LDL, HDL, Триглицериди)',
            'rationale_en': 'Cardiovascular risk assessment.',
            'rationale_bg': 'Оценка на сърдечно-съдов риск.',
        },
    ],
    'HGB': [
        {
            'code': 'IRON_PANEL', 'category': 'blood', 'priority': 'medium', 'fasting_required': False,
            'name_en': 'Iron panel (Fe, Ferritin, TIBC)',
            'name_bg': 'Железен статус (Желязо, Феритин, ЖСК/TIBC)',
            'rationale_en': 'Low hemoglobin — rule out iron deficiency anemia.',
            'rationale_bg': 'Нисък хемоглобин — изключване на желязодефицитна анемия.',
        },
    ],
    'MCV': [
        {
            'code': 'IRON_PANEL', 'category': 'blood', 'priority': 'medium', 'fasting_required': False,
            'name_en': 'Iron panel (Fe, Ferritin, TIBC)',
            'name_bg': 'Железен статус (Желязо, Феритин, ЖСК/TIBC)',
            'rationale_en': 'Low MCV (microcytic) suggests iron deficiency.',
            'rationale_bg': 'Нисък MCV (микроцитни клетки) подсказва дефицит на желязо.',
        },
        {
            'code': 'B12_FOLATE', 'category': 'blood', 'priority': 'low', 'fasting_required': False,
            'name_en': 'Vitamin B12 + Folate',
            'name_bg': 'Витамин B12 + Фолат',
            'rationale_en': 'Rule out macrocytic causes if MCV is HIGH (ignore if low).',
            'rationale_bg': 'Изключване на макроцитарни причини при ВИСОК MCV.',
        },
    ],
    'CREA': [
        {
            'code': 'CREA_REPEAT', 'category': 'blood', 'priority': 'high', 'fasting_required': False,
            'name_en': 'Creatinine + eGFR (repeat)',
            'name_bg': 'Креатинин + еGFR (контрол)',
            'rationale_en': 'Confirm kidney function trend.',
            'rationale_bg': 'Контрол на бъбречната функция.',
        },
    ],
    'TSH': [
        {
            'code': 'FT4', 'category': 'blood', 'priority': 'high', 'fasting_required': False,
            'name_en': 'Free T4 (+ Free T3 if not done)',
            'name_bg': 'Свободен T4 (+ свободен T3, ако не е правен)',
            'rationale_en': 'Confirm thyroid function when TSH is out of range.',
            'rationale_bg': 'Потвърждаване на тиреоидната функция при отклонение в TSH.',
        },
    ],
    'CRP': [
        {
            'code': 'CRP_REPEAT', 'category': 'blood', 'priority': 'medium', 'fasting_required': False,
            'name_en': 'hs-CRP (repeat)',
            'name_bg': 'Високочувствителен CRP (контрол)',
            'rationale_en': 'Confirm inflammation is acute vs sustained.',
            'rationale_bg': 'Потвърждение дали възпалението е остро или хронично.',
        },
    ],
    'VITD': [
        {
            'code': 'VITD_REPEAT', 'category': 'blood', 'priority': 'low', 'fasting_required': False,
            'name_en': 'Vitamin D (25-OH, repeat)',
            'name_bg': 'Витамин D (25-OH, контрол)',
            'rationale_en': 'Confirm supplementation response (retest after 8–12 weeks).',
            'rationale_bg': 'Контрол след добавки (след 8–12 седмици).',
        },
    ],
}


# ── pattern-based additions (triggered by combinations) ──────────────
def _pattern_tests(flagged_abbrs):
    out = []
    liver_markers = {'ALT', 'AST', 'GGT', 'ALP'} & flagged_abbrs
    metabolic = {'GLU', 'HBA1C', 'TG', 'LDL'} & flagged_abbrs

    if liver_markers and (metabolic or 'GLU' in flagged_abbrs):
        out.append({
            'code': 'US_LIVER', 'category': 'imaging', 'priority': 'medium', 'fasting_required': True,
            'name_en': 'Abdominal ultrasound (liver)',
            'name_bg': 'Абдоминална ехография (черен дроб)',
            'rationale_en': 'Elevated liver enzymes + metabolic pattern → rule out NAFLD (fatty liver).',
            'rationale_bg': 'Повишени чернодробни ензими + метаболитен профил → изключване на стеатоза (NAFLD).',
            'triggered_by': sorted(liver_markers | {'GLU'} if 'GLU' in flagged_abbrs else liver_markers),
        })

    if liver_markers:
        out.append({
            'code': 'ALB_TP', 'category': 'blood', 'priority': 'medium', 'fasting_required': True,
            'name_en': 'Albumin + Total Protein',
            'name_bg': 'Албумин + Общ белтък',
            'rationale_en': 'Liver synthesis function — often missing from standard panels.',
            'rationale_bg': 'Синтетична функция на черния дроб — често липсва в стандартните пакети.',
            'triggered_by': sorted(liver_markers),
        })

    if metabolic:
        out.append({
            'code': 'HOMA', 'category': 'note', 'priority': 'medium', 'fasting_required': False,
            'name_en': 'Ask lab to calculate HOMA-IR',
            'name_bg': 'Помолете лабораторията да изчисли HOMA-IR',
            'rationale_en': 'Insulin resistance score from fasting glucose + insulin.',
            'rationale_bg': 'Индекс на инсулинова резистентност от глюкоза + инсулин на гладно.',
            'triggered_by': sorted(metabolic),
        })

    if 'GLU' in flagged_abbrs:
        out.append({
            'code': 'CRP_ADD', 'category': 'blood', 'priority': 'medium', 'fasting_required': False,
            'name_en': 'hs-CRP',
            'name_bg': 'Високочувствителен CRP',
            'rationale_en': 'Systemic inflammation — key to metabolic & cardiovascular risk.',
            'rationale_bg': 'Системно възпаление — важно за метаболитен и сърдечно-съдов риск.',
            'triggered_by': ['GLU'],
        })
        out.append({
            'code': 'VITD_ADD', 'category': 'blood', 'priority': 'low', 'fasting_required': False,
            'name_en': 'Vitamin D (25-OH)',
            'name_bg': 'Витамин D (25-OH)',
            'rationale_en': 'Deficiency affects insulin sensitivity and liver health.',
            'rationale_bg': 'Дефицитът влияе на инсулиновата чувствителност и черния дроб.',
            'triggered_by': ['GLU'],
        })

    return out


# ── main entry point ─────────────────────────────────────────────────
def generate_lab_order(profile):
    """Build the lab-order dict for the profile's most recent BloodReport."""
    report = (
        BloodReport.objects
        .filter(profile=profile)
        .order_by('-test_date')
        .first()
    )
    if not report:
        return {
            'patient': {
                'full_name': profile.full_name,
                'date_of_birth': profile.date_of_birth.isoformat() if profile.date_of_birth else None,
                'sex': profile.sex,
            },
            'generated_at': date_cls.today().isoformat(),
            'based_on_report': None,
            'tests': [],
            'groups': {'high': [], 'medium': [], 'low': []},
            'note': 'No blood report found for this profile.',
        }

    results = (
        BloodResult.objects
        .filter(report=report)
        .select_related('biomarker')
    )

    # Abnormal results only
    abnormal = [r for r in results if r.flag in ABNORMAL_FLAGS]
    flagged_abbrs = {r.biomarker.abbreviation for r in abnormal if r.biomarker.abbreviation}

    # Snapshot of triggering values for display
    abnormal_snapshot = [
        {
            'abbreviation': r.biomarker.abbreviation,
            'name_en': r.biomarker.name,
            'name_bg': r.biomarker.name_bg,
            'value': r.value,
            'unit': r.unit,
            'flag': r.flag,
            'deviation_pct': r.deviation_pct,
        }
        for r in abnormal
    ]

    # Collect follow-ups from the per-biomarker map
    collected = {}  # code -> test dict (with merged triggered_by)
    for abbr in flagged_abbrs:
        for t in FOLLOWUPS.get(abbr, []):
            code = t['code']
            existing = collected.get(code)
            if existing:
                existing['triggered_by'] = sorted(set(existing['triggered_by']) | {abbr})
                # Keep higher priority if duplicate triggers with different prio
                if PRIORITY_ORDER[t['priority']] < PRIORITY_ORDER[existing['priority']]:
                    existing['priority'] = t['priority']
            else:
                collected[code] = {**t, 'triggered_by': [abbr]}

    # Add pattern-based tests (dedupe by code vs already collected)
    for t in _pattern_tests(flagged_abbrs):
        code = t['code']
        if code in collected:
            collected[code]['triggered_by'] = sorted(set(collected[code]['triggered_by']) | set(t.get('triggered_by', [])))
            continue
        collected[code] = t

    tests = sorted(
        collected.values(),
        key=lambda t: (PRIORITY_ORDER[t['priority']], t['name_en']),
    )

    groups = {'high': [], 'medium': [], 'low': []}
    for t in tests:
        groups[t['priority']].append(t)

    any_fasting = any(t.get('fasting_required') for t in tests)

    return {
        'patient': {
            'full_name': profile.full_name,
            'date_of_birth': profile.date_of_birth.isoformat() if profile.date_of_birth else None,
            'sex': profile.sex,
        },
        'generated_at': date_cls.today().isoformat(),
        'based_on_report': {
            'id': report.id,
            'test_date': report.test_date.isoformat() if report.test_date else None,
            'lab_name': report.lab_name,
            'overall_score': report.overall_score,
        },
        'abnormal_results': abnormal_snapshot,
        'tests': tests,
        'groups': groups,
        'any_fasting_required': any_fasting,
        'fasting_instructions': {
            'en': 'Come in the morning, fasting 10–12 hours. Water is allowed. '
                  'Avoid alcohol 48h before and heavy exercise the previous day.',
            'bg': 'Явяване сутрин, на гладно 10–12 часа. Вода е разрешена. '
                  'Без алкохол 48ч преди и без тежко натоварване предишния ден.',
        },
        'receptionist_phrase': {
            'en': 'Hi, I would like to do: ' + ', '.join(t['name_en'] for t in tests) + '.',
            'bg': 'Здравейте, искам да направя: ' + ', '.join(t['name_bg'] for t in tests) + '.',
        },
        'note': None,
    }
