'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../context/LanguageContext';
import { t } from '../../../lib/i18n';
import { getBloodReports, getHealthProfiles, compareReports } from '../../../lib/api';
import NavBar from '../../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Alert, Spinner } from '../../../components/ui';
import Link from 'next/link';

interface Report {
  id: number;
  profile: number;
  test_date: string;
  lab_name: string;
  overall_score: number | null;
  system_scores: Record<string, number>;
}

interface Profile {
  id: number;
  full_name: string;
}

interface ComparisonBiomarker {
  biomarker_id: number;
  biomarker_name: string;
  biomarker_name_bg: string;
  abbreviation: string;
  unit: string;
  category: string;
  value_a: number | null;
  flag_a: string | null;
  value_b: number | null;
  flag_b: string | null;
  change: number;
  change_pct: number;
  direction: 'up' | 'down' | 'stable';
  flag_change: 'improved' | 'worsened' | 'same';
}

interface ComparisonData {
  report_a: Report;
  report_b: Report;
  comparison: ComparisonBiomarker[];
}

const SYSTEM_ICONS: Record<string, string> = {
  blood: '🩸', heart: '❤️', metabolic: '⚡', liver: '🫁',
  kidney: '🫘', thyroid: '🦋', nutrition: '💊', immune: '🔥', hormonal: '⚖️',
};

export default function ComparePage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [reportA, setReportA] = useState<Report | null>(null);
  const [reportB, setReportB] = useState<Report | null>(null);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [p] = await Promise.all([getHealthProfiles()]);
        setProfiles(p || []);
        if (p && p.length > 0) {
          setSelectedProfile(p[0].id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedProfile) return;
    const loadReports = async () => {
      try {
        const r = await getBloodReports(selectedProfile);
        const sorted = [...(r || [])].sort(
          (a, b) => new Date(b.test_date).getTime() - new Date(a.test_date).getTime()
        );
        setReports(sorted);
        if (sorted.length >= 2) {
          setReportA(sorted[sorted.length - 1]);
          setReportB(sorted[0]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load reports');
      }
    };
    loadReports();
  }, [selectedProfile]);

  useEffect(() => {
    if (!reportA || !reportB || reportA.id === reportB.id) {
      setComparison(null);
      return;
    }
    const doCompare = async () => {
      setComparing(true);
      try {
        const data = await compareReports(reportA.id, reportB.id);
        setComparison(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Comparison failed');
      } finally {
        setComparing(false);
      }
    };
    doCompare();
  }, [reportA, reportB]);

  if (loading) {
    return (
      <PageShell>
        <NavBar />
        <PageContent>
          <Spinner message={locale === 'bg' ? 'Зареждане...' : 'Loading...'} />
        </PageContent>
      </PageShell>
    );
  }

  const daysApart = reportA && reportB ? Math.round(
    (new Date(reportB.test_date).getTime() - new Date(reportA.test_date).getTime()) / (1000 * 60 * 60 * 24)
  ) : 0;

  const improved = comparison?.comparison.filter((c) => c.flag_change === 'improved').length || 0;
  const worsened = comparison?.comparison.filter((c) => c.flag_change === 'worsened').length || 0;
  const unchanged = comparison?.comparison.filter((c) => c.flag_change === 'same').length || 0;

  const newlyAbnormal = comparison?.comparison.filter(
    (c) => c.flag_a && !['critical_high', 'critical_low', 'high', 'low', 'borderline_high', 'borderline_low'].includes(c.flag_a) &&
           c.flag_b && ['critical_high', 'critical_low', 'high', 'low', 'borderline_high', 'borderline_low'].includes(c.flag_b)
  ) || [];

  const resolvedIssues = comparison?.comparison.filter(
    (c) => c.flag_a && ['critical_high', 'critical_low', 'high', 'low', 'borderline_high', 'borderline_low'].includes(c.flag_a) &&
           c.flag_b && !['critical_high', 'critical_low', 'high', 'low', 'borderline_high', 'borderline_low'].includes(c.flag_b)
  ) || [];

  const biggest = comparison?.comparison
    .filter((c) => c.change_pct)
    .sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct))
    .slice(0, 3) || [];

  const improvements = biggest.filter((c) => c.direction === 'down');
  const declines = biggest.filter((c) => c.direction === 'up');

  // Group comparison by category
  const grouped: Record<string, ComparisonBiomarker[]> = {};
  comparison?.comparison.forEach((item) => {
    if (!grouped[item.category]) {
      grouped[item.category] = [];
    }
    grouped[item.category].push(item);
  });

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={locale === 'bg' ? 'Сравни резултати' : 'Compare Reports'}
          onBack={() => router.push('/health/tests')}
        />

        {error && <Alert type="error" message={error} />}

        {/* Profile selector */}
        {profiles.length > 1 && (
          <Card className="mb-6">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">
                {locale === 'bg' ? 'Профил:' : 'Profile:'}
              </span>
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => setSelectedProfile(profile.id)}
                  className={`px-3 py-1 rounded-lg text-sm transition ${
                    selectedProfile === profile.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {profile.full_name}
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Report selectors */}
        <Card className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {locale === 'bg' ? 'От (старо)' : 'From (older)'}
              </label>
              <select
                value={reportA?.id || ''}
                onChange={(e) => {
                  const r = reports.find((rep) => rep.id === Number(e.target.value));
                  setReportA(r || null);
                }}
                className="w-full h-10 px-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">Select...</option>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {new Date(r.test_date).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-US')} — {r.lab_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {locale === 'bg' ? 'До (ново)' : 'To (newer)'}
              </label>
              <select
                value={reportB?.id || ''}
                onChange={(e) => {
                  const r = reports.find((rep) => rep.id === Number(e.target.value));
                  setReportB(r || null);
                }}
                className="w-full h-10 px-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">Select...</option>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {new Date(r.test_date).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-US')} — {r.lab_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {comparison && !comparing && reportA && reportB && (
          <>
            {/* Stats Card */}
            <Card className="mb-6 bg-gradient-to-br from-blue-50 to-blue-100/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <p className="text-xs text-gray-600 uppercase font-medium mb-1">
                    {locale === 'bg' ? 'Период' : 'Period'}
                  </p>
                  <p className="text-sm text-gray-900">
                    {new Date(reportA.test_date).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-US')} →{' '}
                    {new Date(reportB.test_date).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-US')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {daysApart} {locale === 'bg' ? 'дни' : 'days'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 uppercase font-medium mb-1">
                    {locale === 'bg' ? 'Оценка' : 'Score Change'}
                  </p>
                  <p className="text-lg font-bold text-gray-900">
                    {reportA.overall_score ?? '—'} →{' '}
                    {reportB.overall_score ?? '—'}
                    {reportA.overall_score && reportB.overall_score && (
                      <span className={reportB.overall_score - reportA.overall_score > 0 ? 'text-green-600' : 'text-red-600'}>
                        {' '}({reportB.overall_score - reportA.overall_score > 0 ? '+' : ''}{reportB.overall_score - reportA.overall_score})
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-6 border-t border-blue-200">
                <div className="text-center">
                  <p className="text-lg font-bold text-green-600">{improved}</p>
                  <p className="text-xs text-gray-600">
                    {locale === 'bg' ? 'Подобрено' : 'Improved'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-red-600">{worsened}</p>
                  <p className="text-xs text-gray-600">
                    {locale === 'bg' ? 'Влошено' : 'Worsened'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-600">{unchanged}</p>
                  <p className="text-xs text-gray-600">
                    {locale === 'bg' ? 'Непроменено' : 'Unchanged'}
                  </p>
                </div>
              </div>
            </Card>

            {/* Key Changes */}
            {(newlyAbnormal.length > 0 || resolvedIssues.length > 0 || improvements.length > 0 || declines.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {resolvedIssues.length > 0 && (
                  <Card className="bg-green-50 border border-green-200">
                    <h4 className="text-sm font-semibold text-green-900 mb-3">
                      ✅ {locale === 'bg' ? 'Решени проблеми' : 'Resolved Issues'} ({resolvedIssues.length})
                    </h4>
                    <div className="space-y-2">
                      {resolvedIssues.map((item) => (
                        <p key={item.biomarker_id} className="text-xs text-green-800">
                          • {locale === 'bg' && item.biomarker_name_bg ? item.biomarker_name_bg : item.biomarker_name}
                        </p>
                      ))}
                    </div>
                  </Card>
                )}
                {newlyAbnormal.length > 0 && (
                  <Card className="bg-red-50 border border-red-200">
                    <h4 className="text-sm font-semibold text-red-900 mb-3">
                      ⚠️ {locale === 'bg' ? 'Нови проблеми' : 'Newly Abnormal'} ({newlyAbnormal.length})
                    </h4>
                    <div className="space-y-2">
                      {newlyAbnormal.map((item) => (
                        <p key={item.biomarker_id} className="text-xs text-red-800">
                          • {locale === 'bg' && item.biomarker_name_bg ? item.biomarker_name_bg : item.biomarker_name}
                        </p>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* Biomarker Comparison Table */}
            <Card padding={false}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left font-medium text-gray-700">
                      {locale === 'bg' ? 'Биомаркер' : 'Biomarker'}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">
                      {locale === 'bg' ? 'Старо' : 'Old'}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">
                      {locale === 'bg' ? 'Ново' : 'New'}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">
                      {locale === 'bg' ? 'Промяна' : 'Change'}
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-gray-700">
                      {locale === 'bg' ? 'Статус' : 'Status'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(grouped).map(([category, items]) => (
                    <tbody key={category}>
                      <tr className="bg-gray-50 hover:bg-gray-100">
                        <td colSpan={5} className="px-4 py-2">
                          <p className="text-xs font-semibold text-gray-700 uppercase">{category}</p>
                        </td>
                      </tr>
                      {items.map((item) => (
                        <tr key={item.biomarker_id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {locale === 'bg' && item.biomarker_name_bg ? item.biomarker_name_bg : item.biomarker_name}
                            <p className="text-xs text-gray-500">{item.abbreviation}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {item.value_a !== null ? `${item.value_a.toFixed(2)} ${item.unit}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {item.value_b !== null ? `${item.value_b.toFixed(2)} ${item.unit}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium">
                            {item.change !== 0 ? `${item.change > 0 ? '+' : ''}${item.change.toFixed(2)}` : '—'}
                            {item.change_pct !== 0 && (
                              <p className="text-xs text-gray-500">
                                {item.change_pct > 0 ? '+' : ''}{item.change_pct.toFixed(1)}%
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {item.flag_change === 'improved' && (
                              <span className="text-lg">↑</span>
                            )}
                            {item.flag_change === 'worsened' && (
                              <span className="text-lg text-red-600">↓</span>
                            )}
                            {item.flag_change === 'same' && (
                              <span className="text-lg text-gray-400">→</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}

        {comparing && (
          <Card className="text-center py-8">
            <Spinner message={locale === 'bg' ? 'Сравнение...' : 'Comparing...'} />
          </Card>
        )}

        {!reportA || !reportB || reportA.id === reportB.id ? (
          <Card className="bg-amber-50 border border-amber-200 text-center py-8">
            <p className="text-sm text-amber-800">
              {locale === 'bg'
                ? 'Изберете два различни отчета за сравнение'
                : 'Select two different reports to compare'}
            </p>
          </Card>
        ) : null}
      </PageContent>
    </PageShell>
  );
}
