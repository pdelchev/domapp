# ── health/recommendations.py ─────────────────────────────────────────
# Rule-based lifestyle recommendation engine.
# Generates prioritized advice based on blood results — considers individual
# markers AND cross-biomarker patterns (metabolic syndrome, anemia, etc.)
#
# §NAV: models → serializers → views → urls → parsers → services → [recommendations]
# §ENGINE: Individual rules → Pattern detection → Priority ranking → Deduplication
#
# V2: Wire to Claude API for personalized narrative recommendations.

import logging
from datetime import date

from .models import BloodReport, BloodResult, HealthRecommendation

logger = logging.getLogger(__name__)


# ── Cross-biomarker pattern definitions ──────────────────────────────
# §PATTERN: Each pattern checks multiple biomarkers together.
# More clinically meaningful than individual marker flags.

PATTERNS = [
    {
        'name': 'Metabolic Syndrome Risk',
        'name_bg': 'Риск от метаболитен синдром',
        'check': lambda r: (
            r.get('GLU', {}).get('flag', '') in ('high', 'borderline_high') and
            r.get('TG', {}).get('flag', '') in ('high', 'borderline_high') and
            r.get('HDL', {}).get('flag', '') in ('low', 'borderline_low')
        ),
        'category': 'medical',
        'priority': 'high',
        'title': 'Metabolic Syndrome Pattern Detected',
        'title_bg': 'Открит модел на метаболитен синдром',
        'description': 'Your combination of elevated glucose, high triglycerides, and low HDL suggests metabolic syndrome risk. This triad significantly increases cardiovascular disease and diabetes risk. Focus on: 1) Reduce refined carbs and sugar, 2) Exercise 30+ min daily, 3) Lose waist fat, 4) Consider Mediterranean diet.',
        'description_bg': 'Комбинацията от повишена глюкоза, високи триглицериди и нисък HDL предполага риск от метаболитен синдром. Тази триада значително увеличава риска от сърдечно-съдови заболявания и диабет. Фокус: 1) Намалете рафинираните въглехидрати и захарта, 2) Упражнения 30+ мин дневно, 3) Свалете коремните мазнини, 4) Средиземноморска диета.',
        'biomarkers': ['GLU', 'TG', 'HDL'],
    },
    {
        'name': 'Iron Deficiency Anemia Pattern',
        'name_bg': 'Модел на желязодефицитна анемия',
        'check': lambda r: (
            r.get('HGB', {}).get('flag', '') in ('low', 'critical_low') and
            (r.get('FERR', {}).get('flag', '') in ('low', 'critical_low') or
             r.get('FE', {}).get('flag', '') in ('low', 'critical_low'))
        ),
        'category': 'medical',
        'priority': 'high',
        'title': 'Iron Deficiency Anemia Pattern',
        'title_bg': 'Модел на желязодефицитна анемия',
        'description': 'Low hemoglobin combined with low iron/ferritin indicates iron deficiency anemia. This is the most common anemia type. Action: 1) Iron bisglycinate supplement (better tolerated), 2) Eat red meat, liver, spinach with vitamin C, 3) Avoid tea/coffee near iron meals, 4) See doctor if severe — may need IV iron.',
        'description_bg': 'Нисък хемоглобин комбиниран с ниско желязо/феритин указва желязодефицитна анемия. Действие: 1) Добавка желязо бисглицинат, 2) Яжте червено месо, черен дроб, спанак с витамин С, 3) Избягвайте чай/кафе близо до храни с желязо, 4) Консултирайте лекар ако е тежка.',
        'biomarkers': ['HGB', 'FERR', 'FE'],
    },
    {
        'name': 'Thyroid Dysfunction Pattern',
        'name_bg': 'Модел на тиреоидна дисфункция',
        'check': lambda r: (
            r.get('TSH', {}).get('flag', '') in ('high', 'critical_high', 'low', 'critical_low')
        ),
        'category': 'medical',
        'priority': 'high',
        'title': 'Thyroid Function Abnormality',
        'title_bg': 'Абнормалност на тиреоидната функция',
        'description': 'Abnormal TSH indicates thyroid dysfunction that affects metabolism, energy, weight, and mood. Consult an endocrinologist. Meanwhile: ensure adequate selenium (Brazil nuts), iodine, and manage stress.',
        'description_bg': 'Абнормален ТСХ указва тиреоидна дисфункция, която влияе на метаболизма, енергията, теглото и настроението. Консултирайте ендокринолог.',
        'biomarkers': ['TSH', 'FT4'],
    },
    {
        'name': 'Liver Stress Pattern',
        'name_bg': 'Модел на чернодробно натоварване',
        'check': lambda r: (
            sum(1 for k in ['ALT', 'AST', 'GGT'] if r.get(k, {}).get('flag', '') in ('high', 'borderline_high')) >= 2
        ),
        'category': 'lifestyle',
        'priority': 'high',
        'title': 'Multiple Liver Enzymes Elevated',
        'title_bg': 'Множество повишени чернодробни ензими',
        'description': 'Two or more liver enzymes elevated suggests liver stress. Common causes: 1) Alcohol, 2) Fatty liver from sugar/carbs, 3) Medications, 4) Obesity. Actions: eliminate alcohol for 30 days, cut sugar, exercise daily, drink coffee (protective).',
        'description_bg': 'Два или повече повишени чернодробни ензима предполагат чернодробно натоварване. Действия: елиминирайте алкохола за 30 дни, намалете захарта, упражнения ежедневно, пийте кафе (защитно).',
        'biomarkers': ['ALT', 'AST', 'GGT'],
    },
    {
        'name': 'Cardiovascular Risk Pattern',
        'name_bg': 'Модел на сърдечно-съдов риск',
        'check': lambda r: (
            r.get('LDL', {}).get('flag', '') in ('high', 'borderline_high') and
            r.get('CRP', {}).get('flag', '') in ('high', 'borderline_high')
        ),
        'category': 'medical',
        'priority': 'high',
        'title': 'Elevated Cardiovascular Risk',
        'title_bg': 'Повишен сърдечно-съдов риск',
        'description': 'High LDL combined with elevated CRP (inflammation) significantly increases heart disease risk beyond either marker alone. This combination suggests active arterial inflammation. Priority: anti-inflammatory diet, statins discussion with doctor, daily exercise.',
        'description_bg': 'Висок LDL комбиниран с повишен CRP (възпаление) значително увеличава риска от сърдечни заболявания. Приоритет: противовъзпалителна диета, обсъждане на статини с лекар, ежедневни упражнения.',
        'biomarkers': ['LDL', 'CRP'],
    },
    {
        'name': 'Vitamin D + Calcium Pattern',
        'name_bg': 'Модел Витамин D + Калций',
        'check': lambda r: (
            r.get('VITD', {}).get('flag', '') in ('low', 'critical_low')
        ),
        'category': 'supplement',
        'priority': 'medium',
        'title': 'Vitamin D Deficiency',
        'title_bg': 'Дефицит на витамин D',
        'description': 'Vitamin D deficiency affects 70%+ of Bulgarians in winter. It impacts bones, immunity, mood, and muscle function. Supplement 2000-4000 IU daily with fat-containing meal. Retest after 3 months.',
        'description_bg': 'Дефицитът на витамин D засяга 70%+ от българите през зимата. Влияе на костите, имунитета, настроението и мускулната функция. Суплементирайте 2000-4000 IU дневно с храна съдържаща мазнини. Повторете теста след 3 месеца.',
        'biomarkers': ['VITD'],
    },
]


# ── Seasonal context ─────────────────────────────────────────────────

def get_seasonal_context(test_date: date) -> dict:
    """
    §SEASON: Adjust recommendations based on test month.
    Bulgaria: Oct-Mar = winter (low sun), Apr-Sep = summer.
    """
    month = test_date.month
    is_winter = month in (10, 11, 12, 1, 2, 3)
    return {
        'is_winter': is_winter,
        'season': 'winter' if is_winter else 'summer',
        'vit_d_note': 'Winter in Bulgaria means very low sun exposure — supplementation is essential.' if is_winter else 'Summer sun can help, but 15-20 min daily exposure needed.',
        'vit_d_note_bg': 'Зимата в България означава много ниско слънцево излагане — суплементацията е задължителна.' if is_winter else 'Лятното слънце може да помогне, но са нужни 15-20 мин дневно излагане.',
    }


# ── Smart retest scheduling ─────────────────────────────────────────

def suggest_retest_date(report: BloodReport) -> dict:
    """
    §RETEST: Suggest when to retest based on result severity.
    - All optimal/normal → 12 months
    - Any borderline → 6 months
    - Any high/low → 3 months
    - Any critical → 1 month (see doctor immediately)
    """
    results = report.results.all()
    flags = set(r.flag for r in results)

    if flags & {'critical_high', 'critical_low'}:
        months = 1
        urgency = 'urgent'
        note = 'Critical values detected. See a doctor as soon as possible and retest in 1 month.'
        note_bg = 'Открити критични стойности. Посетете лекар възможно най-скоро и повторете теста след 1 месец.'
    elif flags & {'high', 'low'}:
        months = 3
        urgency = 'soon'
        note = 'Some values outside normal range. Retest in 3 months to monitor trends.'
        note_bg = 'Някои стойности извън нормалния диапазон. Повторете теста след 3 месеца за проследяване.'
    elif flags & {'borderline_high', 'borderline_low'}:
        months = 6
        urgency = 'routine'
        note = 'Borderline values detected. Retest in 6 months to track improvement.'
        note_bg = 'Открити гранични стойности. Повторете теста след 6 месеца.'
    else:
        months = 12
        urgency = 'maintenance'
        note = 'All results look good! Routine retest in 12 months.'
        note_bg = 'Всички резултати изглеждат добре! Рутинен повторен тест след 12 месеца.'

    return {
        'months': months,
        'urgency': urgency,
        'note': note,
        'note_bg': note_bg,
    }


# ── Main recommendation generator ───────────────────────────────────

def generate_recommendations(report: BloodReport):
    """
    §MAIN: Generate all recommendations for a report.
    1. Check cross-biomarker patterns
    2. Generate individual marker recommendations for flagged results
    3. Add seasonal context
    4. Add retest suggestion
    5. Deduplicate and save
    """
    # Clear existing recommendations
    HealthRecommendation.objects.filter(report=report).delete()

    results = report.results.select_related('biomarker').all()

    # Build lookup: abbreviation → {flag, value, ...}
    result_map = {}
    for r in results:
        result_map[r.biomarker.abbreviation] = {
            'flag': r.flag,
            'value': r.value,
            'deviation_pct': r.deviation_pct,
            'biomarker_id': r.biomarker_id,
        }

    recommendations = []

    # §PATTERNS: Check cross-biomarker patterns first (higher priority)
    for pattern in PATTERNS:
        if pattern['check'](result_map):
            bm_ids = [
                result_map[abbr]['biomarker_id']
                for abbr in pattern['biomarkers']
                if abbr in result_map
            ]
            recommendations.append(HealthRecommendation(
                report=report,
                category=pattern['category'],
                priority=pattern['priority'],
                title=pattern['title'],
                title_bg=pattern.get('title_bg', ''),
                description=pattern['description'],
                description_bg=pattern.get('description_bg', ''),
                related_biomarkers=bm_ids,
            ))

    # §INDIVIDUAL: Generate per-marker recommendations for flagged results
    flagged_biomarkers = set()  # Track to avoid duplicating pattern advice
    for pattern in PATTERNS:
        for abbr in pattern['biomarkers']:
            if abbr in result_map:
                flagged_biomarkers.add(result_map[abbr]['biomarker_id'])

    for r in results:
        if r.flag in ('optimal', 'normal'):
            continue

        # Skip if already covered by a pattern recommendation
        if r.biomarker_id in flagged_biomarkers:
            continue

        bm = r.biomarker
        is_high = r.flag in ('high', 'critical_high', 'borderline_high')
        meaning = bm.high_meaning if is_high else bm.low_meaning
        meaning_bg = bm.high_meaning_bg if is_high else bm.low_meaning_bg

        priority = 'high' if r.flag in ('critical_high', 'critical_low') else (
            'medium' if r.flag in ('high', 'low') else 'low'
        )

        tips = bm.improve_tips
        tips_bg = bm.improve_tips_bg
        tip_text = '\n'.join(f'• {tip}' for tip in tips) if tips else ''
        tip_text_bg = '\n'.join(f'• {tip}' for tip in tips_bg) if tips_bg else ''

        recommendations.append(HealthRecommendation(
            report=report,
            category='lifestyle',
            priority=priority,
            title=f"{bm.name}: {'Above' if is_high else 'Below'} {'optimal' if 'borderline' in r.flag else 'normal'} range",
            title_bg=f"{bm.name_bg}: {'Над' if is_high else 'Под'} {'оптималния' if 'borderline' in r.flag else 'нормалния'} диапазон",
            description=f"{meaning}\n\n{tip_text}" if tip_text else meaning,
            description_bg=f"{meaning_bg}\n\n{tip_text_bg}" if tip_text_bg else meaning_bg,
            related_biomarkers=[bm.id],
        ))

    # §SEASON: Add seasonal Vitamin D note
    seasonal = get_seasonal_context(report.test_date)
    if seasonal['is_winter'] and 'VITD' in result_map:
        vitd_flag = result_map['VITD']['flag']
        if vitd_flag not in ('optimal',):
            recommendations.append(HealthRecommendation(
                report=report,
                category='supplement',
                priority='low',
                title='Seasonal Note: Winter Vitamin D',
                title_bg='Сезонна бележка: Зимен витамин D',
                description=seasonal['vit_d_note'],
                description_bg=seasonal['vit_d_note_bg'],
                related_biomarkers=[result_map['VITD']['biomarker_id']],
            ))

    # §RETEST: Add retest suggestion
    retest = suggest_retest_date(report)
    recommendations.append(HealthRecommendation(
        report=report,
        category='medical',
        priority='low' if retest['urgency'] == 'maintenance' else 'medium',
        title=f"Suggested Retest: {retest['months']} months",
        title_bg=f"Препоръчителен повторен тест: {retest['months']} месеца",
        description=retest['note'],
        description_bg=retest['note_bg'],
        related_biomarkers=[],
    ))

    # Bulk create all recommendations
    HealthRecommendation.objects.bulk_create(recommendations)

    return len(recommendations)
