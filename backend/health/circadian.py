"""
Circadian timing optimizer for supplements and medications.

§PURPOSE: Suggest the optimal time_slot + food/water context for a given
          supplement based on published chronobiology and pharmacokinetics.
§APPROACH: Rule-based. Match by name keywords first (most specific),
           then by category + form + flags. Return slot + human reason +
           confidence (high/medium/low). No ML, no external API.

§NAV: circadian.py → daily_views.suggest_timing_view

§REFERENCES (not cited in output, but the rules draw from):
  - Examine.com monographs
  - AHA 2020 statins @ night recommendation
  - Thyroid meds (levothyroxine) fasted-morning standard of care
  - Iron absorption: vitamin C potentiates, coffee/tea inhibit
  - Magnesium glycinate / bisglycinate → sleep onset
  - Melatonin 0.5–3 mg, 30–60 min before bedtime
  - Fat-soluble vitamins (A/D/E/K) with dietary fat
  - B-complex → mild stimulatory effect, morning
  - Probiotics — debated, fasted morning or bedtime commonly used
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class TimingSuggestion:
    time_slot: str
    take_with_food: bool
    take_on_empty_stomach: bool
    reason: str
    reason_bg: str
    confidence: str  # 'high' / 'medium' / 'low'
    alternatives: list[str]  # other acceptable slots
    avoid_with: list[str]  # supplement slugs to space out from

    def as_dict(self) -> dict:
        return {
            'time_slot': self.time_slot,
            'take_with_food': self.take_with_food,
            'take_on_empty_stomach': self.take_on_empty_stomach,
            'reason': self.reason,
            'reason_bg': self.reason_bg,
            'confidence': self.confidence,
            'alternatives': self.alternatives,
            'avoid_with': self.avoid_with,
        }


# ──────────────────────────────────────────────────────────────
# §RULES: Name-based (most specific → matched first)
# Keys are lowercased substrings to find in Supplement.name.
# ──────────────────────────────────────────────────────────────

NAME_RULES: list[tuple[list[str], TimingSuggestion]] = [
    # ── Vitamins (fat-soluble → with fat-containing meal) ──
    (['vitamin d', 'vit d', 'cholecalciferol', 'd3'], TimingSuggestion(
        time_slot='breakfast', take_with_food=True, take_on_empty_stomach=False,
        reason='Fat-soluble — absorption increases ~30% when taken with a fat-containing meal. Morning timing avoids any mild sleep disruption seen at night.',
        reason_bg='Мастноразтворим — усвояването се увеличава с ~30% при приемане с хранене съдържащо мазнини. Сутрешно време избягва нарушения на съня.',
        confidence='high', alternatives=['lunch', 'dinner'], avoid_with=[],
    )),
    (['vitamin k', 'vit k', 'menaquinone', 'mk-7', 'phylloquinone'], TimingSuggestion(
        time_slot='dinner', take_with_food=True, take_on_empty_stomach=False,
        reason='Fat-soluble — take with the fattiest meal of the day. Pairs well with vitamin D3 for bone/calcium metabolism.',
        reason_bg='Мастноразтворим — приемай с най-мазното хранене. Добре се комбинира с витамин D3.',
        confidence='high', alternatives=['lunch', 'breakfast'], avoid_with=[],
    )),
    (['vitamin e', 'vit e', 'tocopherol', 'tocotrienol'], TimingSuggestion(
        time_slot='dinner', take_with_food=True, take_on_empty_stomach=False,
        reason='Fat-soluble antioxidant — take with dietary fat for absorption.',
        reason_bg='Мастноразтворим антиоксидант — приемай с мазнини.',
        confidence='high', alternatives=['lunch', 'breakfast'], avoid_with=[],
    )),
    (['vitamin a', 'retinol', 'beta-carotene', 'beta carotene'], TimingSuggestion(
        time_slot='dinner', take_with_food=True, take_on_empty_stomach=False,
        reason='Fat-soluble — requires dietary fat for micellar absorption.',
        reason_bg='Мастноразтворим — нуждае се от мазнини за усвояване.',
        confidence='high', alternatives=['lunch', 'breakfast'], avoid_with=[],
    )),
    (['vitamin c', 'ascorbic acid', 'ascorbate'], TimingSuggestion(
        time_slot='breakfast', take_with_food=False, take_on_empty_stomach=False,
        reason='Water-soluble — absorption is good either way. Morning avoids any mild stimulatory effect at bedtime. Pairs with iron to boost absorption.',
        reason_bg='Водоразтворим — усвоява се добре по всяко време. Сутринта избягва лек стимулиращ ефект вечер. Комбинирай с желязо за по-добро усвояване.',
        confidence='medium', alternatives=['midday', 'lunch'], avoid_with=[],
    )),
    (['b12', 'cobalamin', 'methylcobalamin'], TimingSuggestion(
        time_slot='morning', take_with_food=False, take_on_empty_stomach=True,
        reason='Water-soluble, mildly energizing — take on empty stomach in the morning for best absorption and to avoid potential sleep disruption.',
        reason_bg='Водоразтворим, леко енергизиращ — приемай на гладно сутрин за най-добро усвояване.',
        confidence='high', alternatives=['breakfast', 'fasted'], avoid_with=[],
    )),
    (['b complex', 'b-complex', 'vitamin b', 'b vitamin', 'bcomplex'], TimingSuggestion(
        time_slot='breakfast', take_with_food=True, take_on_empty_stomach=False,
        reason='B-vitamins are water-soluble and mildly stimulatory — morning dosing supports daytime energy and avoids bedtime restlessness.',
        reason_bg='В-витамините са водоразтворими и леко стимулиращи — сутрешният прием подкрепя енергията през деня.',
        confidence='high', alternatives=['midday'], avoid_with=[],
    )),
    (['folate', 'folic acid', 'methylfolate', '5-mthf'], TimingSuggestion(
        time_slot='breakfast', take_with_food=True, take_on_empty_stomach=False,
        reason='Water-soluble, part of B-vitamin family — morning with food for consistent absorption.',
        reason_bg='Водоразтворим, част от В-витамините — сутрин с храна.',
        confidence='medium', alternatives=['lunch'], avoid_with=[],
    )),

    # ── Minerals ──
    (['iron', 'ferrous', 'ferritin', 'heme iron'], TimingSuggestion(
        time_slot='fasted', take_with_food=False, take_on_empty_stomach=True,
        reason='Best absorbed on an empty stomach with vitamin C. Avoid coffee, tea, calcium, and dairy within 2 hours — they significantly reduce absorption.',
        reason_bg='Най-добро усвояване на гладно с витамин C. Избягвай кафе, чай, калций и млечни в рамките на 2 часа.',
        confidence='high', alternatives=['morning'], avoid_with=['calcium', 'magnesium', 'zinc', 'coffee'],
    )),
    (['calcium', 'ca carbonate', 'ca citrate'], TimingSuggestion(
        time_slot='dinner', take_with_food=True, take_on_empty_stomach=False,
        reason='Calcium carbonate needs stomach acid (take with food); citrate is flexible. Split doses >500 mg across the day. Keep 2h away from iron and thyroid meds.',
        reason_bg='Карбонатът се нуждае от стомашна киселина (с храна); цитратът е гъвкав. Раздели дози >500 mg. Пази 2 часа разстояние от желязо и левотироксин.',
        confidence='high', alternatives=['lunch', 'breakfast'], avoid_with=['iron', 'levothyroxine', 'zinc'],
    )),
    (['magnesium glycinate', 'magnesium bisglycinate', 'mg glycinate'], TimingSuggestion(
        time_slot='bedtime', take_with_food=False, take_on_empty_stomach=False,
        reason='Glycinate/bisglycinate form supports GABA activity and sleep onset — evening dosing is optimal for sleep quality and muscle relaxation.',
        reason_bg='Глицинатната форма подкрепя GABA и съня — вечерен прием за качество на съня и мускулна релаксация.',
        confidence='high', alternatives=['evening', 'dinner'], avoid_with=['calcium', 'iron'],
    )),
    (['magnesium citrate', 'magnesium oxide', 'mg oxide', 'mg citrate'], TimingSuggestion(
        time_slot='evening', take_with_food=True, take_on_empty_stomach=False,
        reason='Citrate/oxide forms can be mildly laxative — evening with food balances absorption and tolerance.',
        reason_bg='Цитратът/оксидът могат да имат лек слабителен ефект — вечер с храна за по-добра поносимост.',
        confidence='medium', alternatives=['dinner', 'bedtime'], avoid_with=['calcium', 'iron'],
    )),
    (['magnesium', 'mg '], TimingSuggestion(
        time_slot='evening', take_with_food=True, take_on_empty_stomach=False,
        reason='Magnesium generally supports relaxation and sleep — evening is the standard recommendation.',
        reason_bg='Магнезият подкрепя релаксация и сън — вечерен прием.',
        confidence='medium', alternatives=['bedtime', 'dinner'], avoid_with=['calcium', 'iron'],
    )),
    (['zinc'], TimingSuggestion(
        time_slot='bedtime', take_with_food=False, take_on_empty_stomach=True,
        reason='Absorbed best on empty stomach but can cause nausea — bedtime avoids that while keeping it away from competing minerals (calcium, iron) at meals.',
        reason_bg='Усвоява се най-добре на гладно, но може да предизвика гадене — преди сън избягва това.',
        confidence='medium', alternatives=['evening'], avoid_with=['iron', 'calcium', 'copper'],
    )),
    (['selenium'], TimingSuggestion(
        time_slot='breakfast', take_with_food=True, take_on_empty_stomach=False,
        reason='Take with food to reduce nausea risk — low daily dose is sufficient, morning is fine.',
        reason_bg='С храна за намаляване на гаденето — сутрешен прием.',
        confidence='medium', alternatives=['lunch'], avoid_with=[],
    )),
    (['potassium'], TimingSuggestion(
        time_slot='breakfast', take_with_food=True, take_on_empty_stomach=False,
        reason='Take with food to prevent GI upset. Spread doses throughout the day rather than one large dose.',
        reason_bg='С храна — разпредели дозите през деня.',
        confidence='medium', alternatives=['lunch', 'dinner'], avoid_with=[],
    )),

    # ── Fish oil & fats ──
    (['fish oil', 'omega-3', 'omega 3', 'epa', 'dha', 'krill'], TimingSuggestion(
        time_slot='dinner', take_with_food=True, take_on_empty_stomach=False,
        reason='Must be taken with dietary fat for absorption. Evening dosing reduces fishy reflux; dinner is typically the fattiest meal.',
        reason_bg='Приемай с мазнини. Вечер намалява рибния рефлукс.',
        confidence='high', alternatives=['lunch', 'breakfast'], avoid_with=[],
    )),
    (['coq10', 'coenzyme q10', 'ubiquinol', 'ubiquinone'], TimingSuggestion(
        time_slot='breakfast', take_with_food=True, take_on_empty_stomach=False,
        reason='Fat-soluble antioxidant — take with dietary fat. Morning dose may slightly improve daytime energy.',
        reason_bg='Мастноразтворим антиоксидант — с мазнини. Сутрешен прием за енергия.',
        confidence='high', alternatives=['lunch', 'dinner'], avoid_with=[],
    )),

    # ── Sleep / melatonin / adaptogens ──
    (['melatonin'], TimingSuggestion(
        time_slot='bedtime', take_with_food=False, take_on_empty_stomach=False,
        reason='Take 30–60 min before desired sleep onset. Lower doses (0.3–1 mg) often work better than higher ones.',
        reason_bg='30–60 минути преди сън. Ниски дози (0.3–1 mg) често работят по-добре.',
        confidence='high', alternatives=['evening'], avoid_with=[],
    )),
    (['ashwagandha'], TimingSuggestion(
        time_slot='bedtime', take_with_food=False, take_on_empty_stomach=False,
        reason='Cortisol-lowering adaptogen — evening dose supports sleep and stress recovery. Morning dose is also valid for daytime stress.',
        reason_bg='Адаптоген, понижава кортизола — вечерен прием за сън и възстановяване.',
        confidence='medium', alternatives=['evening', 'morning'], avoid_with=[],
    )),
    (['glycine'], TimingSuggestion(
        time_slot='bedtime', take_with_food=False, take_on_empty_stomach=False,
        reason='Inhibitory neurotransmitter — 3 g before bed improves sleep onset and subjective sleep quality.',
        reason_bg='Инхибиторен невротрансмитер — 3 g преди сън.',
        confidence='high', alternatives=['evening'], avoid_with=[],
    )),
    (['l-theanine', 'theanine'], TimingSuggestion(
        time_slot='bedtime', take_with_food=False, take_on_empty_stomach=False,
        reason='Promotes calm without sedation. Bedtime or daytime with caffeine both work.',
        reason_bg='Успокоява без седация — преди сън или с кофеин през деня.',
        confidence='medium', alternatives=['midday', 'evening'], avoid_with=[],
    )),

    # ── Stimulants / morning ──
    (['caffeine'], TimingSuggestion(
        time_slot='morning', take_with_food=False, take_on_empty_stomach=False,
        reason='Half-life ~5 h — avoid after early afternoon to protect sleep. Ideally 60–90 min after waking to align with cortisol curve.',
        reason_bg='Полуживот ~5ч — избягвай след обяд. Идеално 60–90 мин след ставане.',
        confidence='high', alternatives=[], avoid_with=['iron', 'calcium'],
    )),
    (['creatine'], TimingSuggestion(
        time_slot='breakfast', take_with_food=True, take_on_empty_stomach=False,
        reason='Timing matters less than consistency. Post-workout or with a meal is fine. Target 3–5 g daily.',
        reason_bg='Времето е по-малко важно от постоянството. Постигни 3–5 g дневно.',
        confidence='medium', alternatives=['lunch', 'dinner', 'afternoon'], avoid_with=[],
    )),
    (['rhodiola'], TimingSuggestion(
        time_slot='morning', take_with_food=False, take_on_empty_stomach=True,
        reason='Mildly stimulatory adaptogen — morning dosing only. Late-day doses can disrupt sleep.',
        reason_bg='Леко стимулиращ адаптоген — само сутрин.',
        confidence='high', alternatives=['breakfast'], avoid_with=[],
    )),

    # ── Cardio / medications ──
    (['statin', 'atorvastatin', 'simvastatin', 'rosuvastatin', 'lovastatin', 'pravastatin'], TimingSuggestion(
        time_slot='bedtime', take_with_food=False, take_on_empty_stomach=False,
        reason='Endogenous cholesterol synthesis peaks at night. Short-half-life statins (simva/lovastatin) MUST be taken at bedtime; long half-life (atorva/rosuva) are flexible but evening is still standard.',
        reason_bg='Синтезът на холестерол достига пик през нощта — вечерен прием.',
        confidence='high', alternatives=['dinner', 'evening'], avoid_with=[],
    )),
    (['levothyroxine', 'eltroxin', 'euthyrox', 'synthroid', 'thyroxine'], TimingSuggestion(
        time_slot='fasted', take_with_food=False, take_on_empty_stomach=True,
        reason='Must be taken on an empty stomach, 30–60 min before breakfast. Keep 4h away from calcium, iron, and coffee — they can reduce absorption by up to 40%.',
        reason_bg='На гладно, 30–60 мин преди закуска. Дистанция 4ч от калций, желязо и кафе.',
        confidence='high', alternatives=['bedtime'], avoid_with=['calcium', 'iron', 'coffee', 'magnesium'],
    )),
    (['metformin'], TimingSuggestion(
        time_slot='dinner', take_with_food=True, take_on_empty_stomach=False,
        reason='Take with the largest meal to minimize GI side effects. Extended-release formulations are usually dosed with dinner.',
        reason_bg='С най-голямото хранене за намаляване на стомашни оплаквания.',
        confidence='high', alternatives=['lunch', 'breakfast'], avoid_with=[],
    )),
    (['aspirin'], TimingSuggestion(
        time_slot='bedtime', take_with_food=True, take_on_empty_stomach=False,
        reason='Low-dose aspirin for cardio protection: evidence suggests bedtime dosing better reduces morning BP surge and MI risk. Take with food to protect stomach.',
        reason_bg='Ниска доза за сърдечна защита — вечерен прием намалява сутрешното покачване на налягането.',
        confidence='medium', alternatives=['dinner'], avoid_with=[],
    )),

    # ── Probiotics ──
    (['probiotic', 'lactobacillus', 'bifidobacterium'], TimingSuggestion(
        time_slot='bedtime', take_with_food=False, take_on_empty_stomach=True,
        reason='Stomach acid is lowest at night — bedtime on empty stomach maximizes colony survival through the gastric phase.',
        reason_bg='Стомашната киселина е най-ниска през нощта — преди сън на гладно максимизира оцеляването на бактериите.',
        confidence='medium', alternatives=['fasted', 'morning'], avoid_with=[],
    )),
]


# ──────────────────────────────────────────────────────────────
# §RULES: Category fallbacks
# ──────────────────────────────────────────────────────────────

CATEGORY_RULES: dict[str, TimingSuggestion] = {
    'vitamin': TimingSuggestion(
        time_slot='breakfast', take_with_food=True, take_on_empty_stomach=False,
        reason='Generic vitamin — with breakfast for consistent absorption and to avoid bedtime effects.',
        reason_bg='Витамин — сутрин с храна за постоянно усвояване.',
        confidence='low', alternatives=['lunch'], avoid_with=[],
    ),
    'mineral': TimingSuggestion(
        time_slot='dinner', take_with_food=True, take_on_empty_stomach=False,
        reason='Minerals generally do well with food. Evening keeps them away from morning medications.',
        reason_bg='Минералите се понасят добре с храна.',
        confidence='low', alternatives=['lunch', 'breakfast'], avoid_with=[],
    ),
    'medication': TimingSuggestion(
        time_slot='breakfast', take_with_food=True, take_on_empty_stomach=False,
        reason='Default to morning with food unless your prescribing doctor specified otherwise. Check the pharmacy label.',
        reason_bg='По подразбиране сутрин с храна, освен ако лекарят не е указал друго.',
        confidence='low', alternatives=[], avoid_with=[],
    ),
    'probiotic': TimingSuggestion(
        time_slot='bedtime', take_with_food=False, take_on_empty_stomach=True,
        reason='Bedtime on empty stomach helps bacteria survive the gastric phase.',
        reason_bg='Преди сън на гладно.',
        confidence='medium', alternatives=['fasted', 'morning'], avoid_with=[],
    ),
    'protein': TimingSuggestion(
        time_slot='breakfast', take_with_food=False, take_on_empty_stomach=False,
        reason='Front-load protein in the morning for satiety and to support daily protein targets. Post-workout is the other good option.',
        reason_bg='Сутрин за засищане и поддържане на дневната норма протеин.',
        confidence='low', alternatives=['midday', 'afternoon'], avoid_with=[],
    ),
    'herb': TimingSuggestion(
        time_slot='breakfast', take_with_food=True, take_on_empty_stomach=False,
        reason='Most herbs are best taken with food to minimize stomach upset.',
        reason_bg='С храна за по-добра поносимост.',
        confidence='low', alternatives=['lunch', 'dinner'], avoid_with=[],
    ),
}

DEFAULT_SUGGESTION = TimingSuggestion(
    time_slot='breakfast', take_with_food=True, take_on_empty_stomach=False,
    reason='Morning with breakfast is a safe default — most supplements are well-absorbed with food and morning dosing avoids sleep disruption.',
    reason_bg='Сутрин с храна е безопасен избор по подразбиране.',
    confidence='low', alternatives=['lunch', 'dinner'], avoid_with=[],
)


# ──────────────────────────────────────────────────────────────
# §API
# ──────────────────────────────────────────────────────────────

def suggest_timing(
    name: str = '',
    category: str = '',
    form: str = '',
    take_with_food: Optional[bool] = None,
    take_on_empty_stomach: Optional[bool] = None,
) -> dict:
    """
    Suggest an optimal time slot + food context for a supplement.

    §ORDER: name match → category fallback → default.
    §OVERRIDE: Caller's explicit take_with_food / take_on_empty_stomach wins.
    """
    name_lc = (name or '').lower()

    match: Optional[TimingSuggestion] = None
    for keywords, suggestion in NAME_RULES:
        if any(kw in name_lc for kw in keywords):
            match = suggestion
            break

    if match is None and category:
        match = CATEGORY_RULES.get(category)

    if match is None:
        match = DEFAULT_SUGGESTION

    result = match.as_dict()

    # Honor user-supplied flags if they explicitly conflict with the rule
    if take_on_empty_stomach is True:
        result['take_on_empty_stomach'] = True
        result['take_with_food'] = False
    elif take_with_food is True:
        result['take_with_food'] = True
        result['take_on_empty_stomach'] = False

    return result
