'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../context/LanguageContext';
import { t } from '../../../lib/i18n';
import { getBloodReport, deleteBloodReport, getBiomarkerHistory, getBloodReports } from '../../../lib/api';
import NavBar from '../../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Alert, Spinner } from '../../../components/ui';

// ── Types (shared with health page) ─────────────────────────────────

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

// ── Helpers ─────────────────────────────────────────────────────────

const FLAG_COLORS: Record<string, { bg: string; text: string }> = {
  optimal: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  normal: { bg: 'bg-blue-100', text: 'text-blue-700' },
  borderline_low: { bg: 'bg-amber-100', text: 'text-amber-700' },
  borderline_high: { bg: 'bg-amber-100', text: 'text-amber-700' },
  low: { bg: 'bg-red-100', text: 'text-red-700' },
  high: { bg: 'bg-red-100', text: 'text-red-700' },
  critical_low: { bg: 'bg-red-200', text: 'text-red-900' },
  critical_high: { bg: 'bg-red-200', text: 'text-red-900' },
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

// ── Trend sparkline ─────────────────────────────────────────────────

function TrendLine({ history }: { history: HistoryEntry[] }) {
  if (history.length < 2) return null;
  const values = history.map((h) => h.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 120;
  const h = 32;
  const step = w / (values.length - 1);

  const points = values.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ');

  return (
    <svg width={w} height={h} className="inline-block">
      <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => (
        <circle key={i} cx={i * step} cy={h - ((v - min) / range) * h} r="2.5"
          fill={i === values.length - 1 ? '#6366f1' : '#c7d2fe'} />
      ))}
    </svg>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { locale } = useLanguage();

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

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

  // Load all reports for this profile (for navigation)
  useEffect(() => {
    if (report?.profile) {
      getBloodReports(report.profile).then(setAllReports).catch(() => {});
    }
  }, [report?.profile]);

  // Load biomarker history on expand
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

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={`${report.profile_name} — ${report.test_date}`}
          onBack={() => router.push('/health')}
          action={
            <div className="flex gap-2">
              <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
                {t('common.delete', locale)}
              </Button>
            </div>
          }
        />

        <Alert type="error" message={error} />

        {/* Report navigation */}
        {allReports.length > 1 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {allReports.map((r) => (
              <button
                key={r.id}
                onClick={() => router.push(`/health/report/${r.id}`)}
                className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  r.id === report.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {r.test_date} {r.overall_score !== null && `(${r.overall_score})`}
              </button>
            ))}
          </div>
        )}

        {/* Score + Systems header */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          {/* Overall */}
          <div className="col-span-2 sm:col-span-1 bg-white border rounded-xl p-4 text-center">
            <div className="text-xs text-gray-500 uppercase">{t('health.overall_score', locale)}</div>
            <div className={`text-4xl font-bold ${scoreColor(report.overall_score)}`}>{report.overall_score ?? '—'}</div>
            <div className="text-xs text-gray-400">{report.lab_name || report.lab_type}</div>
          </div>
          {/* Systems */}
          {Object.entries(report.system_scores).map(([sys, score]) => (
            <div key={sys} className="bg-white border rounded-xl p-3 text-center">
              <div className="text-xl mb-0.5">{SYSTEM_ICONS[sys] || '📊'}</div>
              <div className={`text-2xl font-bold ${scoreColor(score)}`}>{score}</div>
              <div className="text-[10px] text-gray-500">{t(`system.${sys}`, locale)}</div>
            </div>
          ))}
        </div>

        {/* Fasting warnings */}
        {report.fasting_warnings?.map((w, i) => (
          <Alert key={i} type="error" message={`⚠️ ${w}`} />
        ))}

        {/* Parse warnings */}
        {report.parse_warnings?.length > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            ⚠️ Parser notes: {report.parse_warnings.join('; ')}
          </div>
        )}

        {/* Results by category */}
        {Object.entries(grouped).map(([category, results]) => (
          <div key={category} className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{category}</h3>
            <Card padding={false}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Biomarker</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">{t('health.your_value', locale)}</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-600">Status</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">{t('health.reference_range', locale)}</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => {
                    const bm = r.biomarker_detail;
                    const fc = FLAG_COLORS[r.flag] || FLAG_COLORS.normal;
                    const sex = report.profile_sex || 'male';
                    const refMin = sex === 'female' ? (bm.ref_min_female ?? bm.ref_min_male) : bm.ref_min_male;
                    const refMax = sex === 'female' ? (bm.ref_max_female ?? bm.ref_max_male) : bm.ref_max_male;
                    const isExpanded = expandedBiomarker === r.biomarker;

                    return (
                      <tr key={r.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-3" colSpan={isExpanded ? 5 : 1}>
                          <div className={isExpanded ? '' : 'flex items-center justify-between'}>
                            {/* Main row */}
                            <div className={isExpanded ? 'flex items-center justify-between mb-3' : 'contents'}>
                              <button className="text-left" onClick={() => handleExpandBiomarker(r.biomarker)}>
                                <div className="font-medium text-gray-900">
                                  {bm.category_icon} {locale === 'bg' && bm.name_bg ? bm.name_bg : bm.name}
                                </div>
                                <div className="text-xs text-gray-400">{bm.abbreviation}</div>
                              </button>
                              {!isExpanded && (
                                <>
                                  <td className="text-right px-4 py-3 font-semibold">{r.value} <span className="text-xs text-gray-400">{r.unit}</span></td>
                                  <td className="text-center px-4 py-3">
                                    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-md ${fc.bg} ${fc.text}`}>
                                      {r.flag.replace('_', ' ')}
                                    </span>
                                  </td>
                                  <td className="text-right px-4 py-3 text-gray-500">{refMin} — {refMax}</td>
                                  <td className="px-4 py-3">
                                    <button onClick={() => handleExpandBiomarker(r.biomarker)} className="text-indigo-600 hover:text-indigo-800 text-xs">
                                      {t('health.view_history', locale)}
                                    </button>
                                  </td>
                                </>
                              )}
                            </div>

                            {/* Expanded detail */}
                            {isExpanded && (
                              <div className="space-y-4">
                                {/* Value + status */}
                                <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                                  <div>
                                    <div className="text-3xl font-bold text-gray-900">{r.value} <span className="text-sm text-gray-400">{r.unit}</span></div>
                                    <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-md ${fc.bg} ${fc.text}`}>
                                      {r.flag.replace('_', ' ')}
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    <div>Range: {refMin} — {refMax} {r.unit}</div>
                                    {bm.optimal_min !== null && <div>Optimal: {bm.optimal_min} — {bm.optimal_max}</div>}
                                    {r.deviation_pct !== null && r.deviation_pct !== 0 && (
                                      <div className={fc.text}>{r.deviation_pct > 0 ? '+' : ''}{r.deviation_pct}% from range</div>
                                    )}
                                  </div>
                                </div>

                                {/* Description */}
                                <div>
                                  <h4 className="font-medium text-gray-700 text-xs uppercase mb-1">{t('health.what_is_this', locale)}</h4>
                                  <p className="text-sm text-gray-600">{locale === 'bg' && bm.description_bg ? bm.description_bg : bm.description}</p>
                                </div>

                                {/* What it means */}
                                <div>
                                  <h4 className="font-medium text-gray-700 text-xs uppercase mb-1">{t('health.what_means', locale)}</h4>
                                  <p className={`text-sm ${fc.text}`}>
                                    {r.flag.includes('high')
                                      ? (locale === 'bg' && bm.high_meaning_bg ? bm.high_meaning_bg : bm.high_meaning)
                                      : (locale === 'bg' && bm.low_meaning_bg ? bm.low_meaning_bg : bm.low_meaning)
                                    }
                                  </p>
                                </div>

                                {/* Improvement tips */}
                                {r.flag !== 'optimal' && r.flag !== 'normal' && (
                                  <div>
                                    <h4 className="font-medium text-gray-700 text-xs uppercase mb-1">{t('health.how_to_improve', locale)}</h4>
                                    <ul className="space-y-1 text-sm">
                                      {(locale === 'bg' && bm.improve_tips_bg?.length ? bm.improve_tips_bg : bm.improve_tips || []).map((tip, i) => (
                                        <li key={i} className="flex items-start gap-2 text-gray-600">
                                          <span className="text-emerald-500">✓</span>{tip}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {/* History trend */}
                                <div>
                                  <h4 className="font-medium text-gray-700 text-xs uppercase mb-2">{t('health.history', locale)}</h4>
                                  {historyLoading ? (
                                    <div className="text-xs text-gray-400">Loading...</div>
                                  ) : history.length > 0 ? (
                                    <div>
                                      <TrendLine history={history} />
                                      <div className="mt-2 space-y-1">
                                        {history.map((h, i) => (
                                          <div key={i} className="flex items-center gap-3 text-xs text-gray-500">
                                            <span className="w-20">{h.test_date}</span>
                                            <span className="font-medium text-gray-900">{h.value}</span>
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
                                    <div className="text-xs text-gray-400">No previous data</div>
                                  )}
                                </div>

                                <button onClick={() => setExpandedBiomarker(null)} className="text-xs text-indigo-600 hover:text-indigo-800">
                                  Collapse ↑
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </div>
        ))}

        {/* Recommendations */}
        {report.recommendations.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('health.recommendations', locale)}</h2>
            <div className="space-y-3">
              {report.recommendations.map((rec) => {
                const priorityColor = rec.priority === 'high' ? 'red' : rec.priority === 'medium' ? 'yellow' : 'blue';
                const catIcons: Record<string, string> = { diet: '🥗', exercise: '🏃', supplement: '💊', medical: '🏥', lifestyle: '🌱' };
                return (
                  <Card key={rec.id}>
                    <div className="flex gap-3">
                      <span className="text-2xl shrink-0">{catIcons[rec.category] || '💡'}</span>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm text-gray-900">
                            {locale === 'bg' && rec.title_bg ? rec.title_bg : rec.title}
                          </span>
                          <Badge color={priorityColor as 'red' | 'yellow' | 'blue'}>{rec.priority}</Badge>
                        </div>
                        <p className="text-sm text-gray-600 whitespace-pre-line">
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
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800 mb-6">
            📅 {t('health.retest_in', locale)} <strong>{report.retest_suggestion.months} {t('health.months', locale)}</strong>
            {' — '}{locale === 'bg' ? report.retest_suggestion.note_bg : report.retest_suggestion.note}
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}
