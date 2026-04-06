'use client';

// Unified Life landing page — one HealthScore + sub-scores + deltas + history sparkline
// + active interventions + blood test results + recommendations (merged from lifestyle).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import NavBar from '../components/NavBar';
import {
  PageShell, PageContent, PageHeader, Card, Button,
  Badge, EmptyState, Spinner, Alert,
} from '../components/ui';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import {
  getLifeSummary, deleteIntervention,
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
  frequency: string;
  reminder_times: string[];
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

const FREQ_LABELS: Record<string, string> = {
  daily: '1×/day', twice_daily: '2×/day', three_daily: '3×/day',
  weekly: 'Weekly', as_needed: 'PRN', one_time: 'Once',
};

// ── Blood test data (from latest results) ──
interface BloodResult {
  id: string; category: string;
  name: { en: string; bg: string }; code: string;
  refMin: number; refMax: number; unit: string;
  value: number; status: 'optimal' | 'borderline' | 'abnormal';
}

const BLOOD_RESULTS: BloodResult[] = [
  { id: 'glu', category: 'metabolic', name: { en: 'Glucose (fasting)', bg: 'Глюкоза (на гладно)' }, code: 'GLU', refMin: 3.9, refMax: 6.1, unit: 'mmol/L', value: 8.64, status: 'abnormal' },
  { id: 'alt', category: 'liver', name: { en: 'ALT (SGPT)', bg: 'АЛТ (СГПТ)' }, code: 'ALT', refMin: 0, refMax: 41, unit: 'U/L', value: 49.7, status: 'abnormal' },
  { id: 'ast', category: 'liver', name: { en: 'AST (SGOT)', bg: 'АСТ (СГОТ)' }, code: 'AST', refMin: 0, refMax: 40, unit: 'U/L', value: 32.8, status: 'borderline' },
  { id: 'ggt', category: 'liver', name: { en: 'GGT', bg: 'ГГТ' }, code: 'GGT', refMin: 0, refMax: 55, unit: 'U/L', value: 35, status: 'borderline' },
  { id: 'alp', category: 'liver', name: { en: 'Alkaline Phosphatase', bg: 'Алкална фосфатаза (АФ)' }, code: 'ALP', refMin: 40, refMax: 130, unit: 'U/L', value: 73, status: 'optimal' },
  { id: 'crea', category: 'kidney', name: { en: 'Creatinine', bg: 'Креатинин' }, code: 'CREA', refMin: 62, refMax: 106, unit: 'μmol/L', value: 95, status: 'optimal' },
  { id: 'urea', category: 'kidney', name: { en: 'Urea', bg: 'Урея' }, code: 'UREA', refMin: 2.5, refMax: 7.1, unit: 'mmol/L', value: 5.3, status: 'optimal' },
  { id: 'uric', category: 'kidney', name: { en: 'Uric Acid', bg: 'Пикочна киселина' }, code: 'URIC', refMin: 200, refMax: 430, unit: 'μmol/L', value: 481, status: 'abnormal' },
  { id: 'ca', category: 'electrolytes', name: { en: 'Calcium', bg: 'Калций' }, code: 'CA', refMin: 2.15, refMax: 2.55, unit: 'mmol/L', value: 2.43, status: 'optimal' },
  { id: 'p', category: 'electrolytes', name: { en: 'Phosphorus', bg: 'Фосфор' }, code: 'P', refMin: 0.81, refMax: 1.45, unit: 'mmol/L', value: 1.23, status: 'optimal' },
  { id: 'tp', category: 'protein', name: { en: 'Total Protein', bg: 'Общ белтък' }, code: 'TP', refMin: 60, refMax: 83, unit: 'g/L', value: 81.5, status: 'borderline' },
  { id: 'alb', category: 'protein', name: { en: 'Albumin', bg: 'Албумин' }, code: 'ALB', refMin: 35, refMax: 55, unit: 'g/L', value: 44.6, status: 'optimal' },
  { id: 'psa', category: 'tumor', name: { en: 'Total PSA', bg: 'Общ ПСА' }, code: 'PSA', refMin: 0, refMax: 4, unit: 'ng/mL', value: 0.73, status: 'optimal' },
  { id: 'cea', category: 'tumor', name: { en: 'CEA', bg: 'Карциноембрионален антиген' }, code: 'CEA', refMin: 0, refMax: 3.8, unit: 'ng/mL', value: 0.22, status: 'optimal' },
  { id: 'ca199', category: 'tumor', name: { en: 'CA 19-9', bg: 'CA 19-9' }, code: 'CA199', refMin: 0, refMax: 34, unit: 'U/mL', value: 8.38, status: 'optimal' },
];

interface Recommendation {
  icon: string; priority: 'high' | 'medium' | 'low';
  title: { en: string; bg: string }; description: { en: string; bg: string };
  linkedResults: string[];
}

const RECOMMENDATIONS: Recommendation[] = [
  { icon: '🏥', priority: 'high', title: { en: 'Metabolic Syndrome Pattern Detected', bg: 'Открит модел на метаболитен синдром' }, description: { en: 'Elevated glucose combined with liver enzyme changes suggests metabolic syndrome risk. Focus: 1) Cut refined carbs & sugar, 2) Exercise 30+ min daily, 3) Reduce belly fat, 4) Mediterranean diet.', bg: 'Комбинацията от повишена глюкоза и промени в чернодробните ензими предполага риск от метаболитен синдром. Фокус: 1) Намалете рафинираните въглехидрати и захарта, 2) Упражнения 30+ мин дневно, 3) Свалете коремните мазнини, 4) Средиземноморска диета.' }, linkedResults: ['glu', 'alt', 'ast'] },
  { icon: '🫁', priority: 'high', title: { en: 'Elevated Liver Enzymes', bg: 'Множество повишени чернодробни ензими' }, description: { en: 'Two or more elevated liver enzymes suggest liver stress. Actions: eliminate alcohol for 30 days, reduce sugar, exercise daily, drink coffee (protective).', bg: 'Два или повече повишени чернодробни ензима предполагат чернодробно натоварване. Действия: елиминирайте алкохола за 30 дни, намалете захарта, упражнения ежедневно, пийте кафе (защитно).' }, linkedResults: ['alt', 'ast', 'ggt'] },
  { icon: '⚡', priority: 'high', title: { en: 'Fasting Glucose Significantly Elevated', bg: 'Значително повишена кръвна захар на гладно' }, description: { en: 'Fasting glucose of 8.64 mmol/L is well above reference (3.9-6.1). This indicates pre-diabetic or diabetic range. Urgent: consult endocrinologist, HbA1c test needed, strict carb management.', bg: 'Глюкоза на гладно 8.64 mmol/L е значително над нормата (3.9-6.1). Това показва пре-диабетен или диабетен диапазон. Спешно: консултация с ендокринолог, необходим HbA1c тест, строг контрол на въглехидратите.' }, linkedResults: ['glu'] },
  { icon: '🫘', priority: 'medium', title: { en: 'Uric Acid Above Normal', bg: 'Пикочна киселина над нормата' }, description: { en: 'Risk of gout, kidney stones. Linked to metabolic syndrome. Reduce purine-rich foods: organ meats, sardines, beer. Drink plenty of water. Limit fructose & alcohol. Cherry extract may help.', bg: 'Риск от подагра, бъбречни камъни. Свързано с метаболитен синдром. Намалете храни богати на пурини: карантии, сардини, бира. Пийте много вода. Ограничете фруктозата и алкохола. Екстракт от череши може да помогне.' }, linkedResults: ['uric', 'glu'] },
  { icon: '🧬', priority: 'low', title: { en: 'Total Protein: Upper Borderline', bg: 'Общ белтък: горна граница' }, description: { en: 'Most common cause is dehydration. Ensure adequate hydration (2.5-3L water/day). Distribute protein evenly across meals (1.2-1.6g/kg body weight).', bg: 'Най-честа причина е дехидратация. Осигурете адекватна хидратация (2.5-3L вода/ден). Разпределете протеина равномерно в храненията (1.2-1.6г/кг телесно тегло).' }, linkedResults: ['tp'] },
  { icon: '❤️', priority: 'high', title: { en: 'Blood Pressure Monitoring Recommended', bg: 'Препоръчва се проследяване на кръвното налягане' }, description: { en: 'Elevated glucose + liver enzyme changes indicate cardiovascular risk. Regular BP monitoring is critical. Track your blood pressure alongside blood results for integrated cardiovascular risk assessment.', bg: 'Повишена глюкоза + промени в чернодробните ензими показват сърдечно-съдов риск. Редовното мониториране на кръвното налягане е критично. Проследявайте кръвното налягане заедно с кръвните резултати.' }, linkedResults: ['glu', 'alt'] },
];

const CATEGORY_LABELS: Record<string, { en: string; bg: string; icon: string }> = {
  metabolic: { en: 'Metabolic Panel', bg: 'Метаболитен панел', icon: '⚡' },
  liver: { en: 'Liver Function', bg: 'Чернодробна функция', icon: '🫁' },
  kidney: { en: 'Kidney Function', bg: 'Бъбречна функция', icon: '🫘' },
  electrolytes: { en: 'Electrolytes', bg: 'Електролити', icon: '⚡' },
  protein: { en: 'Protein Panel', bg: 'Протеинов панел', icon: '🧬' },
  tumor: { en: 'Tumor Markers', bg: 'Туморни маркери', icon: '🔬' },
};

const STATUS_COLORS: Record<string, 'green' | 'yellow' | 'red'> = { optimal: 'green', borderline: 'yellow', abnormal: 'red' };
const PRIORITY_COLORS: Record<string, 'red' | 'yellow' | 'blue'> = { high: 'red', medium: 'yellow', low: 'blue' };

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

function Sparkline({ values, width = 220, height = 40 }: { values: (number | null)[]; width?: number; height?: number }) {
  const clean = values.filter((v): v is number => v != null);
  if (clean.length < 2) return <div className="text-xs text-gray-400">Not enough history yet</div>;
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
  const [vitals, setVitals] = useState<VitalsDash | null>(null);
  const [cmAge, setCmAge] = useState<CMAge | null>(null);
  const [slope, setSlope] = useState<Slope | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [ritualOpen, setRitualOpen] = useState(false);
  const [bloodOpen, setBloodOpen] = useState(false);
  const [recsOpen, setRecsOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getLifeSummary();
      setData(res);
      setError('');
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

  const handleEnd = async (id: number) => {
    if (!confirm(locale === 'bg' ? 'Маркирай тази интервенция като приключена днес?' : 'Mark this intervention as ended today?')) return;
    try {
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
    if (!confirm(locale === 'bg' ? 'Изтрий тази интервенция?' : 'Delete this intervention? This cannot be undone.')) return;
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
  const bloodCategories = [...new Set(BLOOD_RESULTS.map((r) => r.category))];

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
                  {locale === 'bg' ? 'Тестове' : 'Lab Order'}
                </Button>
              </Link>
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
          />
        </div>

        {/* ═══ QUICK TOOLS ═══ */}
        <div className="mt-6 mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {locale === 'bg' ? 'Бързи инструменти' : 'Quick Tools'}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Link href="/health/recovery" className="block group">
            <Card className="hover:shadow-md transition-shadow h-full">
              <div className="flex items-center gap-3">
                <span className="text-3xl">&#x1F49A;</span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{locale === 'bg' ? 'WHOOP' : 'WHOOP Recovery'}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{locale === 'bg' ? 'Стрейн, пулс' : 'Strain, HR & recovery'}</p>
                </div>
              </div>
            </Card>
          </Link>
          <Link href="/health/bp" className="block group">
            <Card className="hover:shadow-md transition-shadow h-full">
              <div className="flex items-center gap-3">
                <span className="text-3xl">&#x2764;&#xFE0F;</span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{locale === 'bg' ? 'Кръвно налягане' : 'Blood Pressure'}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{locale === 'bg' ? 'КН и сърдечен риск' : 'Track BP & CV risk'}</p>
                </div>
              </div>
            </Card>
          </Link>
          <Link href="/life/lab-order" className="block group">
            <Card className="hover:shadow-md transition-shadow h-full">
              <div className="flex items-center gap-3">
                <span className="text-3xl">&#x1F9EA;</span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{locale === 'bg' ? 'Тестове' : 'Follow-up Tests'}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{locale === 'bg' ? 'След 3 месеца' : 'Repeat in 3 months'}</p>
                </div>
              </div>
            </Card>
          </Link>
          <Link href="/health/lifestyle/meals" className="block group">
            <Card className="hover:shadow-md transition-shadow h-full">
              <div className="flex items-center gap-3">
                <span className="text-3xl">&#x1F957;</span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{locale === 'bg' ? 'Меню' : 'Meal Plan'}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{locale === 'bg' ? 'Ротиращо меню' : 'Daily rotating menu'}</p>
                </div>
              </div>
            </Card>
          </Link>
          <Link href="/health/lifestyle/gym" className="block group">
            <Card className="hover:shadow-md transition-shadow h-full">
              <div className="flex items-center gap-3">
                <span className="text-3xl">&#x1F3CB;&#xFE0F;</span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{locale === 'bg' ? 'Фитнес' : 'Gym & Sports'}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{locale === 'bg' ? 'Тренировки' : 'Training & recovery'}</p>
                </div>
              </div>
            </Card>
          </Link>
        </div>

        {/* ═══ BIOLOGICAL AGE ═══ */}
        {(data?.phenoage || cmAge) && (
          <>
            <div className="mt-6 mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              {t('life.bio_age_section', locale)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data?.phenoage && (
                <Card>
                  <div className="flex items-baseline justify-between mb-3">
                    <div>
                      <div className="text-[13px] font-medium text-gray-700">{t('life.phenoage', locale)}</div>
                      <div className="text-[11px] text-gray-400">Levine 2018 · 9 blood markers</div>
                    </div>
                    {data.phenoage.test_date && <div className="text-xs text-gray-500">{data.phenoage.test_date}</div>}
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
              {cmAge && cmAge.signals_present > 0 && (
                <Card>
                  <div className="flex items-baseline justify-between mb-3">
                    <div>
                      <div className="text-[13px] font-medium text-gray-700">{t('vitals.cm_age_title', locale)}</div>
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
                <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide">{t('nav.weight', locale)}</div>
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
                <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide">{t('nav.bp', locale)}</div>
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
                <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide">{t('vitals.bp_per_kg', locale)}</div>
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
                    <div className="text-xs text-gray-500 mt-1">{t('vitals.log_weight_bp', locale)}</div>
                  </>
                )}
              </Card>
            </div>

            {forecast?.status === 'ok' && (
              <Card>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide">{t('vitals.forecast_title', locale)}</div>
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

        {/* ═══ INTERVENTIONS (meds & supplements) ═══ */}
        <div className="mt-6 mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {locale === 'bg' ? 'Лекарства и добавки' : 'Medications & Supplements'}
        </div>
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[13px] font-medium text-gray-700">
                {t('life.active_interventions', locale)}
              </div>
              <div className="text-[10px] text-gray-400 leading-snug">
                {locale === 'bg'
                  ? 'Управлявайте вашите добавки и лекарства. Добавете нови през ритуала.'
                  : 'Manage your supplements & meds. Add new ones via the morning ritual.'}
              </div>
            </div>
          </div>
          {(data?.active_interventions ?? []).length === 0 ? (
            <EmptyState
              icon="💊"
              message={locale === 'bg'
                ? 'Няма активни добавки. Добавете нови чрез ритуала.'
                : 'No active supplements or meds. Add via the ritual.'}
            />
          ) : (
            <div className="space-y-2">
              {data!.active_interventions.map((iv) => (
                <div key={iv.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{iv.name}</span>
                      <Badge color="indigo">{iv.category}</Badge>
                      {iv.frequency && iv.frequency !== 'daily' && (
                        <Badge color="blue">{FREQ_LABELS[iv.frequency] || iv.frequency}</Badge>
                      )}
                      <Badge color={iv.evidence_grade === 'A' ? 'green' : iv.evidence_grade === 'B' ? 'blue' : iv.evidence_grade === 'C' ? 'yellow' : 'gray'}>
                        {iv.evidence_grade}
                      </Badge>
                    </div>
                    {iv.dose && <div className="text-xs text-gray-600 mt-0.5">{iv.dose}</div>}
                    {iv.reminder_times && iv.reminder_times.length > 0 && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {locale === 'bg' ? 'Напомняне:' : 'Remind:'} {iv.reminder_times.join(', ')}
                      </div>
                    )}
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

        {/* ═══ BLOOD TEST RESULTS (from lifestyle) ═══ */}
        <div className="mt-6 mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {locale === 'bg' ? 'Кръвни резултати' : 'Blood Test Results'}
        </div>
        <Card>
          <button
            type="button"
            onClick={() => setBloodOpen(!bloodOpen)}
            className="w-full flex items-center justify-between"
          >
            <div>
              <div className="text-[13px] font-medium text-gray-700">
                {locale === 'bg' ? 'Последни резултати' : 'Latest Results'}
              </div>
              <div className="text-[10px] text-gray-400">
                {locale === 'bg'
                  ? 'Преглед на кръвните тестове по системи'
                  : 'Blood test overview by body system'}
              </div>
            </div>
            <span className={`text-gray-400 transition-transform ${bloodOpen ? 'rotate-180' : ''}`}>▼</span>
          </button>
          {bloodOpen && (
            <div className="mt-4 space-y-4">
              {bloodCategories.map(cat => {
                const catLabel = CATEGORY_LABELS[cat];
                const results = BLOOD_RESULTS.filter(r => r.category === cat);
                return (
                  <div key={cat}>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <span>{catLabel?.icon}</span> {catLabel?.[locale] || cat}
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 text-left">
                            <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">{locale === 'bg' ? 'Тест' : 'Test'}</th>
                            <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase text-right hidden sm:table-cell">{locale === 'bg' ? 'Референция' : 'Reference'}</th>
                            <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase text-right">{locale === 'bg' ? 'Резултат' : 'Result'}</th>
                            <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase text-center">{locale === 'bg' ? 'Статус' : 'Status'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {results.map(r => (
                            <tr key={r.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <span className="text-sm font-medium text-gray-900">{r.name[locale]}</span>
                                <span className="text-xs text-gray-400 ml-1.5">{r.code}</span>
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-500 text-right hidden sm:table-cell">
                                {r.refMin}–{r.refMax} {r.unit}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={`text-sm font-semibold ${r.status === 'abnormal' ? 'text-red-600' : r.status === 'borderline' ? 'text-yellow-600' : 'text-gray-900'}`}>
                                  {r.value}
                                </span>
                                <span className="text-xs text-gray-400 ml-1">{r.unit}</span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <Badge color={STATUS_COLORS[r.status]}>
                                  {r.status === 'optimal' ? (locale === 'bg' ? 'Оптимален' : 'Optimal') :
                                   r.status === 'borderline' ? (locale === 'bg' ? 'Гранична' : 'Borderline') :
                                   (locale === 'bg' ? 'Отклонение' : 'Abnormal')}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ═══ RECOMMENDATIONS (from lifestyle) ═══ */}
        <div className="mt-6 mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {locale === 'bg' ? 'Препоръки' : 'Recommendations'}
        </div>
        <Card>
          <button
            type="button"
            onClick={() => setRecsOpen(!recsOpen)}
            className="w-full flex items-center justify-between"
          >
            <div>
              <div className="text-[13px] font-medium text-gray-700">
                {locale === 'bg' ? 'Персонализирани препоръки' : 'Personalized Recommendations'}
              </div>
              <div className="text-[10px] text-gray-400">
                {locale === 'bg'
                  ? 'На база кръвните ви резултати'
                  : 'Based on your blood test results'}
              </div>
            </div>
            <span className={`text-gray-400 transition-transform ${recsOpen ? 'rotate-180' : ''}`}>▼</span>
          </button>
          {recsOpen && (
            <div className="mt-4 space-y-4">
              {RECOMMENDATIONS.map((rec, i) => {
                const linked = BLOOD_RESULTS.filter(r => rec.linkedResults.includes(r.id));
                return (
                  <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="text-2xl mt-0.5">{rec.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-semibold text-gray-900">{rec.title[locale]}</h3>
                        <Badge color={PRIORITY_COLORS[rec.priority]}>
                          {rec.priority === 'high' ? (locale === 'bg' ? 'Висок' : 'High Priority') :
                           rec.priority === 'medium' ? (locale === 'bg' ? 'Среден' : 'Medium Priority') :
                           (locale === 'bg' ? 'Нисък' : 'Low Priority')}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">{rec.description[locale]}</p>
                      {linked.length > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-gray-400">{locale === 'bg' ? 'Свързани:' : 'Linked:'}</span>
                          {linked.map(r => (
                            <Badge key={r.id} color={STATUS_COLORS[r.status]}>{r.code} {r.value}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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
