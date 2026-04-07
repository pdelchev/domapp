'use client';

/**
 * Property Deal Analyzer — evaluate any property investment.
 *
 * AI-NAV: Form → POST /api/analyze-property/ → results with verdict.
 * AI-NAV: Market data loaded from /api/market-data/ for cascading dropdowns.
 * AI-NAV: Saved analyses from /api/property-analyses/ shown in history.
 * AI-NAV: Re-analyze: load saved analysis inputs back into form with new price.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getMarketData, analyzeProperty, reanalyzeProperty, getPropertyAnalyses, deletePropertyAnalysis } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Select, Badge, Alert, Spinner, FormSection } from '../../components/ui';
import type { LocationResult } from '../../components/LocationPicker';

// Dynamic import — Leaflet requires window (no SSR)
const LocationPicker = dynamic(() => import('../../components/LocationPicker'), { ssr: false });

// ── Types ──────────────────────────────────────────────────────────

interface MarketAreaRaw {
  country: string;
  city: string;
  area: string;
  high_value: boolean;
  avg_sqm: number;
  currency: string;
  transport_score: number;
  infrastructure_score: number;
  green_spaces: number;
  noise_level: number;
  crime_index: number;
  seismic_zone: number;
  panel_buildings_pct: number;
  appreciation_history: number[];
  demand_trend: string;
}

interface MarketDataResponse {
  countries: Record<string, { currency: string; eur_rate: number; tax_pct: number }>;
  cities: Record<string, string[]>;
  areas: MarketAreaRaw[];
}

function buildAreaLookup(areas: MarketAreaRaw[]): Record<string, string[]> {
  const lookup: Record<string, string[]> = {};
  for (const a of areas) {
    const key = `${a.country}:${a.city}`;
    if (!lookup[key]) lookup[key] = [];
    if (!lookup[key].includes(a.area)) lookup[key].push(a.area);
  }
  return lookup;
}

interface AnalysisResult {
  id?: number;
  country: string;
  city: string;
  area: string;
  currency: string;
  total_cost: number;
  price_per_sqm: number;
  market_avg_sqm: number;
  market_min_sqm: number;
  market_max_sqm: number;
  price_vs_market_pct: number;
  estimated_monthly_rent: number;
  estimated_annual_rent: number;
  gross_rental_yield: number;
  net_rental_yield: number;
  operating_expenses_pct: number;
  estimated_airbnb_daily: number;
  estimated_airbnb_monthly: number;
  airbnb_annual_revenue: number;
  airbnb_yield: number;
  airbnb_occupancy_pct: number;
  cap_rate: number;
  roi_5_year: number;
  roi_10_year: number;
  projected_value_5y: number;
  projected_value_10y: number;
  break_even_months: number;
  annual_appreciation_pct: number;
  area_heat_score: number;
  high_value_area: boolean;
  verdict: string;
  verdict_score: number;
  score_breakdown: Record<string, { score: number; max: number; label_en: string; label_bg: string }>;
  renovation_cost?: number;
  monthly_fees?: number;
  annual_fees?: number;
  cost_breakdown?: {
    asking_price: number;
    notary_fees: number;
    acquisition_tax: number;
    lawyer_fees: number;
    agent_commission: number;
    other_costs: number;
    renovation_cost: number;
    parking_price: number;
    total_acquisition: number;
  };
  location_score: number;
  risk_score: number;
  market_trend_score: number;
  renovation_roi: number | null;
  risk_factors: { factor: string; severity: string; text_en: string; text_bg: string }[];
  recommendation_text: string;
  recommendation_text_bg: string;
  appreciation_history: number[];
  demand_trend: string;
  seismic_zone: number;
  panel_buildings_pct: number;
  transport_score: number;
  infrastructure_score: number;
  green_spaces_score: number;
  noise_level_score: number;
  crime_index: number;
}

interface SavedAnalysis {
  id: number;
  name: string;
  country: string;
  city: string;
  area: string;
  property_type: string;
  square_meters: number;
  asking_price: number;
  parking_included: boolean;
  parking_price: number;
  num_bedrooms: number;
  num_bathrooms: number;
  condition: string;
  furnishing: string;
  floor: number | null;
  total_floors: number | null;
  year_built: number | null;
  has_balcony: boolean;
  has_garden: boolean;
  has_patio: boolean;
  has_elevator: boolean;
  has_storage: boolean;
  has_ac: boolean;
  has_heating: boolean;
  has_pool: boolean;
  has_gym: boolean;
  has_view: boolean;
  view_type: string;
  renovation_cost: number;
  monthly_fees: number;
  verdict: string;
  verdict_score: number;
  price_per_sqm: number;
  gross_rental_yield: number;
  net_rental_yield: number;
  estimated_monthly_rent: number;
  cap_rate: number;
  break_even_months: number;
  area_heat_score: number;
  created_at: string;
  construction_type: string;
  near_metro: boolean;
  near_school: boolean;
  near_hospital: boolean;
  near_park: boolean;
  noise_level: string;
  location_score: number;
  risk_score: number;
  market_trend_score: number;
  renovation_roi: number | null;
  recommendation_text: string;
  recommendation_text_bg: string;
  score_breakdown_json: Record<string, { score: number; max: number; label_en: string; label_bg: string }>;
}

// ── Constants ──────────────────────────────────────────────────────

const PROPERTY_TYPES = ['apartment', 'house', 'studio', 'penthouse', 'commercial', 'villa'];
const CONDITIONS = ['new_build', 'renovated', 'good', 'needs_work'];
const FURNISHINGS = ['unfurnished', 'semi', 'fully'];
const VIEW_TYPES = ['none', 'city', 'sea', 'mountain', 'garden'];

const VERDICT_COLORS: Record<string, string> = {
  strong_buy: 'green', buy: 'blue', hold: 'yellow', overpriced: 'red', avoid: 'red',
};

const VERDICT_EMOJIS: Record<string, string> = {
  strong_buy: '🚀', buy: '✅', hold: '⚡', overpriced: '⚠️', avoid: '🛑',
};

const VERDICT_BG: Record<string, string> = {
  strong_buy: 'from-emerald-50 to-emerald-100/50 border-emerald-200',
  buy: 'from-blue-50 to-blue-100/50 border-blue-200',
  hold: 'from-amber-50 to-amber-100/50 border-amber-200',
  overpriced: 'from-red-50 to-red-100/50 border-red-200',
  avoid: 'from-red-100 to-red-200/50 border-red-300',
};

// Research links per country
const RESEARCH_LINKS: Record<string, { name: string; url: string; icon: string }[]> = {
  'Bulgaria': [
    { name: 'imot.bg', url: 'https://imot.bg', icon: '🏠' },
    { name: 'imoti.net', url: 'https://imoti.net', icon: '🏢' },
    { name: 'address.bg', url: 'https://address.bg', icon: '📍' },
    { name: 'NSI Statistics', url: 'https://nsi.bg', icon: '📊' },
  ],
  'UAE': [
    { name: 'Property Finder', url: 'https://propertyfinder.ae', icon: '🏠' },
    { name: 'Bayut', url: 'https://bayut.com', icon: '🏢' },
    { name: 'Dubizzle', url: 'https://dubizzle.com', icon: '📍' },
  ],
  'United Kingdom': [
    { name: 'Rightmove', url: 'https://rightmove.co.uk', icon: '🏠' },
    { name: 'Zoopla', url: 'https://zoopla.co.uk', icon: '🏢' },
    { name: 'OnTheMarket', url: 'https://onthemarket.com', icon: '📍' },
    { name: 'Land Registry', url: 'https://landregistry.data.gov.uk', icon: '📊' },
  ],
};

// Country-specific acquisition cost guides
const ACQUISITION_COSTS: Record<string, { label_en: string; label_bg: string; items: { key: string; label_en: string; label_bg: string; pct: string; hint_en: string; hint_bg: string }[] }> = {
  'Bulgaria': {
    label_en: 'Bulgarian Acquisition Costs',
    label_bg: 'Разходи по придобиване (БГ)',
    items: [
      { key: 'notary_fees', label_en: 'Notary fees', label_bg: 'Нотариални такси', pct: '~0.5-1.5%', hint_en: 'Notary deed + registration fees. Typically 0.5-1.5% of price.', hint_bg: 'Нотариален акт + регистрация. Обикновено 0.5-1.5% от цената.' },
      { key: 'acquisition_tax', label_en: 'Local transfer tax', label_bg: 'Местен данък придобиване', pct: '~2-3%', hint_en: 'Municipal transfer tax, varies 2-3% by municipality.', hint_bg: 'Общински данък, варира 2-3% от данъчната оценка.' },
      { key: 'lawyer_fees', label_en: 'Lawyer', label_bg: 'Адвокат', pct: '~€300-1000', hint_en: 'Legal review + due diligence. Fixed fee or 0.5-1%.', hint_bg: 'Правна проверка + due diligence. Фиксирана такса или 0.5-1%.' },
      { key: 'agent_commission', label_en: 'Agent commission', label_bg: 'Агентска комисионна', pct: '~2-3%', hint_en: 'Real estate agent fee, typically 2-3% + VAT.', hint_bg: 'Комисионна на брокера, обикновено 2-3% + ДДС.' },
    ],
  },
  'United Kingdom': {
    label_en: 'UK Acquisition Costs',
    label_bg: 'Разходи по придобиване (UK)',
    items: [
      { key: 'notary_fees', label_en: 'Solicitor / Conveyancer', label_bg: 'Нотариус / Conveyancer', pct: '~£1000-2500', hint_en: 'Conveyancing solicitor fees including searches.', hint_bg: 'Такса нотариус включително проверки.' },
      { key: 'acquisition_tax', label_en: 'Stamp Duty (SDLT)', label_bg: 'Stamp Duty (SDLT)', pct: '0-12%', hint_en: 'Stamp Duty Land Tax. 0% up to £250k, 5% £250-925k, 10% £925k-1.5M, 12% above. +3% for additional properties.', hint_bg: 'Stamp Duty. 0% до £250k, 5% £250-925k, 10% £925k-1.5M. +3% за допълнителни имоти.' },
      { key: 'lawyer_fees', label_en: 'Survey / Inspection', label_bg: 'Оглед / Инспекция', pct: '~£400-1500', hint_en: 'RICS Home Survey or Building Survey. Essential before purchase.', hint_bg: 'RICS оглед на имота. Задължителен преди покупка.' },
      { key: 'agent_commission', label_en: 'Agent fee (seller pays)', label_bg: 'Агентска комисионна (плаща продавач)', pct: '1-3%', hint_en: 'In UK, seller typically pays agent fees. Buyer pays nothing.', hint_bg: 'В UK продавачът плаща комисионната. Купувачът не плаща.' },
    ],
  },
  'UAE': {
    label_en: 'UAE Acquisition Costs',
    label_bg: 'Разходи по придобиване (ОАЕ)',
    items: [
      { key: 'notary_fees', label_en: 'DLD Registration', label_bg: 'DLD регистрация', pct: '4%', hint_en: 'Dubai Land Department transfer fee. Fixed at 4% of price + AED 580 admin.', hint_bg: 'Такса прехвърляне DLD. Фиксирана 4% от цената + AED 580.' },
      { key: 'acquisition_tax', label_en: 'NOC Fee', label_bg: 'NOC такса', pct: '~AED 500-5000', hint_en: 'No Objection Certificate from developer. Varies AED 500-5000.', hint_bg: 'Сертификат от предприемача. Варира AED 500-5000.' },
      { key: 'lawyer_fees', label_en: 'Conveyancer', label_bg: 'Conveyancer', pct: '~AED 5000-10000', hint_en: 'Legal fees for contract review and transfer processing.', hint_bg: 'Правни такси за преглед на договор и прехвърляне.' },
      { key: 'agent_commission', label_en: 'Agent commission', label_bg: 'Агентска комисионна', pct: '2%', hint_en: 'Standard 2% commission to agent.', hint_bg: 'Стандартна 2% комисионна.' },
    ],
  },
};

// ── Bulgarian notary fee tariff (official sliding scale) ─────────
// Based on Tarifa za notarialnite taksi + Imoten registar taksi
function calcBulgarianNotaryFees(price: number): number {
  // Notary deed fee (sliding scale per Bulgarian Notary Tariff)
  let notaryDeed = 0;
  const brackets = [
    { upto: 100, rate: 0, flat: 30 },
    { upto: 1000, rate: 0, flat: 30 },       // min 30 BGN
    { upto: 10000, rate: 0.015, flat: 0 },    // 1.5%
    { upto: 50000, rate: 0.01, flat: 50 },    // 1% + 50
    { upto: 100000, rate: 0.005, flat: 300 }, // 0.5% + 300
    { upto: 500000, rate: 0.002, flat: 600 }, // 0.2% + 600
    { upto: Infinity, rate: 0.001, flat: 1400 }, // 0.1% + 1400
  ];
  // Convert EUR to BGN for tariff calculation (1 EUR = 1.9558 BGN)
  const priceBGN = price * 1.9558;
  for (const b of brackets) {
    if (priceBGN <= b.upto) {
      notaryDeed = Math.max(30, priceBGN * b.rate + b.flat);
      break;
    }
  }
  // Property Registry fee (Imoten registar): 0.1% of price
  const registryFee = priceBGN * 0.001;
  // Convert back to EUR
  return Math.round((notaryDeed + registryFee) / 1.9558);
}

// Bulgarian municipal transfer tax rates (данък придобиване)
// Source: official municipal ordinances, updated 2026
const BG_MUNICIPAL_TAX_RATES: Record<string, number> = {
  'Sofia': 0.03,      // 3% — Столична община
  'Plovdiv': 0.025,   // 2.5%
  'Varna': 0.026,     // 2.6%
  'Burgas': 0.025,    // 2.5%
};
const BG_DEFAULT_TAX_RATE = 0.025; // 2.5% fallback for unknown cities

// UK SDLT (Stamp Duty Land Tax) calculator
function calcUKStampDuty(priceGBP: number, additionalProperty = true): number {
  // Standard rates (2025-26)
  const brackets = [
    { upto: 250000, rate: 0 },
    { upto: 925000, rate: 0.05 },
    { upto: 1500000, rate: 0.10 },
    { upto: Infinity, rate: 0.12 },
  ];
  let duty = 0;
  let prev = 0;
  for (const b of brackets) {
    const taxable = Math.min(priceGBP, b.upto) - prev;
    if (taxable > 0) duty += taxable * b.rate;
    prev = b.upto;
    if (priceGBP <= b.upto) break;
  }
  // Additional property surcharge: +3%
  if (additionalProperty) duty += priceGBP * 0.03;
  return Math.round(duty);
}

// Country-specific acquisition cost estimator
function estimateAcquisitionCosts(country: string, city: string, priceEUR: number): {
  notary_fees: number; acquisition_tax: number; lawyer_fees: number; agent_commission: number;
} | null {
  if (!priceEUR || priceEUR <= 0) return null;

  if (country === 'Bulgaria') {
    const taxRate = BG_MUNICIPAL_TAX_RATES[city] || BG_DEFAULT_TAX_RATE;
    return {
      notary_fees: calcBulgarianNotaryFees(priceEUR),
      acquisition_tax: Math.round(priceEUR * taxRate),
      lawyer_fees: 500,  // typical flat fee ~€500
      agent_commission: Math.round(priceEUR * 0.03), // 3% standard buyer commission
    };
  }

  if (country === 'United Kingdom') {
    const priceGBP = priceEUR * 0.86; // approximate EUR→GBP
    return {
      notary_fees: Math.round(1500 / 0.86),   // ~£1500 solicitor/conveyancer
      acquisition_tax: Math.round(calcUKStampDuty(priceGBP) / 0.86), // SDLT in EUR
      lawyer_fees: Math.round(800 / 0.86),     // ~£800 survey
      agent_commission: 0,                      // seller pays in UK
    };
  }

  if (country === 'UAE') {
    const priceAED = priceEUR * 4.02;
    return {
      notary_fees: Math.round((priceAED * 0.04 + 580) / 4.02),  // 4% DLD + admin
      acquisition_tax: Math.round(2500 / 4.02),                   // NOC ~AED 2500
      lawyer_fees: Math.round(7500 / 4.02),                       // ~AED 7500
      agent_commission: Math.round(priceEUR * 0.02),               // 2%
    };
  }

  return null;
}

// 3 key purchase mistakes checklist
const PURCHASE_RULES = [
  {
    icon: '🔍',
    title_en: 'Always inspect before buying',
    title_bg: 'Винаги прави инспекция',
    desc_en: 'Hidden issues (roof, pipes, electrical, structural) can cost €3,000-30,000+. Never skip a professional inspection.',
    desc_bg: 'Скрити проблеми (покрив, тръби, ел. инсталация, конструкция) могат да струват €3 000-30 000+. Никога не пропускай професионален оглед.',
  },
  {
    icon: '🧮',
    title_en: 'Always calculate ALL costs',
    title_bg: 'Винаги смятай ВСИЧКИ разходи',
    desc_en: 'Beyond the price: notary fees, transfer tax, lawyer, agent commission, renovation. Total can be 10-25% above asking price.',
    desc_bg: 'Освен цената: нотариални такси, данък придобиване, адвокат, комисионна, ремонт. Тоталът може да е 10-25% над обявената цена.',
  },
  {
    icon: '📊',
    title_en: 'Always buy on numbers, not emotion',
    title_bg: 'Винаги купувай на числа, не на емоция',
    desc_en: 'Check: market price per m², rental yield, margin for profit. A cheaper property with 6.6% yield beats an expensive one at 4.3% — the 10-year difference is €11,000+.',
    desc_bg: 'Провери: пазарна цена на м², доходност от наем, маржин за печалба. По-евтин имот с 6.6% доходност бие скъп с 4.3% — разликата за 10 години е €11 000+.',
  },
];

// ── Helpers ─────────────────────────────────────────────────────────

function fmt(v: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
}

function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

// ── Score Bar ──────────────────────────────────────────────────────

function ScoreBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = (score / max) * 100;
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-900">{score}/{max}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Verdict Ring ───────────────────────────────────────────────────

function VerdictRing({ score, size = 100 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#10b981' : score >= 65 ? '#3b82f6' : score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
      </svg>
      <span className="absolute text-2xl font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

// ── Price Position Bar ─────────────────────────────────────────────

function PricePositionBar({ value, min, avg, max }: { value: number; min: number; avg: number; max: number }) {
  const totalRange = max - min;
  if (totalRange <= 0) return null;
  const vizMin = min * 0.85;
  const vizMax = max * 1.15;
  const vizRange = vizMax - vizMin;
  const toPos = (v: number) => Math.max(2, Math.min(98, ((v - vizMin) / vizRange) * 100));

  const valuePos = toPos(value);
  const minPos = toPos(min);
  const avgPos = toPos(avg);
  const maxPos = toPos(max);
  const isBelow = value <= avg;

  return (
    <div className="mt-3">
      <div className="relative h-3 rounded-full bg-gray-100">
        {/* Market range */}
        <div className="absolute top-0 h-full rounded-full bg-gradient-to-r from-emerald-200 via-amber-200 to-red-200"
          style={{ left: `${minPos}%`, width: `${maxPos - minPos}%` }} />
        {/* Average tick */}
        <div className="absolute top-0 h-full w-0.5 bg-gray-400" style={{ left: `${avgPos}%` }} />
        {/* Value marker */}
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10" style={{ left: `${valuePos}%` }}>
          <div className={`w-4 h-4 rounded-full border-2 border-white shadow-md ${isBelow ? 'bg-emerald-500' : 'bg-red-500'}`} />
        </div>
      </div>
      <div className="relative h-4 mt-1 text-[10px] text-gray-400">
        <span className="absolute -translate-x-1/2" style={{ left: `${minPos}%` }}>€{min}</span>
        <span className="absolute -translate-x-1/2 font-medium text-gray-500" style={{ left: `${avgPos}%` }}>avg</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${maxPos}%` }}>€{max}</span>
      </div>
    </div>
  );
}

// ── Default form state ─────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  country: '',
  city: '',
  area: '',
  property_type: 'apartment',
  square_meters: '',
  asking_price: '',
  parking_included: true,
  parking_price: '',
  num_bedrooms: '1',
  num_bathrooms: '1',
  condition: 'good',
  furnishing: 'unfurnished',
  floor: '',
  total_floors: '',
  year_built: '',
  has_balcony: false,
  has_garden: false,
  has_patio: false,
  has_elevator: false,
  has_storage: false,
  has_ac: false,
  has_heating: false,
  has_pool: false,
  has_gym: false,
  has_view: false,
  view_type: '',
  renovation_cost: '',
  monthly_fees: '',
  notary_fees: '',
  acquisition_tax: '',
  lawyer_fees: '',
  agent_commission: '',
  other_costs: '',
  construction_type: '',
  near_metro: false,
  near_school: false,
  near_hospital: false,
  near_park: false,
  noise_level: '',
};

// ── Main Component ─────────────────────────────────────────────────

export default function DealAnalyzerPage() {
  const router = useRouter();
  const { locale } = useLanguage();

  const [marketData, setMarketData] = useState<MarketDataResponse | null>(null);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loadedFromSaved, setLoadedFromSaved] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showMethodology, setShowMethodology] = useState(false);

  const [openSections, setOpenSections] = useState({ basic: true, financial: false, details: false, amenities: false, location: false, building: false });
  const toggleSection = (key: keyof typeof openSections) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const [areaLookup, setAreaLookup] = useState<Record<string, string[]>>({});

  useEffect(() => {
    Promise.all([getMarketData(), getPropertyAnalyses()])
      .then(([md, sa]) => {
        setMarketData(md);
        setAreaLookup(buildAreaLookup(md.areas || []));
        setSavedAnalyses(sa);
      })
      .catch(() => setError('Failed to load market data. Please refresh.'))
      .finally(() => setLoading(false));
  }, []);

  // Cascading dropdown values
  const countries = marketData ? Object.keys(marketData.countries) : [];
  const cities = form.country && marketData?.cities ? (marketData.cities[form.country] || []) : [];
  const areas = form.country && form.city ? (areaLookup[`${form.country}:${form.city}`] || []) : [];

  // Current area benchmark data
  const selectedAreaData = useMemo(() => {
    if (!marketData?.areas || !form.country || !form.city) return null;
    const match = marketData.areas.find(a => a.country === form.country && a.city === form.city && a.area === form.area);
    return match || null;
  }, [marketData, form.country, form.city, form.area]);

  // Nearby areas for comparison
  const nearbyAreas = useMemo(() => {
    if (!marketData?.areas || !form.country || !form.city) return [];
    return marketData.areas
      .filter(a => a.country === form.country && a.city === form.city)
      .sort((a, b) => a.avg_sqm - b.avg_sqm);
  }, [marketData, form.country, form.city]);

  const updateForm = (field: string, value: string | boolean) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'country') { next.city = ''; next.area = ''; }
      if (field === 'city') { next.area = ''; }
      return next;
    });
    setLoadedFromSaved(false);
  };

  // Auto-populate acquisition costs when price + country are set
  // Only fills empty fields — user overrides are preserved
  const [acqManualOverrides, setAcqManualOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const price = Number(form.asking_price);
    if (!form.country || !price) return;
    const estimates = estimateAcquisitionCosts(form.country, form.city, price);
    if (!estimates) return;

    setForm((prev) => {
      const next = { ...prev };
      const keys = ['notary_fees', 'acquisition_tax', 'lawyer_fees', 'agent_commission'] as const;
      let changed = false;
      for (const key of keys) {
        // Only auto-fill if the user hasn't manually typed a value
        if (!acqManualOverrides[key]) {
          const newVal = String(estimates[key]);
          if (next[key] !== newVal) {
            (next as unknown as Record<string, string>)[key] = newVal;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [form.asking_price, form.country, form.city, acqManualOverrides]);

  // Track when user manually edits an acquisition cost field
  const updateAcqField = (field: string, value: string) => {
    setAcqManualOverrides((prev) => ({ ...prev, [field]: true }));
    updateForm(field, value);
  };

  // Reset manual overrides when country changes (different rate structure)
  useEffect(() => {
    setAcqManualOverrides({});
  }, [form.country]);

  // Handle location picked from map
  const handleLocationSelect = useCallback((loc: LocationResult) => {
    setForm((prev) => {
      const next = { ...prev };
      // Map OpenStreetMap country names to our market data keys
      const countryMap: Record<string, string> = {
        'Bulgaria': 'Bulgaria',
        'United Arab Emirates': 'UAE',
        'United Kingdom': 'United Kingdom',
      };
      const mappedCountry = countryMap[loc.country] || loc.country;

      // Only update country/city/area if they match our market data
      if (marketData) {
        const md = marketData as MarketDataResponse;
        if (md.cities[mappedCountry]) {
          next.country = mappedCountry;
          // Find best matching city
          const matchCity = md.cities[mappedCountry].find(
            (c) => loc.city.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(loc.city.toLowerCase())
          );
          if (matchCity) {
            next.city = matchCity;
            // Find best matching area
            const areaKey = `${mappedCountry}:${matchCity}`;
            const availableAreas = areaLookup[areaKey] || [];
            const matchArea = availableAreas.find(
              (a) => loc.area.toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(loc.area.toLowerCase())
            );
            if (matchArea) next.area = matchArea;
            else next.area = '';
          }
        }
      }

      // Always update proximity flags from POI detection
      next.near_metro = loc.nearMetro;
      next.near_school = loc.nearSchool;
      next.near_hospital = loc.nearHospital;
      next.near_park = loc.nearPark;

      return next;
    });
    setLoadedFromSaved(false);
  }, [marketData, areaLookup]);

  // Load saved analysis back into form for re-analysis
  const handleLoadSaved = (a: SavedAnalysis) => {
    setForm({
      name: a.name || '',
      country: a.country,
      city: a.city,
      area: a.area || '',
      property_type: a.property_type || 'apartment',
      square_meters: String(a.square_meters),
      asking_price: String(a.asking_price),
      parking_included: a.parking_included ?? true,
      parking_price: a.parking_price ? String(a.parking_price) : '',
      num_bedrooms: String(a.num_bedrooms || 1),
      num_bathrooms: String(a.num_bathrooms || 1),
      condition: a.condition || 'good',
      furnishing: a.furnishing || 'unfurnished',
      floor: a.floor ? String(a.floor) : '',
      total_floors: a.total_floors ? String(a.total_floors) : '',
      year_built: a.year_built ? String(a.year_built) : '',
      has_balcony: a.has_balcony ?? false,
      has_garden: a.has_garden ?? false,
      has_patio: a.has_patio ?? false,
      has_elevator: a.has_elevator ?? false,
      has_storage: a.has_storage ?? false,
      has_ac: a.has_ac ?? false,
      has_heating: a.has_heating ?? false,
      has_pool: a.has_pool ?? false,
      has_gym: a.has_gym ?? false,
      has_view: a.has_view ?? false,
      view_type: a.view_type || '',
      renovation_cost: a.renovation_cost ? String(a.renovation_cost) : '',
      monthly_fees: a.monthly_fees ? String(a.monthly_fees) : '',
      notary_fees: '',
      acquisition_tax: '',
      lawyer_fees: '',
      agent_commission: '',
      other_costs: '',
      construction_type: a.construction_type || '',
      near_metro: a.near_metro ?? false,
      near_school: a.near_school ?? false,
      near_hospital: a.near_hospital ?? false,
      near_park: a.near_park ?? false,
      noise_level: a.noise_level || '',
    });
    setEditingId(a.id);
    setLoadedFromSaved(true);
    setAcqManualOverrides({});
    setResult(null);
    setOpenSections({ basic: true, financial: true, details: false, amenities: false, location: false, building: false });
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setAnalyzing(true);
    setError('');
    setResult(null);
    try {
      const payload = {
        name: form.name || `${form.city} ${form.area}`.trim(),
        country: form.country,
        city: form.city,
        area: form.area,
        property_type: form.property_type,
        square_meters: Number(form.square_meters),
        asking_price: Number(form.asking_price),
        parking_included: form.parking_included,
        parking_price: form.parking_included ? 0 : Number(form.parking_price || 0),
        num_bedrooms: Number(form.num_bedrooms),
        num_bathrooms: Number(form.num_bathrooms),
        condition: form.condition,
        furnishing: form.furnishing,
        floor: form.floor ? Number(form.floor) : null,
        total_floors: form.total_floors ? Number(form.total_floors) : null,
        year_built: form.year_built ? Number(form.year_built) : null,
        has_balcony: form.has_balcony,
        has_garden: form.has_garden,
        has_patio: form.has_patio,
        has_elevator: form.has_elevator,
        has_storage: form.has_storage,
        has_ac: form.has_ac,
        has_heating: form.has_heating,
        has_pool: form.has_pool,
        has_gym: form.has_gym,
        has_view: form.has_view,
        view_type: form.has_view ? form.view_type : '',
        renovation_cost: Number(form.renovation_cost || 0),
        monthly_fees: Number(form.monthly_fees || 0),
        notary_fees: Number(form.notary_fees || 0),
        acquisition_tax: Number(form.acquisition_tax || 0),
        lawyer_fees: Number(form.lawyer_fees || 0),
        agent_commission: Number(form.agent_commission || 0),
        other_costs: Number(form.other_costs || 0),
        construction_type: form.construction_type || null,
        near_metro: form.near_metro,
        near_school: form.near_school,
        near_hospital: form.near_hospital,
        near_park: form.near_park,
        noise_level: form.noise_level || null,
      };
      const res = editingId
        ? await reanalyzeProperty(editingId, payload)
        : await analyzeProperty(payload);
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res);
        const updated = await getPropertyAnalyses();
        setSavedAnalyses(updated);
        setLoadedFromSaved(false);
        setEditingId(null);
      }
    } catch {
      setError(t('common.error', locale));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDeleteAnalysis = async (id: number) => {
    if (!confirm(t('investments.delete_confirm', locale))) return;
    await deletePropertyAnalysis(id);
    setSavedAnalyses((prev) => prev.filter((a) => a.id !== id));
  };

  if (loading) return <PageShell><NavBar /><PageContent size="lg"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>;

  const researchLinks = RESEARCH_LINKS[form.country] || [];

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('analyzer.title', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/investments')}
        />
        <p className="text-sm text-gray-500 -mt-4 mb-4">{t('analyzer.subtitle', locale)}</p>

        {/* Methodology */}
        <div className="mb-5">
          <button type="button" onClick={() => setShowMethodology(!showMethodology)}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
            <span>{showMethodology ? '▾' : '▸'}</span>
            {t('analyzer.how_it_works', locale)}
          </button>
          {showMethodology && (
            <div className="mt-3 p-4 bg-indigo-50 rounded-xl text-xs text-gray-700 space-y-3 border border-indigo-100">
              <p className="font-semibold text-gray-900">{t('analyzer.methodology_title', locale)}</p>
              <p>{t('analyzer.methodology_intro', locale)}</p>
              <div className="space-y-1.5">
                <p><span className="font-medium text-gray-900">{t('analyzer.price_vs_market', locale)} (30 pts):</span> {t('analyzer.method_price', locale)}</p>
                <p><span className="font-medium text-gray-900">{t('analyzer.rental_yield_score', locale)} (25 pts):</span> {t('analyzer.method_yield', locale)}</p>
                <p><span className="font-medium text-gray-900">{t('analyzer.airbnb_potential', locale)} (15 pts):</span> {t('analyzer.method_airbnb', locale)}</p>
                <p><span className="font-medium text-gray-900">{t('analyzer.area_heat_score', locale)} (15 pts):</span> {t('analyzer.method_area', locale)}</p>
                <p><span className="font-medium text-gray-900">{t('analyzer.property_quality', locale)} (15 pts):</span> {t('analyzer.method_quality', locale)}</p>
              </div>
              <div className="border-t border-indigo-200 pt-2 space-y-1">
                <p className="font-semibold text-gray-900">{t('analyzer.verdict_scale', locale)}</p>
                <p>🚀 <span className="font-medium">{t('analyzer.strong_buy', locale)}</span> (80-100) — {t('analyzer.verdict_strong_buy_desc', locale)}</p>
                <p>✅ <span className="font-medium">{t('analyzer.buy', locale)}</span> (65-79) — {t('analyzer.verdict_buy_desc', locale)}</p>
                <p>⚡ <span className="font-medium">{t('analyzer.hold', locale)}</span> (50-64) — {t('analyzer.verdict_hold_desc', locale)}</p>
                <p>⚠️ <span className="font-medium">{t('analyzer.overpriced', locale)}</span> (35-49) — {t('analyzer.verdict_overpriced_desc', locale)}</p>
                <p>🛑 <span className="font-medium">{t('analyzer.avoid', locale)}</span> (0-34) — {t('analyzer.verdict_avoid_desc', locale)}</p>
              </div>
              <p className="text-gray-500 italic">{t('analyzer.methodology_disclaimer', locale)}</p>
            </div>
          )}
        </div>

        <Alert type="error" message={error} />

        {/* Loaded from saved banner */}
        {loadedFromSaved && (
          <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-700 flex items-center gap-2">
            <span>✏️</span> {t('analyzer.loaded_from_saved', locale)}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT: Form (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            <form onSubmit={handleAnalyze}>
              {/* Map Location Picker */}
              <Card className="mb-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span>🗺️</span> {locale === 'en' ? 'Pick Location on Map' : 'Изберете локация на картата'}
                </h3>
                <LocationPicker
                  locale={locale}
                  initialCity={form.city || undefined}
                  onSelect={handleLocationSelect}
                />
              </Card>

              <FormSection title={t('properties.section.basic', locale)} icon="📍" open={openSections.basic} onToggle={() => toggleSection('basic')}>
                <Input
                  label={t('analyzer.property_name', locale)}
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  placeholder="e.g. Sofia Center 2BR"
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Select label={t('analyzer.country', locale)} value={form.country} onChange={(e) => updateForm('country', e.target.value)} required>
                    <option value="">{t('analyzer.select_country', locale)}</option>
                    {countries.map((c) => (
                      <option key={c} value={c}>{t(`country.${c.toLowerCase().replace(/ /g, '_')}`, locale) || c}</option>
                    ))}
                  </Select>
                  <Select label={t('analyzer.city', locale)} value={form.city} onChange={(e) => updateForm('city', e.target.value)} required>
                    <option value="">{t('analyzer.select_city', locale)}</option>
                    {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                  <Select label={t('analyzer.area', locale)} value={form.area} onChange={(e) => updateForm('area', e.target.value)}>
                    <option value="">{t('analyzer.select_area', locale)}</option>
                    {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label={t('analyzer.square_meters', locale)} type="number" value={form.square_meters} onChange={(e) => updateForm('square_meters', e.target.value)} required />
                  <Input label={`${t('analyzer.asking_price', locale)} (€)`} type="number" value={form.asking_price} onChange={(e) => updateForm('asking_price', e.target.value)} required />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Select label={t('analyzer.property_type', locale)} value={form.property_type} onChange={(e) => updateForm('property_type', e.target.value)}>
                    {PROPERTY_TYPES.map((pt) => <option key={pt} value={pt}>{t(`analyzer.${pt}`, locale)}</option>)}
                  </Select>
                  <Input label={t('analyzer.bedrooms', locale)} type="number" value={form.num_bedrooms} onChange={(e) => updateForm('num_bedrooms', e.target.value)} min="0" max="10" />
                  <Input label={t('analyzer.bathrooms', locale)} type="number" value={form.num_bathrooms} onChange={(e) => updateForm('num_bathrooms', e.target.value)} min="1" max="10" />
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={form.parking_included} onChange={(e) => updateForm('parking_included', e.target.checked)} className="rounded" />
                    {t('analyzer.parking_included', locale)}
                  </label>
                </div>
                {!form.parking_included && (
                  <Input label={t('analyzer.parking_price', locale)} type="number" value={form.parking_price} onChange={(e) => updateForm('parking_price', e.target.value)} />
                )}
              </FormSection>

              <div className="mt-4">
                <FormSection title={t('analyzer.financial_details', locale)} icon="💰" open={openSections.financial} onToggle={() => toggleSection('financial')}>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label={t('analyzer.renovation_cost', locale)} type="number" value={form.renovation_cost} onChange={(e) => updateForm('renovation_cost', e.target.value)} placeholder="0" />
                    <Input label={t('analyzer.monthly_fees', locale)} type="number" value={form.monthly_fees} onChange={(e) => updateForm('monthly_fees', e.target.value)} placeholder="0" />
                  </div>

                  {/* Acquisition costs */}
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                      📋 {locale === 'bg' ? 'Разходи по придобиване' : 'Acquisition Costs'}
                    </h4>
                    {form.country && ACQUISITION_COSTS[form.country] && (
                      <div className="mb-3 p-2 bg-amber-50 border border-amber-100 rounded-lg">
                        <p className="text-[11px] text-amber-700 font-medium mb-1">
                          {locale === 'bg' ? ACQUISITION_COSTS[form.country].label_bg : ACQUISITION_COSTS[form.country].label_en}
                          {form.country === 'Bulgaria' && form.city && (
                            <span className="ml-1 text-amber-500">
                              — {form.city} {((BG_MUNICIPAL_TAX_RATES[form.city] || BG_DEFAULT_TAX_RATE) * 100).toFixed(1)}% {locale === 'bg' ? 'данък' : 'tax'}
                            </span>
                          )}
                        </p>
                        <div className="space-y-0.5">
                          {ACQUISITION_COSTS[form.country].items.map((item) => (
                            <div key={item.key} className="flex justify-between text-[11px] text-amber-600">
                              <span>{locale === 'bg' ? item.label_bg : item.label_en}</span>
                              <span className="font-mono">{item.pct}</span>
                            </div>
                          ))}
                        </div>
                        {Number(form.asking_price) > 0 && (
                          <p className="text-[10px] text-emerald-600 mt-1.5 flex items-center gap-1">
                            <span>&#10003;</span>
                            {locale === 'bg' ? 'Стойностите са изчислени автоматично по официални ставки' : 'Values auto-estimated from official rates'}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <Input label={locale === 'bg' ? 'Нотариални такси' : 'Notary / Solicitor'} type="number" value={form.notary_fees} onChange={(e) => updateAcqField('notary_fees', e.target.value)} placeholder="0" />
                      <Input label={locale === 'bg' ? 'Данък придобиване / SDLT' : 'Transfer tax / SDLT'} type="number" value={form.acquisition_tax} onChange={(e) => updateAcqField('acquisition_tax', e.target.value)} placeholder="0" />
                      <Input label={locale === 'bg' ? 'Адвокат / Инспекция' : 'Lawyer / Survey'} type="number" value={form.lawyer_fees} onChange={(e) => updateAcqField('lawyer_fees', e.target.value)} placeholder="0" />
                      <Input label={locale === 'bg' ? 'Агентска комисионна' : 'Agent commission'} type="number" value={form.agent_commission} onChange={(e) => updateAcqField('agent_commission', e.target.value)} placeholder="0" />
                      <Input label={locale === 'bg' ? 'Други разходи' : 'Other costs'} type="number" value={form.other_costs} onChange={(e) => updateForm('other_costs', e.target.value)} placeholder="0" />
                    </div>
                  </div>

                  <p className="text-xs text-gray-400 mt-2">
                    {locale === 'bg'
                      ? 'Всички разходи (ремонт + придобиване) се добавят към общата инвестиция. Месечните такси се изваждат от нетния наем.'
                      : 'All costs (renovation + acquisition) are added to total investment. Monthly fees are deducted from net rental income.'}
                  </p>
                </FormSection>
              </div>

              <div className="mt-4">
                <FormSection title={t('analyzer.condition', locale)} icon="🏠" open={openSections.details} onToggle={() => toggleSection('details')}>
                  <div className="grid grid-cols-2 gap-3">
                    <Select label={t('analyzer.condition', locale)} value={form.condition} onChange={(e) => updateForm('condition', e.target.value)}>
                      {CONDITIONS.map((c) => <option key={c} value={c === 'new_build' ? 'new' : c}>{t(`analyzer.${c}`, locale)}</option>)}
                    </Select>
                    <Select label={t('analyzer.furnishing', locale)} value={form.furnishing} onChange={(e) => updateForm('furnishing', e.target.value)}>
                      {FURNISHINGS.map((f) => <option key={f} value={f}>{t(`analyzer.${f}`, locale)}</option>)}
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Input label={t('analyzer.floor', locale)} type="number" value={form.floor} onChange={(e) => updateForm('floor', e.target.value)} />
                    <Input label={t('analyzer.total_floors', locale)} type="number" value={form.total_floors} onChange={(e) => updateForm('total_floors', e.target.value)} />
                    <Input label={t('analyzer.year_built', locale)} type="number" value={form.year_built} onChange={(e) => updateForm('year_built', e.target.value)} />
                  </div>
                </FormSection>
              </div>

              <div className="mt-4">
                <FormSection title={t('analyzer.amenities', locale)} icon="✨" open={openSections.amenities} onToggle={() => toggleSection('amenities')}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {(['has_balcony', 'has_garden', 'has_patio', 'has_elevator', 'has_storage', 'has_ac', 'has_heating', 'has_pool', 'has_gym'] as const).map((key) => (
                      <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer py-1">
                        <input type="checkbox" checked={form[key] as boolean} onChange={(e) => updateForm(key, e.target.checked)} className="rounded" />
                        {t(`analyzer.${key}`, locale)}
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={form.has_view} onChange={(e) => updateForm('has_view', e.target.checked)} className="rounded" />
                      {t('analyzer.has_view', locale)}
                    </label>
                    {form.has_view && (
                      <Select value={form.view_type} onChange={(e) => updateForm('view_type', e.target.value)}>
                        {VIEW_TYPES.map((vt) => <option key={vt} value={vt}>{t(`analyzer.view_${vt}`, locale)}</option>)}
                      </Select>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-3">{t('analyzer.amenities_hint', locale)}</p>
                </FormSection>
              </div>

              <div className="mt-4">
                <FormSection title={t('analyzer.location_details', locale)} icon="📍" open={openSections.location} onToggle={() => toggleSection('location')}>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(['near_metro', 'near_school', 'near_hospital', 'near_park'] as const).map((key) => (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={form[key] as boolean} onChange={(e) => updateForm(key, e.target.checked)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                        {t(`analyzer.${key}`, locale)}
                      </label>
                    ))}
                  </div>
                  <div className="mt-3">
                    <Select label={t('analyzer.noise_level', locale)} value={form.noise_level} onChange={(e) => updateForm('noise_level', e.target.value)}>
                      <option value="">{t('common.select', locale)}</option>
                      <option value="quiet">{t('analyzer.noise_quiet', locale)}</option>
                      <option value="moderate">{t('analyzer.noise_moderate', locale)}</option>
                      <option value="noisy">{t('analyzer.noise_noisy', locale)}</option>
                    </Select>
                  </div>
                </FormSection>
              </div>

              <div className="mt-4">
                <FormSection title={t('analyzer.building_details', locale)} icon="🏗️" open={openSections.building} onToggle={() => toggleSection('building')}>
                  <Select label={t('analyzer.construction_type', locale)} value={form.construction_type} onChange={(e) => updateForm('construction_type', e.target.value)}>
                    <option value="">{t('analyzer.construction_unknown', locale)}</option>
                    <option value="panel">{t('analyzer.construction_panel', locale)}</option>
                    <option value="brick">{t('analyzer.construction_brick', locale)}</option>
                    <option value="reinforced">{t('analyzer.construction_reinforced', locale)}</option>
                    <option value="wood">{t('analyzer.construction_wood', locale)}</option>
                  </Select>
                </FormSection>
              </div>

              <Button type="submit" className="w-full mt-5" disabled={analyzing || !form.country || !form.city || !form.square_meters || !form.asking_price}>
                {analyzing ? t('analyzer.analyzing', locale) : editingId ? t('analyzer.reanalyze', locale) : t('analyzer.analyze', locale)}
              </Button>
            </form>
          </div>

          {/* RIGHT: Results / Area Info (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Area benchmarks — shown when location selected */}
            {form.country && form.city && nearbyAreas.length > 0 && !result && (
              <Card>
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
                  📊 {t('analyzer.area_benchmarks', locale)}
                </h3>
                <div className="space-y-2">
                  {nearbyAreas.map((a) => {
                    const isSelected = a.area === form.area;
                    return (
                      <div key={a.area} className={`p-2.5 rounded-lg text-xs transition-colors ${isSelected ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50 border border-transparent'}`}>
                        <div className="flex items-center justify-between">
                          <span className={`font-medium ${isSelected ? 'text-indigo-700' : 'text-gray-700'}`}>
                            {a.area} {a.high_value && <span className="text-amber-500">★</span>}
                          </span>
                          <span className="font-semibold text-gray-900">€{a.avg_sqm}/m²</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Research links */}
                {researchLinks.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <h4 className="text-xs font-medium text-gray-500 mb-2">{t('analyzer.research_links', locale)}</h4>
                    <div className="flex flex-wrap gap-2">
                      {researchLinks.map((link) => (
                        <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors text-gray-600">
                          <span>{link.icon}</span> {link.name}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {result ? (
              <div className="space-y-4">
                {/* Verdict hero card */}
                <div className={`bg-gradient-to-b ${VERDICT_BG[result.verdict] || 'from-gray-50 to-gray-100/50 border-gray-200'} border rounded-xl p-5`}>
                  <div className="flex items-center gap-4">
                    <VerdictRing score={result.verdict_score} />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl">{VERDICT_EMOJIS[result.verdict] || '📊'}</span>
                        <h2 className="text-xl font-bold text-gray-900">{t(`analyzer.${result.verdict}`, locale)}</h2>
                      </div>
                      <p className="text-sm text-gray-600">{t(`analyzer.verdict_${result.verdict}_desc`, locale)}</p>
                    </div>
                  </div>

                  {/* Score breakdown */}
                  <div className="mt-4 pt-4 border-t border-black/5">
                    {result.score_breakdown && Object.entries(result.score_breakdown).map(([key, entry]) => (
                      <ScoreBar
                        key={key}
                        label={locale === 'bg' && entry.label_bg ? entry.label_bg : entry.label_en || key}
                        score={entry.score} max={entry.max}
                      />
                    ))}
                  </div>
                </div>

                {/* Price analysis with position bar */}
                <Card>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('analyzer.price_per_sqm', locale)}</h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-lg font-bold text-gray-900">{fmt(result.price_per_sqm)}</p>
                      <p className="text-[11px] text-gray-500">{t('analyzer.price_per_sqm', locale)}</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-500">{fmt(result.market_avg_sqm)}</p>
                      <p className="text-[11px] text-gray-500">{t('analyzer.market_avg', locale)}</p>
                    </div>
                    <div>
                      <p className={`text-lg font-bold ${result.price_vs_market_pct <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {fmtPct(result.price_vs_market_pct)}
                      </p>
                      <p className="text-[11px] text-gray-500">{t('analyzer.vs_market', locale)}</p>
                    </div>
                  </div>
                  <PricePositionBar
                    value={result.price_per_sqm}
                    min={result.market_min_sqm}
                    avg={result.market_avg_sqm}
                    max={result.market_max_sqm}
                  />
                  <p className="text-xs text-gray-400 mt-3">
                    {t('analyzer.total_cost', locale)}: {fmt(result.total_cost)}
                    {(result.renovation_cost ?? 0) > 0 && ` (incl. €${result.renovation_cost} renovation)`}
                  </p>
                </Card>

                {/* Real costs breakdown */}
                {result.cost_breakdown && (
                  <Card>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">
                      {locale === 'bg' ? '💰 Реални разходи' : '💰 Real Costs Breakdown'}
                    </h3>
                    <div className="space-y-1.5">
                      {[
                        { key: 'asking_price', label_en: 'Purchase price', label_bg: 'Покупна цена' },
                        { key: 'notary_fees', label_en: 'Notary / Solicitor', label_bg: 'Нотариални такси' },
                        { key: 'acquisition_tax', label_en: 'Transfer tax / SDLT', label_bg: 'Данък придобиване' },
                        { key: 'lawyer_fees', label_en: 'Lawyer / Survey', label_bg: 'Адвокат / Инспекция' },
                        { key: 'agent_commission', label_en: 'Agent commission', label_bg: 'Агентска комисионна' },
                        { key: 'renovation_cost', label_en: 'Renovation', label_bg: 'Ремонт' },
                        { key: 'parking_price', label_en: 'Parking', label_bg: 'Паркомясто' },
                        { key: 'other_costs', label_en: 'Other costs', label_bg: 'Други' },
                      ].map((item) => {
                        const val = (result.cost_breakdown as Record<string, number>)[item.key] || 0;
                        if (val === 0) return null;
                        return (
                          <div key={item.key} className="flex justify-between text-sm py-1">
                            <span className="text-gray-600">{locale === 'bg' ? item.label_bg : item.label_en}</span>
                            <span className="font-medium text-red-600">-{fmt(val)}</span>
                          </div>
                        );
                      })}
                      {result.cost_breakdown.total_acquisition > 0 && (
                        <div className="flex justify-between text-xs py-1 text-gray-400 border-t border-gray-100">
                          <span>{locale === 'bg' ? 'Разходи по придобиване' : 'Acquisition costs'}</span>
                          <span>-{fmt(result.cost_breakdown.total_acquisition)} ({((result.cost_breakdown.total_acquisition / result.cost_breakdown.asking_price) * 100).toFixed(1)}%)</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-bold py-2 border-t-2 border-gray-200">
                        <span className="text-gray-900">{locale === 'bg' ? 'ТОТАЛ ИНВЕСТИЦИЯ' : 'TOTAL INVESTMENT'}</span>
                        <span className="text-gray-900">{fmt(result.total_cost)}</span>
                      </div>
                      {result.cost_breakdown.total_acquisition > 0 && (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-100 rounded-lg">
                          <p className="text-[11px] text-amber-700">
                            {locale === 'bg'
                              ? `⚠️ Реалната инвестиция е ${((result.total_cost / result.cost_breakdown.asking_price - 1) * 100).toFixed(1)}% над покупната цена. Ако тоталът е над бюджета – не купувай.`
                              : `⚠️ Real investment is ${((result.total_cost / result.cost_breakdown.asking_price - 1) * 100).toFixed(1)}% above asking price. If total exceeds budget — don't buy.`}
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {/* Rental analysis */}
                <Card>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('analyzer.standard_rent', locale)}</h3>
                  <div className="grid grid-cols-3 gap-3 text-center mb-3">
                    <div className="p-2 bg-emerald-50 rounded-lg">
                      <p className="text-base font-bold text-emerald-700">{fmt(result.estimated_monthly_rent)}</p>
                      <p className="text-[10px] text-gray-500">/mo</p>
                    </div>
                    <div className="p-2 bg-emerald-50 rounded-lg">
                      <p className="text-base font-bold text-emerald-700">{result.gross_rental_yield}%</p>
                      <p className="text-[10px] text-gray-500">{t('analyzer.gross_yield', locale)}</p>
                    </div>
                    <div className="p-2 bg-emerald-50 rounded-lg">
                      <p className="text-base font-bold text-emerald-700">{result.net_rental_yield}%</p>
                      <p className="text-[10px] text-gray-500">{t('analyzer.net_yield', locale)}</p>
                    </div>
                  </div>

                  {/* Net income breakdown */}
                  {(result.monthly_fees ?? 0) > 0 && (
                    <div className="text-xs text-gray-500 space-y-0.5 mb-3 p-2 bg-gray-50 rounded-lg">
                      <div className="flex justify-between">
                        <span>{t('analyzer.monthly_rent', locale)}</span>
                        <span className="text-emerald-600">+{fmt(result.estimated_monthly_rent)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t('analyzer.operating_expenses', locale)} ({result.operating_expenses_pct}%)</span>
                        <span className="text-red-500">-{fmt(result.estimated_monthly_rent * result.operating_expenses_pct / 100)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t('analyzer.monthly_fees', locale)}</span>
                        <span className="text-red-500">-{fmt(result.monthly_fees || 0)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-gray-200 font-medium text-gray-900">
                        <span>{t('analyzer.net_monthly_income', locale)}</span>
                        <span>{fmt(result.estimated_monthly_rent * (1 - result.operating_expenses_pct / 100) - (result.monthly_fees || 0))}</span>
                      </div>
                    </div>
                  )}

                  <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('analyzer.airbnb_rent', locale)}</h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-2 bg-purple-50 rounded-lg">
                      <p className="text-base font-bold text-purple-700">{fmt(result.estimated_airbnb_daily)}</p>
                      <p className="text-[10px] text-gray-500">/day</p>
                    </div>
                    <div className="p-2 bg-purple-50 rounded-lg">
                      <p className="text-base font-bold text-purple-700">{fmt(result.estimated_airbnb_monthly)}</p>
                      <p className="text-[10px] text-gray-500">/mo</p>
                    </div>
                    <div className="p-2 bg-purple-50 rounded-lg">
                      <p className="text-base font-bold text-purple-700">{result.airbnb_yield}%</p>
                      <p className="text-[10px] text-gray-500">{t('analyzer.airbnb_yield', locale)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{t('analyzer.occupancy', locale)}: {result.airbnb_occupancy_pct.toFixed(0)}%</p>
                </Card>

                {/* Investment metrics */}
                <Card>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('analyzer.investment_metrics', locale)}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-lg font-bold text-gray-900">{result.cap_rate}%</p>
                      <p className="text-[10px] text-gray-500">{t('analyzer.cap_rate', locale)}</p>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-lg font-bold text-gray-900">{Math.floor(result.break_even_months / 12)}y {result.break_even_months % 12}m</p>
                      <p className="text-[10px] text-gray-500">{t('analyzer.break_even', locale)}</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-lg font-bold text-blue-700">{fmtPct(result.roi_5_year)}</p>
                      <p className="text-[10px] text-gray-500">{t('analyzer.roi_5y', locale)}</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-lg font-bold text-blue-700">{fmtPct(result.roi_10_year)}</p>
                      <p className="text-[10px] text-gray-500">{t('analyzer.roi_10y', locale)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3 text-center">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{fmt(result.projected_value_5y)}</p>
                      <p className="text-[10px] text-gray-500">{t('analyzer.projected_5y', locale)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">{fmt(result.projected_value_10y)}</p>
                      <p className="text-[10px] text-gray-500">{t('analyzer.projected_10y', locale)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{t('analyzer.appreciation', locale)}: {result.annual_appreciation_pct}%/yr</p>
                  {result.renovation_roi != null && (
                    <div className="mt-3 pt-3 border-t border-gray-100 text-center">
                      <p className="text-[13px] text-gray-500">{locale === 'en' ? 'Renovation ROI' : 'ROI от ремонт'}</p>
                      <p className={`text-xl font-bold ${result.renovation_roi > 0 ? 'text-green-600' : 'text-red-600'}`}>{result.renovation_roi.toFixed(1)}%</p>
                      <p className="text-[11px] text-gray-400">{locale === 'en' ? 'Annual return from renovation' : 'Годишна възвръщаемост от ремонт'}</p>
                    </div>
                  )}
                </Card>

                {/* Area heat + research links */}
                <Card>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-900">{t('analyzer.area_heat', locale)}</h3>
                    {result.high_value_area && <Badge color="purple">{t('analyzer.high_value_area', locale)}</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${result.area_heat_score}%`,
                          background: `linear-gradient(90deg, #3b82f6, ${result.area_heat_score >= 70 ? '#ef4444' : '#f59e0b'})`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-bold text-gray-900">{result.area_heat_score}/100</span>
                  </div>

                  {/* Compare nearby areas */}
                  {nearbyAreas.length > 1 && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <h4 className="text-xs font-medium text-gray-500 mb-2">{t('analyzer.compare_areas', locale)}</h4>
                      <div className="space-y-1">
                        {nearbyAreas.map((a) => (
                          <div key={a.area} className={`flex items-center justify-between text-xs py-1 ${a.area === result.area ? 'font-semibold text-indigo-700' : 'text-gray-600'}`}>
                            <span>{a.area} {a.high_value && '★'}</span>
                            <span>€{a.avg_sqm}/m²</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Research links */}
                  {researchLinks.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <h4 className="text-xs font-medium text-gray-500 mb-2">{t('analyzer.research_links', locale)}</h4>
                      <div className="flex flex-wrap gap-2">
                        {researchLinks.map((link) => (
                          <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                            <span>{link.icon}</span> {link.name}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>

                {/* Risk Factors */}
                {result.risk_factors && result.risk_factors.length > 0 && (
                  <Card className="mt-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">{locale === 'en' ? 'Risk Factors' : 'Рискови фактори'}</h3>
                    <div className="space-y-2">
                      {result.risk_factors.map((rf, i) => (
                        <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-sm ${
                          rf.severity === 'high' ? 'bg-red-50 text-red-800' :
                          rf.severity === 'medium' ? 'bg-amber-50 text-amber-800' :
                          'bg-gray-50 text-gray-700'
                        }`}>
                          <span>{rf.severity === 'high' ? '🔴' : rf.severity === 'medium' ? '🟡' : '🟢'}</span>
                          <span>{locale === 'en' ? rf.text_en : rf.text_bg}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Market Trends */}
                {result.appreciation_history && result.appreciation_history.length > 0 && (
                  <Card className="mt-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">{locale === 'en' ? 'Market Trends' : 'Пазарни тенденции'}</h3>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge color={result.demand_trend === 'rising' ? 'green' : result.demand_trend === 'declining' ? 'red' : 'gray'}>
                        {result.demand_trend === 'rising' ? (locale === 'en' ? '↑ Rising Demand' : '↑ Растящо търсене') :
                         result.demand_trend === 'declining' ? (locale === 'en' ? '↓ Declining' : '↓ Намаляващо') :
                         (locale === 'en' ? '→ Stable' : '→ Стабилно')}
                      </Badge>
                    </div>
                    <div className="flex items-end gap-1 h-16">
                      {result.appreciation_history.map((v, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center">
                          <div className="w-full bg-indigo-400 rounded-t" style={{ height: `${Math.max((v / 15) * 100, 10)}%` }} />
                          <span className="text-[10px] text-gray-500 mt-1">{v}%</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                      <span>{locale === 'en' ? '5yr ago' : 'преди 5г'}</span>
                      <span>{locale === 'en' ? 'Latest' : 'Последна'}</span>
                    </div>
                  </Card>
                )}

                {/* Recommendation */}
                {result.recommendation_text && (
                  <Card className="mt-4 bg-gradient-to-r from-indigo-50 to-white border-indigo-200">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">{locale === 'en' ? 'Investment Recommendation' : 'Инвестиционна препоръка'}</h3>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {locale === 'en' ? result.recommendation_text : result.recommendation_text_bg}
                    </p>
                  </Card>
                )}

                {/* 3 Purchase Rules Checklist */}
                <Card className="mt-4 border-amber-200 bg-gradient-to-b from-amber-50/50 to-white">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    ✅ {locale === 'bg' ? '3 правила преди покупка' : '3 Rules Before Buying'}
                  </h3>
                  <div className="space-y-3">
                    {PURCHASE_RULES.map((rule, i) => {
                      // Determine if the rule is satisfied based on the analysis
                      const checks = [
                        // Rule 1: Inspection — needs_work condition flagged
                        result.risk_factors && result.risk_factors.length > 0,
                        // Rule 2: All costs calculated — acquisition costs entered
                        result.cost_breakdown && result.cost_breakdown.total_acquisition > 0,
                        // Rule 3: Numbers checked — analysis was done
                        result.verdict_score > 0,
                      ];
                      const isMet = checks[i];
                      return (
                        <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${isMet ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                          <span className="text-xl shrink-0">{rule.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold text-gray-900">
                                {locale === 'bg' ? rule.title_bg : rule.title_en}
                              </h4>
                              {isMet && <span className="text-green-600 text-xs">✓</span>}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                              {locale === 'bg' ? rule.desc_bg : rule.desc_en}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 p-2 bg-red-50 border border-red-100 rounded-lg">
                    <p className="text-[11px] text-red-700 leading-relaxed">
                      {locale === 'bg'
                        ? '⚠️ Ако направиш и 3-те грешки: загуба от €15 000-25 000 за 5 години. Следвай тези 3 правила и ще ги спестиш.'
                        : '⚠️ Making all 3 mistakes can cost €15,000-25,000 over 5 years. Follow these 3 rules and save that money.'}
                    </p>
                  </div>
                </Card>
              </div>
            ) : !form.country || nearbyAreas.length === 0 ? (
              <Card className="text-center py-16">
                <span className="text-5xl block mb-4">🏠</span>
                <p className="text-gray-500 text-sm">{t('analyzer.subtitle', locale)}</p>
                <p className="text-gray-400 text-xs mt-2">
                  {locale === 'bg' ? 'Попълнете формуляра и натиснете' : 'Fill in the form and click'} "{t('analyzer.analyze', locale)}"
                </p>
              </Card>
            ) : null}
          </div>
        </div>

        {/* Saved analyses */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            📋 {t('analyzer.saved_analyses', locale)} ({savedAnalyses.length})
          </h2>
          {savedAnalyses.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-500 py-4 text-center">{t('analyzer.no_analyses', locale)}</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {savedAnalyses.map((a) => {
                const vColor = VERDICT_COLORS[a.verdict] || 'gray';
                const vEmoji = VERDICT_EMOJIS[a.verdict] || '📊';
                const vBg = VERDICT_BG[a.verdict] || 'from-gray-50 to-gray-100/50 border-gray-200';
                return (
                  <div key={a.id} className={`bg-gradient-to-b ${vBg} border rounded-xl p-4 transition-shadow hover:shadow-md`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{vEmoji}</span>
                        <div>
                          <h3 className="font-semibold text-sm text-gray-900 truncate max-w-[200px]">
                            {a.name || `${a.city} ${a.area}`}
                          </h3>
                          <p className="text-[11px] text-gray-500">{a.city}, {a.country}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge color={vColor as 'green' | 'blue' | 'yellow' | 'red'}>
                          {t(`analyzer.${a.verdict}`, locale)} {a.verdict_score}
                        </Badge>
                        <p className="text-[10px] text-gray-400 mt-1">{new Date(a.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>

                    {/* Key metrics */}
                    <div className="grid grid-cols-4 gap-2 text-center mt-3 mb-3">
                      <div className="bg-white/60 rounded-lg py-1.5 px-1">
                        <p className="text-xs font-bold text-gray-900">{fmt(a.asking_price)}</p>
                        <p className="text-[9px] text-gray-500">{locale === 'bg' ? 'Цена' : 'Price'}</p>
                      </div>
                      <div className="bg-white/60 rounded-lg py-1.5 px-1">
                        <p className="text-xs font-bold text-gray-900">{a.square_meters}m²</p>
                        <p className="text-[9px] text-gray-500">€{Math.round(a.price_per_sqm)}/m²</p>
                      </div>
                      <div className="bg-white/60 rounded-lg py-1.5 px-1">
                        <p className="text-xs font-bold text-emerald-700">{a.gross_rental_yield}%</p>
                        <p className="text-[9px] text-gray-500">{locale === 'bg' ? 'Доходн.' : 'Yield'}</p>
                      </div>
                      <div className="bg-white/60 rounded-lg py-1.5 px-1">
                        <p className="text-xs font-bold text-gray-900">{a.cap_rate}%</p>
                        <p className="text-[9px] text-gray-500">Cap rate</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" className="flex-1" onClick={() => handleLoadSaved(a)}>
                        ✏️ {t('analyzer.re_analyze', locale)}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDeleteAnalysis(a.id)}>
                        {t('common.delete', locale)}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PageContent>
    </PageShell>
  );
}
