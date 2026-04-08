# ── health/test_panel.py ─────────────────────────────────────────────
# Smart blood test panel recommendation engine.
# Generates a quarterly test panel: constant base + dynamic additions
# informed by previous blood results, BP data, WHOOP recovery, and weight.
#
# §FLOW: get_recommended_panel(user, profile) → { base_panel, additional_tests, next_date }

import logging
from datetime import date, timedelta
from django.db.models import Avg, Max
from django.utils import timezone

logger = logging.getLogger(__name__)


# ── Constant base panel — every 3 months ────────────────────────────
# Maps Bulgarian clinical panel names → biomarker abbreviations.
# These are ALWAYS included regardless of health data.

BASE_PANEL = [
    {
        'name': 'CBC (Complete Blood Count)',
        'name_bg': 'ПКК (Пълна кръвна картина)',
        'abbreviation': 'CBC',
        'biomarkers': ['HGB', 'WBC', 'RBC', 'PLT', 'HCT', 'MCV', 'MCH', 'MCHC'],
        'reason': 'Routine screening for anemia, infection, and blood disorders',
        'reason_bg': 'Рутинен скрининг за анемия, инфекции и кръвни нарушения',
    },
    {
        'name': 'Fasting Glucose',
        'name_bg': 'Глюкоза на гладно',
        'abbreviation': 'GLU',
        'biomarkers': ['GLU'],
        'reason': 'Diabetes and metabolic health screening',
        'reason_bg': 'Скрининг за диабет и метаболитно здраве',
    },
    {
        'name': 'Lipid Panel',
        'name_bg': 'Липиден профил',
        'abbreviation': 'LIPID',
        'biomarkers': ['CHOL', 'LDL', 'HDL', 'TG', 'VLDL'],
        'reason': 'Cardiovascular risk assessment',
        'reason_bg': 'Оценка на сърдечно-съдов риск',
    },
    {
        'name': 'Lipoprotein(a)',
        'name_bg': 'Липопротеин (а)',
        'abbreviation': 'LPA',
        'biomarkers': ['LPA'],
        'reason': 'Genetic cardiovascular risk marker',
        'reason_bg': 'Генетичен маркер за сърдечно-съдов риск',
    },
    {
        'name': 'Liver Enzymes',
        'name_bg': 'Чернодробни ензими',
        'abbreviation': 'LIVER',
        'biomarkers': ['ALT', 'AST', 'GGT'],
        'reason': 'Liver function monitoring',
        'reason_bg': 'Мониторинг на чернодробната функция',
    },
    {
        'name': 'LDL Cholesterol (direct)',
        'name_bg': 'LDL холестерол (директен)',
        'abbreviation': 'LDL',
        'biomarkers': ['LDL'],
        'reason': 'Primary target for cardiovascular risk reduction',
        'reason_bg': 'Основна цел за намаляване на сърдечно-съдовия риск',
    },
    {
        'name': 'Urea, Creatinine & Uric Acid',
        'name_bg': 'Урея, креатинин и пикочна киселина',
        'abbreviation': 'KIDNEY',
        'biomarkers': ['UREA', 'CREA', 'URIC'],
        'reason': 'Kidney function and gout risk',
        'reason_bg': 'Бъбречна функция и риск от подагра',
    },
    {
        'name': 'Thyroid Panel (TSH, FT3, FT4, TAT, MAT)',
        'name_bg': 'Щитовидни хормони (TSH, FT3, FT4, TAT, MAT)',
        'abbreviation': 'THYROID',
        'biomarkers': ['TSH', 'FT4'],
        'reason': 'Thyroid function — affects metabolism, energy, weight',
        'reason_bg': 'Щитовидна функция — влияе на метаболизъм, енергия, тегло',
    },
    {
        'name': 'Vitamin D',
        'name_bg': 'Витамин D',
        'abbreviation': 'VITD',
        'biomarkers': ['VITD'],
        'reason': 'Essential for bones, immunity, mood — most Bulgarians are deficient',
        'reason_bg': 'Важен за кости, имунитет, настроение — повечето българи имат дефицит',
    },
    {
        'name': 'Vitamin B12',
        'name_bg': 'Витамин B12',
        'abbreviation': 'B12',
        'biomarkers': ['B12'],
        'reason': 'Nerve function, red blood cell production, energy',
        'reason_bg': 'Нервна функция, производство на еритроцити, енергия',
    },
]


# ── Dynamic test rules ──────────────────────────────────────────────
# Each rule checks health data and returns additional tests if triggered.
# Priority: high (must do), medium (recommended), low (nice to have)

def _get_additional_from_blood(result_map: dict) -> list:
    """Generate additional tests based on previous blood results."""
    additional = []

    # Elevated glucose → add HbA1c
    glu = result_map.get('GLU', {})
    if glu.get('flag') in ('high', 'borderline_high', 'critical_high'):
        additional.append({
            'name': 'HbA1c (Glycated Hemoglobin)',
            'name_bg': 'HbA1c (Гликиран хемоглобин)',
            'biomarkers': ['HBA1C'],
            'priority': 'high',
            'trigger': 'blood',
            'reason': f'Elevated fasting glucose ({glu.get("value", "?")}) — HbA1c shows 3-month average blood sugar',
            'reason_bg': f'Повишена глюкоза на гладно ({glu.get("value", "?")}) — HbA1c показва средната кръвна захар за 3 месеца',
        })

    # High LDL or cholesterol → add ApoB, Lp-PLA2
    ldl = result_map.get('LDL', {})
    chol = result_map.get('CHOL', {})
    if ldl.get('flag') in ('high', 'borderline_high') or chol.get('flag') in ('high', 'borderline_high'):
        additional.append({
            'name': 'ApoB (Apolipoprotein B)',
            'name_bg': 'ApoB (Аполипопротеин B)',
            'biomarkers': ['APOB'],
            'priority': 'medium',
            'trigger': 'blood',
            'reason': 'Elevated cholesterol/LDL — ApoB is a better predictor of cardiovascular risk than LDL alone',
            'reason_bg': 'Повишен холестерол/LDL — ApoB е по-добър предиктор на сърдечно-съдов риск от самия LDL',
        })

    # Elevated CRP → add homocysteine, fibrinogen
    crp = result_map.get('CRP', {})
    if crp.get('flag') in ('high', 'borderline_high'):
        additional.append({
            'name': 'Homocysteine',
            'name_bg': 'Хомоцистеин',
            'biomarkers': ['HCYS'],
            'priority': 'medium',
            'trigger': 'blood',
            'reason': 'Elevated CRP (inflammation) — homocysteine is an independent cardiovascular risk factor',
            'reason_bg': 'Повишен CRP (възпаление) — хомоцистеинът е независим рисков фактор за сърдечно-съдови заболявания',
        })

    # Low iron/ferritin → add transferrin, TIBC
    ferr = result_map.get('FERR', {})
    fe = result_map.get('FE', {})
    if ferr.get('flag') in ('low', 'critical_low') or fe.get('flag') in ('low', 'critical_low'):
        additional.append({
            'name': 'Iron Studies (Transferrin, TIBC)',
            'name_bg': 'Разширено желязо (Трансферин, ТИЖК)',
            'biomarkers': ['FE', 'FERR'],
            'priority': 'high',
            'trigger': 'blood',
            'reason': 'Low iron/ferritin detected — full iron panel needed to determine cause',
            'reason_bg': 'Установен нисък феритин/желязо — нужен е пълен панел за определяне на причината',
        })

    # Abnormal thyroid → add antibodies
    tsh = result_map.get('TSH', {})
    if tsh.get('flag') in ('high', 'critical_high', 'low', 'critical_low'):
        additional.append({
            'name': 'Thyroid Antibodies (Anti-TPO, Anti-TG)',
            'name_bg': 'Тиреоидни антитела (Анти-ТПО, Анти-ТГ)',
            'biomarkers': ['TPO', 'ATG'],
            'priority': 'high',
            'trigger': 'blood',
            'reason': 'Abnormal TSH — antibodies determine if cause is autoimmune (Hashimoto\'s/Graves\')',
            'reason_bg': 'Абнормален TSH — антителата определят дали причината е автоимунна (Хашимото/Грейвс)',
        })

    # Elevated uric acid → add 24h urine uric acid
    uric = result_map.get('URIC', {})
    if uric.get('flag') in ('high', 'borderline_high', 'critical_high'):
        additional.append({
            'name': 'Urine Uric Acid (24h)',
            'name_bg': 'Пикочна киселина в урина (24ч)',
            'biomarkers': ['URIC_U'],
            'priority': 'medium',
            'trigger': 'blood',
            'reason': f'Elevated uric acid ({uric.get("value", "?")}) — 24h urine test determines if overproduction or underexcretion',
            'reason_bg': f'Повишена пикочна киселина ({uric.get("value", "?")}) — 24ч тест определя дали е свръхпроизводство или намалена екскреция',
        })

    # Low vitamin D → add calcium, PTH
    vitd = result_map.get('VITD', {})
    if vitd.get('flag') in ('low', 'critical_low'):
        additional.append({
            'name': 'Calcium & PTH (Parathyroid Hormone)',
            'name_bg': 'Калций и PTH (Паратхормон)',
            'biomarkers': ['CA', 'PTH'],
            'priority': 'medium',
            'trigger': 'blood',
            'reason': 'Low Vitamin D — calcium and PTH assess bone metabolism impact',
            'reason_bg': 'Нисък витамин D — калций и PTH оценяват влиянието върху костния метаболизъм',
        })

    # Elevated liver enzymes → add bilirubin, albumin, ALP
    alt = result_map.get('ALT', {})
    ast = result_map.get('AST', {})
    ggt = result_map.get('GGT', {})
    liver_elevated = sum(1 for m in [alt, ast, ggt] if m.get('flag') in ('high', 'borderline_high', 'critical_high'))
    if liver_elevated >= 2:
        additional.append({
            'name': 'Extended Liver Panel (Bilirubin, Albumin, ALP)',
            'name_bg': 'Разширен чернодробен панел (Билирубин, Албумин, АФ)',
            'biomarkers': ['TBIL', 'ALB', 'ALP'],
            'priority': 'high',
            'trigger': 'blood',
            'reason': 'Multiple elevated liver enzymes — extended panel assesses liver damage severity',
            'reason_bg': 'Множество повишени чернодробни ензими — разширеният панел оценява степента на увреждане',
        })

    return additional


def _get_additional_from_bp(user, profile) -> list:
    """Generate additional tests based on blood pressure data."""
    additional = []
    try:
        from .bp_models import BPReading
        cutoff = timezone.now() - timedelta(days=30)
        bp_avg = BPReading.objects.filter(
            user=user, profile=profile, measured_at__gte=cutoff
        ).aggregate(
            avg_sys=Avg('systolic'),
            avg_dia=Avg('diastolic'),
        )
        avg_sys = bp_avg.get('avg_sys')
        avg_dia = bp_avg.get('avg_dia')

        if avg_sys and avg_dia:
            # Stage 2 hypertension or higher → add kidney function, electrolytes
            if avg_sys >= 140 or avg_dia >= 90:
                additional.append({
                    'name': 'Kidney Function (eGFR, Microalbumin)',
                    'name_bg': 'Бъбречна функция (eGFR, Микроалбумин)',
                    'biomarkers': ['CREA', 'UREA'],
                    'priority': 'high',
                    'trigger': 'bp',
                    'reason': f'Elevated BP average ({avg_sys:.0f}/{avg_dia:.0f}) — hypertension can damage kidneys',
                    'reason_bg': f'Повишено средно АН ({avg_sys:.0f}/{avg_dia:.0f}) — хипертонията може да увреди бъбреците',
                })
                additional.append({
                    'name': 'Electrolytes (Na, K, Mg)',
                    'name_bg': 'Електролити (Na, K, Mg)',
                    'biomarkers': ['NA', 'K', 'MG'],
                    'priority': 'medium',
                    'trigger': 'bp',
                    'reason': 'Hypertension monitoring — electrolyte imbalances can worsen BP',
                    'reason_bg': 'Мониторинг на хипертония — електролитен дисбаланс може да влоши АН',
                })
                additional.append({
                    'name': 'BNP / NT-proBNP (Heart Failure Marker)',
                    'name_bg': 'BNP / NT-proBNP (Маркер за сърдечна недостатъчност)',
                    'biomarkers': ['BNP'],
                    'priority': 'medium',
                    'trigger': 'bp',
                    'reason': 'Sustained hypertension — BNP screens for cardiac strain',
                    'reason_bg': 'Продължителна хипертония — BNP скринира за сърдечно натоварване',
                })

            # Elevated BP → add CRP for cardiovascular inflammation
            elif avg_sys >= 130 or avg_dia >= 80:
                additional.append({
                    'name': 'hs-CRP (High-Sensitivity C-Reactive Protein)',
                    'name_bg': 'hs-CRP (Високочувствителен С-реактивен протеин)',
                    'biomarkers': ['CRP'],
                    'priority': 'medium',
                    'trigger': 'bp',
                    'reason': f'Elevated BP ({avg_sys:.0f}/{avg_dia:.0f}) — hs-CRP assesses vascular inflammation',
                    'reason_bg': f'Повишено АН ({avg_sys:.0f}/{avg_dia:.0f}) — hs-CRP оценява съдовото възпаление',
                })
    except ImportError:
        pass

    return additional


def _get_additional_from_whoop(user) -> list:
    """Generate additional tests based on WHOOP recovery data."""
    additional = []
    try:
        from .whoop_models import WhoopRecovery, WhoopCycle
        cutoff = timezone.now() - timedelta(days=14)

        recovery_avg = WhoopRecovery.objects.filter(
            user=user, score_state='SCORED',
            cycle__start__gte=cutoff,
        ).aggregate(
            avg_recovery=Avg('recovery_score'),
            avg_hrv=Avg('hrv_rmssd_milli'),
            avg_rhr=Avg('resting_heart_rate'),
        )

        avg_recovery = recovery_avg.get('avg_recovery')
        avg_hrv = recovery_avg.get('avg_hrv')
        avg_rhr = recovery_avg.get('avg_rhr')

        if avg_recovery is not None:
            # Persistently low recovery → check cortisol, inflammation, iron
            if avg_recovery < 40:
                additional.append({
                    'name': 'Cortisol (Morning)',
                    'name_bg': 'Кортизол (сутрешен)',
                    'biomarkers': ['CORT'],
                    'priority': 'medium',
                    'trigger': 'whoop',
                    'reason': f'Low WHOOP recovery avg ({avg_recovery:.0f}%) — cortisol assesses chronic stress/overtraining',
                    'reason_bg': f'Нисък среден WHOOP recovery ({avg_recovery:.0f}%) — кортизолът оценява хроничен стрес/претрениране',
                })
                additional.append({
                    'name': 'Ferritin & Iron',
                    'name_bg': 'Феритин и Желязо',
                    'biomarkers': ['FERR', 'FE'],
                    'priority': 'medium',
                    'trigger': 'whoop',
                    'reason': 'Low recovery can indicate iron depletion from training',
                    'reason_bg': 'Ниското възстановяване може да означава изчерпване на желязото от тренировки',
                })

            # Low HRV → check magnesium, inflammation
            if avg_hrv is not None and avg_hrv < 30:
                additional.append({
                    'name': 'Magnesium (serum + RBC)',
                    'name_bg': 'Магнезий (серумен + еритроцитен)',
                    'biomarkers': ['MG'],
                    'priority': 'medium',
                    'trigger': 'whoop',
                    'reason': f'Low HRV ({avg_hrv:.0f}ms) — magnesium deficiency reduces HRV and recovery',
                    'reason_bg': f'Нисък HRV ({avg_hrv:.0f}ms) — магнезиевият дефицит намалява HRV и възстановяването',
                })

            # High resting HR → check thyroid, anemia
            if avg_rhr is not None and avg_rhr > 75:
                additional.append({
                    'name': 'Thyroid + CBC check',
                    'name_bg': 'Щитовидна жлеза + ПКК',
                    'biomarkers': ['TSH', 'FT4', 'HGB'],
                    'priority': 'medium',
                    'trigger': 'whoop',
                    'reason': f'Elevated resting HR ({avg_rhr:.0f} BPM) — thyroid dysfunction or anemia can cause this',
                    'reason_bg': f'Повишен пулс в покой ({avg_rhr:.0f} BPM) — тиреоидна дисфункция или анемия може да е причина',
                })
    except ImportError:
        pass

    return additional


def _get_additional_from_weight(user, profile) -> list:
    """Generate additional tests based on weight/BMI trends."""
    additional = []
    try:
        from .weight_models import WeightEntry
        latest = WeightEntry.objects.filter(
            user=user, profile=profile
        ).order_by('-date').first()

        if latest and latest.bmi:
            # Obese → add insulin, HbA1c
            if latest.bmi >= 30:
                additional.append({
                    'name': 'Fasting Insulin',
                    'name_bg': 'Инсулин на гладно',
                    'biomarkers': ['INS'],
                    'priority': 'high',
                    'trigger': 'weight',
                    'reason': f'BMI {latest.bmi:.1f} (obese) — fasting insulin detects insulin resistance before glucose rises',
                    'reason_bg': f'BMI {latest.bmi:.1f} (затлъстяване) — инсулинът на гладно открива инсулинова резистентност преди повишаване на глюкозата',
                })
                additional.append({
                    'name': 'HbA1c',
                    'name_bg': 'HbA1c (Гликиран хемоглобин)',
                    'biomarkers': ['HBA1C'],
                    'priority': 'high',
                    'trigger': 'weight',
                    'reason': 'Obesity significantly increases diabetes risk — HbA1c monitors 3-month glucose control',
                    'reason_bg': 'Затлъстяването значително увеличава риска от диабет — HbA1c мониторира контрола на глюкозата за 3 месеца',
                })

            # Overweight → add CRP
            elif latest.bmi >= 25:
                additional.append({
                    'name': 'hs-CRP (Inflammation)',
                    'name_bg': 'hs-CRP (Възпаление)',
                    'biomarkers': ['CRP'],
                    'priority': 'low',
                    'trigger': 'weight',
                    'reason': f'BMI {latest.bmi:.1f} (overweight) — excess weight increases systemic inflammation',
                    'reason_bg': f'BMI {latest.bmi:.1f} (наднормено тегло) — излишното тегло увеличава системното възпаление',
                })
    except ImportError:
        pass

    return additional


# ── Main panel generator ────────────────────────────────────────────

def get_recommended_panel(user, profile) -> dict:
    """
    Generate a smart quarterly blood test panel.
    Returns constant base tests + dynamic additions from health data.
    """
    from .models import BloodReport, BloodResult

    # --- Determine next test date ---
    latest_report = (
        BloodReport.objects
        .filter(profile=profile)
        .order_by('-test_date')
        .first()
    )

    if latest_report:
        next_date = latest_report.test_date + timedelta(days=90)
        days_until = (next_date - date.today()).days
        last_test_date = latest_report.test_date.isoformat()
    else:
        next_date = date.today()
        days_until = 0
        last_test_date = None

    # --- Get previous results for dynamic rules ---
    result_map = {}
    if latest_report:
        for r in latest_report.results.select_related('biomarker').all():
            result_map[r.biomarker.abbreviation] = {
                'flag': r.flag,
                'value': float(r.value) if r.value else None,
                'biomarker_id': r.biomarker_id,
            }

    # --- Collect additional tests ---
    additional = []
    additional.extend(_get_additional_from_blood(result_map))
    additional.extend(_get_additional_from_bp(user, profile))
    additional.extend(_get_additional_from_whoop(user))
    additional.extend(_get_additional_from_weight(user, profile))

    # Deduplicate by biomarker list (keep highest priority)
    priority_order = {'high': 0, 'medium': 1, 'low': 2}
    seen_biomarkers = set()
    deduped = []
    # Sort by priority first
    additional.sort(key=lambda x: priority_order.get(x.get('priority', 'low'), 2))
    for test in additional:
        key = tuple(sorted(test['biomarkers']))
        if key not in seen_biomarkers:
            seen_biomarkers.add(key)
            deduped.append(test)

    # --- Build response ---
    return {
        'last_test_date': last_test_date,
        'next_test_date': next_date.isoformat(),
        'days_until_next': max(days_until, 0),
        'is_overdue': days_until < 0,
        'base_panel': BASE_PANEL,
        'additional_tests': deduped,
        'total_tests': len(BASE_PANEL) + len(deduped),
        'summary': {
            'base_count': len(BASE_PANEL),
            'additional_count': len(deduped),
            'triggers': {
                'blood': len([t for t in deduped if t.get('trigger') == 'blood']),
                'bp': len([t for t in deduped if t.get('trigger') == 'bp']),
                'whoop': len([t for t in deduped if t.get('trigger') == 'whoop']),
                'weight': len([t for t in deduped if t.get('trigger') == 'weight']),
            },
        },
    }
