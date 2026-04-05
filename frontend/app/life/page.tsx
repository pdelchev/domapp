'use client';

// Unified Life landing page — one HealthScore + sub-scores + deltas + history sparkline
// + active interventions + quick-add intervention form.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import NavBar from '../components/NavBar';
import {
  PageShell, PageContent, PageHeader, Card, Button,
  Input, Select, Textarea, Badge, EmptyState, Spinner, Alert,
} from '../components/ui';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import {
  getLifeSummary, createIntervention, deleteIntervention,
  getVitalsDashboard, getCardiometabolicAge, getBPPerKgSlope,
  getStageRegressionForecast,
} from '../lib/api';
import { RitualModal } from '../components/RitualModal';

type Snapshot = {
  id: number;
  date: string;
  composite_score: number | null;
  blood_score: number | null;
  bp_score: number | null;
  recovery_score: number | null;
  lifestyle_score: number | null;
  confidence: number;
  inputs: Record<string, unknown>;
};

type Intervention = {
  id: number;
  name: string;
  category: string;
  dose: string;
  started_on: string;
  ended_on: string | null;
  hypothesis: string;
  target_metrics: string[];
  evidence_grade: string;
  source_url: string;
  notes: string;
  is_active: boolean;
};

type PhenoAge = {
  phenoage: number | null;
  chronological_age: number | null;
  age_accel: number | null;
  mortality_score: number | null;
  report_id: number | null;
  test_date: string | null;
  inputs_used: Record<string, number>;
  missing_markers: string[];
  note: string | null;
};

type Briefing = {
  date: string;
  headline: string;
  advice: string[];
  metrics: {
    recovery: number | null;
    bp_sys_avg: number | null;
    bp_dia_avg: number | null;
    bp_reading_count_7d: number;
    active_interventions: number;
  };
};

type LifeSummary = {
  profile: { id: number; full_name: string; sex: string; is_primary: boolean };
  today: Snapshot & { snapshot_id: number | null };
  deltas: Record<string, { prior_date: string; composite_score: number | null; blood_score: number | null; bp_score: number | null; recovery_score: number | null } | null>;
  history: Snapshot[];
  active_interventions: Intervention[];
  phenoage: PhenoAge;
  briefing: Briefing;
};

// Vitals section types
interface VitalsDash {
  latest_weight: { weight_kg: string; bmi: number | null; waist_hip_ratio: number | null; measured_at: string } | null;
  latest_bp_session: { measured_at: string; avg_systolic: number; avg_diastolic: number; stage: string } | null;
}
interface CMAge { chronological_age: number; cardiometabolic_age: number; delta_years: number; signals_present: number; confidence: number; }
interface Slope { status: string; slope_mmhg_per_kg?: number; r_squared?: number; paired_days?: number; need?: number; }
interface Forecast { status: string; kg_to_lose?: number; target_systolic?: number; eta_date?: string; weeks?: number; }

const STAGE_COLORS: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  normal: 'green', elevated: 'yellow', stage_1: 'yellow', stage_2: 'red', crisis: 'red',
};

const CATEGORIES = ['supplement', 'medication', 'diet', 'exercise', 'sleep', 'habit', 'other'];
const EVIDENCE_GRADES = [
  { value: 'A', label: 'A — Strong' },
  { value: 'B', label: 'B — Moderate' },
  { value: 'C', label: 'C — Preliminary' },
  { value: 'anecdote', label: 'Anecdote' },
];

function scoreColor(score: number | null) {
  if (score == null) return 'text-gray-400';
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBg(score: number | null) {
  if (score == null) return 'bg-gray-100';
  if (score >= 80) return 'bg-green-50';
  if (score >= 60) return 'bg-amber-50';
  return 'bg-red-50';
}

function DeltaArrow({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-400 text-xs">—</span>;
  if (value === 0) return <span className="text-gray-500 text-xs">±0</span>;
  const up = value > 0;
  return (
    <span className={`text-xs font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(value)}
    </span>
  );
}

// Tiny inline sparkline for composite history
function Sparkline({ values, width = 220, height = 40 }: { values: (number | null)[]; width?: number; height?: number }) {
  const clean = values.filter((v): v is number => v != null);
  if (clean.length < 2) {
    return <div className="text-xs text-gray-400">Not enough history yet</div>;
  }
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = Math.max(max - min, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => {
    if (v == null) return null;
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).filter(Boolean).join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} className="text-indigo-500" />
    </svg>
  );
}

function SubScoreCard({
  label, score, delta7, delta30, href, hint,
}: { label: string; score: number | null; delta7: number | null; delta30: number | null; href?: string; hint?: string }) {
  const body = (
    <Card>
      <div className="flex items-start justify-between mb-0.5">
        <div className="text-[13px] font-medium text-gray-700">{label}</div>
        {href && <span className="text-xs text-gray-400">→</span>}
      </div>
      {hint && <div className="text-[10px] text-gray-400 mb-2 leading-snug">{hint}</div>}
      <div className={`text-4xl font-bold ${scoreColor(score)}`}>
        {score != null ? score : '—'}
      </div>
      <div className="flex gap-4 mt-2 text-xs text-gray-500">
        <div>7d <DeltaArrow value={delta7} /></div>
        <div>30d <DeltaArrow value={delta30} /></div>
      </div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function LifePage() {
  const { locale } = useLanguage();
  const [data, setData] = useState<LifeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', category: 'supplement', dose: '',
    started_on: new Date().toISOString().slice(0, 10),
    hypothesis: '', evidence_grade: 'B', source_url: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [vitals, setVitals] = useState<VitalsDash | null>(null);
  const [cmAge, setCmAge] = useState<CMAge | null>(null);
  const [slope, setSlope] = useState<Slope | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [ritualOpen, setRitualOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getLifeSummary();
      setData(res);
      setError('');
      // §VITALS: fire 4 vitals requests in parallel once we know the profile
      const pid = res?.profile?.id;
      if (pid) {
        Promise.all([
          getVitalsDashboard(pid).catch(() => null),
          getCardiometabolicAge(pid).catch(() => null),
          getBPPerKgSlope(pid).catch(() => null),
          getStageRegressionForecast(pid).catch(() => null),
        ]).then(([d, a, s, f]) => {
          setVitals(d); setCmAge(a); setSlope(s); setForecast(f);
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await createIntervention({
        ...form,
        target_metrics: [],
      });
      setShowForm(false);
      setForm({
        name: '', category: 'supplement', dose: '',
        started_on: new Date().toISOString().slice(0, 10),
        hypothesis: '', evidence_grade: 'B', source_url: '', notes: '',
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleEnd = async (id: number) => {
    if (!confirm('Mark this intervention as ended today?')) return;
    try {
      // PATCH with ended_on=today is handled by updateIntervention; inline here
      const res = await fetch(`/api/health/interventions/${id}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({ ended_on: new Date().toISOString().slice(0, 10) }),
      });
      if (!res.ok) throw new Error('Failed to end intervention');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this intervention? This cannot be undone.')) return;
    try {
      await deleteIntervention(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  if (loading) {
    return (
      <PageShell>
        <NavBar />
        <PageContent size="lg">
          <Spinner message={t('common.loading', locale)} />
        </PageContent>
      </PageShell>
    );
  }

  const today = data?.today;
  const d7 = data?.deltas?.['7'] ?? data?.deltas?.[7 as unknown as string];
  const d30 = data?.deltas?.['30'] ?? data?.deltas?.[30 as unknown as string];
  const historyComposite = (data?.history ?? []).map((s) => s.composite_score);

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('life.title', locale)}
          action={
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => setRitualOpen(true)} disabled={!data?.profile?.id}>
                + {t('vitals.log_ritual', locale)}
              </Button>
              <Link href="/life/lab-order">
                <Button variant="secondary">
                  📋 {t('life.lab_order', locale)}
                </Button>
              </Link>
              <Button variant="secondary" onClick={() => setShowForm((v) => !v)}>
                {showForm ? t('common.cancel', locale) : `+ ${t('life.add_intervention', locale)}`}
              </Button>
            </div>
          }
        />

        {error && <Alert type="error" message={error} />}

        {/* MORNING BRIEFING */}
        {data?.briefing && (
          <Card>
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-[13px] font-medium text-gray-700">
                {t('life.briefing', locale)} · {data.briefing.date}
              </div>
              <div className="text-xs text-gray-500">{data.briefing.headline}</div>
            </div>
            {data.briefing.advice.length === 0 ? (
              <div className="text-sm text-gray-500">{t('life.briefing_empty', locale)}</div>
            ) : (
              <ul className="space-y-1.5">
                {data.briefing.advice.map((line, i) => (
                  <li key={i} className="text-sm text-gray-800 flex gap-2">
                    <span className="text-indigo-500 flex-shrink-0">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* HERO: composite score + sparkline */}
        <Card>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="text-[13px] font-medium text-gray-700">
                {t('life.health_score', locale)} · {data?.profile.full_name}
              </div>
              <div className="text-[11px] text-gray-400 mb-1">{t('life.health_score_hint', locale)}</div>
              <div className={`text-7xl font-bold ${scoreColor(today?.composite_score ?? null)}`}>
                {today?.composite_score ?? '—'}
              </div>
              <div className="flex gap-4 mt-2 text-sm text-gray-600">
                <div>7d <DeltaArrow value={d7?.composite_score ?? null} /></div>
                <div>30d <DeltaArrow value={d30?.composite_score ?? null} /></div>
                <div className="text-xs text-gray-400">
                  {t('life.confidence', locale)}: {Math.round((today?.confidence ?? 0) * 100)}%
                </div>
              </div>
            </div>
            <div className={`flex-1 md:max-w-sm ${scoreBg(today?.composite_score ?? null)} rounded-lg p-4`}>
              <div className="text-[13px] font-medium text-gray-700 mb-2">{t('life.trend_30d', locale)}</div>
              <Sparkline values={historyComposite} width={320} height={56} />
            </div>
          </div>
        </Card>

        {/* Sub-scores grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <SubScoreCard
            label={t('life.sub.blood', locale)}
            hint={t('life.sub.blood_hint', locale)}
            score={today?.blood_score ?? null}
            delta7={d7?.blood_score ?? null}
            delta30={d30?.blood_score ?? null}
            href="/health"
          />
          <SubScoreCard
            label={t('life.sub.bp', locale)}
            hint={t('life.sub.bp_hint', locale)}
            score={today?.bp_score ?? null}
            delta7={d7?.bp_score ?? null}
            delta30={d30?.bp_score ?? null}
            href="/health/bp"
          />
          <SubScoreCard
            label={t('life.sub.recovery', locale)}
            hint={t('life.sub.recovery_hint', locale)}
            score={today?.recovery_score ?? null}
            delta7={d7?.recovery_score ?? null}
            delta30={d30?.recovery_score ?? null}
            href="/health/recovery"
          />
          <SubScoreCard
            label={t('life.sub.lifestyle', locale)}
            hint={t('life.sub.lifestyle_hint', locale)}
            score={today?.lifestyle_score ?? null}
            delta7={null}
            delta30={null}
            href="/health/lifestyle"
          />
        </div>

        {/* ═══ BIOLOGICAL AGE ═══ */}
        {(data?.phenoage || cmAge) && (
          <>
            <div className="mt-6 mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              {t('life.bio_age_section', locale)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* PhenoAge — blood-based */}
              {data?.phenoage && (
                <Card>
                  <div className="flex items-baseline justify-between mb-3">
                    <div>
                      <div className="text-[13px] font-medium text-gray-700">
                        {t('life.phenoage', locale)}
                      </div>
                      <div className="text-[11px] text-gray-400">Levine 2018 · 9 blood markers</div>
                    </div>
                    {data.phenoage.test_date && (
                      <div className="text-xs text-gray-500">{data.phenoage.test_date}</div>
                    )}
                  </div>
                  {data.phenoage.phenoage != null ? (
                    <div className="flex items-end gap-5">
                      <div>
                        <div className="text-[11px] text-gray-500">{t('life.bio_age', locale)}</div>
                        <div className="text-5xl font-bold text-indigo-600">{data.phenoage.phenoage}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-gray-500">{t('life.chron_age', locale)}</div>
                        <div className="text-3xl font-medium text-gray-700">{data.phenoage.chronological_age}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-gray-500">Δ</div>
                        <div className={`text-3xl font-medium ${(data.phenoage.age_accel ?? 0) < 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {(data.phenoage.age_accel ?? 0) >= 0 ? '+' : ''}{data.phenoage.age_accel}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">{data.phenoage.note}</div>
                  )}
                </Card>
              )}

              {/* Cardiometabolic Age — BP + body comp */}
              {cmAge && cmAge.signals_present > 0 && (
                <Card>
                  <div className="flex items-baseline justify-between mb-3">
                    <div>
                      <div className="text-[13px] font-medium text-gray-700">
                        {t('vitals.cm_age_title', locale)}
                      </div>
                      <div className="text-[11px] text-gray-400">BP + body comp · {cmAge.signals_present}/4 signals</div>
                    </div>
                  </div>
                  <div className="flex items-end gap-5">
                    <div>
                      <div className="text-[11px] text-gray-500">{t('life.bio_age', locale)}</div>
                      <div className="text-5xl font-bold text-indigo-600">{cmAge.cardiometabolic_age}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">{t('life.chron_age', locale)}</div>
                      <div className="text-3xl font-medium text-gray-700">{cmAge.chronological_age}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">Δ</div>
                      <div className={`text-3xl font-medium ${cmAge.delta_years <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {cmAge.delta_years >= 0 ? '+' : ''}{cmAge.delta_years}
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </>
        )}

        {/* ═══ VITALS SNAPSHOT ═══ */}
        {(vitals || slope) && (
          <>
            <div className="mt-6 mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              {t('life.vitals_section', locale)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide">
                  {t('nav.weight', locale)}
                </div>
                <div className="text-[10px] text-gray-400 mb-2 leading-snug">{t('life.weight_hint', locale)}</div>
                {vitals?.latest_weight ? (
                  <>
                    <div className="text-3xl font-semibold text-gray-900">
                      {Number(vitals.latest_weight.weight_kg).toFixed(1)}
                      <span className="text-lg text-gray-500 ml-1">kg</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(vitals.latest_weight.measured_at).toLocaleDateString()}
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {vitals.latest_weight.bmi && <Badge color="indigo">BMI {vitals.latest_weight.bmi}</Badge>}
                      {vitals.latest_weight.waist_hip_ratio && <Badge color="blue">WHR {vitals.latest_weight.waist_hip_ratio}</Badge>}
                    </div>
                  </>
                ) : <div className="text-sm text-gray-500 py-4">{t('weight.no_readings', locale)}</div>}
              </Card>

              <Card>
                <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide">
                  {t('nav.bp', locale)}
                </div>
                <div className="text-[10px] text-gray-400 mb-2 leading-snug">{t('life.bp_hint', locale)}</div>
                {vitals?.latest_bp_session ? (
                  <>
                    <div className="text-3xl font-semibold text-gray-900">
                      {Math.round(vitals.latest_bp_session.avg_systolic)}/{Math.round(vitals.latest_bp_session.avg_diastolic)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(vitals.latest_bp_session.measured_at).toLocaleDateString()}
                    </div>
                    <Badge color={STAGE_COLORS[vitals.latest_bp_session.stage] || 'gray'}>
                      {vitals.latest_bp_session.stage.replace('_', ' ')}
                    </Badge>
                  </>
                ) : <div className="text-sm text-gray-500 py-4">{t('vitals.no_bp', locale)}</div>}
              </Card>

              <Card>
                <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide">
                  {t('vitals.bp_per_kg', locale)}
                </div>
                <div className="text-[10px] text-gray-400 mb-2 leading-snug">{t('life.slope_hint', locale)}</div>
                {slope?.status === 'ok' ? (
                  <>
                    <div className="text-3xl font-semibold text-gray-900">
                      {slope.slope_mmhg_per_kg! > 0 ? '+' : ''}{slope.slope_mmhg_per_kg}
                      <span className="text-sm text-gray-500 ml-1">mmHg/kg</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      R² {slope.r_squared} • {slope.paired_days}d {t('vitals.paired', locale)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-gray-600">
                      {slope?.paired_days || 0} / {slope?.need || 20} {t('vitals.paired_days_needed', locale)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {t('vitals.log_weight_bp', locale)}
                    </div>
                  </>
                )}
              </Card>
            </div>

            {forecast?.status === 'ok' && (
              <Card>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide">
                      {t('vitals.forecast_title', locale)}
                    </div>
                    <div className="text-[10px] text-gray-400 mb-2 leading-snug">{t('life.forecast_hint', locale)}</div>
                    <div className="text-lg text-gray-900">
                      {t('vitals.forecast_lose', locale).replace('{kg}', String(forecast.kg_to_lose))}
                      {' → '}
                      <span className="font-medium">{forecast.target_systolic} mmHg</span>
                    </div>
                    {forecast.eta_date && (
                      <div className="text-sm text-gray-600 mt-1">
                        ETA: {new Date(forecast.eta_date).toLocaleDateString()} ({forecast.weeks} wks)
                      </div>
                    )}
                  </div>
                  <Badge color="indigo">{t('vitals.projection', locale)}</Badge>
                </div>
              </Card>
            )}
          </>
        )}

        {/* Add intervention form */}
        {showForm && (
          <Card>
            <div className="text-[13px] font-medium text-gray-700 mb-3">
              {t('life.add_intervention', locale)}
            </div>
            <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t('life.field.name', locale)}
                required
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Magnesium glycinate 400mg"
              />
              <Select
                label={t('life.field.category', locale)}
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
              <Input
                label={t('life.field.dose', locale)}
                value={form.dose}
                onChange={(e) => setForm((p) => ({ ...p, dose: e.target.value }))}
                placeholder="400 mg/day"
              />
              <Input
                label={t('life.field.started_on', locale)}
                type="date"
                required
                value={form.started_on}
                onChange={(e) => setForm((p) => ({ ...p, started_on: e.target.value }))}
              />
              <Select
                label={t('life.field.evidence', locale)}
                value={form.evidence_grade}
                onChange={(e) => setForm((p) => ({ ...p, evidence_grade: e.target.value }))}
              >
                {EVIDENCE_GRADES.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </Select>
              <Input
                label={t('life.field.source_url', locale)}
                type="url"
                value={form.source_url}
                onChange={(e) => setForm((p) => ({ ...p, source_url: e.target.value }))}
                placeholder="https://pubmed.ncbi.nlm.nih.gov/..."
              />
              <div className="md:col-span-2">
                <Textarea
                  label={t('life.field.hypothesis', locale)}
                  value={form.hypothesis}
                  onChange={(e) => setForm((p) => ({ ...p, hypothesis: e.target.value }))}
                  rows={2}
                  placeholder="Lower morning systolic, improve HRV"
                />
              </div>
              <div className="md:col-span-2">
                <Textarea
                  label={t('life.field.notes', locale)}
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="md:col-span-2 flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                  {t('common.cancel', locale)}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? t('common.loading', locale) : t('common.save', locale)}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* ═══ INTERVENTIONS ═══ */}
        <div className="mt-6 mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {t('life.interventions_section', locale)}
        </div>
        <Card>
          <div className="text-[13px] font-medium text-gray-700">
            {t('life.active_interventions', locale)}
          </div>
          <div className="text-[10px] text-gray-400 mb-3 leading-snug">{t('life.interventions_hint', locale)}</div>
          {(data?.active_interventions ?? []).length === 0 ? (
            <EmptyState
              icon="🧪"
              message={t('life.no_interventions', locale)}
            />
          ) : (
            <div className="space-y-2">
              {data!.active_interventions.map((iv) => (
                <div key={iv.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{iv.name}</span>
                      <Badge color="indigo">{iv.category}</Badge>
                      <Badge color={iv.evidence_grade === 'A' ? 'green' : iv.evidence_grade === 'B' ? 'blue' : iv.evidence_grade === 'C' ? 'yellow' : 'gray'}>
                        {iv.evidence_grade}
                      </Badge>
                    </div>
                    {iv.dose && <div className="text-xs text-gray-600 mt-0.5">{iv.dose}</div>}
                    {iv.hypothesis && <div className="text-xs text-gray-500 italic mt-0.5">&ldquo;{iv.hypothesis}&rdquo;</div>}
                    <div className="text-xs text-gray-400 mt-0.5">
                      {t('life.since', locale)} {iv.started_on}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleEnd(iv.id)}>
                      {t('life.end', locale)}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(iv.id)}>
                      ×
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {ritualOpen && data?.profile?.id && (
          <RitualModal
            profileId={data.profile.id}
            locale={locale}
            onClose={() => setRitualOpen(false)}
            onDone={() => { setRitualOpen(false); load(); }}
          />
        )}
      </PageContent>
    </PageShell>
  );
}
