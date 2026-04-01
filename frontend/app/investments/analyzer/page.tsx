'use client';

/**
 * Property Deal Analyzer — evaluate any property investment.
 *
 * AI-NAV: Form → POST /api/analyze-property/ → results with verdict.
 * AI-NAV: Market data loaded from /api/market-data/ for cascading dropdowns.
 * AI-NAV: Saved analyses from /api/property-analyses/ shown in history.
 * AI-NAV: Score breakdown with visual bar charts.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getMarketData, analyzeProperty, getPropertyAnalyses, deletePropertyAnalysis } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Select, Badge, Alert, Spinner, FormSection } from '../../components/ui';

interface MarketAreaRaw {
  country: string;
  city: string;
  area: string;
  high_value: boolean;
  avg_sqm: number;
  currency: string;
}

interface MarketDataResponse {
  countries: Record<string, { currency: string; eur_rate: number; tax_pct: number }>;
  cities: Record<string, string[]>;
  areas: MarketAreaRaw[];
}

// Transform flat areas list into lookup: "Country:City" → ["Area1", "Area2", ...]
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
  score_breakdown: Record<string, { score: number; max: number }>;
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
  verdict: string;
  verdict_score: number;
  price_per_sqm: number;
  gross_rental_yield: number;
  created_at: string;
}

const PROPERTY_TYPES = ['apartment', 'house', 'studio', 'penthouse', 'commercial', 'villa'];
const CONDITIONS = ['new_build', 'renovated', 'good', 'needs_work'];
const FURNISHINGS = ['unfurnished', 'semi', 'fully'];

const VERDICT_COLORS: Record<string, string> = {
  strong_buy: 'green',
  buy: 'blue',
  hold: 'yellow',
  overpriced: 'red',
  avoid: 'red',
};

const VERDICT_EMOJIS: Record<string, string> = {
  strong_buy: '🚀',
  buy: '✅',
  hold: '⚡',
  overpriced: '⚠️',
  avoid: '🛑',
};

function fmt(v: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
}

function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

// Score bar component
function ScoreBar({ label, score, max, locale }: { label: string; score: number; max: number; locale: 'en' | 'bg' }) {
  const pct = (score / max) * 100;
  const color = pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-900">{score}/{max}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function DealAnalyzerPage() {
  const router = useRouter();
  const { locale } = useLanguage();

  // Market data for cascading dropdowns
  const [marketData, setMarketData] = useState<MarketDataResponse | null>(null);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);

  // Form
  const [form, setForm] = useState({
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
    condition: 'good',
    furnishing: 'unfurnished',
    floor: '',
    total_floors: '',
    year_built: '',
  });

  // Sections
  const [openSections, setOpenSections] = useState({ basic: true, details: false, saved: false });
  const toggleSection = (key: keyof typeof openSections) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // Precomputed area lookup from market data
  const [areaLookup, setAreaLookup] = useState<Record<string, string[]>>({});

  // Load market data + saved analyses
  useEffect(() => {
    Promise.all([getMarketData(), getPropertyAnalyses()])
      .then(([md, sa]) => {
        setMarketData(md);
        setAreaLookup(buildAreaLookup(md.areas || []));
        setSavedAnalyses(sa);
      })
      .catch((err) => {
        console.error('Failed to load analyzer data:', err);
        setError('Failed to load market data. Please refresh.');
      })
      .finally(() => setLoading(false));
  }, []);

  // Cascading dropdown values
  const countries = marketData ? Object.keys(marketData.countries) : [];
  const cities = form.country && marketData?.cities ? (marketData.cities[form.country] || []) : [];
  const areas = form.country && form.city
    ? (areaLookup[`${form.country}:${form.city}`] || [])
    : [];

  const updateForm = (field: string, value: string | boolean) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Reset cascading dropdowns
      if (field === 'country') { next.city = ''; next.area = ''; }
      if (field === 'city') { next.area = ''; }
      return next;
    });
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setAnalyzing(true);
    setError('');
    setResult(null);
    try {
      const payload = {
        name: form.name || `${form.city} ${form.area}`,
        country: form.country,
        city: form.city,
        area: form.area,
        property_type: form.property_type,
        square_meters: Number(form.square_meters),
        asking_price: Number(form.asking_price),
        parking_included: form.parking_included,
        parking_price: form.parking_included ? 0 : Number(form.parking_price || 0),
        num_bedrooms: Number(form.num_bedrooms),
        condition: form.condition,
        furnishing: form.furnishing,
        floor: form.floor ? Number(form.floor) : null,
        total_floors: form.total_floors ? Number(form.total_floors) : null,
        year_built: form.year_built ? Number(form.year_built) : null,
      };
      const res = await analyzeProperty(payload);
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res);
        // Refresh saved analyses list
        const updated = await getPropertyAnalyses();
        setSavedAnalyses(updated);
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

  if (loading) return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('analyzer.title', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/investments')}
        />
        <p className="text-sm text-gray-500 -mt-4 mb-6">{t('analyzer.subtitle', locale)}</p>

        <Alert type="error" message={error} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: Form */}
          <div className="space-y-4">
            <form onSubmit={handleAnalyze}>
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
                  <Input label={t('analyzer.asking_price', locale)} type="number" value={form.asking_price} onChange={(e) => updateForm('asking_price', e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Select label={t('analyzer.property_type', locale)} value={form.property_type} onChange={(e) => updateForm('property_type', e.target.value)}>
                    {PROPERTY_TYPES.map((pt) => <option key={pt} value={pt}>{t(`analyzer.${pt}`, locale)}</option>)}
                  </Select>
                  <Input label={t('analyzer.bedrooms', locale)} type="number" value={form.num_bedrooms} onChange={(e) => updateForm('num_bedrooms', e.target.value)} min="0" max="10" />
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

              <Button type="submit" className="w-full mt-5" disabled={analyzing || !form.country || !form.city || !form.square_meters || !form.asking_price}>
                {analyzing ? t('analyzer.analyzing', locale) : t('analyzer.analyze', locale)}
              </Button>
            </form>
          </div>

          {/* RIGHT: Results */}
          <div>
            {result ? (
              <div className="space-y-4">
                {/* Verdict card */}
                <Card>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl">{VERDICT_EMOJIS[result.verdict] || '📊'}</span>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{t(`analyzer.${result.verdict}`, locale)}</h2>
                      <p className="text-sm text-gray-500">{t('analyzer.verdict', locale)} — {result.verdict_score}/100</p>
                    </div>
                    <Badge color={VERDICT_COLORS[result.verdict] as 'green' | 'blue' | 'yellow' | 'red'}>
                      {result.verdict_score}/100
                    </Badge>
                  </div>

                  {/* Overall score bar */}
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        result.verdict_score >= 80 ? 'bg-green-500' :
                        result.verdict_score >= 65 ? 'bg-blue-500' :
                        result.verdict_score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${result.verdict_score}%` }}
                    />
                  </div>

                  {/* Score breakdown */}
                  {result.score_breakdown && Object.entries(result.score_breakdown).map(([key, { score, max }]) => (
                    <ScoreBar key={key} label={t(`analyzer.${key === 'property_quality' ? 'property_quality' : key === 'area_heat' ? 'area_heat_score' : key === 'rental_yield' ? 'rental_yield_score' : key === 'airbnb_potential' ? 'airbnb_potential' : 'price_vs_market'}`, locale)} score={score} max={max} locale={locale} />
                  ))}
                </Card>

                {/* Price analysis */}
                <Card>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('analyzer.price_per_sqm', locale)}</h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-lg font-bold text-gray-900">{fmt(result.price_per_sqm)}</p>
                      <p className="text-xs text-gray-500">{t('analyzer.price_per_sqm', locale)}</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-500">{fmt(result.market_avg_sqm)}</p>
                      <p className="text-xs text-gray-500">{t('analyzer.market_avg', locale)}</p>
                    </div>
                    <div>
                      <p className={`text-lg font-bold ${result.price_vs_market_pct <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {fmtPct(result.price_vs_market_pct)}
                      </p>
                      <p className="text-xs text-gray-500">{t('analyzer.vs_market', locale)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{t('analyzer.total_cost', locale)}: {fmt(result.total_cost)}</p>
                </Card>

                {/* Rental analysis */}
                <Card>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('analyzer.standard_rent', locale)}</h3>
                  <div className="grid grid-cols-2 gap-3 text-center mb-4">
                    <div>
                      <p className="text-lg font-bold text-green-600">{fmt(result.estimated_monthly_rent)}/mo</p>
                      <p className="text-xs text-gray-500">{t('analyzer.monthly_rent', locale)}</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-green-600">{result.gross_rental_yield}%</p>
                      <p className="text-xs text-gray-500">{t('analyzer.gross_yield', locale)}</p>
                    </div>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('analyzer.airbnb_rent', locale)}</h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-base font-bold text-purple-600">{fmt(result.estimated_airbnb_daily)}/day</p>
                      <p className="text-xs text-gray-500">{t('analyzer.airbnb_daily', locale)}</p>
                    </div>
                    <div>
                      <p className="text-base font-bold text-purple-600">{fmt(result.estimated_airbnb_monthly)}/mo</p>
                      <p className="text-xs text-gray-500">{t('analyzer.airbnb_monthly', locale)}</p>
                    </div>
                    <div>
                      <p className="text-base font-bold text-purple-600">{result.airbnb_yield}%</p>
                      <p className="text-xs text-gray-500">{t('analyzer.airbnb_yield', locale)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{t('analyzer.occupancy', locale)}: {result.airbnb_occupancy_pct.toFixed(0)}%</p>
                </Card>

                {/* Investment metrics */}
                <Card>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('analyzer.investment_metrics', locale)}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-lg font-bold text-gray-900">{result.cap_rate}%</p>
                      <p className="text-xs text-gray-500">{t('analyzer.cap_rate', locale)}</p>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-lg font-bold text-gray-900">{Math.round(result.break_even_months / 12)}y {result.break_even_months % 12}m</p>
                      <p className="text-xs text-gray-500">{t('analyzer.break_even', locale)}</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-lg font-bold text-blue-700">{fmtPct(result.roi_5_year)}</p>
                      <p className="text-xs text-gray-500">{t('analyzer.roi_5y', locale)}</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-lg font-bold text-blue-700">{fmtPct(result.roi_10_year)}</p>
                      <p className="text-xs text-gray-500">{t('analyzer.roi_10y', locale)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-700">{fmt(result.projected_value_5y)}</p>
                      <p className="text-xs text-gray-500">{t('analyzer.projected_5y', locale)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-700">{fmt(result.projected_value_10y)}</p>
                      <p className="text-xs text-gray-500">{t('analyzer.projected_10y', locale)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{t('analyzer.appreciation', locale)}: {result.annual_appreciation_pct}%/yr</p>
                </Card>

                {/* Area heat */}
                <Card>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">{t('analyzer.area_heat', locale)}</h3>
                    {result.high_value_area && <Badge color="purple">{t('analyzer.high_value_area', locale)}</Badge>}
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${result.area_heat_score}%`,
                            background: `linear-gradient(90deg, #3b82f6, ${result.area_heat_score >= 70 ? '#ef4444' : '#f59e0b'})`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold text-gray-900">{result.area_heat_score}/100</span>
                    </div>
                  </div>
                </Card>
              </div>
            ) : (
              <Card className="text-center py-16">
                <span className="text-5xl block mb-4">🏠</span>
                <p className="text-gray-500 text-sm">{t('analyzer.subtitle', locale)}</p>
                <p className="text-gray-400 text-xs mt-2">Fill in the form and click "{t('analyzer.analyze', locale)}"</p>
              </Card>
            )}
          </div>
        </div>

        {/* Saved analyses */}
        <div className="mt-8">
          <FormSection
            title={`${t('analyzer.saved_analyses', locale)} (${savedAnalyses.length})`}
            icon="📋"
            open={openSections.saved}
            onToggle={() => toggleSection('saved')}
          >
            {savedAnalyses.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">{t('analyzer.no_analyses', locale)}</p>
            ) : (
              <div className="space-y-2">
                {savedAnalyses.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 border border-gray-100">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{a.name || `${a.city} ${a.area}`}</p>
                        <Badge color={VERDICT_COLORS[a.verdict] as 'green' | 'blue' | 'yellow' | 'red'}>
                          {t(`analyzer.${a.verdict}`, locale)} {a.verdict_score}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500">{a.city}, {a.country} — {a.square_meters}m² — {fmt(a.asking_price)} — {a.gross_rental_yield}% yield</p>
                    </div>
                    <Button variant="danger" size="sm" onClick={() => handleDeleteAnalysis(a.id)}>
                      {t('common.delete', locale)}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </FormSection>
        </div>
      </PageContent>
    </PageShell>
  );
}
