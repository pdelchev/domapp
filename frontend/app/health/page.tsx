'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../context/LanguageContext';
import { t, Locale } from '../lib/i18n';
import { getHealthDashboard, createHealthProfile } from '../lib/api';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, Card, Button, Badge, Alert, Spinner, Input, Select, EmptyState } from '../components/ui';

// ── Types ──────────────────────────────────────────────────────────

interface Profile {
  id: number; full_name: string; sex: string; is_primary: boolean;
  date_of_birth: string | null; report_count: number;
  latest_report_date: string | null; latest_score: number | null;
}

interface BiomarkerDetail {
  id: number; name: string; name_bg: string; abbreviation: string; unit: string;
  body_system: string; category_name: string; category_name_bg: string; category_icon: string;
  ref_min_male: number | null; ref_max_male: number | null;
  ref_min_female: number | null; ref_max_female: number | null;
  optimal_min: number | null; optimal_max: number | null;
  description: string; description_bg: string;
  high_meaning: string; high_meaning_bg: string;
  low_meaning: string; low_meaning_bg: string;
  improve_tips: string[]; improve_tips_bg: string[];
}

interface BloodResult {
  id: number; value: number; unit: string; flag: string;
  deviation_pct: number | null; biomarker: number;
  biomarker_detail: BiomarkerDetail;
}

interface Recommendation {
  id: number; category: string; priority: string;
  title: string; title_bg: string;
  description: string; description_bg: string;
  related_biomarkers: number[];
}

interface Report {
  id: number; test_date: string; lab_name: string; lab_type: string;
  overall_score: number | null; system_scores: Record<string, number>;
  results: BloodResult[]; recommendations: Recommendation[];
  fasting_warnings: string[]; retest_suggestion: { months: number; urgency: string; note: string; note_bg: string };
  parse_warnings: string[];
}

interface DashboardData {
  profiles: Profile[]; current_profile: Profile; has_data: boolean;
  latest_report?: Report; score_change?: number | null;
  previous_report_id?: number | null; report_count?: number;
  top_recommendations?: Recommendation[];
}

// ── Helpers ─────────────────────────────────────────────────────────

const FLAG_META: Record<string, { bg: string; text: string; dot: string; label: string; badgeColor: string }> = {
  optimal:        { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'health.optimal', badgeColor: 'green' },
  normal:         { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500',    label: 'health.normal',  badgeColor: 'blue' },
  borderline_low: { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'health.borderline', badgeColor: 'yellow' },
  borderline_high:{ bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'health.borderline', badgeColor: 'yellow' },
  low:            { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500',     label: 'health.abnormal', badgeColor: 'red' },
  high:           { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500',     label: 'health.abnormal', badgeColor: 'red' },
  critical_low:   { bg: 'bg-red-100',    text: 'text-red-900',     dot: 'bg-red-700',     label: 'health.critical', badgeColor: 'red' },
  critical_high:  { bg: 'bg-red-100',    text: 'text-red-900',     dot: 'bg-red-700',     label: 'health.critical', badgeColor: 'red' },
};

const SYSTEM_ICONS: Record<string, string> = {
  blood: '🩸', heart: '❤️', metabolic: '⚡', liver: '🫁',
  kidney: '🫘', thyroid: '🦋', nutrition: '💊', immune: '🔥', hormonal: '⚖️',
};

const REC_ICONS: Record<string, string> = {
  diet: '🥗', exercise: '🏃', supplement: '💊', medical: '🏥', lifestyle: '🌱',
};

function scoreColor(s: number | null) {
  if (s === null) return 'text-gray-400';
  if (s >= 85) return 'text-emerald-600';
  if (s >= 70) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBgGradient(s: number | null) {
  if (s === null) return 'from-gray-100 to-gray-50';
  if (s >= 85) return 'from-emerald-50 to-emerald-100/50';
  if (s >= 70) return 'from-amber-50 to-amber-100/50';
  return 'from-red-50 to-red-100/50';
}

// ── Score Ring ─────────────────────────────────────────────────────

function ScoreRing({ score, size = 100, label }: { score: number | null; size?: number; label?: string }) {
  if (score === null) return <span className="text-4xl font-bold text-gray-300">—</span>;
  const r = (size - 10) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 85 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col items-center">
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth="7" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7"
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
        </svg>
        <span className="absolute text-3xl font-bold" style={{ color }}>{score}</span>
      </div>
      {label && <span className="text-[10px] text-gray-400 mt-1">{label}</span>}
    </div>
  );
}

// ── Range Bar ──────────────────────────────────────────────────────

function RangeBar({ value, refMin, refMax, optMin, optMax, flag }: {
  value: number; refMin: number | null; refMax: number | null;
  optMin: number | null; optMax: number | null; flag: string;
}) {
  const rMin = refMin ?? 0;
  const rMax = refMax ?? value * 2;
  const range = rMax - rMin;
  const padding = range * 0.25;
  const vizMin = Math.min(rMin - padding, value - range * 0.1);
  const vizMax = Math.max(rMax + padding, value + range * 0.1);
  const vizRange = vizMax - vizMin;

  const toPos = (v: number) => Math.max(0, Math.min(100, ((v - vizMin) / vizRange) * 100));

  const refMinPos = toPos(rMin);
  const refMaxPos = toPos(rMax);
  const valuePos = toPos(value);
  const hasOptimal = optMin !== null && optMax !== null;
  const optMinPos = hasOptimal ? toPos(optMin!) : 0;
  const optMaxPos = hasOptimal ? toPos(optMax!) : 0;

  const fc = FLAG_META[flag] || FLAG_META.normal;

  return (
    <div className="w-full">
      <div className="relative h-2.5 rounded-full bg-gray-100 overflow-visible">
        {/* Out-of-range zones */}
        <div className="absolute top-0 h-full rounded-l-full bg-red-200/40" style={{ left: '0%', width: `${refMinPos}%` }} />
        <div className="absolute top-0 h-full rounded-r-full bg-red-200/40" style={{ left: `${refMaxPos}%`, width: `${100 - refMaxPos}%` }} />
        {/* Reference range */}
        <div className="absolute top-0 h-full rounded-full bg-emerald-200/60" style={{ left: `${refMinPos}%`, width: `${refMaxPos - refMinPos}%` }} />
        {/* Optimal range */}
        {hasOptimal && (
          <div className="absolute top-0 h-full rounded-full bg-emerald-300/60" style={{ left: `${optMinPos}%`, width: `${optMaxPos - optMinPos}%` }} />
        )}
        {/* Ref boundary ticks */}
        <div className="absolute top-0 h-full w-px bg-gray-300/80" style={{ left: `${refMinPos}%` }} />
        <div className="absolute top-0 h-full w-px bg-gray-300/80" style={{ left: `${refMaxPos}%` }} />
        {/* Value marker */}
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10" style={{ left: `${valuePos}%` }}>
          <div className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-md ${fc.dot}`} />
        </div>
      </div>
      {/* Labels */}
      <div className="relative h-4 mt-0.5 text-[9px] text-gray-400">
        <span className="absolute -translate-x-1/2" style={{ left: `${refMinPos}%` }}>{rMin}</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${refMaxPos}%` }}>{rMax}</span>
      </div>
    </div>
  );
}

// ── Biomarker Row ──────────────────────────────────────────────────

function BiomarkerRow({ result, sex, locale }: { result: BloodResult; sex: string; locale: Locale }) {
  const [expanded, setExpanded] = useState(false);
  const bm = result.biomarker_detail;
  const fc = FLAG_META[result.flag] || FLAG_META.normal;
  const isGood = result.flag === 'optimal' || result.flag === 'normal';
  const refMin = sex === 'female' ? (bm.ref_min_female ?? bm.ref_min_male) : bm.ref_min_male;
  const refMax = sex === 'female' ? (bm.ref_max_female ?? bm.ref_max_male) : bm.ref_max_male;

  return (
    <div className={`border-b border-gray-100 last:border-0 transition-colors ${expanded ? 'bg-gray-50/50' : 'hover:bg-gray-50/50'}`}>
      <button className="w-full text-left px-4 py-3" onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-3">
          {/* Status dot */}
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${fc.dot}`} />

          {/* Name + range bar */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-gray-900 truncate">
                {locale === 'bg' && bm.name_bg ? bm.name_bg : bm.name}
              </span>
              <span className="text-[11px] text-gray-400 font-mono shrink-0">{bm.abbreviation}</span>
            </div>
            <div className="mt-1 max-w-[220px] sm:max-w-[300px]">
              <RangeBar
                value={result.value} refMin={refMin} refMax={refMax}
                optMin={bm.optimal_min} optMax={bm.optimal_max} flag={result.flag}
              />
            </div>
          </div>

          {/* Value */}
          <div className="text-right shrink-0 ml-2">
            <div className={`text-lg font-bold tabular-nums ${isGood ? 'text-gray-900' : fc.text}`}>
              {result.value}
            </div>
            <div className="text-[10px] text-gray-400 -mt-0.5">{result.unit}</div>
          </div>

          {/* Status badge */}
          <Badge color={fc.badgeColor as 'green' | 'blue' | 'yellow' | 'red'}>
            {t(fc.label, locale)}
          </Badge>

          {/* Chevron */}
          <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Large value + range */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <span className={`text-3xl font-bold ${isGood ? 'text-gray-900' : fc.text}`}>{result.value}</span>
                <span className="text-sm text-gray-400 ml-1">{result.unit}</span>
              </div>
              <div className="text-right text-xs text-gray-500">
                <div>{t('health.ref_range', locale)}: <span className="font-medium text-gray-700">{refMin} — {refMax}</span> {result.unit}</div>
                {bm.optimal_min !== null && (
                  <div>{t('health.optimal_range', locale)}: <span className="font-medium text-emerald-600">{bm.optimal_min} — {bm.optimal_max}</span></div>
                )}
                {result.deviation_pct !== null && result.deviation_pct !== 0 && (
                  <div className={`font-medium ${fc.text}`}>{result.deviation_pct > 0 ? '+' : ''}{result.deviation_pct}% {t('health.deviation', locale)}</div>
                )}
              </div>
            </div>
            <RangeBar value={result.value} refMin={refMin} refMax={refMax} optMin={bm.optimal_min} optMax={bm.optimal_max} flag={result.flag} />
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{t('health.what_is_this', locale)}</h4>
              <p className="text-sm text-gray-600 leading-relaxed">{locale === 'bg' && bm.description_bg ? bm.description_bg : bm.description}</p>
            </div>
            <div className={`rounded-lg border p-3 ${fc.bg}`} style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
              <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{t('health.what_means', locale)}</h4>
              <p className={`text-sm leading-relaxed ${fc.text}`}>
                {result.flag.includes('high') || result.flag === 'critical_high'
                  ? (locale === 'bg' && bm.high_meaning_bg ? bm.high_meaning_bg : bm.high_meaning)
                  : (locale === 'bg' && bm.low_meaning_bg ? bm.low_meaning_bg : bm.low_meaning)
                }
              </p>
            </div>
          </div>

          {/* Improvement tips */}
          {!isGood && (
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('health.how_to_improve', locale)}</h4>
              <ul className="space-y-1.5">
                {(locale === 'bg' && bm.improve_tips_bg?.length ? bm.improve_tips_bg : bm.improve_tips || []).map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Follow-Up Tests (printable for lab technicians) ───────────────

interface TestRec {
  name: string; name_bg: string; code: string;
  reason: string; reason_bg: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  triggerFlags: string[]; // biomarker abbreviations that trigger this
}

const FOLLOW_UP_CATALOG: TestRec[] = [
  { name: 'HbA1c (Glycated Hemoglobin)', name_bg: 'HbA1c (Гликиран хемоглобин)', code: 'HBA1C', reason: 'Elevated fasting glucose warrants HbA1c to assess 3-month average blood sugar.', reason_bg: 'Повишената глюкоза на гладно изисква HbA1c за оценка на средната кръвна захар за 3 месеца.', priority: 'high', category: 'metabolic', triggerFlags: ['GLU'] },
  { name: 'Fasting Glucose (repeat)', name_bg: 'Глюкоза на гладно (повторен)', code: 'GLU', reason: 'Confirm whether lifestyle changes lowered glucose.', reason_bg: 'Потвърдете дали промените в начина на живот са намалили глюкозата.', priority: 'high', category: 'metabolic', triggerFlags: ['GLU'] },
  { name: 'Fasting Insulin', name_bg: 'Инсулин на гладно', code: 'INS', reason: 'Check insulin resistance (HOMA-IR) given elevated glucose.', reason_bg: 'Проверка за инсулинова резистентност (HOMA-IR) при повишена глюкоза.', priority: 'high', category: 'metabolic', triggerFlags: ['GLU'] },
  { name: 'ALT (repeat)', name_bg: 'АЛТ (повторен)', code: 'ALT', reason: 'Verify liver enzyme recovery after lifestyle changes.', reason_bg: 'Проверете възстановяването на чернодробните ензими след промени в начина на живот.', priority: 'high', category: 'liver', triggerFlags: ['ALT'] },
  { name: 'Full Liver Panel (ALT, AST, GGT, ALP, Bilirubin)', name_bg: 'Пълен чернодробен панел (АЛТ, АСТ, ГГТ, АФ, Билирубин)', code: 'LIVER', reason: 'Multiple elevated liver enzymes need full panel.', reason_bg: 'Множество повишени чернодробни ензими изискват пълен панел.', priority: 'high', category: 'liver', triggerFlags: ['ALT', 'AST', 'GGT'] },
  { name: 'Uric Acid (repeat)', name_bg: 'Пикочна киселина (повторен)', code: 'URIC', reason: 'Track response to dietary changes.', reason_bg: 'Проследете отговора на диетичните промени.', priority: 'medium', category: 'kidney', triggerFlags: ['URIC'] },
  { name: 'Lipid Panel (Total, LDL, HDL, Triglycerides)', name_bg: 'Липиден панел (Общ, LDL, HDL, Триглицериди)', code: 'LIPID', reason: 'Metabolic syndrome pattern usually comes with dyslipidemia.', reason_bg: 'Метаболитният синдром обикновено идва с дислипидемия.', priority: 'medium', category: 'metabolic', triggerFlags: ['GLU'] },
  { name: 'CRP (C-Reactive Protein)', name_bg: 'CRP (С-реактивен протеин)', code: 'CRP', reason: 'Assess systemic inflammation with metabolic risk.', reason_bg: 'Оценка на системно възпаление при метаболитен риск.', priority: 'medium', category: 'metabolic', triggerFlags: ['GLU', 'ALT'] },
  { name: 'Vitamin D', name_bg: 'Витамин D', code: 'VITD', reason: 'Affects insulin sensitivity, liver health, immunity.', reason_bg: 'Влияе на инсулиновата чувствителност, черния дроб и имунитета.', priority: 'low', category: 'vitamins', triggerFlags: ['GLU', 'ALT'] },
  { name: 'Iron Panel (Fe, Ferritin, TIBC)', name_bg: 'Железен панел (Fe, Феритин, TIBC)', code: 'IRON', reason: 'Low MCV suggests possible iron deficiency.', reason_bg: 'Нисък MCV предполага възможен дефицит на желязо.', priority: 'low', category: 'blood', triggerFlags: ['MCV'] },
  { name: 'TSH (Thyroid)', name_bg: 'ТСХ (Щитовидна жлеза)', code: 'TSH', reason: 'Thyroid dysfunction affects metabolism and liver enzymes.', reason_bg: 'Тиреоидната дисфункция засяга метаболизма и чернодробните ензими.', priority: 'low', category: 'hormones', triggerFlags: ['GLU', 'ALT'] },
];

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_BADGE: Record<string, 'red' | 'yellow' | 'blue'> = { high: 'red', medium: 'yellow', low: 'blue' };
const CAT_ICON_TEST: Record<string, string> = { metabolic: '⚡', liver: '🫁', kidney: '🫘', vitamins: '💊', blood: '🩸', hormones: '🧬' };

function FollowUpTests({ results, locale }: { results: BloodResult[]; locale: 'en' | 'bg' }) {
  const [open, setOpen] = useState(false);

  // Determine which biomarkers are abnormal
  const abnormalAbbrs = new Set(
    results
      .filter(r => !['optimal', 'normal'].includes(r.flag))
      .map(r => r.biomarker_detail.abbreviation)
  );

  // Filter catalog to only show relevant tests
  const relevantTests = FOLLOW_UP_CATALOG
    .filter(test => test.triggerFlags.some(f => abnormalAbbrs.has(f)))
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  if (relevantTests.length === 0) return null;

  const handlePrint = () => {
    const printEl = document.getElementById('follow-up-tests-print');
    if (!printEl) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${locale === 'bg' ? 'Контролни изследвания' : 'Follow-up Tests'}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #111; }
  h1 { font-size: 20px; border-bottom: 2px solid #111; padding-bottom: 8px; }
  h2 { font-size: 15px; margin-top: 24px; color: #444; }
  .test { margin: 12px 0; padding: 8px 12px; border-left: 3px solid #999; }
  .test.high { border-color: #dc2626; }
  .test.medium { border-color: #f59e0b; }
  .test.low { border-color: #3b82f6; }
  .test-name { font-weight: 700; font-size: 14px; }
  .test-code { color: #888; font-family: monospace; font-size: 12px; }
  .test-reason { font-size: 13px; color: #444; margin-top: 4px; }
  .priority { display: inline-block; font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 10px; }
  .priority.high { background: #fee2e2; color: #dc2626; }
  .priority.medium { background: #fef3c7; color: #d97706; }
  .priority.low { background: #dbeafe; color: #2563eb; }
  .date { color: #666; font-size: 12px; }
  @media print { body { margin: 20px; } }
</style></head><body>`);
    win.document.write(`<h1>${locale === 'bg' ? 'Препоръчани контролни изследвания' : 'Recommended Follow-up Tests'}</h1>`);
    win.document.write(`<p class="date">${locale === 'bg' ? 'Дата' : 'Date'}: ${new Date().toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-US')}</p>`);

    const groups = { high: relevantTests.filter(t => t.priority === 'high'), medium: relevantTests.filter(t => t.priority === 'medium'), low: relevantTests.filter(t => t.priority === 'low') };
    const groupLabels = {
      high: locale === 'bg' ? 'Висок приоритет' : 'High Priority',
      medium: locale === 'bg' ? 'Среден приоритет' : 'Medium Priority',
      low: locale === 'bg' ? 'Нисък приоритет' : 'Low Priority',
    };

    for (const [priority, tests] of Object.entries(groups)) {
      if (tests.length === 0) continue;
      win.document.write(`<h2>${groupLabels[priority as keyof typeof groupLabels]} (${tests.length})</h2>`);
      for (const test of tests) {
        win.document.write(`<div class="test ${priority}">
          <div><span class="test-name">${locale === 'bg' ? test.name_bg : test.name}</span> <span class="test-code">${test.code}</span></div>
          <div class="test-reason">${locale === 'bg' ? test.reason_bg : test.reason}</div>
        </div>`);
      }
    }

    win.document.write('</body></html>');
    win.document.close();
    win.print();
  };

  return (
    <div className="mt-8 mb-6" id="follow-up-tests-print">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-lg font-semibold text-gray-900 hover:text-indigo-600 transition-colors">
          <svg className={`w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          🧪 {locale === 'bg' ? 'Контролни изследвания' : 'Follow-up Tests'}
          <Badge color="indigo">{relevantTests.length}</Badge>
        </button>
        {open && (
          <Button size="sm" variant="secondary" onClick={handlePrint}>
            🖨️ {locale === 'bg' ? 'Принтирай за лаборатория' : 'Print for Lab'}
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 mb-3">
            {locale === 'bg'
              ? 'Базирано на текущите ви резултати. Принтирайте и покажете на лаборанта.'
              : 'Based on your current results. Print and show to the lab technician.'}
          </p>
          {relevantTests.map((test, i) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${
              test.priority === 'high' ? 'border-red-200 bg-red-50/50' :
              test.priority === 'medium' ? 'border-amber-200 bg-amber-50/50' :
              'border-blue-200 bg-blue-50/50'
            }`}>
              <span className="text-lg mt-0.5">{CAT_ICON_TEST[test.category] || '🧪'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{locale === 'bg' ? test.name_bg : test.name}</span>
                  <span className="text-xs font-mono text-gray-400">{test.code}</span>
                  <Badge color={PRIORITY_BADGE[test.priority]}>{test.priority}</Badge>
                </div>
                <p className="text-xs text-gray-600 mt-1">{locale === 'bg' ? test.reason_bg : test.reason}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────

export default function HealthPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);

  // Profile creation
  const [showCreateProfile, setShowCreateProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: '', date_of_birth: '', sex: 'male' });
  const [profileError, setProfileError] = useState('');

  // Category filter
  const [categoryFilter, setCategoryFilter] = useState('');

  const loadDashboard = useCallback((profileId?: number) => {
    setLoading(true);
    getHealthDashboard(profileId)
      .then((d) => { setData(d); setError(''); })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const handleProfileChange = (id: string) => {
    const numId = Number(id);
    setSelectedProfile(numId);
    loadDashboard(numId);
  };

  const handleCreateProfile = async () => {
    if (!profileForm.full_name.trim()) { setProfileError(t('common.required', locale)); return; }
    setProfileError('');
    try {
      await createHealthProfile(profileForm);
      setShowCreateProfile(false);
      setProfileForm({ full_name: '', date_of_birth: '', sex: 'male' });
      loadDashboard();
    } catch { setProfileError('Failed to create profile'); }
  };

  if (loading) return (
    <PageShell><NavBar /><PageContent size="lg"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>
  );

  const profiles = data?.profiles || [];
  const report = data?.latest_report;
  const hasData = data?.has_data || false;

  // Group results by category
  const resultsByCategory: Record<string, BloodResult[]> = {};
  if (report?.results) {
    for (const r of report.results) {
      const cat = r.biomarker_detail.category_name;
      (resultsByCategory[cat] ??= []).push(r);
    }
  }
  const categories = Object.keys(resultsByCategory);
  const issueCount = report?.results.filter(r => !['optimal', 'normal'].includes(r.flag)).length || 0;

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('health.title', locale)}</h1>
            {data?.current_profile && (
              <p className="text-sm text-gray-500 mt-1">{data.current_profile.full_name}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {profiles.length > 1 && (
              <select
                value={selectedProfile || data?.current_profile?.id || ''}
                onChange={(e) => handleProfileChange(e.target.value)}
                className="h-10 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}{p.is_primary ? ' (me)' : ''}</option>
                ))}
              </select>
            )}
            <Button size="sm" variant="secondary" onClick={() => setShowCreateProfile(true)}>
              + {t('health.add_profile', locale)}
            </Button>
            <Button variant="secondary" onClick={() => router.push('/lifestyle/tests')}>
              🧪 {locale === 'bg' ? 'Панел изследвания' : 'Test Panel'}
            </Button>
            <Button onClick={() => router.push('/health/upload')}>
              + {t('health.upload_report', locale)}
            </Button>
          </div>
        </div>

        <Alert type="error" message={error} />

        {/* Create Profile Modal */}
        {showCreateProfile && (
          <Card className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">{t('health.add_profile', locale)}</h3>
            <Alert type="error" message={profileError} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <Input label={t('health.full_name', locale)} required value={profileForm.full_name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm((p) => ({ ...p, full_name: e.target.value }))} />
              <Input label={t('health.date_of_birth', locale)} type="date" value={profileForm.date_of_birth}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm((p) => ({ ...p, date_of_birth: e.target.value }))} />
              <Select label={t('health.sex', locale)} value={profileForm.sex}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setProfileForm((p) => ({ ...p, sex: e.target.value }))}>
                <option value="male">{t('health.male', locale)}</option>
                <option value="female">{t('health.female', locale)}</option>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreateProfile}>{t('common.save', locale)}</Button>
              <Button variant="secondary" onClick={() => setShowCreateProfile(false)}>{t('common.cancel', locale)}</Button>
            </div>
          </Card>
        )}

        {/* Empty states */}
        {!hasData && profiles.length === 0 && (
          <EmptyState icon="🩸" message={t('health.no_profiles', locale)} />
        )}
        {!hasData && profiles.length > 0 && (
          <EmptyState icon="📋" message={t('health.no_reports', locale)} />
        )}

        {/* Dashboard content */}
        {hasData && report && (
          <>
            {/* Score header */}
            <Card>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Overall score ring */}
                <div className="flex flex-col items-center">
                  <ScoreRing score={report.overall_score} size={100} />
                  <div className="text-[11px] text-gray-400 mt-1.5">{report.test_date} · {report.lab_name || report.lab_type}</div>
                  {data.score_change !== null && data.score_change !== undefined && (
                    <div className={`text-xs mt-1 font-medium ${data.score_change > 0 ? 'text-emerald-600' : data.score_change < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {data.score_change > 0 ? '↑' : data.score_change < 0 ? '↓' : '→'} {Math.abs(data.score_change)} {t('health.score_change', locale)}
                    </div>
                  )}
                </div>

                {/* System scores */}
                <div className="flex-1 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 w-full">
                  {Object.entries(report.system_scores).map(([sys, score]) => (
                    <div
                      key={sys}
                      className={`rounded-xl p-2.5 text-center bg-gradient-to-b ${scoreBgGradient(score)} border border-gray-100`}
                    >
                      <div className="text-lg">{SYSTEM_ICONS[sys] || '📊'}</div>
                      <div className={`text-xl font-bold ${scoreColor(score)}`}>{score}</div>
                      <div className="text-[10px] text-gray-500 leading-tight">{t(`system.${sys}`, locale)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick stats */}
              <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                <span>{report.results.length} {t('health.results', locale).toLowerCase()}</span>
                {issueCount > 0 && (
                  <span className="text-amber-600 font-medium">{issueCount} {locale === 'bg' ? 'извън нормата' : 'out of range'}</span>
                )}
                {data.report_count && data.report_count > 1 && (
                  <span>{data.report_count} {t('health.reports', locale).toLowerCase()}</span>
                )}
              </div>
            </Card>

            {/* Fasting warnings */}
            {report.fasting_warnings?.length > 0 && (
              <div className="mt-3">
                {report.fasting_warnings.map((w, i) => (
                  <Alert key={i} type="error" message={`⚠️ ${w}`} />
                ))}
              </div>
            )}

            {/* Retest suggestion */}
            {report.retest_suggestion && (
              <div className="mt-3 p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-800">
                📅 {t('health.retest_in', locale)} <strong>{report.retest_suggestion.months} {t('health.months', locale)}</strong>
                {' — '}{locale === 'bg' ? report.retest_suggestion.note_bg : report.retest_suggestion.note}
              </div>
            )}

            {/* Category filter tabs */}
            <div className="flex gap-1.5 mt-6 mb-4 overflow-x-auto pb-1">
              <button
                onClick={() => setCategoryFilter('')}
                className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  !categoryFilter ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {t('health.all_categories', locale)} ({report.results.length})
              </button>
              {categories.map((cat) => {
                const icon = resultsByCategory[cat][0]?.biomarker_detail.category_icon || '';
                const catLabel = locale === 'bg' ? (resultsByCategory[cat][0]?.biomarker_detail.category_name_bg || cat) : cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
                    className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      categoryFilter === cat ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {icon} {catLabel} ({resultsByCategory[cat].length})
                  </button>
                );
              })}
            </div>

            {/* Results by category */}
            {(categoryFilter ? [categoryFilter] : categories).map((cat) => {
              const results = resultsByCategory[cat];
              const icon = results[0]?.biomarker_detail.category_icon || '';
              const catLabel = locale === 'bg' ? (results[0]?.biomarker_detail.category_name_bg || cat) : cat;
              return (
                <div key={cat} className="mb-4">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                    <span>{icon}</span> {catLabel}
                  </h3>
                  <Card padding={false}>
                    {results.map((result) => (
                      <BiomarkerRow key={result.id} result={result} sex={data.current_profile?.sex || 'male'} locale={locale as Locale} />
                    ))}
                  </Card>
                </div>
              );
            })}

            {/* Recommendations */}
            {report.recommendations && report.recommendations.length > 0 && (
              <div className="mb-6 mt-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('health.recommendations', locale)}</h2>
                <div className="space-y-3">
                  {report.recommendations.map((rec) => {
                    const priorityColor = rec.priority === 'high' ? 'red' : rec.priority === 'medium' ? 'yellow' : 'blue';
                    return (
                      <Card key={rec.id}>
                        <div className="flex gap-3">
                          <span className="text-2xl shrink-0">{REC_ICONS[rec.category] || '💡'}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm text-gray-900">
                                {locale === 'bg' && rec.title_bg ? rec.title_bg : rec.title}
                              </span>
                              <Badge color={priorityColor as 'red' | 'yellow' | 'blue'}>{rec.priority}</Badge>
                            </div>
                            <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">
                              {locale === 'bg' && rec.description_bg ? rec.description_bg : rec.description}
                            </p>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ═══ Recommended Follow-Up Tests (printable) ═══ */}
            <FollowUpTests results={report.results} locale={locale as 'en' | 'bg'} />

            {/* Report links */}
            <div className="flex gap-3 mt-6">
              <Button variant="secondary" onClick={() => router.push(`/health/report/${report.id}`)}>
                {t('health.report', locale)} — {report.test_date}
              </Button>
              {data.report_count && data.report_count > 1 && data.previous_report_id && (
                <Button variant="ghost" onClick={() => router.push(`/health/report/${data.previous_report_id}`)}>
                  {t('health.history', locale)} ({data.report_count} {t('health.reports', locale)})
                </Button>
              )}
            </div>
          </>
        )}
      </PageContent>
    </PageShell>
  );
}
