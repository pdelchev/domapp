# ── management/commands/seed_weight_medications.py ──────────────────
# Seed the WeightMedicationEffect knowledge base with ~40 medications
# commonly prescribed in Bulgaria for hypertension, diabetes, and
# comorbid conditions that affect weight.
#
# §USAGE:  python manage.py seed_weight_medications
# §IDEMP:  uses update_or_create — safe to re-run.
# §BG:     aliases include Bulgarian trade names (Concor, Lorista,
#          Prestarium, Norvasc, Tenox, Lercanil, Forxiga, Jardiance...)
# §SOURCE: drug classes + expected weight deltas based on published
#          reviews (Messerli 2016, Lee 2011, Domecq 2015 meta-analysis).

from django.core.management.base import BaseCommand
from health.weight_models import WeightMedicationEffect


# ── Med catalogue ────────────────────────────────────────────────────
# Format: (canonical_name, [aliases], drug_class, delta_kg, onset_wk,
#          evidence, mechanism_en, mechanism_bg)

MEDS = [
    # ── Beta blockers (+1 to +2 kg — reduce metabolic rate) ──
    ('Bisoprolol', ['concor', 'bisoblock', 'bisocard', 'conpres', 'bisogamma', 'corbis'],
     'beta_blocker', 1.5, 12, 'strong',
     'Beta blockers slightly lower resting metabolic rate and suppress lipolysis.',
     'Бета-блокерите леко понижават основния метаболизъм и потискат липолизата.'),
    ('Metoprolol', ['betaloc', 'egilok', 'metocard', 'metoprogamma'],
     'beta_blocker', 1.2, 12, 'strong',
     'Beta blockers slightly lower resting metabolic rate and suppress lipolysis.',
     'Бета-блокерите леко понижават основния метаболизъм и потискат липолизата.'),
    ('Nebivolol', ['nebilet', 'nebivor', 'nebicard'],
     'beta_blocker', 0.5, 12, 'moderate',
     'Third-generation beta blocker with NO-mediated vasodilation; milder weight effect.',
     'Бета-блокер 3-то поколение с NO-медиирана вазодилатация; по-слаб ефект върху теглото.'),
    ('Atenolol', ['tenormin', 'atenobene', 'atehexal'],
     'beta_blocker', 1.5, 12, 'strong',
     'Beta blockers slightly lower resting metabolic rate.',
     'Бета-блокерите леко понижават основния метаболизъм.'),
    ('Carvedilol', ['dilatrend', 'coryol', 'carvedigamma'],
     'beta_blocker', 1.0, 12, 'moderate',
     'Alpha+beta blocker; mild weight gain from reduced metabolic rate.',
     'Алфа+бета блокер; леко наддаване от понижен метаболизъм.'),
    ('Propranolol', ['propranolol', 'obzidan'],
     'beta_blocker', 1.8, 12, 'strong',
     'Non-selective beta blocker; consistent modest weight gain.',
     'Неселективен бета-блокер; устойчиво умерено наддаване.'),

    # ── Thiazide diuretics (−0.5 to −1 kg, fluid not fat) ──
    ('Hydrochlorothiazide', ['hctz', 'hypothiazid', 'disalunil'],
     'thiazide', -0.8, 2, 'strong',
     'Diuresis — fluid loss, not fat. Weight plateaus after ~2 weeks.',
     'Диуреза — загуба на течности, не на мазнини. Теглото стабилизира след ~2 седмици.'),
    ('Indapamide', ['indap', 'tertensif', 'arifon', 'indapres', 'rawel'],
     'thiazide', -0.6, 2, 'strong',
     'Diuresis — fluid loss, not fat.',
     'Диуреза — загуба на течности, не на мазнини.'),
    ('Chlorthalidone', ['chlorthalidone', 'hygroton'],
     'thiazide', -0.8, 2, 'moderate',
     'Long-acting thiazide; similar fluid-loss effect.',
     'Дълго-действащ тиазид; сходен ефект на загуба на течности.'),

    # ── ACE inhibitors (weight-neutral) ──
    ('Enalapril', ['renitec', 'ednyt', 'enap', 'berlipril', 'enalapril'],
     'ace_inhibitor', 0.0, 8, 'strong',
     'Weight-neutral. Any change is likely behavioral, not drug-related.',
     'Неутрален спрямо теглото. Промяна най-вероятно е поведенческа, не лекарствена.'),
    ('Perindopril', ['prestarium', 'prenessa', 'perinpress', 'coverex'],
     'ace_inhibitor', 0.0, 8, 'strong',
     'Weight-neutral.',
     'Неутрален спрямо теглото.'),
    ('Ramipril', ['tritace', 'piramil', 'hartil', 'ramigamma', 'ramicard'],
     'ace_inhibitor', 0.0, 8, 'strong',
     'Weight-neutral.',
     'Неутрален спрямо теглото.'),
    ('Lisinopril', ['lisinopril', 'diroton', 'lysinogamma'],
     'ace_inhibitor', 0.0, 8, 'strong',
     'Weight-neutral.',
     'Неутрален спрямо теглото.'),
    ('Quinapril', ['accupro', 'quinapril'],
     'ace_inhibitor', 0.0, 8, 'moderate',
     'Weight-neutral.',
     'Неутрален спрямо теглото.'),

    # ── ARBs (weight-neutral) ──
    ('Losartan', ['lorista', 'cozaar', 'losacor', 'losartic'],
     'arb', 0.0, 8, 'strong',
     'Weight-neutral. Excellent choice if weight gain is a concern.',
     'Неутрален спрямо теглото. Добър избор при притеснение от наддаване.'),
    ('Valsartan', ['diovan', 'valsacor', 'valsartan'],
     'arb', 0.0, 8, 'strong',
     'Weight-neutral.',
     'Неутрален спрямо теглото.'),
    ('Telmisartan', ['micardis', 'tolura', 'telmisartan'],
     'arb', 0.0, 8, 'strong',
     'Weight-neutral; some evidence of mild metabolic benefit.',
     'Неутрален спрямо теглото; данни за лека метаболитна полза.'),
    ('Candesartan', ['atacand', 'candesar', 'candecor'],
     'arb', 0.0, 8, 'strong',
     'Weight-neutral.',
     'Неутрален спрямо теглото.'),
    ('Irbesartan', ['aprovel', 'irbesartan'],
     'arb', 0.0, 8, 'moderate',
     'Weight-neutral.',
     'Неутрален спрямо теглото.'),

    # ── Calcium channel blockers (neutral, sometimes ankle edema) ──
    ('Amlodipine', ['norvasc', 'tenox', 'amlopin', 'amlogamma', 'amlessa', 'cardilopin'],
     'ccb', 0.3, 4, 'moderate',
     'Weight-neutral overall; may cause ankle edema (fluid, not fat).',
     'Като цяло неутрален; може да предизвика оток на глезени (течности, не мазнини).'),
    ('Lercanidipine', ['lercanil', 'lercaton', 'zanidip'],
     'ccb', 0.2, 4, 'moderate',
     'CCB with less ankle edema than amlodipine.',
     'CCB с по-малко оток от амлодипин.'),
    ('Nifedipine', ['osmo-adalat', 'adalat', 'nifecard'],
     'ccb', 0.3, 4, 'moderate',
     'Weight-neutral; fluid retention possible.',
     'Неутрален; възможно задържане на течности.'),
    ('Diltiazem', ['diltiazem', 'dilzem'],
     'ccb', 0.0, 4, 'moderate',
     'Weight-neutral.',
     'Неутрален спрямо теглото.'),
    ('Verapamil', ['isoptin', 'verapamil'],
     'ccb', 0.5, 4, 'moderate',
     'Weight-neutral to mild gain.',
     'Неутрален до леко наддаване.'),

    # ── Combo pills (common in Bulgaria) ──
    ('Perindopril+Indapamide', ['noliprel', 'co-prenessa', 'co-perinpress'],
     'combo_acei_thiazide', -0.6, 4, 'strong',
     'ACE-i (neutral) + thiazide (fluid loss). Net mild fluid-driven loss.',
     'ACE-i (неутрален) + тиазид (загуба на течности). Лека нетна загуба от течности.'),
    ('Losartan+HCTZ', ['lorista-h', 'hyzaar'],
     'combo_arb_thiazide', -0.6, 4, 'strong',
     'ARB (neutral) + thiazide (fluid loss).',
     'ARB (неутрален) + тиазид (загуба на течности).'),
    ('Amlodipine+Valsartan', ['exforge', 'copalia'],
     'combo_ccb_arb', 0.2, 4, 'moderate',
     'CCB + ARB combination — essentially weight-neutral.',
     'CCB + ARB комбинация — практически неутрална.'),
    ('Perindopril+Amlodipine', ['prestance', 'amlessa-combo'],
     'combo_acei_ccb', 0.2, 4, 'moderate',
     'ACE-i + CCB combination — essentially weight-neutral.',
     'ACE-i + CCB комбинация — практически неутрална.'),

    # ── Diabetes meds (huge weight effects — often co-prescribed) ──
    ('Metformin', ['siofor', 'glucophage', 'metfogamma', 'metfonorm', 'diaphage'],
     'biguanide', -1.5, 12, 'strong',
     'Modest weight loss; improves insulin sensitivity.',
     'Умерена загуба на тегло; подобрява инсулиновата чувствителност.'),
    ('Empagliflozin', ['jardiance', 'synjardy'],
     'sglt2', -2.5, 12, 'strong',
     'Urinary glucose excretion — ~300 kcal/day caloric loss.',
     'Екскреция на глюкоза с урината — ~300 ккал/ден калориен дефицит.'),
    ('Dapagliflozin', ['forxiga', 'xigduo'],
     'sglt2', -2.5, 12, 'strong',
     'Urinary glucose excretion — ~300 kcal/day caloric loss.',
     'Екскреция на глюкоза с урината — ~300 ккал/ден калориен дефицит.'),
    ('Canagliflozin', ['invokana'],
     'sglt2', -2.8, 12, 'strong',
     'Urinary glucose excretion.',
     'Екскреция на глюкоза с урината.'),
    ('Semaglutide', ['ozempic', 'rybelsus', 'wegovy'],
     'glp1', -6.0, 16, 'strong',
     'GLP-1 agonist — delayed gastric emptying + appetite suppression.',
     'GLP-1 агонист — забавено изпразване на стомаха + потискане на апетита.'),
    ('Liraglutide', ['victoza', 'saxenda'],
     'glp1', -4.5, 16, 'strong',
     'GLP-1 agonist — appetite suppression.',
     'GLP-1 агонист — потискане на апетита.'),
    ('Dulaglutide', ['trulicity'],
     'glp1', -3.5, 16, 'strong',
     'GLP-1 agonist (weekly injection) — appetite suppression.',
     'GLP-1 агонист (седмична инжекция) — потискане на апетита.'),
    ('Glibenclamide', ['glibenclamide', 'maninil', 'daonil'],
     'sulfonylurea', 2.5, 12, 'strong',
     'Insulin secretagogue — causes weight gain via hyperinsulinemia.',
     'Стимулира секрецията на инсулин — наддаване чрез хиперинсулинемия.'),
    ('Gliclazide', ['diaprel', 'gliclada', 'glyclazide'],
     'sulfonylurea', 2.0, 12, 'strong',
     'Insulin secretagogue — causes weight gain.',
     'Стимулира инсулина — предизвиква наддаване.'),
    ('Glimepiride', ['amaryl', 'glimepiride', 'glianov'],
     'sulfonylurea', 2.0, 12, 'strong',
     'Insulin secretagogue — causes weight gain.',
     'Стимулира инсулина — предизвиква наддаване.'),
    ('Pioglitazone', ['actos', 'pioglitazone'],
     'tzd', 3.0, 16, 'strong',
     'PPAR-gamma agonist — adipocyte expansion + fluid retention.',
     'PPAR-гама агонист — разширение на адипоцитите + задържане на течности.'),
    ('Insulin', ['lantus', 'levemir', 'tresiba', 'humulin', 'novorapid', 'humalog', 'apidra'],
     'insulin', 3.5, 16, 'strong',
     'Anabolic hormone — promotes fat storage; needs dietary discipline to offset.',
     'Анаболен хормон — насърчава мастното натрупване; нужна е хранителна дисциплина.'),

    # ── Other common Bulgarian prescriptions with weight effects ──
    ('Spironolactone', ['verospiron', 'aldactone', 'spironol'],
     'k_sparing_diuretic', -0.5, 4, 'moderate',
     'Potassium-sparing diuretic — mild fluid loss.',
     'Калий-съхраняващ диуретик — лека загуба на течности.'),
    ('Prednisolone', ['prednisolone', 'decortin', 'prednison'],
     'corticosteroid', 4.0, 8, 'strong',
     'Corticosteroid — appetite increase + central fat redistribution.',
     'Кортикостероид — повишен апетит + централно преразпределение на мазнини.'),
    ('Sertraline', ['zoloft', 'asentra', 'serlift'],
     'ssri', 1.0, 24, 'moderate',
     'SSRI — modest long-term weight gain in ~30% of patients.',
     'SSRI — умерено наддаване при ~30% от пациентите при дълготрайна употреба.'),
    ('Paroxetine', ['paxil', 'seroxat', 'rexetin'],
     'ssri', 2.5, 24, 'strong',
     'SSRI with the highest weight gain of its class.',
     'SSRI с най-голямо наддаване в класа си.'),
    ('Olanzapine', ['zyprexa', 'olanzapine'],
     'atypical_antipsychotic', 5.5, 16, 'strong',
     'Atypical antipsychotic — significant appetite increase.',
     'Атипичен антипсихотик — значително повишен апетит.'),
    ('Mirtazapine', ['remeron', 'mirzaten', 'mirtazapine'],
     'tetracyclic_antidep', 3.0, 12, 'strong',
     'Tetracyclic antidepressant — strong appetite stimulant.',
     'Тетрацикличен антидепресант — силен стимулант на апетита.'),
]


class Command(BaseCommand):
    help = 'Seed WeightMedicationEffect KB with BG-market medications'

    def handle(self, *args, **opts):
        created, updated = 0, 0
        for row in MEDS:
            (name, aliases, cls, delta, onset, evidence, mech_en, mech_bg) = row
            obj, was_created = WeightMedicationEffect.objects.update_or_create(
                medication_name=name,
                defaults={
                    'aliases': aliases,
                    'drug_class': cls,
                    'avg_weight_delta_kg': delta,
                    'onset_weeks': onset,
                    'evidence_level': evidence,
                    'mechanism': mech_en,
                    'mechanism_bg': mech_bg,
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1
        self.stdout.write(self.style.SUCCESS(
            f'Weight medication KB: {created} created, {updated} updated '
            f'({len(MEDS)} total)'))
