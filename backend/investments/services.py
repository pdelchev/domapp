"""
=== PROPERTY ANALYSIS ENGINE ===
// §SERVICE:analyze_property — core computation engine
// §FLOW: views.py calls analyze_property(data) → returns dict with all metrics + verdict
// §DEPS: market_data.py (benchmarks), models.py (PropertyAnalysis)

Enhanced 8-dimension weighted scoring system (100 points total):
  Price vs Market:    20 pts  — asking price vs area average
  Rental Yield:       15 pts  — gross rental yield attractiveness
  Airbnb Potential:   10 pts  — short-term rental revenue potential
  Area Heat:          10 pts  — neighborhood appreciation + demand
  Property Quality:   10 pts  — condition, furnishing, floor, amenities
  Location Quality:   15 pts  — transport, infrastructure, green spaces, noise
  Risk Assessment:    10 pts  — earthquake, building age, construction, crime
  Market Trends:      10 pts  — appreciation history, demand trajectory
"""

from decimal import Decimal
from .market_data import get_market_data, get_country_info, MARKET_DATA

# §CONST — operating expense ratios by country
OPERATING_EXPENSE_PCT = {
    'Bulgaria': Decimal('0.15'),
    'UAE': Decimal('0.20'),
    'United Kingdom': Decimal('0.25'),
}

AIRBNB_EXPENSE_PCT = Decimal('0.35')

FURNISHING_RENT_MULT = {
    'unfurnished': Decimal('1.0'),
    'semi': Decimal('1.10'),
    'fully': Decimal('1.20'),
}

CONDITION_RENT_MULT = {
    'new': Decimal('1.15'),
    'renovated': Decimal('1.05'),
    'good': Decimal('1.0'),
    'needs_work': Decimal('0.85'),
}

BEDROOM_AIRBNB_MULT = {
    0: Decimal('0.7'),
    1: Decimal('1.0'),
    2: Decimal('1.35'),
    3: Decimal('1.65'),
    4: Decimal('1.90'),
}


# ═══ SCORING FUNCTIONS (8 dimensions) ═══

def _score_price_vs_market(pct_diff: float) -> int:
    """§SCORING:price — 20 points max"""
    if pct_diff <= -20:
        return 20
    elif pct_diff <= -10:
        return 17
    elif pct_diff <= -5:
        return 14
    elif pct_diff <= 0:
        return 12
    elif pct_diff <= 5:
        return 9
    elif pct_diff <= 10:
        return 6
    elif pct_diff <= 20:
        return 4
    else:
        return 2


def _score_rental_yield(gross_yield: float) -> int:
    """§SCORING:yield — 15 points max"""
    if gross_yield >= 8:
        return 15
    elif gross_yield >= 6:
        return 12
    elif gross_yield >= 4.5:
        return 9
    elif gross_yield >= 3:
        return 6
    else:
        return 3


def _score_airbnb(airbnb_yield: float) -> int:
    """§SCORING:airbnb — 10 points max"""
    if airbnb_yield >= 12:
        return 10
    elif airbnb_yield >= 8:
        return 8
    elif airbnb_yield >= 5:
        return 6
    elif airbnb_yield >= 3:
        return 4
    else:
        return 2


def _score_area_heat(appr_pct: float, high_value: bool) -> int:
    """§SCORING:area — 10 points max"""
    base = 0
    if appr_pct >= 9:
        base = 8
    elif appr_pct >= 7:
        base = 6
    elif appr_pct >= 5:
        base = 5
    elif appr_pct >= 3:
        base = 3
    else:
        base = 2
    if high_value:
        base = min(base + 2, 10)
    return base


def _score_property_quality(condition: str, furnishing: str, floor: int | None, total_floors: int | None, extras: dict | None = None) -> int:
    """§SCORING:quality — 10 points max"""
    score = 0.0
    cond_scores = {'new': 3.0, 'renovated': 2.5, 'good': 2.0, 'needs_work': 0.5}
    score += cond_scores.get(condition, 2.0)
    furn_scores = {'fully': 2.5, 'semi': 2.0, 'unfurnished': 1.0}
    score += furn_scores.get(furnishing, 1.0)
    if floor and total_floors and total_floors > 1:
        ratio = floor / total_floors
        if ratio >= 0.8:
            score += 2.0
        elif ratio >= 0.5:
            score += 1.5
        else:
            score += 0.5
    else:
        score += 1.0
    if extras:
        amenity_pts = 0.0
        if extras.get('has_garden'):
            amenity_pts += 0.5
        if extras.get('has_balcony') or extras.get('has_patio'):
            amenity_pts += 0.3
        if extras.get('has_elevator'):
            amenity_pts += 0.3
        if extras.get('has_ac') or extras.get('has_heating'):
            amenity_pts += 0.3
        if extras.get('has_pool'):
            amenity_pts += 0.5
        if extras.get('has_view'):
            amenity_pts += 0.5
        if extras.get('num_bathrooms', 1) >= 2:
            amenity_pts += 0.3
        score += min(amenity_pts, 2.5)
    return min(int(round(score)), 10)


def _score_location_quality(market: dict, user_data: dict) -> int:
    """§SCORING:location — 15 points max
    Based on area-level data (transport, infrastructure, green spaces, noise, crime)
    plus user-provided proximity flags.
    """
    score = 0.0
    # Transport (0-4): from market data + user metro flag
    transport = market.get('transport_score', 5)
    score += min(transport * 0.4, 4.0)
    if user_data.get('near_metro'):
        score += 0.5

    # Infrastructure (0-4): from market data + user proximity flags
    infra = market.get('infrastructure_score', 5)
    score += min(infra * 0.35, 3.5)
    if user_data.get('near_school'):
        score += 0.25
    if user_data.get('near_hospital'):
        score += 0.25

    # Green spaces (0-3): from market data + user park flag
    green = market.get('green_spaces', 5)
    score += min(green * 0.25, 2.5)
    if user_data.get('near_park'):
        score += 0.5

    # Noise penalty (0 to -2): higher noise = penalty
    noise = market.get('noise_level', 5)
    if noise >= 7:
        score -= 1.5
    elif noise >= 5:
        score -= 0.5

    return max(0, min(int(round(score)), 15))


def _score_risk_assessment(market: dict, user_data: dict, year_built: int | None, condition: str, country: str) -> tuple[int, list[dict]]:
    """§SCORING:risk — 10 points max (higher = less risky = better)
    Returns (score, risk_factors_list)
    """
    score = 10.0  # Start perfect, deduct for risks
    risk_factors = []

    # Seismic risk (BG-specific)
    seismic = market.get('seismic_zone', 0)
    if seismic >= 3:
        score -= 2.0
        risk_factors.append({'factor': 'high_seismic_zone', 'severity': 'high',
                             'text_en': 'High earthquake risk zone (Zone 3)',
                             'text_bg': 'Висок сеизмичен риск (Зона 3)'})
    elif seismic == 2:
        score -= 0.5
        risk_factors.append({'factor': 'moderate_seismic_zone', 'severity': 'low',
                             'text_en': 'Moderate seismic activity zone',
                             'text_bg': 'Умерена сеизмична активност'})

    # Panel building risk (BG)
    construction = user_data.get('construction_type', '')
    panel_pct = market.get('panel_buildings_pct', 0)
    if construction == 'panel':
        score -= 2.5
        risk_factors.append({'factor': 'panel_construction', 'severity': 'high',
                             'text_en': 'Panel (prefab) construction — lower earthquake resistance, insulation issues',
                             'text_bg': 'Панелно строителство — по-ниска земетръсна устойчивост, проблеми с изолацията'})
    elif construction == 'wood':
        score -= 1.5
        risk_factors.append({'factor': 'wood_construction', 'severity': 'medium',
                             'text_en': 'Wooden construction — fire and moisture risk',
                             'text_bg': 'Дървена конструкция — риск от пожар и влага'})
    elif panel_pct > 50 and not construction:
        score -= 0.5
        risk_factors.append({'factor': 'high_panel_area', 'severity': 'low',
                             'text_en': f'Area has {panel_pct}% panel buildings — verify construction type',
                             'text_bg': f'Районът има {panel_pct}% панелни сгради — проверете типа строителство'})

    # Building age risk
    if year_built:
        import datetime
        age = datetime.date.today().year - year_built
        if age > 50:
            score -= 2.0
            risk_factors.append({'factor': 'very_old_building', 'severity': 'high',
                                 'text_en': f'Building is {age} years old — likely needs major renovation',
                                 'text_bg': f'Сградата е на {age} години — вероятно се нуждае от основен ремонт'})
        elif age > 30:
            score -= 1.0
            risk_factors.append({'factor': 'aging_building', 'severity': 'medium',
                                 'text_en': f'Building is {age} years old — check structural condition',
                                 'text_bg': f'Сградата е на {age} години — проверете конструктивното състояние'})
        elif age > 15:
            score -= 0.5
            risk_factors.append({'factor': 'mature_building', 'severity': 'low',
                                 'text_en': f'Building is {age} years old',
                                 'text_bg': f'Сградата е на {age} години'})

    # Crime risk
    crime = market.get('crime_index', 3)
    if crime >= 6:
        score -= 1.5
        risk_factors.append({'factor': 'high_crime', 'severity': 'high',
                             'text_en': 'Above-average crime rate in the area',
                             'text_bg': 'Над средното ниво на престъпност в района'})
    elif crime >= 4:
        score -= 0.5
        risk_factors.append({'factor': 'moderate_crime', 'severity': 'low',
                             'text_en': 'Average crime rate in the area',
                             'text_bg': 'Средно ниво на престъпност в района'})

    # Condition risk
    if condition == 'needs_work':
        score -= 1.0
        risk_factors.append({'factor': 'needs_renovation', 'severity': 'medium',
                             'text_en': 'Property needs renovation — budget for unexpected costs',
                             'text_bg': 'Имотът се нуждае от ремонт — предвидете неочаквани разходи'})

    # Noise risk
    noise = market.get('noise_level', 5)
    if noise >= 7:
        risk_factors.append({'factor': 'noisy_area', 'severity': 'medium',
                             'text_en': 'High noise area — may affect tenant retention and rent prices',
                             'text_bg': 'Шумен район — може да повлияе на задържането на наематели и наемните цени'})

    # Market volatility (demand declining)
    demand = market.get('demand_trend', 'stable')
    if demand == 'declining':
        score -= 1.5
        risk_factors.append({'factor': 'declining_demand', 'severity': 'high',
                             'text_en': 'Market demand is declining — higher vacancy risk',
                             'text_bg': 'Пазарното търсене намалява — по-висок риск от празен имот'})

    return max(0, min(int(round(score)), 10)), risk_factors


def _score_market_trends(market: dict) -> int:
    """§SCORING:trends — 10 points max
    Based on appreciation history trend and demand direction.
    """
    score = 0.0
    history = market.get('appreciation_history', [])
    demand = market.get('demand_trend', 'stable')

    if len(history) >= 3:
        # Trend direction: is appreciation accelerating?
        recent_avg = sum(history[-2:]) / 2
        older_avg = sum(history[:2]) / 2 if len(history) >= 4 else history[0]
        if recent_avg > older_avg * 1.3:
            score += 5.0  # Strong upward trend
        elif recent_avg > older_avg * 1.1:
            score += 3.5  # Moderate upward
        elif recent_avg >= older_avg * 0.9:
            score += 2.0  # Stable
        else:
            score += 0.5  # Declining

        # Latest year appreciation
        latest = history[-1] if history else 0
        if latest >= 8:
            score += 3.0
        elif latest >= 6:
            score += 2.0
        elif latest >= 4:
            score += 1.5
        else:
            score += 0.5
    else:
        score += 3.0  # No history = neutral

    # Demand trend bonus
    if demand == 'rising':
        score += 2.0
    elif demand == 'stable':
        score += 1.0

    return max(0, min(int(round(score)), 10))


def _renovation_roi(renovation_cost: float, condition: str, monthly_rent_before: float, monthly_rent_after: float, total_cost: float) -> float | None:
    """Calculate renovation ROI: extra annual rent / renovation cost × 100"""
    if renovation_cost <= 0:
        return None
    rent_increase_annual = (monthly_rent_after - monthly_rent_before) * 12
    if rent_increase_annual <= 0:
        return 0.0
    return round((rent_increase_annual / renovation_cost) * 100, 2)


def _verdict_from_score(score: int) -> str:
    """§MAP:score→verdict"""
    if score >= 80:
        return 'strong_buy'
    elif score >= 65:
        return 'buy'
    elif score >= 50:
        return 'hold'
    elif score >= 35:
        return 'overpriced'
    else:
        return 'avoid'


def _build_recommendation(verdict: str, score: int, breakdown: dict, risk_factors: list, data: dict, result: dict) -> tuple[str, str]:
    """Generate detailed recommendation text in EN and BG."""
    city = data.get('city', '')
    area = data.get('area', '')
    location = f"{area}, {city}" if area else city

    # EN recommendation
    lines_en = []
    if verdict == 'strong_buy':
        lines_en.append(f"Strong Buy — This property in {location} scores {score}/100 and represents an excellent investment opportunity.")
    elif verdict == 'buy':
        lines_en.append(f"Buy — This property in {location} scores {score}/100 with positive investment fundamentals.")
    elif verdict == 'hold':
        lines_en.append(f"Hold — This property in {location} scores {score}/100. Consider negotiating a lower price or wait for better conditions.")
    elif verdict == 'overpriced':
        lines_en.append(f"Overpriced — This property in {location} scores {score}/100. The asking price is too high relative to its potential.")
    else:
        lines_en.append(f"Avoid — This property in {location} scores {score}/100. Poor investment metrics across multiple dimensions.")

    # Highlight strengths
    strengths = []
    for key, dim in breakdown.items():
        pct = dim['score'] / dim['max'] * 100
        if pct >= 75:
            strengths.append(dim.get('label_en', key.replace('_', ' ').title()))
    if strengths:
        lines_en.append(f"Strengths: {', '.join(strengths)}.")

    # Highlight weaknesses
    weaknesses = []
    for key, dim in breakdown.items():
        pct = dim['score'] / dim['max'] * 100
        if pct < 40:
            weaknesses.append(dim.get('label_en', key.replace('_', ' ').title()))
    if weaknesses:
        lines_en.append(f"Weaknesses: {', '.join(weaknesses)}.")

    # Key metrics
    gy = result.get('gross_rental_yield', 0)
    cap = result.get('cap_rate', 0)
    roi5 = result.get('roi_5_year', 0)
    pvm = result.get('price_vs_market_pct', 0)
    lines_en.append(f"Key metrics: {gy:.1f}% gross yield, {cap:.1f}% CAP rate, {roi5:.0f}% projected 5-year ROI, {pvm:+.1f}% vs market price.")

    # Risk summary
    high_risks = [r for r in risk_factors if r['severity'] == 'high']
    if high_risks:
        lines_en.append(f"Warning: {len(high_risks)} high-severity risk(s) identified — review risk panel carefully.")

    renovation_cost = float(data.get('renovation_cost', 0))
    reno_roi = result.get('renovation_roi')
    if renovation_cost > 0 and reno_roi is not None:
        lines_en.append(f"Renovation investment of €{renovation_cost:,.0f} yields {reno_roi:.1f}% annual ROI from increased rent.")

    # BG recommendation
    lines_bg = []
    if verdict == 'strong_buy':
        lines_bg.append(f"Силна покупка — Имотът в {location} получава {score}/100 и представлява отлична инвестиционна възможност.")
    elif verdict == 'buy':
        lines_bg.append(f"Покупка — Имотът в {location} получава {score}/100 с положителни инвестиционни показатели.")
    elif verdict == 'hold':
        lines_bg.append(f"Изчакване — Имотът в {location} получава {score}/100. Опитайте да договорите по-ниска цена.")
    elif verdict == 'overpriced':
        lines_bg.append(f"Надценен — Имотът в {location} получава {score}/100. Исканата цена е твърде висока спрямо потенциала.")
    else:
        lines_bg.append(f"Избягвайте — Имотът в {location} получава {score}/100. Слаби инвестиционни показатели.")

    lines_bg.append(f"Ключови показатели: {gy:.1f}% брутна доходност, {cap:.1f}% CAP, {roi5:.0f}% прогнозна 5-годишна ROI, {pvm:+.1f}% спрямо пазарна цена.")

    if high_risks:
        lines_bg.append(f"Внимание: {len(high_risks)} високорисков(и) фактор(а) — прегледайте панела за рискове.")

    if renovation_cost > 0 and reno_roi is not None:
        lines_bg.append(f"Инвестиция в ремонт от €{renovation_cost:,.0f} носи {reno_roi:.1f}% годишна ROI от повишен наем.")

    return ' '.join(lines_en), ' '.join(lines_bg)


def analyze_property(data: dict) -> dict:
    """
    §ENTRY — Main analysis function (enhanced 8-dimension scoring).
    """
    country = data.get('country', '')
    city = data.get('city', '')
    area = data.get('area', '')
    sqm = Decimal(str(data.get('square_meters', 0)))
    asking_price = Decimal(str(data.get('asking_price', 0)))
    parking_included = data.get('parking_included', False)
    parking_price = Decimal(str(data.get('parking_price', 0))) if not parking_included else Decimal('0')
    condition = data.get('condition', 'good')
    furnishing = data.get('furnishing', 'unfurnished')
    floor = data.get('floor')
    total_floors = data.get('total_floors')
    year_built = data.get('year_built')
    num_bedrooms = int(data.get('num_bedrooms', 1))
    renovation_cost = Decimal(str(data.get('renovation_cost', 0)))
    monthly_fees = Decimal(str(data.get('monthly_fees', 0)))

    # Acquisition costs (notary, tax, lawyer, agent, other)
    notary_fees = Decimal(str(data.get('notary_fees', 0)))
    acquisition_tax = Decimal(str(data.get('acquisition_tax', 0)))
    lawyer_fees = Decimal(str(data.get('lawyer_fees', 0)))
    agent_commission = Decimal(str(data.get('agent_commission', 0)))
    other_costs = Decimal(str(data.get('other_costs', 0)))
    total_acquisition = notary_fees + acquisition_tax + lawyer_fees + agent_commission + other_costs

    # §STEP:1 — Look up market data
    market = get_market_data(country, city, area)
    country_info = get_country_info(country)

    if not market:
        city_areas = [
            v for (c, ci, _), v in MARKET_DATA.items()
            if c == country and ci == city
        ]
        if city_areas:
            market = {
                'avg_sqm': sum(a['avg_sqm'] for a in city_areas) / len(city_areas),
                'min_sqm': min(a['min_sqm'] for a in city_areas),
                'max_sqm': max(a['max_sqm'] for a in city_areas),
                'rent_sqm': sum(a['rent_sqm'] for a in city_areas) / len(city_areas),
                'airbnb_adr': sum(a['airbnb_adr'] for a in city_areas) / len(city_areas),
                'airbnb_occ': sum(a['airbnb_occ'] for a in city_areas) / len(city_areas),
                'yield_pct': sum(a['yield_pct'] for a in city_areas) / len(city_areas),
                'appr_pct': sum(a['appr_pct'] for a in city_areas) / len(city_areas),
                'high_value': False,
                'parking_premium': sum(a['parking_premium'] for a in city_areas) / len(city_areas),
                'transport_score': sum(a.get('transport_score', 5) for a in city_areas) / len(city_areas),
                'infrastructure_score': sum(a.get('infrastructure_score', 5) for a in city_areas) / len(city_areas),
                'green_spaces': sum(a.get('green_spaces', 5) for a in city_areas) / len(city_areas),
                'noise_level': sum(a.get('noise_level', 5) for a in city_areas) / len(city_areas),
                'crime_index': sum(a.get('crime_index', 3) for a in city_areas) / len(city_areas),
                'seismic_zone': max(a.get('seismic_zone', 0) for a in city_areas),
                'panel_buildings_pct': sum(a.get('panel_buildings_pct', 0) for a in city_areas) / len(city_areas),
                'appreciation_history': [],
                'demand_trend': 'stable',
            }

    if not market or sqm <= 0 or asking_price <= 0:
        return {
            'error': 'Insufficient data or unsupported location',
            'supported_countries': list(set(c for c, _, _ in MARKET_DATA.keys())),
        }

    # §STEP:2 — Price calculations
    total_cost = asking_price + parking_price + renovation_cost + total_acquisition
    price_per_sqm = asking_price / sqm
    market_avg = Decimal(str(market['avg_sqm']))
    price_vs_market_pct = float(((price_per_sqm - market_avg) / market_avg) * 100)

    # §STEP:3 — Standard rent estimate
    base_rent_sqm = Decimal(str(market['rent_sqm']))
    furn_mult = FURNISHING_RENT_MULT.get(furnishing, Decimal('1.0'))
    cond_mult = CONDITION_RENT_MULT.get(condition, Decimal('1.0'))
    amenity_mult = Decimal('1.0')
    if data.get('has_garden'):
        amenity_mult += Decimal('0.08')
    if data.get('has_balcony') or data.get('has_patio'):
        amenity_mult += Decimal('0.03')
    if int(data.get('num_bathrooms', 1)) >= 2:
        amenity_mult += Decimal('0.05')
    if data.get('has_ac'):
        amenity_mult += Decimal('0.03')
    if data.get('has_pool'):
        amenity_mult += Decimal('0.10')
    if data.get('has_gym'):
        amenity_mult += Decimal('0.03')
    if data.get('has_view'):
        vt = data.get('view_type', '')
        if vt == 'sea':
            amenity_mult += Decimal('0.15')
        elif vt == 'mountain':
            amenity_mult += Decimal('0.08')
        elif vt == 'city':
            amenity_mult += Decimal('0.05')
        else:
            amenity_mult += Decimal('0.03')

    monthly_rent = sqm * base_rent_sqm * furn_mult * cond_mult * amenity_mult
    annual_rent = monthly_rent * 12

    # Rent estimate WITHOUT renovation premium (for renovation ROI calc)
    cond_mult_before = CONDITION_RENT_MULT.get('needs_work', Decimal('0.85')) if condition == 'needs_work' and renovation_cost > 0 else cond_mult
    monthly_rent_before_reno = sqm * base_rent_sqm * furn_mult * cond_mult_before * amenity_mult

    # §STEP:4 — Airbnb revenue estimate
    base_adr = Decimal(str(market['airbnb_adr']))
    occupancy = Decimal(str(market['airbnb_occ']))
    bedroom_mult = BEDROOM_AIRBNB_MULT.get(min(num_bedrooms, 4), Decimal('1.0'))
    airbnb_furn_mult = Decimal('1.0')
    if furnishing == 'fully':
        airbnb_furn_mult = Decimal('1.10')
    elif furnishing == 'unfurnished':
        airbnb_furn_mult = Decimal('0.80')

    adjusted_adr = base_adr * bedroom_mult * airbnb_furn_mult
    airbnb_monthly = adjusted_adr * occupancy * 30
    airbnb_annual = adjusted_adr * occupancy * 365

    # §STEP:5 — Yield calculations
    opex_pct = OPERATING_EXPENSE_PCT.get(country, Decimal('0.20'))
    annual_fees = monthly_fees * 12
    gross_rental_yield = float((annual_rent / total_cost) * 100) if total_cost > 0 else 0
    net_operating_income = annual_rent * (1 - opex_pct) - annual_fees
    net_rental_yield = float((net_operating_income / total_cost) * 100) if total_cost > 0 else 0

    airbnb_net = airbnb_annual * (1 - AIRBNB_EXPENSE_PCT)
    airbnb_yield_pct = float((airbnb_net / total_cost) * 100) if total_cost > 0 else 0

    cap_rate = float((net_operating_income / total_cost) * 100) if total_cost > 0 else 0

    # §STEP:6 — ROI projections
    appr_pct = Decimal(str(market['appr_pct'])) / 100
    annual_net_income = float(net_operating_income)
    total_cost_f = float(total_cost)

    value_5y = float(total_cost) * ((1 + float(appr_pct)) ** 5)
    appreciation_5y = value_5y - total_cost_f
    total_return_5y = (annual_net_income * 5) + appreciation_5y
    roi_5_year = (total_return_5y / total_cost_f) * 100 if total_cost_f > 0 else 0

    value_10y = float(total_cost) * ((1 + float(appr_pct)) ** 10)
    appreciation_10y = value_10y - total_cost_f
    total_return_10y = (annual_net_income * 10) + appreciation_10y
    roi_10_year = (total_return_10y / total_cost_f) * 100 if total_cost_f > 0 else 0

    monthly_net = float(net_operating_income) / 12
    break_even_months = int(total_cost_f / monthly_net) if monthly_net > 0 else 999

    # §STEP:7 — Area heat score (0-100)
    heat_base = min(float(market['appr_pct']) * 8, 60)
    heat_yield = min(float(market['yield_pct']) * 4, 25)
    heat_premium = 15 if market.get('high_value') else 0
    area_heat_score = min(int(heat_base + heat_yield + heat_premium), 100)

    # §STEP:8 — Renovation ROI
    reno_roi = _renovation_roi(
        float(renovation_cost), condition,
        float(monthly_rent_before_reno), float(monthly_rent),
        total_cost_f
    )

    # §STEP:9 — 8-dimension scoring
    s_price = _score_price_vs_market(price_vs_market_pct)
    s_yield = _score_rental_yield(gross_rental_yield)
    s_airbnb = _score_airbnb(airbnb_yield_pct)
    s_area = _score_area_heat(float(market['appr_pct']), market.get('high_value', False))

    extras = {
        'has_garden': data.get('has_garden', False),
        'has_balcony': data.get('has_balcony', False),
        'has_patio': data.get('has_patio', False),
        'has_elevator': data.get('has_elevator', False),
        'has_storage': data.get('has_storage', False),
        'has_ac': data.get('has_ac', False),
        'has_heating': data.get('has_heating', False),
        'has_pool': data.get('has_pool', False),
        'has_gym': data.get('has_gym', False),
        'has_view': data.get('has_view', False),
        'num_bathrooms': int(data.get('num_bathrooms', 1)),
    }
    s_quality = _score_property_quality(condition, furnishing, floor, total_floors, extras)
    s_location = _score_location_quality(market, data)
    s_risk, risk_factors = _score_risk_assessment(market, data, year_built, condition, country)
    s_trends = _score_market_trends(market)

    verdict_score = s_price + s_yield + s_airbnb + s_area + s_quality + s_location + s_risk + s_trends
    verdict = _verdict_from_score(verdict_score)

    score_breakdown = {
        'price_vs_market': {'score': s_price, 'max': 20, 'label_en': 'Price vs Market', 'label_bg': 'Цена спрямо пазара'},
        'rental_yield': {'score': s_yield, 'max': 15, 'label_en': 'Rental Yield', 'label_bg': 'Доходност от наем'},
        'airbnb_potential': {'score': s_airbnb, 'max': 10, 'label_en': 'Airbnb Potential', 'label_bg': 'Airbnb потенциал'},
        'area_heat': {'score': s_area, 'max': 10, 'label_en': 'Area Demand', 'label_bg': 'Търсене в района'},
        'property_quality': {'score': s_quality, 'max': 10, 'label_en': 'Property Quality', 'label_bg': 'Качество на имота'},
        'location_quality': {'score': s_location, 'max': 15, 'label_en': 'Location Quality', 'label_bg': 'Качество на локацията'},
        'risk_assessment': {'score': s_risk, 'max': 10, 'label_en': 'Risk Assessment', 'label_bg': 'Оценка на риска'},
        'market_trends': {'score': s_trends, 'max': 10, 'label_en': 'Market Trends', 'label_bg': 'Пазарни тенденции'},
    }

    # §STEP:10 — Build result
    currency = country_info.get('currency', 'EUR') if country_info else 'EUR'

    result = {
        'country': country,
        'city': city,
        'area': area,
        'currency': currency,

        'total_cost': float(total_cost),
        'cost_breakdown': {
            'asking_price': float(asking_price),
            'notary_fees': float(notary_fees),
            'acquisition_tax': float(acquisition_tax),
            'lawyer_fees': float(lawyer_fees),
            'agent_commission': float(agent_commission),
            'other_costs': float(other_costs),
            'renovation_cost': float(renovation_cost),
            'parking_price': float(parking_price),
            'total_acquisition': float(total_acquisition),
        },
        'price_per_sqm': round(float(price_per_sqm), 2),
        'market_avg_sqm': float(market_avg),
        'market_min_sqm': market['min_sqm'],
        'market_max_sqm': market['max_sqm'],
        'price_vs_market_pct': round(price_vs_market_pct, 2),

        'estimated_monthly_rent': round(float(monthly_rent), 2),
        'estimated_annual_rent': round(float(annual_rent), 2),
        'gross_rental_yield': round(gross_rental_yield, 2),
        'net_rental_yield': round(net_rental_yield, 2),
        'operating_expenses_pct': float(opex_pct) * 100,

        'estimated_airbnb_daily': round(float(adjusted_adr), 2),
        'estimated_airbnb_monthly': round(float(airbnb_monthly), 2),
        'airbnb_annual_revenue': round(float(airbnb_annual), 2),
        'airbnb_yield': round(airbnb_yield_pct, 2),
        'airbnb_occupancy_pct': float(occupancy) * 100,

        'cap_rate': round(cap_rate, 2),
        'roi_5_year': round(roi_5_year, 2),
        'roi_10_year': round(roi_10_year, 2),
        'projected_value_5y': round(value_5y, 2),
        'projected_value_10y': round(value_10y, 2),
        'break_even_months': break_even_months,
        'annual_appreciation_pct': float(market['appr_pct']),

        'area_heat_score': area_heat_score,
        'high_value_area': market.get('high_value', False),
        'verdict': verdict,
        'verdict_score': verdict_score,
        'score_breakdown': score_breakdown,

        'parking_value_pct': round(
            float(parking_price / total_cost * 100) if total_cost > 0 and parking_price > 0 else 0, 1
        ),
        'market_parking_premium_pct': market.get('parking_premium', 0) * 100,

        'renovation_cost': float(renovation_cost),
        'monthly_fees': float(monthly_fees),
        'annual_fees': float(annual_fees),

        # New enhanced fields
        'location_score': s_location,
        'risk_score': s_risk,
        'market_trend_score': s_trends,
        'renovation_roi': reno_roi,
        'risk_factors': risk_factors,
        'appreciation_history': market.get('appreciation_history', []),
        'demand_trend': market.get('demand_trend', 'stable'),
        'seismic_zone': market.get('seismic_zone', 0),
        'panel_buildings_pct': market.get('panel_buildings_pct', 0),
        'transport_score': market.get('transport_score', 5),
        'infrastructure_score': market.get('infrastructure_score', 5),
        'green_spaces_score': market.get('green_spaces', 5),
        'noise_level_score': market.get('noise_level', 5),
        'crime_index': market.get('crime_index', 3),
    }

    # Generate recommendation text
    rec_en, rec_bg = _build_recommendation(verdict, verdict_score, score_breakdown, risk_factors, data, result)
    result['recommendation_text'] = rec_en
    result['recommendation_text_bg'] = rec_bg

    return result
