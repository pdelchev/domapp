"""
=== PROPERTY ANALYSIS ENGINE ===
// §SERVICE:analyze_property — core computation engine
// §FLOW: views.py calls analyze_property(data) → returns dict with all metrics + verdict
// §DEPS: market_data.py (benchmarks), models.py (PropertyAnalysis)

Weighted scoring system:
  Price vs Market:    30 pts  — how the asking price compares to area average
  Rental Yield:       25 pts  — gross rental yield attractiveness
  Airbnb Potential:   15 pts  — short-term rental revenue potential
  Area Heat:          15 pts  — neighborhood appreciation + demand
  Property Quality:   15 pts  — condition, furnishing, floor premium
"""

from decimal import Decimal
from .market_data import get_market_data, get_country_info, MARKET_DATA

# §CONST — operating expense ratios by country
OPERATING_EXPENSE_PCT = {
    'Bulgaria': Decimal('0.15'),     # 15% of gross rent (mgmt, maintenance, vacancy)
    'UAE': Decimal('0.20'),          # 20% (service charges are high)
    'United Kingdom': Decimal('0.25'),  # 25% (higher taxes, letting agent fees)
}

# §CONST — Airbnb operating expense ratio (cleaning, platform fees, supplies)
AIRBNB_EXPENSE_PCT = Decimal('0.35')

# §CONST — furnishing premium multipliers for rent
FURNISHING_RENT_MULT = {
    'unfurnished': Decimal('1.0'),
    'semi': Decimal('1.10'),
    'fully': Decimal('1.20'),
}

# §CONST — condition adjustment for rent
CONDITION_RENT_MULT = {
    'new': Decimal('1.15'),
    'renovated': Decimal('1.05'),
    'good': Decimal('1.0'),
    'needs_work': Decimal('0.85'),
}

# §CONST — bedroom multiplier for Airbnb ADR
BEDROOM_AIRBNB_MULT = {
    0: Decimal('0.7'),   # studio
    1: Decimal('1.0'),
    2: Decimal('1.35'),
    3: Decimal('1.65'),
    4: Decimal('1.90'),
}


def _score_price_vs_market(pct_diff: float) -> int:
    """
    §SCORING:price — 30 points max
    pct_diff: negative = below market (good), positive = above market (bad)
    """
    if pct_diff <= -20:
        return 30
    elif pct_diff <= -10:
        return 25
    elif pct_diff <= 0:
        return 20
    elif pct_diff <= 10:
        return 14
    elif pct_diff <= 20:
        return 8
    else:
        return 3


def _score_rental_yield(gross_yield: float) -> int:
    """§SCORING:yield — 25 points max"""
    if gross_yield >= 8:
        return 25
    elif gross_yield >= 6:
        return 20
    elif gross_yield >= 4.5:
        return 15
    elif gross_yield >= 3:
        return 10
    else:
        return 5


def _score_airbnb(airbnb_yield: float) -> int:
    """§SCORING:airbnb — 15 points max"""
    if airbnb_yield >= 12:
        return 15
    elif airbnb_yield >= 8:
        return 12
    elif airbnb_yield >= 5:
        return 9
    elif airbnb_yield >= 3:
        return 6
    else:
        return 3


def _score_area_heat(appr_pct: float, high_value: bool) -> int:
    """§SCORING:area — 15 points max"""
    base = 0
    if appr_pct >= 9:
        base = 12
    elif appr_pct >= 7:
        base = 10
    elif appr_pct >= 5:
        base = 7
    elif appr_pct >= 3:
        base = 5
    else:
        base = 3
    if high_value:
        base = min(base + 3, 15)
    return base


def _score_property_quality(condition: str, furnishing: str, floor: int | None, total_floors: int | None) -> int:
    """§SCORING:quality — 15 points max"""
    score = 0
    # Condition
    cond_scores = {'new': 6, 'renovated': 5, 'good': 3, 'needs_work': 1}
    score += cond_scores.get(condition, 3)
    # Furnishing
    furn_scores = {'fully': 5, 'semi': 3, 'unfurnished': 2}
    score += furn_scores.get(furnishing, 2)
    # Floor premium (higher floors generally better, penthouse floor = max)
    if floor and total_floors and total_floors > 1:
        floor_ratio = floor / total_floors
        if floor_ratio >= 0.8:
            score += 4
        elif floor_ratio >= 0.5:
            score += 3
        elif floor_ratio >= 0.2:
            score += 2
        else:
            score += 1
    else:
        score += 2  # neutral if unknown
    return min(score, 15)


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


def analyze_property(data: dict) -> dict:
    """
    §ENTRY — Main analysis function.
    Input: dict with property details (country, city, area, sqm, price, etc.)
    Output: dict with all computed metrics + verdict + score

    Computation flow:
    1. Look up market benchmarks for the area
    2. Compute price/sqm and compare to market
    3. Estimate standard rent (rent_sqm × sqm × adjustments)
    4. Estimate Airbnb revenue (ADR × occupancy × bedroom multiplier)
    5. Compute yields, cap rate, ROI projections
    6. Score each dimension and compute weighted verdict
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
    num_bedrooms = int(data.get('num_bedrooms', 1))

    # §STEP:1 — Look up market data
    market = get_market_data(country, city, area)
    country_info = get_country_info(country)

    # If area not found, try to find city average
    if not market:
        city_areas = [
            v for (c, ci, _), v in MARKET_DATA.items()
            if c == country and ci == city
        ]
        if city_areas:
            # Use average of all areas in the city
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
            }

    if not market or sqm <= 0 or asking_price <= 0:
        return {
            'error': 'Insufficient data or unsupported location',
            'supported_countries': list(set(c for c, _, _ in MARKET_DATA.keys())),
        }

    # §STEP:2 — Price calculations
    total_cost = asking_price + parking_price
    price_per_sqm = asking_price / sqm
    market_avg = Decimal(str(market['avg_sqm']))
    price_vs_market_pct = float(((price_per_sqm - market_avg) / market_avg) * 100)

    # §STEP:3 — Standard rent estimate
    base_rent_sqm = Decimal(str(market['rent_sqm']))
    furn_mult = FURNISHING_RENT_MULT.get(furnishing, Decimal('1.0'))
    cond_mult = CONDITION_RENT_MULT.get(condition, Decimal('1.0'))
    monthly_rent = sqm * base_rent_sqm * furn_mult * cond_mult
    annual_rent = monthly_rent * 12

    # §STEP:4 — Airbnb revenue estimate
    base_adr = Decimal(str(market['airbnb_adr']))
    occupancy = Decimal(str(market['airbnb_occ']))
    bedroom_mult = BEDROOM_AIRBNB_MULT.get(
        min(num_bedrooms, 4), Decimal('1.0')
    )
    # Furnishing boost for Airbnb (furnished properties earn more)
    airbnb_furn_mult = Decimal('1.0')
    if furnishing == 'fully':
        airbnb_furn_mult = Decimal('1.10')
    elif furnishing == 'semi':
        airbnb_furn_mult = Decimal('1.0')
    else:
        airbnb_furn_mult = Decimal('0.80')  # unfurnished can't really do Airbnb well

    adjusted_adr = base_adr * bedroom_mult * airbnb_furn_mult
    airbnb_monthly = adjusted_adr * occupancy * 30
    airbnb_annual = adjusted_adr * occupancy * 365

    # §STEP:5 — Yield calculations
    opex_pct = OPERATING_EXPENSE_PCT.get(country, Decimal('0.20'))
    gross_rental_yield = float((annual_rent / total_cost) * 100) if total_cost > 0 else 0
    net_operating_income = annual_rent * (1 - opex_pct)
    net_rental_yield = float((net_operating_income / total_cost) * 100) if total_cost > 0 else 0

    airbnb_net = airbnb_annual * (1 - AIRBNB_EXPENSE_PCT)
    airbnb_yield_pct = float((airbnb_net / total_cost) * 100) if total_cost > 0 else 0

    cap_rate = float((net_operating_income / total_cost) * 100) if total_cost > 0 else 0

    # §STEP:6 — ROI projections (appreciation + net rental income)
    appr_pct = Decimal(str(market['appr_pct'])) / 100
    annual_net_income = float(net_operating_income)
    total_cost_f = float(total_cost)

    # 5-year ROI: cumulative net rent + appreciation
    value_5y = float(total_cost) * ((1 + float(appr_pct)) ** 5)
    appreciation_5y = value_5y - total_cost_f
    total_return_5y = (annual_net_income * 5) + appreciation_5y
    roi_5_year = (total_return_5y / total_cost_f) * 100 if total_cost_f > 0 else 0

    # 10-year ROI
    value_10y = float(total_cost) * ((1 + float(appr_pct)) ** 10)
    appreciation_10y = value_10y - total_cost_f
    total_return_10y = (annual_net_income * 10) + appreciation_10y
    roi_10_year = (total_return_10y / total_cost_f) * 100 if total_cost_f > 0 else 0

    # Break-even months (months until cumulative net rent covers total investment)
    monthly_net = float(net_operating_income) / 12
    break_even_months = int(total_cost_f / monthly_net) if monthly_net > 0 else 999

    # §STEP:7 — Area heat score (0-100)
    heat_base = min(float(market['appr_pct']) * 8, 60)  # up to 60 from appreciation
    heat_yield = min(float(market['yield_pct']) * 4, 25)  # up to 25 from yield
    heat_premium = 15 if market.get('high_value') else 0
    area_heat_score = min(int(heat_base + heat_yield + heat_premium), 100)

    # §STEP:8 — Weighted verdict scoring
    s_price = _score_price_vs_market(price_vs_market_pct)
    s_yield = _score_rental_yield(gross_rental_yield)
    s_airbnb = _score_airbnb(airbnb_yield_pct)
    s_area = _score_area_heat(float(market['appr_pct']), market.get('high_value', False))
    s_quality = _score_property_quality(condition, furnishing, floor, total_floors)

    verdict_score = s_price + s_yield + s_airbnb + s_area + s_quality
    verdict = _verdict_from_score(verdict_score)

    # §STEP:9 — Build result dict
    currency = country_info.get('currency', 'EUR') if country_info else 'EUR'

    return {
        # Inputs echoed back
        'country': country,
        'city': city,
        'area': area,
        'currency': currency,

        # Price analysis
        'total_cost': float(total_cost),
        'price_per_sqm': round(float(price_per_sqm), 2),
        'market_avg_sqm': float(market_avg),
        'market_min_sqm': market['min_sqm'],
        'market_max_sqm': market['max_sqm'],
        'price_vs_market_pct': round(price_vs_market_pct, 2),

        # Rental analysis
        'estimated_monthly_rent': round(float(monthly_rent), 2),
        'estimated_annual_rent': round(float(annual_rent), 2),
        'gross_rental_yield': round(gross_rental_yield, 2),
        'net_rental_yield': round(net_rental_yield, 2),
        'operating_expenses_pct': float(opex_pct) * 100,

        # Airbnb analysis
        'estimated_airbnb_daily': round(float(adjusted_adr), 2),
        'estimated_airbnb_monthly': round(float(airbnb_monthly), 2),
        'airbnb_annual_revenue': round(float(airbnb_annual), 2),
        'airbnb_yield': round(airbnb_yield_pct, 2),
        'airbnb_occupancy_pct': float(occupancy) * 100,

        # Investment metrics
        'cap_rate': round(cap_rate, 2),
        'roi_5_year': round(roi_5_year, 2),
        'roi_10_year': round(roi_10_year, 2),
        'projected_value_5y': round(value_5y, 2),
        'projected_value_10y': round(value_10y, 2),
        'break_even_months': break_even_months,
        'annual_appreciation_pct': float(market['appr_pct']),

        # Scores
        'area_heat_score': area_heat_score,
        'high_value_area': market.get('high_value', False),
        'verdict': verdict,
        'verdict_score': verdict_score,
        'score_breakdown': {
            'price_vs_market': {'score': s_price, 'max': 30},
            'rental_yield': {'score': s_yield, 'max': 25},
            'airbnb_potential': {'score': s_airbnb, 'max': 15},
            'area_heat': {'score': s_area, 'max': 15},
            'property_quality': {'score': s_quality, 'max': 15},
        },

        # Parking analysis
        'parking_value_pct': round(
            float(parking_price / total_cost * 100) if total_cost > 0 and parking_price > 0 else 0, 1
        ),
        'market_parking_premium_pct': market.get('parking_premium', 0) * 100,
    }
