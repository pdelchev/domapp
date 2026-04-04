'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../context/LanguageContext';
import { t, Locale } from '../../../lib/i18n';
import { getBloodReport, deleteBloodReport, getBiomarkerHistory, getBloodReports } from '../../../lib/api';
import NavBar from '../../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Alert, Spinner } from '../../../components/ui';

// ── Types ──────────────────────────────────────────────────────────

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
}

interface Report {
  id: number; profile: number; profile_name: string; profile_sex: string;
  test_date: string; lab_name: string; lab_type: string;
  overall_score: number | null; system_scores: Record<string, number>;
  results: BloodResult[]; recommendations: Recommendation[];
  fasting_warnings: string[];
  retest_suggestion: { months: number; note: string; note_bg: string };
  parse_warnings: string[];
}

interface HistoryEntry {
  report_id: number; test_date: string; value: number;
  flag: string; change: number | null; change_pct: number | null;
  direction: string | null;
}

interface ReportListItem {
  id: number; test_date: string; lab_name: string; overall_score: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────

const FLAG_COLORS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  optimal:        { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'health.optimal' },
  normal:         { bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-500',    label: 'health.normal' },
  borderline_low: { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'health.borderline' },
  borderline_high:{ bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'health.borderline' },
  low:            { bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-500',     label: 'health.abnormal' },
  high:           { bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-500',     label: 'health.abnormal' },
  critical_low:   { bg: 'bg-red-100',     text: 'text-red-900',     dot: 'bg-red-700',     label: 'health.critical' },
  critical_high:  { bg: 'bg-red-100',     text: 'text-red-900',     dot: 'bg-red-700',     label: 'health.critical' },
};

const SYSTEM_ICONS: Record<string, string> = {
  blood: '🩸', heart: '❤️', metabolic: '⚡', liver: '🫁',
  kidney: '🫘', thyroid: '🦋', nutrition: '💊', immune: '🔥', hormonal: '⚖️',
};

function scoreColor(s: number | null) {
  if (s === null) return 'text-gray-400';
  if (s >= 85) return 'text-emerald-600';
  if (s >= 70) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBgColor(s: number | null) {
  if (s === null) return 'from-gray-100 to-gray-50';
  if (s >= 85) return 'from-emerald-50 to-emerald-100/50';
  if (s >= 70) return 'from-amber-50 to-amber-100/50';
  return 'from-red-50 to-red-100/50';
}

// ── Range Bar Component ────────────────────────────────────────────

function RangeBar({ value, refMin, refMax, optMin, optMax, unit, flag }: {
  value: number; refMin: number | null; refMax: number | null;
  optMin: number | null; optMax: number | null; unit: string; flag: string;
}) {
  const rMin = refMin ?? 0;
  const rMax = refMax ?? value * 2;
  const range = rMax - rMin;

  // Extend visual range to show out-of-range values with padding
  const padding = range * 0.25;
  const vizMin = Math.min(rMin - padding, value - range * 0.1);
  const vizMax = Math.max(rMax + padding, value + range * 0.1);
  const vizRange = vizMax - vizMin;

  // Position as percentage
  const toPos = (v: number) => Math.max(0, Math.min(100, ((v - vizMin) / vizRange) * 100));

  const refMinPos = toPos(rMin);
  const refMaxPos = toPos(rMax);
  const valuePos = toPos(value);
  const hasOptimal = optMin !== null && optMax !== null;
  const optMinPos = hasOptimal ? toPos(optMin!) : 0;
  const optMaxPos = hasOptimal ? toPos(optMax!) : 0;

  const fc = FLAG_COLORS[flag] || FLAG_COLORS.normal;
  const isOutOfRange = flag === 'high' || flag === 'low' || flag === 'critical_high' || flag === 'critical_low';
  const isBorderline = flag === 'borderline_high' || flag === 'borderline_low';

  return (
    <div className="w-full">
      {/* Bar */}
      <div className="relative h-3 rounded-full bg-gray-100 overflow-visible">
        {/* Reference range zone */}
        <div
          className="absolute top-0 h-full rounded-full bg-emerald-200/60"
          style={{ left: `${refMinPos}%`, width: `${refMaxPos - refMinPos}%` }}
        />
        {/* Optimal range zone (if different) */}
        {hasOptimal && (
          <div
            className="absolute top-0 h-full rounded-full bg-emerald-300/60"
            style={{ left: `${optMinPos}%`, width: `${optMaxPos - optMinPos}%` }}
          />
        )}
        {/* Warning zones on edges of ref range */}
        <div
          className="absolute top-0 h-full rounded-l-full bg-red-200/40"
          style={{ left: '0%', width: `${refMinPos}%` }}
        />
        <div
          className="absolute top-0 h-full rounded-r-full bg-red-200/40"
          style={{ left: `${refMaxPos}%`, width: `${100 - refMaxPos}%` }}
        />

        {/* Ref min/max tick marks */}
        <div className="absolute top-0 h-full w-px bg-gray-300/80" style={{ left: `${refMinPos}%` }} />
        <div className="absolute top-0 h-full w-px bg-gray-300/80" style={{ left: `${refMaxPos}%` }} />

        {/* Value marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
          style={{ left: `${valuePos}%` }}
        >
          <div className={`w-4 h-4 rounded-full border-2 border-white shadow-md ${fc.dot}`} />
        </div>
      </div>

      {/* Labels below bar */}
      <div className="relative h-5 mt-1 text-[10px] text-gray-400">
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${refMinPos}%` }}
        >
          {rMin}
        </span>
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${refMaxPos}%` }}
        >
          {rMax}
        </span>
        {/* Value label if clearly separated from ref labels */}
        {(isOutOfRange || isBorderline) && Math.abs(valuePos - refMinPos) > 8 && Math.abs(valuePos - refMaxPos) > 8 && (
          <span
            className={`absolute -translate-x-1/2 whitespace-nowrap font-semibold ${fc.text}`}
            style={{ left: `${valuePos}%` }}
          >
            {value}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Trend Sparkline ────────────────────────────────────────────────

function TrendLine({ history }: { history: HistoryEntry[] }) {
  if (history.length < 2) return null;
  const values = history.map((h) => h.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 140;
  const h = 36;
  const step = w / (values.length - 1);

  const points = values.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 8) - 4}`).join(' ');

  return (
    <svg width={w} height={h} className="inline-block">
      <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => (
        <circle key={i} cx={i * step} cy={h - ((v - min) / range) * (h - 8) - 4} r="3"
          fill={i === values.length - 1 ? '#6366f1' : '#e0e7ff'} stroke={i === values.length - 1 ? '#4f46e5' : '#c7d2fe'} strokeWidth="1" />
      ))}
    </svg>
  );
}

// ── Score Ring (SVG) ───────────────────────────────────────────────

function ScoreRing({ score, size = 80 }: { score: number | null; size?: number }) {
  if (score === null) return <span className="text-3xl font-bold text-gray-300">—</span>;
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 85 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
      </svg>
      <span className="absolute text-2xl font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

// ── Biomarker Row ──────────────────────────────────────────────────

function BiomarkerRow({ result, sex, locale, isExpanded, onToggle, history, historyLoading }: {
  result: BloodResult; sex: string; locale: Locale;
  isExpanded: boolean; onToggle: () => void;
  history: HistoryEntry[]; historyLoading: boolean;
}) {
  const bm = result.biomarker_detail;
  const fc = FLAG_COLORS[result.flag] || FLAG_COLORS.normal;
  const refMin = sex === 'female' ? (bm.ref_min_female ?? bm.ref_min_male) : bm.ref_min_male;
  const refMax = sex === 'female' ? (bm.ref_max_female ?? bm.ref_max_male) : bm.ref_max_male;
  const isGood = result.flag === 'optimal' || result.flag === 'normal';

  return (
    <div className={`border-b border-gray-100 last:border-0 transition-colors ${isExpanded ? 'bg-gray-50/50' : 'hover:bg-gray-50/50'}`}>
      <button className="w-full text-left px-4 py-3.5" onClick={onToggle}>
        <div className="flex items-center gap-3">
          {/* Status dot */}
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${fc.dot}`} />

          {/* Name + abbreviation */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 text-sm truncate">
                {locale === 'bg' && bm.name_bg ? bm.name_bg : bm.name}
              </span>
              <span className="text-[11px] text-gray-400 font-mono shrink-0">{bm.abbreviation}</span>
            </div>
            {/* Range bar - compact view */}
            <div className="mt-1.5 max-w-[240px] sm:max-w-[320px]">
              <RangeBar
                value={result.value} refMin={refMin} refMax={refMax}
                optMin={bm.optimal_min} optMax={bm.optimal_max}
                unit={result.unit} flag={result.flag}
              />
            </div>
          </div>

          {/* Value + unit */}
          <div className="text-right shrink-0 ml-2">
            <div className={`text-lg font-bold tabular-nums ${isGood ? 'text-gray-900' : fc.text}`}>
              {result.value}
            </div>
            <div className="text-[10px] text-gray-400 -mt-0.5">{result.unit}</div>
          </div>

          {/* Status badge */}
          <div className="shrink-0 ml-1">
            <span className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded-md ${fc.bg} ${fc.text}`}>
              {t(fc.label, locale as Locale)}
            </span>
          </div>

          {/* Chevron */}
          <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Large range bar with labels */}
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
            <RangeBar
              value={result.value} refMin={refMin} refMax={refMax}
              optMin={bm.optimal_min} optMax={bm.optimal_max}
              unit={result.unit} flag={result.flag}
            />
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* What is this */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{t('health.what_is_this', locale)}</h4>
              <p className="text-sm text-gray-600 leading-relaxed">{locale === 'bg' && bm.description_bg ? bm.description_bg : bm.description}</p>
            </div>

            {/* What it means */}
            <div className={`rounded-lg border p-3 ${fc.bg} border-opacity-50`} style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
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

          {/* History trend */}
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('health.history', locale)}</h4>
            {historyLoading ? (
              <div className="text-xs text-gray-400">{t('common.loading', locale)}...</div>
            ) : history.length > 0 ? (
              <div className="flex items-start gap-6">
                <TrendLine history={history} />
                <div className="space-y-1 flex-1">
                  {history.map((h, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <span className="text-gray-400 w-20 shrink-0 font-mono">{h.test_date}</span>
                      <span className="font-semibold text-gray-900 w-12 text-right tabular-nums">{h.value}</span>
                      {h.change !== null && (
                        <span className={h.direction === 'up' ? 'text-red-500' : h.direction === 'down' ? 'text-emerald-500' : 'text-gray-400'}>
                          {h.direction === 'up' ? '↑' : h.direction === 'down' ? '↓' : '→'} {h.change_pct !== null ? `${h.change_pct}%` : ''}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-400">{t('health.no_previous_data', locale)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { locale } = useLanguage();

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Trend data for expanded biomarkers
  const [expandedBiomarker, setExpandedBiomarker] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Other reports for navigation
  const [allReports, setAllReports] = useState<ReportListItem[]>([]);

  const loadReport = useCallback(() => {
    setLoading(true);
    getBloodReport(Number(id))
      .then((d) => { setReport(d); setError(''); })
      .catch(() => router.push('/health'))
      .finally(() => setLoading(false));
  }, [id, router]);

  useEffect(() => { loadReport(); }, [loadReport]);

  useEffect(() => {
    if (report?.profile) {
      getBloodReports(report.profile).then(setAllReports).catch(() => {});
    }
  }, [report?.profile]);

  const handleExpandBiomarker = async (biomarkerId: number) => {
    if (expandedBiomarker === biomarkerId) {
      setExpandedBiomarker(null);
      return;
    }
    setExpandedBiomarker(biomarkerId);
    if (report) {
      setHistoryLoading(true);
      try {
        const data = await getBiomarkerHistory(biomarkerId, report.profile);
        setHistory(data.history || []);
      } catch { setHistory([]); }
      finally { setHistoryLoading(false); }
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this report?')) return;
    setDeleting(true);
    try {
      await deleteBloodReport(Number(id));
      router.push('/health');
    } catch { setError('Failed to delete'); }
    finally { setDeleting(false); }
  };

  if (loading) return (
    <PageShell><NavBar /><PageContent size="lg"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>
  );

  if (!report) return (
    <PageShell><NavBar /><PageContent size="lg"><Alert type="error" message="Report not found" /></PageContent></PageShell>
  );

  // Group results by category
  const grouped: Record<string, BloodResult[]> = {};
  for (const r of report.results) {
    const cat = r.biomarker_detail.category_name;
    (grouped[cat] ??= []).push(r);
  }
  const categories = Object.keys(grouped);

  // Filter by active category
  const filteredGrouped = activeCategory
    ? { [activeCategory]: grouped[activeCategory] }
    : grouped;

  // Count issues
  const issueCount = report.results.filter(r => !['optimal', 'normal'].includes(r.flag)).length;

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={`${report.profile_name} — ${report.test_date}`}
          onBack={() => router.push('/health')}
          action={
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
              {t('common.delete', locale)}
            </Button>
          }
        />

        <Alert type="error" message={error} />

        {/* Report navigation pills */}
        {allReports.length > 1 && (
          <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
            {allReports.map((r) => (
              <button
                key={r.id}
                onClick={() => router.push(`/health/report/${r.id}`)}
                className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                  r.id === report.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                {r.test_date} {r.overall_score !== null && `· ${r.overall_score}`}
              </button>
            ))}
          </div>
        )}

        {/* Score header */}
        <Card>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Overall score ring */}
            <div className="flex flex-col items-center">
              <ScoreRing score={report.overall_score} size={90} />
              <div className="text-xs text-gray-400 mt-1">{report.lab_name || report.lab_type}</div>
            </div>

            {/* System scores grid */}
            <div className="flex-1 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 w-full">
              {Object.entries(report.system_scores).map(([sys, score]) => (
                <div
                  key={sys}
                  className={`rounded-xl p-2.5 text-center bg-gradient-to-b ${scoreBgColor(score)} border border-gray-100`}
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
          </div>
        </Card>

        {/* Fasting warnings */}
        {report.fasting_warnings?.map((w, i) => (
          <div key={i} className="mt-3">
            <Alert type="error" message={`⚠️ ${w}`} />
          </div>
        ))}

        {/* Parse warnings */}
        {report.parse_warnings?.length > 0 && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            ⚠️ Parser notes: {report.parse_warnings.join('; ')}
          </div>
        )}

        {/* Category filter tabs */}
        <div className="flex gap-1.5 mt-6 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCategory(null)}
            className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              !activeCategory
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t('health.all_categories', locale)} ({report.results.length})
          </button>
          {categories.map((cat) => {
            const icon = grouped[cat][0]?.biomarker_detail.category_icon || '';
            const catLabel = locale === 'bg' ? (grouped[cat][0]?.biomarker_detail.category_name_bg || cat) : cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  activeCategory === cat
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {icon} {catLabel} ({grouped[cat].length})
              </button>
            );
          })}
        </div>

        {/* Results by category */}
        {Object.entries(filteredGrouped).map(([category, results]) => {
          const icon = results[0]?.biomarker_detail.category_icon || '';
          const catLabel = locale === 'bg' ? (results[0]?.biomarker_detail.category_name_bg || category) : category;
          return (
            <div key={category} className="mb-4">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                <span>{icon}</span> {catLabel}
              </h3>
              <Card padding={false}>
                {results.map((r) => (
                  <BiomarkerRow
                    key={r.id}
                    result={r}
                    sex={report.profile_sex || 'male'}
                    locale={locale}
                    isExpanded={expandedBiomarker === r.biomarker}
                    onToggle={() => handleExpandBiomarker(r.biomarker)}
                    history={expandedBiomarker === r.biomarker ? history : []}
                    historyLoading={expandedBiomarker === r.biomarker ? historyLoading : false}
                  />
                ))}
              </Card>
            </div>
          );
        })}

        {/* Recommendations */}
        {report.recommendations.length > 0 && (
          <div className="mb-6 mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('health.recommendations', locale)}</h2>
            <div className="space-y-3">
              {report.recommendations.map((rec) => {
                const priorityColor = rec.priority === 'high' ? 'red' : rec.priority === 'medium' ? 'yellow' : 'blue';
                const catIcons: Record<string, string> = { diet: '🥗', exercise: '🏃', supplement: '💊', medical: '🏥', lifestyle: '🌱' };
                return (
                  <Card key={rec.id}>
                    <div className="flex gap-3">
                      <span className="text-2xl shrink-0">{catIcons[rec.category] || '💡'}</span>
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

        {/* Retest suggestion */}
        {report.retest_suggestion && (
          <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-800 mb-6">
            📅 {t('health.retest_in', locale)} <strong>{report.retest_suggestion.months} {t('health.months', locale)}</strong>
            {' — '}{locale === 'bg' ? report.retest_suggestion.note_bg : report.retest_suggestion.note}
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}
