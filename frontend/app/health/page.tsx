'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import { getHealthDashboard, createHealthProfile } from '../lib/api';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Alert, Spinner, Input, Select, EmptyState } from '../components/ui';

// ── Types ───────────────────────────────────────────────────────────

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

// ── Flag colors ─────────────────────────────────────────────────────

const FLAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  optimal: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  normal: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  borderline_low: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  borderline_high: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  low: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  high: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  critical_low: { bg: 'bg-red-100', text: 'text-red-900', border: 'border-red-400' },
  critical_high: { bg: 'bg-red-100', text: 'text-red-900', border: 'border-red-400' },
};

const FLAG_LABELS: Record<string, string> = {
  optimal: 'health.optimal', normal: 'health.normal',
  borderline_low: 'health.borderline', borderline_high: 'health.borderline',
  low: 'health.abnormal', high: 'health.abnormal',
  critical_low: 'health.critical', critical_high: 'health.critical',
};

const SYSTEM_ICONS: Record<string, string> = {
  blood: '🩸', heart: '❤️', metabolic: '⚡', liver: '🫁',
  kidney: '🫘', thyroid: '🦋', nutrition: '💊', immune: '🔥', hormonal: '⚖️',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'red', medium: 'yellow', low: 'blue',
};

const REC_CATEGORY_ICONS: Record<string, string> = {
  diet: '🥗', exercise: '🏃', supplement: '💊', medical: '🏥', lifestyle: '🌱',
};

// ── Score color helper ──────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score === null) return 'text-gray-400';
  if (score >= 85) return 'text-emerald-600';
  if (score >= 70) return 'text-amber-600';
  if (score >= 50) return 'text-orange-600';
  return 'text-red-600';
}

function scoreBg(score: number | null): string {
  if (score === null) return 'bg-gray-100';
  if (score >= 85) return 'bg-emerald-50 border-emerald-200';
  if (score >= 70) return 'bg-amber-50 border-amber-200';
  if (score >= 50) return 'bg-orange-50 border-orange-200';
  return 'bg-red-50 border-red-200';
}

// ── Reference range bar ─────────────────────────────────────────────

function RangeBar({ value, refMin, refMax, optMin, optMax, unit }: {
  value: number; refMin: number | null; refMax: number | null;
  optMin: number | null; optMax: number | null; unit: string;
}) {
  if (refMin === null || refMax === null) return null;
  const range = refMax - refMin;
  const padding = range * 0.3;
  const totalMin = refMin - padding;
  const totalMax = refMax + padding;
  const totalRange = totalMax - totalMin;
  if (totalRange <= 0) return null;

  const pct = (v: number) => Math.max(0, Math.min(100, ((v - totalMin) / totalRange) * 100));

  const refStartPct = pct(refMin);
  const refEndPct = pct(refMax);
  const valuePct = pct(value);

  return (
    <div className="w-full mt-1.5">
      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
        {/* Reference range (green zone) */}
        <div
          className="absolute h-full bg-emerald-200 rounded-full"
          style={{ left: `${refStartPct}%`, width: `${refEndPct - refStartPct}%` }}
        />
        {/* Optimal range (darker green) */}
        {optMin !== null && optMax !== null && (
          <div
            className="absolute h-full bg-emerald-400 rounded-full opacity-50"
            style={{ left: `${pct(optMin)}%`, width: `${pct(optMax) - pct(optMin)}%` }}
          />
        )}
        {/* Value marker */}
        <div
          className="absolute top-0 w-1 h-full bg-gray-900 rounded-full"
          style={{ left: `${valuePct}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
        <span>{refMin}</span>
        <span>{refMax} {unit}</span>
      </div>
    </div>
  );
}

// ── Expandable result row ───────────────────────────────────────────

function ResultRow({ result, sex, locale }: { result: BloodResult; sex: string; locale: 'en' | 'bg' }) {
  const [expanded, setExpanded] = useState(false);
  const bm = result.biomarker_detail;
  const fc = FLAG_COLORS[result.flag] || FLAG_COLORS.normal;
  const isHigh = result.flag.includes('high');
  const refMin = sex === 'female' ? (bm.ref_min_female ?? bm.ref_min_male) : bm.ref_min_male;
  const refMax = sex === 'female' ? (bm.ref_max_female ?? bm.ref_max_male) : bm.ref_max_male;

  return (
    <div className={`border ${fc.border} rounded-lg mb-2 overflow-hidden transition-all`}>
      <button
        className={`w-full flex items-center gap-3 px-4 py-3 ${fc.bg} hover:opacity-90 transition-opacity text-left`}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-lg">{bm.category_icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-gray-900 truncate">
              {locale === 'bg' && bm.name_bg ? bm.name_bg : bm.name}
            </span>
            <span className="text-xs text-gray-500">{bm.abbreviation}</span>
          </div>
          <RangeBar
            value={result.value} refMin={refMin} refMax={refMax}
            optMin={bm.optimal_min} optMax={bm.optimal_max} unit={result.unit}
          />
        </div>
        <div className="text-right shrink-0">
          <div className={`text-lg font-semibold ${fc.text}`}>{result.value}</div>
          <div className="text-xs text-gray-500">{result.unit}</div>
        </div>
        <Badge color={
          result.flag === 'optimal' ? 'green' : result.flag === 'normal' ? 'blue' :
          result.flag.includes('borderline') ? 'yellow' : result.flag.includes('critical') ? 'red' : 'red'
        }>
          {t(FLAG_LABELS[result.flag] || 'health.normal', locale)}
        </Badge>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 py-3 bg-white space-y-3 text-sm">
          {/* What is this? */}
          <div>
            <div className="font-medium text-gray-700 mb-1">{t('health.what_is_this', locale)}</div>
            <p className="text-gray-600">{locale === 'bg' && bm.description_bg ? bm.description_bg : bm.description}</p>
          </div>

          {/* What it means */}
          <div>
            <div className="font-medium text-gray-700 mb-1">{t('health.what_means', locale)}</div>
            <p className={fc.text}>
              {isHigh
                ? (locale === 'bg' && bm.high_meaning_bg ? bm.high_meaning_bg : bm.high_meaning)
                : (locale === 'bg' && bm.low_meaning_bg ? bm.low_meaning_bg : bm.low_meaning)
              }
            </p>
          </div>

          {/* Reference range */}
          <div className="flex gap-4 text-xs text-gray-500">
            <span>{t('health.reference_range', locale)}: {refMin} — {refMax} {result.unit}</span>
            {bm.optimal_min !== null && <span>Optimal: {bm.optimal_min} — {bm.optimal_max}</span>}
            {result.deviation_pct !== null && result.deviation_pct !== 0 && (
              <span className={fc.text}>{result.deviation_pct > 0 ? '+' : ''}{result.deviation_pct}% from range</span>
            )}
          </div>

          {/* How to improve */}
          {(result.flag !== 'optimal' && result.flag !== 'normal') && (
            <div>
              <div className="font-medium text-gray-700 mb-1">{t('health.how_to_improve', locale)}</div>
              <ul className="space-y-1">
                {(locale === 'bg' && bm.improve_tips_bg?.length ? bm.improve_tips_bg : bm.improve_tips || []).map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-600">
                    <span className="text-emerald-500 mt-0.5">&#10003;</span>
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


// ── Main Page Component ─────────────────────────────────────────────

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
            {/* Profile selector */}
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

        {/* Empty state */}
        {!hasData && profiles.length === 0 && (
          <EmptyState
            icon="🩸"
            message={t('health.no_profiles', locale)}
          />
        )}

        {!hasData && profiles.length > 0 && (
          <EmptyState
            icon="📋"
            message={t('health.no_reports', locale)}
          />
        )}

        {/* Dashboard content */}
        {hasData && report && (
          <>
            {/* Overall score + system scores */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
              {/* Overall score card */}
              <Card className={`text-center ${scoreBg(report.overall_score)}`}>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{t('health.overall_score', locale)}</div>
                <div className={`text-5xl font-bold ${scoreColor(report.overall_score)}`}>
                  {report.overall_score ?? '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">/100</div>
                {data.score_change !== null && data.score_change !== undefined && (
                  <div className={`text-sm mt-2 ${data.score_change > 0 ? 'text-emerald-600' : data.score_change < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                    {data.score_change > 0 ? '↑' : data.score_change < 0 ? '↓' : '→'} {Math.abs(data.score_change)} {t('health.score_change', locale)}
                  </div>
                )}
                <div className="text-xs text-gray-400 mt-2">{report.test_date} · {report.lab_name || report.lab_type}</div>
              </Card>

              {/* Body system score cards */}
              <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {Object.entries(report.system_scores).map(([system, score]) => (
                  <div key={system} className={`rounded-xl border p-3 text-center ${scoreBg(score)}`}>
                    <div className="text-2xl mb-1">{SYSTEM_ICONS[system] || '📊'}</div>
                    <div className={`text-2xl font-bold ${scoreColor(score)}`}>{score}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{t(`system.${system}`, locale)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fasting warnings */}
            {report.fasting_warnings?.length > 0 && (
              <div className="mb-4">
                {report.fasting_warnings.map((w, i) => (
                  <Alert key={i} type="error" message={`⚠️ ${w}`} />
                ))}
              </div>
            )}

            {/* Retest suggestion */}
            {report.retest_suggestion && (
              <div className="mb-6 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800">
                📅 {t('health.retest_in', locale)} <strong>{report.retest_suggestion.months} {t('health.months', locale)}</strong>
                {' — '}{locale === 'bg' ? report.retest_suggestion.note_bg : report.retest_suggestion.note}
              </div>
            )}

            {/* Category filter pills */}
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    !categoryFilter ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  onClick={() => setCategoryFilter('')}
                >
                  All ({report.results.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      categoryFilter === cat ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
                  >
                    {cat} ({resultsByCategory[cat].length})
                  </button>
                ))}
              </div>
            )}

            {/* Results list */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('health.results', locale)}</h2>
              {(categoryFilter ? [categoryFilter] : categories).map((cat) => (
                <div key={cat} className="mb-4">
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">{cat}</h3>
                  {resultsByCategory[cat].map((result) => (
                    <ResultRow key={result.id} result={result} sex={data.current_profile?.sex || 'male'} locale={locale} />
                  ))}
                </div>
              ))}
            </div>

            {/* Recommendations */}
            {report.recommendations && report.recommendations.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('health.recommendations', locale)}</h2>
                <div className="space-y-3">
                  {report.recommendations.map((rec) => (
                    <Card key={rec.id} className="flex gap-3">
                      <span className="text-2xl shrink-0">{REC_CATEGORY_ICONS[rec.category] || '💡'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm text-gray-900">
                            {locale === 'bg' && rec.title_bg ? rec.title_bg : rec.title}
                          </span>
                          <Badge color={PRIORITY_COLORS[rec.priority] as 'red' | 'yellow' | 'blue' || 'gray'}>
                            {rec.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 whitespace-pre-line">
                          {locale === 'bg' && rec.description_bg ? rec.description_bg : rec.description}
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Report history link */}
            <div className="flex gap-3">
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
