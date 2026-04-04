"""
=== MARKET BENCHMARK DATA ===
// §REF:market_data — property valuation benchmarks by country/city/area
// §FLOW: services.py reads this → computes analysis → returns verdict
// §UPDATE: edit dicts below to refresh market pricing (no migration needed)

Real estate market benchmarks for property valuation analysis.
All prices in EUR. Updated Q1 2026.

Structure per area:
  avg_sqm    — average price per sqm (EUR)
  min_sqm    — bottom of market range
  max_sqm    — top of market range
  rent_sqm   — monthly rent per sqm (standard long-term)
  airbnb_adr — average daily rate for Airbnb/short-term
  airbnb_occ — occupancy rate (0.0-1.0)
  yield_pct  — typical gross rental yield
  appr_pct   — annual appreciation trend
  high_value — premium/high-demand area flag
  parking_premium — parking price as % of total property value

  # Location quality (1-10 scale)
  transport_score      — public transport accessibility (metro, bus, tram)
  infrastructure_score — schools, hospitals, shops, restaurants
  green_spaces         — parks, nature, recreational areas
  noise_level          — 1=very quiet, 10=very noisy (lower is better for residential)
  crime_index          — 1=very safe, 10=dangerous (lower is better)

  # BG-specific / building risk
  seismic_zone         — 1=low risk, 2=moderate, 3=high (Bulgaria-specific, 0 for non-BG)
  panel_buildings_pct  — % of panel (prefab) buildings in area (BG: 20-80%, non-BG: 0)

  # Market trends (5-year historical appreciation % per year)
  appreciation_history — list of 5 floats, oldest to newest year
  demand_trend         — 'rising', 'stable', or 'declining'
"""

# §DATA:countries — top-level geo hierarchy
COUNTRIES = {
    'Bulgaria': {'currency': 'BGN', 'eur_rate': 1.9558, 'tax_pct': 10.0},
    'UAE': {'currency': 'AED', 'eur_rate': 4.02, 'tax_pct': 0.0},
    'United Kingdom': {'currency': 'GBP', 'eur_rate': 0.86, 'tax_pct': 20.0},
}

# §DATA:cities — city list per country
CITIES = {
    'Bulgaria': ['Sofia', 'Plovdiv', 'Varna', 'Burgas'],
    'UAE': ['Dubai', 'Abu Dhabi'],
    'United Kingdom': ['London', 'Manchester', 'Birmingham', 'Leeds', 'Edinburgh', 'Bristol'],
}

# §DATA:areas — neighborhood benchmarks (all prices EUR)
MARKET_DATA = {
    # ─── SOFIA ───────────────────────────────────────────
    ('Bulgaria', 'Sofia', 'Lozenets'): {
        'avg_sqm': 2800, 'min_sqm': 2200, 'max_sqm': 3800,
        'rent_sqm': 14.0, 'airbnb_adr': 75, 'airbnb_occ': 0.70,
        'yield_pct': 5.0, 'appr_pct': 8.0, 'high_value': True,
        'parking_premium': 0.08,
        'transport_score': 8, 'infrastructure_score': 9, 'green_spaces': 6,
        'noise_level': 5, 'crime_index': 2,
        'seismic_zone': 2, 'panel_buildings_pct': 15,
        'appreciation_history': [5.0, 6.0, 7.0, 8.0, 8.0], 'demand_trend': 'rising',
    },
    ('Bulgaria', 'Sofia', 'Iztok'): {
        'avg_sqm': 2500, 'min_sqm': 2000, 'max_sqm': 3200,
        'rent_sqm': 12.5, 'airbnb_adr': 65, 'airbnb_occ': 0.68,
        'yield_pct': 5.2, 'appr_pct': 7.0, 'high_value': True,
        'parking_premium': 0.07,
        'transport_score': 8, 'infrastructure_score': 8, 'green_spaces': 7,
        'noise_level': 4, 'crime_index': 2,
        'seismic_zone': 2, 'panel_buildings_pct': 20,
        'appreciation_history': [5.0, 5.0, 6.0, 7.0, 7.0], 'demand_trend': 'rising',
    },
    ('Bulgaria', 'Sofia', 'Center'): {
        'avg_sqm': 2600, 'min_sqm': 2000, 'max_sqm': 3500,
        'rent_sqm': 13.0, 'airbnb_adr': 70, 'airbnb_occ': 0.72,
        'yield_pct': 5.0, 'appr_pct': 6.5, 'high_value': True,
        'parking_premium': 0.10,
        'transport_score': 10, 'infrastructure_score': 10, 'green_spaces': 5,
        'noise_level': 7, 'crime_index': 3,
        'seismic_zone': 2, 'panel_buildings_pct': 10,
        'appreciation_history': [4.0, 5.0, 5.0, 6.0, 6.5], 'demand_trend': 'stable',
    },
    ('Bulgaria', 'Sofia', 'Oborishte'): {
        'avg_sqm': 2700, 'min_sqm': 2100, 'max_sqm': 3500,
        'rent_sqm': 13.5, 'airbnb_adr': 72, 'airbnb_occ': 0.68,
        'yield_pct': 5.0, 'appr_pct': 7.5, 'high_value': True,
        'parking_premium': 0.09,
        'transport_score': 8, 'infrastructure_score': 9, 'green_spaces': 7,
        'noise_level': 4, 'crime_index': 2,
        'seismic_zone': 2, 'panel_buildings_pct': 10,
        'appreciation_history': [5.0, 6.0, 6.0, 7.0, 7.5], 'demand_trend': 'rising',
    },
    ('Bulgaria', 'Sofia', 'Vitosha'): {
        'avg_sqm': 2200, 'min_sqm': 1700, 'max_sqm': 3000,
        'rent_sqm': 11.0, 'airbnb_adr': 55, 'airbnb_occ': 0.62,
        'yield_pct': 5.0, 'appr_pct': 7.0, 'high_value': False,
        'parking_premium': 0.06,
        'transport_score': 5, 'infrastructure_score': 6, 'green_spaces': 9,
        'noise_level': 2, 'crime_index': 1,
        'seismic_zone': 2, 'panel_buildings_pct': 5,
        'appreciation_history': [5.0, 5.0, 6.0, 7.0, 7.0], 'demand_trend': 'rising',
    },
    ('Bulgaria', 'Sofia', 'Boyana'): {
        'avg_sqm': 3000, 'min_sqm': 2200, 'max_sqm': 4200,
        'rent_sqm': 14.0, 'airbnb_adr': 85, 'airbnb_occ': 0.58,
        'yield_pct': 4.5, 'appr_pct': 9.0, 'high_value': True,
        'parking_premium': 0.05,
        'transport_score': 4, 'infrastructure_score': 5, 'green_spaces': 10,
        'noise_level': 1, 'crime_index': 1,
        'seismic_zone': 2, 'panel_buildings_pct': 0,
        'appreciation_history': [6.0, 7.0, 8.0, 9.0, 9.0], 'demand_trend': 'rising',
    },
    ('Bulgaria', 'Sofia', 'Mladost'): {
        'avg_sqm': 1600, 'min_sqm': 1200, 'max_sqm': 2100,
        'rent_sqm': 9.0, 'airbnb_adr': 45, 'airbnb_occ': 0.60,
        'yield_pct': 5.8, 'appr_pct': 5.5, 'high_value': False,
        'parking_premium': 0.06,
        'transport_score': 7, 'infrastructure_score': 7, 'green_spaces': 5,
        'noise_level': 5, 'crime_index': 4,
        'seismic_zone': 2, 'panel_buildings_pct': 60,
        'appreciation_history': [3.0, 4.0, 5.0, 5.0, 5.5], 'demand_trend': 'stable',
    },
    ('Bulgaria', 'Sofia', 'Studentski Grad'): {
        'avg_sqm': 1400, 'min_sqm': 1000, 'max_sqm': 1800,
        'rent_sqm': 8.5, 'airbnb_adr': 40, 'airbnb_occ': 0.65,
        'yield_pct': 6.5, 'appr_pct': 5.0, 'high_value': False,
        'parking_premium': 0.05,
        'transport_score': 7, 'infrastructure_score': 6, 'green_spaces': 5,
        'noise_level': 6, 'crime_index': 5,
        'seismic_zone': 2, 'panel_buildings_pct': 50,
        'appreciation_history': [3.0, 3.0, 4.0, 5.0, 5.0], 'demand_trend': 'stable',
    },
    ('Bulgaria', 'Sofia', 'Lyulin'): {
        'avg_sqm': 1000, 'min_sqm': 750, 'max_sqm': 1300,
        'rent_sqm': 6.5, 'airbnb_adr': 32, 'airbnb_occ': 0.50,
        'yield_pct': 6.8, 'appr_pct': 4.0, 'high_value': False,
        'parking_premium': 0.04,
        'transport_score': 7, 'infrastructure_score': 5, 'green_spaces': 4,
        'noise_level': 6, 'crime_index': 6,
        'seismic_zone': 2, 'panel_buildings_pct': 80,
        'appreciation_history': [2.0, 3.0, 3.0, 4.0, 4.0], 'demand_trend': 'stable',
    },
    ('Bulgaria', 'Sofia', 'Druzhba'): {
        'avg_sqm': 1100, 'min_sqm': 800, 'max_sqm': 1400,
        'rent_sqm': 7.0, 'airbnb_adr': 35, 'airbnb_occ': 0.52,
        'yield_pct': 6.5, 'appr_pct': 4.5, 'high_value': False,
        'parking_premium': 0.04,
        'transport_score': 6, 'infrastructure_score': 5, 'green_spaces': 5,
        'noise_level': 5, 'crime_index': 5,
        'seismic_zone': 2, 'panel_buildings_pct': 70,
        'appreciation_history': [3.0, 3.0, 4.0, 4.0, 4.5], 'demand_trend': 'stable',
    },
    ('Bulgaria', 'Sofia', 'Manastirski Livadi'): {
        'avg_sqm': 2100, 'min_sqm': 1600, 'max_sqm': 2700,
        'rent_sqm': 10.5, 'airbnb_adr': 52, 'airbnb_occ': 0.60,
        'yield_pct': 5.2, 'appr_pct': 7.0, 'high_value': False,
        'parking_premium': 0.06,
        'transport_score': 6, 'infrastructure_score': 7, 'green_spaces': 6,
        'noise_level': 4, 'crime_index': 2,
        'seismic_zone': 2, 'panel_buildings_pct': 10,
        'appreciation_history': [5.0, 5.0, 6.0, 7.0, 7.0], 'demand_trend': 'rising',
    },
    ('Bulgaria', 'Sofia', 'Geo Milev'): {
        'avg_sqm': 2000, 'min_sqm': 1500, 'max_sqm': 2600,
        'rent_sqm': 10.0, 'airbnb_adr': 50, 'airbnb_occ': 0.62,
        'yield_pct': 5.3, 'appr_pct': 6.0, 'high_value': False,
        'parking_premium': 0.06,
        'transport_score': 7, 'infrastructure_score': 7, 'green_spaces': 6,
        'noise_level': 4, 'crime_index': 3,
        'seismic_zone': 2, 'panel_buildings_pct': 30,
        'appreciation_history': [4.0, 4.0, 5.0, 6.0, 6.0], 'demand_trend': 'stable',
    },
    ('Bulgaria', 'Sofia', 'Krastova Vada'): {
        'avg_sqm': 2300, 'min_sqm': 1800, 'max_sqm': 3000,
        'rent_sqm': 11.5, 'airbnb_adr': 58, 'airbnb_occ': 0.63,
        'yield_pct': 5.0, 'appr_pct': 7.5, 'high_value': False,
        'parking_premium': 0.06,
        'transport_score': 6, 'infrastructure_score': 7, 'green_spaces': 7,
        'noise_level': 3, 'crime_index': 2,
        'seismic_zone': 2, 'panel_buildings_pct': 5,
        'appreciation_history': [5.0, 6.0, 6.0, 7.0, 7.5], 'demand_trend': 'rising',
    },

    # ─── PLOVDIV ─────────────────────────────────────────
    ('Bulgaria', 'Plovdiv', 'Center'): {
        'avg_sqm': 1500, 'min_sqm': 1100, 'max_sqm': 2100,
        'rent_sqm': 8.5, 'airbnb_adr': 50, 'airbnb_occ': 0.65,
        'yield_pct': 6.0, 'appr_pct': 6.0, 'high_value': True,
        'parking_premium': 0.07,
        'transport_score': 8, 'infrastructure_score': 8, 'green_spaces': 7,
        'noise_level': 5, 'crime_index': 3,
        'seismic_zone': 2, 'panel_buildings_pct': 15,
        'appreciation_history': [4.0, 4.0, 5.0, 6.0, 6.0], 'demand_trend': 'rising',
    },
    ('Bulgaria', 'Plovdiv', 'Kapana'): {
        'avg_sqm': 1600, 'min_sqm': 1200, 'max_sqm': 2200,
        'rent_sqm': 9.0, 'airbnb_adr': 55, 'airbnb_occ': 0.68,
        'yield_pct': 5.8, 'appr_pct': 7.0, 'high_value': True,
        'parking_premium': 0.08,
        'transport_score': 8, 'infrastructure_score': 9, 'green_spaces': 6,
        'noise_level': 5, 'crime_index': 2,
        'seismic_zone': 2, 'panel_buildings_pct': 5,
        'appreciation_history': [5.0, 5.0, 6.0, 7.0, 7.0], 'demand_trend': 'rising',
    },
    ('Bulgaria', 'Plovdiv', 'Marasha'): {
        'avg_sqm': 1200, 'min_sqm': 900, 'max_sqm': 1600,
        'rent_sqm': 7.0, 'airbnb_adr': 40, 'airbnb_occ': 0.58,
        'yield_pct': 6.2, 'appr_pct': 5.5, 'high_value': False,
        'parking_premium': 0.05,
        'transport_score': 6, 'infrastructure_score': 6, 'green_spaces': 5,
        'noise_level': 4, 'crime_index': 3,
        'seismic_zone': 2, 'panel_buildings_pct': 40,
        'appreciation_history': [3.0, 4.0, 4.0, 5.0, 5.5], 'demand_trend': 'stable',
    },
    ('Bulgaria', 'Plovdiv', 'Trakiya'): {
        'avg_sqm': 900, 'min_sqm': 650, 'max_sqm': 1200,
        'rent_sqm': 5.5, 'airbnb_adr': 32, 'airbnb_occ': 0.50,
        'yield_pct': 6.8, 'appr_pct': 4.5, 'high_value': False,
        'parking_premium': 0.04,
        'transport_score': 6, 'infrastructure_score': 5, 'green_spaces': 4,
        'noise_level': 5, 'crime_index': 5,
        'seismic_zone': 2, 'panel_buildings_pct': 70,
        'appreciation_history': [3.0, 3.0, 4.0, 4.0, 4.5], 'demand_trend': 'stable',
    },
    ('Bulgaria', 'Plovdiv', 'Karshiyaka'): {
        'avg_sqm': 1300, 'min_sqm': 1000, 'max_sqm': 1800,
        'rent_sqm': 7.5, 'airbnb_adr': 42, 'airbnb_occ': 0.60,
        'yield_pct': 6.0, 'appr_pct': 5.0, 'high_value': False,
        'parking_premium': 0.05,
        'transport_score': 7, 'infrastructure_score': 7, 'green_spaces': 6,
        'noise_level': 4, 'crime_index': 3,
        'seismic_zone': 2, 'panel_buildings_pct': 25,
        'appreciation_history': [3.0, 4.0, 4.0, 5.0, 5.0], 'demand_trend': 'stable',
    },
    ('Bulgaria', 'Plovdiv', 'Grebna Baza'): {
        'avg_sqm': 1100, 'min_sqm': 850, 'max_sqm': 1500,
        'rent_sqm': 6.5, 'airbnb_adr': 38, 'airbnb_occ': 0.52,
        'yield_pct': 6.5, 'appr_pct': 5.0, 'high_value': False,
        'parking_premium': 0.04,
        'transport_score': 5, 'infrastructure_score': 5, 'green_spaces': 8,
        'noise_level': 2, 'crime_index': 2,
        'seismic_zone': 2, 'panel_buildings_pct': 20,
        'appreciation_history': [3.0, 4.0, 4.0, 5.0, 5.0], 'demand_trend': 'stable',
    },

    # ─── VARNA ───────────────────────────────────────────
    ('Bulgaria', 'Varna', 'Center'): {
        'avg_sqm': 1800, 'min_sqm': 1400, 'max_sqm': 2500,
        'rent_sqm': 10.0, 'airbnb_adr': 60, 'airbnb_occ': 0.65,
        'yield_pct': 5.5, 'appr_pct': 6.5, 'high_value': True,
        'parking_premium': 0.07,
        'transport_score': 8, 'infrastructure_score': 8, 'green_spaces': 6,
        'noise_level': 5, 'crime_index': 3,
        'seismic_zone': 1, 'panel_buildings_pct': 15,
        'appreciation_history': [4.0, 5.0, 5.0, 6.0, 6.5], 'demand_trend': 'rising',
    },
    ('Bulgaria', 'Varna', 'Sea Garden'): {
        'avg_sqm': 2200, 'min_sqm': 1700, 'max_sqm': 3000,
        'rent_sqm': 12.0, 'airbnb_adr': 75, 'airbnb_occ': 0.60,
        'yield_pct': 5.0, 'appr_pct': 7.0, 'high_value': True,
        'parking_premium': 0.08,
        'transport_score': 6, 'infrastructure_score': 7, 'green_spaces': 10,
        'noise_level': 3, 'crime_index': 2,
        'seismic_zone': 1, 'panel_buildings_pct': 5,
        'appreciation_history': [5.0, 5.0, 6.0, 7.0, 7.0], 'demand_trend': 'rising',
    },

    # ─── BURGAS ──────────────────────────────────────────
    ('Bulgaria', 'Burgas', 'Center'): {
        'avg_sqm': 1300, 'min_sqm': 1000, 'max_sqm': 1800,
        'rent_sqm': 7.0, 'airbnb_adr': 45, 'airbnb_occ': 0.55,
        'yield_pct': 5.8, 'appr_pct': 5.0, 'high_value': False,
        'parking_premium': 0.06,
        'transport_score': 7, 'infrastructure_score': 7, 'green_spaces': 6,
        'noise_level': 5, 'crime_index': 3,
        'seismic_zone': 1, 'panel_buildings_pct': 20,
        'appreciation_history': [3.0, 4.0, 4.0, 5.0, 5.0], 'demand_trend': 'stable',
    },
    ('Bulgaria', 'Burgas', 'Sarafovo'): {
        'avg_sqm': 1500, 'min_sqm': 1100, 'max_sqm': 2000,
        'rent_sqm': 8.0, 'airbnb_adr': 55, 'airbnb_occ': 0.50,
        'yield_pct': 5.5, 'appr_pct': 5.5, 'high_value': False,
        'parking_premium': 0.05,
        'transport_score': 5, 'infrastructure_score': 5, 'green_spaces': 7,
        'noise_level': 3, 'crime_index': 2,
        'seismic_zone': 1, 'panel_buildings_pct': 10,
        'appreciation_history': [4.0, 4.0, 5.0, 5.0, 5.5], 'demand_trend': 'stable',
    },

    # ─── DUBAI ───────────────────────────────────────────
    ('UAE', 'Dubai', 'Downtown'): {
        'avg_sqm': 6000, 'min_sqm': 4500, 'max_sqm': 9000,
        'rent_sqm': 30.0, 'airbnb_adr': 220, 'airbnb_occ': 0.80,
        'yield_pct': 5.5, 'appr_pct': 10.0, 'high_value': True,
        'parking_premium': 0.03,
        'transport_score': 9, 'infrastructure_score': 10, 'green_spaces': 7,
        'noise_level': 5, 'crime_index': 1,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [7.0, 8.0, 9.0, 10.0, 10.0], 'demand_trend': 'rising',
    },
    ('UAE', 'Dubai', 'Dubai Marina'): {
        'avg_sqm': 4500, 'min_sqm': 3500, 'max_sqm': 6500,
        'rent_sqm': 25.0, 'airbnb_adr': 180, 'airbnb_occ': 0.78,
        'yield_pct': 6.0, 'appr_pct': 8.5, 'high_value': True,
        'parking_premium': 0.03,
        'transport_score': 8, 'infrastructure_score': 9, 'green_spaces': 5,
        'noise_level': 5, 'crime_index': 1,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [6.0, 7.0, 8.0, 8.5, 8.5], 'demand_trend': 'rising',
    },
    ('UAE', 'Dubai', 'Palm Jumeirah'): {
        'avg_sqm': 8000, 'min_sqm': 5500, 'max_sqm': 13000,
        'rent_sqm': 38.0, 'airbnb_adr': 350, 'airbnb_occ': 0.75,
        'yield_pct': 5.0, 'appr_pct': 12.0, 'high_value': True,
        'parking_premium': 0.02,
        'transport_score': 5, 'infrastructure_score': 7, 'green_spaces': 6,
        'noise_level': 2, 'crime_index': 1,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [8.0, 9.0, 10.0, 12.0, 12.0], 'demand_trend': 'rising',
    },
    ('UAE', 'Dubai', 'JBR'): {
        'avg_sqm': 4200, 'min_sqm': 3200, 'max_sqm': 5800,
        'rent_sqm': 24.0, 'airbnb_adr': 200, 'airbnb_occ': 0.82,
        'yield_pct': 6.2, 'appr_pct': 7.5, 'high_value': True,
        'parking_premium': 0.03,
        'transport_score': 7, 'infrastructure_score': 8, 'green_spaces': 5,
        'noise_level': 5, 'crime_index': 1,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [5.0, 6.0, 7.0, 7.5, 7.5], 'demand_trend': 'rising',
    },
    ('UAE', 'Dubai', 'Business Bay'): {
        'avg_sqm': 3800, 'min_sqm': 2800, 'max_sqm': 5200,
        'rent_sqm': 22.0, 'airbnb_adr': 160, 'airbnb_occ': 0.76,
        'yield_pct': 6.5, 'appr_pct': 8.0, 'high_value': False,
        'parking_premium': 0.03,
        'transport_score': 8, 'infrastructure_score': 9, 'green_spaces': 5,
        'noise_level': 6, 'crime_index': 1,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [5.0, 6.0, 7.0, 8.0, 8.0], 'demand_trend': 'rising',
    },
    ('UAE', 'Dubai', 'JVC'): {
        'avg_sqm': 2200, 'min_sqm': 1500, 'max_sqm': 3000,
        'rent_sqm': 14.0, 'airbnb_adr': 100, 'airbnb_occ': 0.70,
        'yield_pct': 7.5, 'appr_pct': 6.0, 'high_value': False,
        'parking_premium': 0.04,
        'transport_score': 6, 'infrastructure_score': 7, 'green_spaces': 6,
        'noise_level': 4, 'crime_index': 2,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [4.0, 4.0, 5.0, 6.0, 6.0], 'demand_trend': 'rising',
    },
    ('UAE', 'Dubai', 'Dubai Hills'): {
        'avg_sqm': 3500, 'min_sqm': 2500, 'max_sqm': 5000,
        'rent_sqm': 20.0, 'airbnb_adr': 150, 'airbnb_occ': 0.72,
        'yield_pct': 6.0, 'appr_pct': 9.0, 'high_value': True,
        'parking_premium': 0.03,
        'transport_score': 6, 'infrastructure_score': 8, 'green_spaces': 8,
        'noise_level': 3, 'crime_index': 1,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [6.0, 7.0, 8.0, 9.0, 9.0], 'demand_trend': 'rising',
    },
    ('UAE', 'Dubai', 'Arabian Ranches'): {
        'avg_sqm': 3200, 'min_sqm': 2400, 'max_sqm': 4500,
        'rent_sqm': 18.0, 'airbnb_adr': 180, 'airbnb_occ': 0.60,
        'yield_pct': 5.5, 'appr_pct': 7.5, 'high_value': False,
        'parking_premium': 0.02,
        'transport_score': 4, 'infrastructure_score': 7, 'green_spaces': 7,
        'noise_level': 2, 'crime_index': 1,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [5.0, 6.0, 6.0, 7.0, 7.5], 'demand_trend': 'stable',
    },

    # ─── ABU DHABI ───────────────────────────────────────
    ('UAE', 'Abu Dhabi', 'Al Reem Island'): {
        'avg_sqm': 3000, 'min_sqm': 2200, 'max_sqm': 4200,
        'rent_sqm': 18.0, 'airbnb_adr': 130, 'airbnb_occ': 0.68,
        'yield_pct': 6.5, 'appr_pct': 6.0, 'high_value': True,
        'parking_premium': 0.03,
        'transport_score': 7, 'infrastructure_score': 8, 'green_spaces': 6,
        'noise_level': 4, 'crime_index': 1,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [4.0, 5.0, 5.0, 6.0, 6.0], 'demand_trend': 'rising',
    },
    ('UAE', 'Abu Dhabi', 'Saadiyat Island'): {
        'avg_sqm': 4500, 'min_sqm': 3200, 'max_sqm': 6500,
        'rent_sqm': 25.0, 'airbnb_adr': 200, 'airbnb_occ': 0.65,
        'yield_pct': 5.5, 'appr_pct': 8.0, 'high_value': True,
        'parking_premium': 0.02,
        'transport_score': 5, 'infrastructure_score': 7, 'green_spaces': 8,
        'noise_level': 2, 'crime_index': 1,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [5.0, 6.0, 7.0, 8.0, 8.0], 'demand_trend': 'rising',
    },
    ('UAE', 'Abu Dhabi', 'Yas Island'): {
        'avg_sqm': 3200, 'min_sqm': 2500, 'max_sqm': 4500,
        'rent_sqm': 19.0, 'airbnb_adr': 160, 'airbnb_occ': 0.70,
        'yield_pct': 6.0, 'appr_pct': 7.0, 'high_value': True,
        'parking_premium': 0.03,
        'transport_score': 5, 'infrastructure_score': 8, 'green_spaces': 7,
        'noise_level': 3, 'crime_index': 1,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [5.0, 5.0, 6.0, 7.0, 7.0], 'demand_trend': 'rising',
    },
    ('UAE', 'Abu Dhabi', 'Corniche'): {
        'avg_sqm': 3800, 'min_sqm': 2800, 'max_sqm': 5200,
        'rent_sqm': 22.0, 'airbnb_adr': 170, 'airbnb_occ': 0.65,
        'yield_pct': 5.8, 'appr_pct': 6.5, 'high_value': True,
        'parking_premium': 0.03,
        'transport_score': 7, 'infrastructure_score': 8, 'green_spaces': 7,
        'noise_level': 4, 'crime_index': 1,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [4.0, 5.0, 5.0, 6.0, 6.5], 'demand_trend': 'stable',
    },
    ('UAE', 'Abu Dhabi', 'Al Raha Beach'): {
        'avg_sqm': 2800, 'min_sqm': 2000, 'max_sqm': 3800,
        'rent_sqm': 16.0, 'airbnb_adr': 120, 'airbnb_occ': 0.62,
        'yield_pct': 6.2, 'appr_pct': 5.5, 'high_value': False,
        'parking_premium': 0.03,
        'transport_score': 5, 'infrastructure_score': 7, 'green_spaces': 6,
        'noise_level': 3, 'crime_index': 1,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [3.0, 4.0, 4.0, 5.0, 5.5], 'demand_trend': 'stable',
    },

    # ─── LONDON ──────────────────────────────────────────
    ('United Kingdom', 'London', 'Zone 1 (Central)'): {
        'avg_sqm': 15000, 'min_sqm': 10000, 'max_sqm': 25000,
        'rent_sqm': 45.0, 'airbnb_adr': 200, 'airbnb_occ': 0.78,
        'yield_pct': 3.2, 'appr_pct': 4.0, 'high_value': True,
        'parking_premium': 0.12,
        'transport_score': 10, 'infrastructure_score': 10, 'green_spaces': 6,
        'noise_level': 7, 'crime_index': 4,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [2.0, 3.0, 3.0, 4.0, 4.0], 'demand_trend': 'stable',
    },
    ('United Kingdom', 'London', 'Zone 2 (Inner)'): {
        'avg_sqm': 9000, 'min_sqm': 6500, 'max_sqm': 13000,
        'rent_sqm': 32.0, 'airbnb_adr': 150, 'airbnb_occ': 0.75,
        'yield_pct': 3.8, 'appr_pct': 4.5, 'high_value': True,
        'parking_premium': 0.10,
        'transport_score': 9, 'infrastructure_score': 9, 'green_spaces': 6,
        'noise_level': 5, 'crime_index': 3,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [3.0, 3.0, 4.0, 4.0, 4.5], 'demand_trend': 'stable',
    },
    ('United Kingdom', 'London', 'Zone 3 (Outer)'): {
        'avg_sqm': 6500, 'min_sqm': 4500, 'max_sqm': 9000,
        'rent_sqm': 24.0, 'airbnb_adr': 110, 'airbnb_occ': 0.70,
        'yield_pct': 4.2, 'appr_pct': 5.0, 'high_value': False,
        'parking_premium': 0.08,
        'transport_score': 8, 'infrastructure_score': 8, 'green_spaces': 7,
        'noise_level': 4, 'crime_index': 3,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [3.0, 4.0, 4.0, 5.0, 5.0], 'demand_trend': 'rising',
    },
    ('United Kingdom', 'London', 'Canary Wharf'): {
        'avg_sqm': 8500, 'min_sqm': 6000, 'max_sqm': 12000,
        'rent_sqm': 35.0, 'airbnb_adr': 160, 'airbnb_occ': 0.72,
        'yield_pct': 4.0, 'appr_pct': 5.0, 'high_value': True,
        'parking_premium': 0.08,
        'transport_score': 9, 'infrastructure_score': 8, 'green_spaces': 5,
        'noise_level': 4, 'crime_index': 2,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [3.0, 4.0, 4.0, 5.0, 5.0], 'demand_trend': 'stable',
    },

    # ─── MANCHESTER ──────────────────────────────────────
    ('United Kingdom', 'Manchester', 'City Centre'): {
        'avg_sqm': 4000, 'min_sqm': 3000, 'max_sqm': 5500,
        'rent_sqm': 18.0, 'airbnb_adr': 95, 'airbnb_occ': 0.72,
        'yield_pct': 5.5, 'appr_pct': 6.0, 'high_value': True,
        'parking_premium': 0.08,
        'transport_score': 9, 'infrastructure_score': 9, 'green_spaces': 5,
        'noise_level': 6, 'crime_index': 4,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [4.0, 5.0, 5.0, 6.0, 6.0], 'demand_trend': 'rising',
    },
    ('United Kingdom', 'Manchester', 'Salford Quays'): {
        'avg_sqm': 3500, 'min_sqm': 2600, 'max_sqm': 4800,
        'rent_sqm': 16.0, 'airbnb_adr': 85, 'airbnb_occ': 0.68,
        'yield_pct': 5.8, 'appr_pct': 5.5, 'high_value': False,
        'parking_premium': 0.06,
        'transport_score': 7, 'infrastructure_score': 7, 'green_spaces': 6,
        'noise_level': 4, 'crime_index': 3,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [4.0, 4.0, 5.0, 5.0, 5.5], 'demand_trend': 'rising',
    },
    ('United Kingdom', 'Manchester', 'Northern Quarter'): {
        'avg_sqm': 4200, 'min_sqm': 3200, 'max_sqm': 5800,
        'rent_sqm': 19.0, 'airbnb_adr': 100, 'airbnb_occ': 0.75,
        'yield_pct': 5.5, 'appr_pct': 6.5, 'high_value': True,
        'parking_premium': 0.09,
        'transport_score': 9, 'infrastructure_score': 9, 'green_spaces': 4,
        'noise_level': 7, 'crime_index': 4,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [4.0, 5.0, 5.0, 6.0, 6.5], 'demand_trend': 'rising',
    },

    # ─── BIRMINGHAM ──────────────────────────────────────
    ('United Kingdom', 'Birmingham', 'City Centre'): {
        'avg_sqm': 3200, 'min_sqm': 2500, 'max_sqm': 4500,
        'rent_sqm': 15.0, 'airbnb_adr': 80, 'airbnb_occ': 0.68,
        'yield_pct': 5.8, 'appr_pct': 5.5, 'high_value': False,
        'parking_premium': 0.07,
        'transport_score': 8, 'infrastructure_score': 8, 'green_spaces': 5,
        'noise_level': 6, 'crime_index': 4,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [4.0, 4.0, 5.0, 5.0, 5.5], 'demand_trend': 'rising',
    },
    ('United Kingdom', 'Birmingham', 'Jewellery Quarter'): {
        'avg_sqm': 3500, 'min_sqm': 2700, 'max_sqm': 4800,
        'rent_sqm': 16.0, 'airbnb_adr': 85, 'airbnb_occ': 0.65,
        'yield_pct': 5.5, 'appr_pct': 6.0, 'high_value': True,
        'parking_premium': 0.07,
        'transport_score': 8, 'infrastructure_score': 8, 'green_spaces': 5,
        'noise_level': 4, 'crime_index': 3,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [4.0, 5.0, 5.0, 6.0, 6.0], 'demand_trend': 'rising',
    },

    # ─── LEEDS ───────────────────────────────────────────
    ('United Kingdom', 'Leeds', 'City Centre'): {
        'avg_sqm': 2800, 'min_sqm': 2000, 'max_sqm': 3800,
        'rent_sqm': 14.0, 'airbnb_adr': 75, 'airbnb_occ': 0.65,
        'yield_pct': 6.0, 'appr_pct': 5.0, 'high_value': False,
        'parking_premium': 0.06,
        'transport_score': 7, 'infrastructure_score': 7, 'green_spaces': 5,
        'noise_level': 5, 'crime_index': 4,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [3.0, 4.0, 4.0, 5.0, 5.0], 'demand_trend': 'stable',
    },

    # ─── EDINBURGH ───────────────────────────────────────
    ('United Kingdom', 'Edinburgh', 'New Town'): {
        'avg_sqm': 5000, 'min_sqm': 3800, 'max_sqm': 7000,
        'rent_sqm': 22.0, 'airbnb_adr': 130, 'airbnb_occ': 0.75,
        'yield_pct': 4.8, 'appr_pct': 5.5, 'high_value': True,
        'parking_premium': 0.10,
        'transport_score': 8, 'infrastructure_score': 9, 'green_spaces': 7,
        'noise_level': 4, 'crime_index': 2,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [4.0, 4.0, 5.0, 5.0, 5.5], 'demand_trend': 'stable',
    },
    ('United Kingdom', 'Edinburgh', 'Old Town'): {
        'avg_sqm': 4800, 'min_sqm': 3500, 'max_sqm': 6500,
        'rent_sqm': 21.0, 'airbnb_adr': 140, 'airbnb_occ': 0.78,
        'yield_pct': 4.5, 'appr_pct': 5.0, 'high_value': True,
        'parking_premium': 0.11,
        'transport_score': 8, 'infrastructure_score': 8, 'green_spaces': 6,
        'noise_level': 5, 'crime_index': 3,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [3.0, 4.0, 4.0, 5.0, 5.0], 'demand_trend': 'stable',
    },

    # ─── BRISTOL ─────────────────────────────────────────
    ('United Kingdom', 'Bristol', 'Harbourside'): {
        'avg_sqm': 4200, 'min_sqm': 3200, 'max_sqm': 5800,
        'rent_sqm': 18.0, 'airbnb_adr': 100, 'airbnb_occ': 0.70,
        'yield_pct': 5.0, 'appr_pct': 5.5, 'high_value': True,
        'parking_premium': 0.08,
        'transport_score': 7, 'infrastructure_score': 8, 'green_spaces': 6,
        'noise_level': 4, 'crime_index': 3,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [4.0, 4.0, 5.0, 5.0, 5.5], 'demand_trend': 'rising',
    },
    ('United Kingdom', 'Bristol', 'Clifton'): {
        'avg_sqm': 4500, 'min_sqm': 3500, 'max_sqm': 6200,
        'rent_sqm': 19.0, 'airbnb_adr': 110, 'airbnb_occ': 0.68,
        'yield_pct': 4.8, 'appr_pct': 5.0, 'high_value': True,
        'parking_premium': 0.08,
        'transport_score': 7, 'infrastructure_score': 8, 'green_spaces': 7,
        'noise_level': 3, 'crime_index': 2,
        'seismic_zone': 0, 'panel_buildings_pct': 0,
        'appreciation_history': [3.0, 4.0, 4.0, 5.0, 5.0], 'demand_trend': 'stable',
    },
}


def get_areas_for_city(country: str, city: str) -> list[str]:
    """Return list of areas for a given country+city."""
    return [
        area for (c, ci, area) in MARKET_DATA.keys()
        if c == country and ci == city
    ]


def get_market_data(country: str, city: str, area: str) -> dict | None:
    """Look up benchmark data for a specific area."""
    return MARKET_DATA.get((country, city, area))


def get_country_info(country: str) -> dict | None:
    """Return currency/tax info for a country."""
    return COUNTRIES.get(country)


def get_all_areas() -> list[dict]:
    """Return all areas with their market data for frontend dropdowns."""
    result = []
    for (country, city, area), data in MARKET_DATA.items():
        result.append({
            'country': country,
            'city': city,
            'area': area,
            'high_value': data['high_value'],
            'avg_sqm': data['avg_sqm'],
            'currency': COUNTRIES.get(country, {}).get('currency', 'EUR'),
            'transport_score': data['transport_score'],
            'infrastructure_score': data['infrastructure_score'],
            'green_spaces': data['green_spaces'],
            'noise_level': data['noise_level'],
            'crime_index': data['crime_index'],
            'seismic_zone': data['seismic_zone'],
            'panel_buildings_pct': data['panel_buildings_pct'],
            'appreciation_history': data['appreciation_history'],
            'demand_trend': data['demand_trend'],
        })
    return result
