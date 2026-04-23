'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { getBloodReports, getHealthProfiles, getBiomarkerHistory } from '../../lib/api';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Badge, Alert, Spinner } from '../../components/ui';
import Link from 'next/link';

interface Report {
  id: number;
  profile: number;
  test_date: string;
  lab_name: string;
  overall_score: number | null;
  system_scores: Record<string, number>;
  result_count: number;
  flag_summary: Record<string, number>;
}

interface Profile {
  id: number;
  full_name: string;
}

interface HistoryItem {
  report_id: number;
  test_date: string;
  value: number;
  unit: string;
  flag: string;
  deviation_pct: number;
  change: number;
  change_pct: number;
  direction: 'up' | 'down' | 'stable';
}

interface BiomarkerHistory {
  biomarker: { id: number; name: string; name_bg: string; category_name: string };
  history: HistoryItem[];
}

const SYSTEM_ICONS: Record<string, string> = {
  blood: '🩸', heart: '❤️', metabolic: '⚡', liver: '🫁',
  kidney: '🫘', thyroid: '🦋', nutrition: '💊', immune: '🔥', hormonal: '⚖️',
};

const scaleToColor = (score: number): string => {
  if (score >= 85) return '#10b981'; // green
  if (score >= 70) return '#eab308'; // yellow
  if (score >= 50) return '#f97316'; // orange
  return '#ef4444'; // red
};

export default function StatsPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [biomarkerHistories, setBiomarkerHistories] = useState<Map<number, BiomarkerHistory>>(new Map());
  const [loadingHistories, setLoadingHistories] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const p = await getHealthProfiles();
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
        setLoading(true);
        const r = await getBloodReports(selectedProfile);
        const sorted = [...(r || [])].sort(
          (a, b) => new Date(a.test_date).getTime() - new Date(b.test_date).getTime()
        );
        setReports(sorted);

        // Load biomarker histories
        setLoadingHistories(true);
        const histories = new Map<number, BiomarkerHistory>();
        const biomarkerIds = new Set<number>();

        sorted.forEach((report) => {
          // Count abnormal biomarkers for frequency calculation
          report.flag_summary;
        });

        // For now, we'll calculate stats from report data
        // In a full implementation, we'd fetch individual biomarker histories
        setBiomarkerHistories(histories);
        setLoadingHistories(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load reports');
      } finally {
        setLoading(false);
      }
    };
    loadReports();
  }, [selectedProfile]);

  // Compute derived stats
  const stats = useMemo(() => {
    if (reports.length === 0) {
      return {
        totalReports: 0,
        latestScore: null,
        bestScore: null,
        worstScore: null,
        scoreRange: 0,
        trend: 'stable' as 'up' | 'down' | 'stable',
        systems: [] as string[],
      };
    }

    const sorted = [...reports].sort(
      (a, b) => new Date(b.test_date).getTime() - new Date(a.test_date).getTime()
    );

    const scores = sorted.map((r) => r.overall_score).filter((s): s is number => s !== null && s !== undefined);
    const latest = scores[0] || null;
    const best = Math.max(...scores);
    const worst = Math.min(...scores);

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (scores.length >= 2) {
      const delta = scores[0] - scores[1];
      if (delta > 1) trend = 'up';
      else if (delta < -1) trend = 'down';
    }

    const systems = new Set<string>();
    sorted.forEach((r) => {
      Object.keys(r.system_scores).forEach((s) => systems.add(s));
    });

    return {
      totalReports: reports.length,
      latestScore: latest,
      bestScore: best,
      worstScore: worst,
      scoreRange: best - worst,
      trend,
      systems: Array.from(systems).sort(),
    };
  }, [reports]);

  // Abnormal biomarkers frequency analysis
  const abnormalBiomarkers = useMemo(() => {
    const markers: Map<
      string,
      { count: number; name: string; name_bg: string; category: string; latestValue?: number; latestUnit?: string; latestFlag?: string }
    > = new Map();

    reports.forEach((report) => {
      const abnormal = report.flag_summary.abnormal || 0;
      const critical = report.flag_summary.critical || 0;
      const borderline = report.flag_summary.borderline || 0;

      // This is a simplified version - in reality we'd track individual biomarkers
      // For now we show aggregate stats
    });

    return Array.from(markers.values()).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [reports]);

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

  // Timeline visualization (simple bar chart)
  const minScore = Math.min(...reports.map((r) => r.overall_score ?? 0).filter((s) => s > 0), 100);
  const maxScore = Math.max(...reports.map((r) => r.overall_score ?? 0), 0);

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={locale === 'bg' ? 'Статистика' : 'Blood Stats'}
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

        {/* Quick Stats Bar */}
        {reports.length > 0 && (
          <Card className="mb-6 bg-gradient-to-r from-indigo-50 to-blue-50">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-xs text-gray-600 uppercase font-medium mb-1">
                  {locale === 'bg' ? 'Тестове' : 'Reports'}
                </p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalReports}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 uppercase font-medium mb-1">
                  {locale === 'bg' ? 'Последна' : 'Latest'}
                </p>
                <p className="text-2xl font-bold text-indigo-600">{stats.latestScore ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 uppercase font-medium mb-1">
                  {locale === 'bg' ? 'Най-добра' : 'Best'}
                </p>
                <p className="text-2xl font-bold text-green-600">{stats.bestScore}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 uppercase font-medium mb-1">
                  {locale === 'bg' ? 'Най-лоша' : 'Worst'}
                </p>
                <p className="text-2xl font-bold text-red-600">{stats.worstScore}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 uppercase font-medium mb-1">
                  {locale === 'bg' ? 'Тренд' : 'Trend'}
                </p>
                <p className="text-2xl">
                  {stats.trend === 'up' ? '📈' : stats.trend === 'down' ? '📉' : '→'}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Timeline Chart */}
        {reports.length > 0 && (
          <Card className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {locale === 'bg' ? 'Развитие на оценката' : 'Score Timeline'}
            </h3>
            <div className="space-y-3">
              {reports.map((report, idx) => (
                <div key={report.id} className="flex items-center gap-3">
                  <div className="w-24 text-xs text-gray-600 shrink-0">
                    {new Date(report.test_date).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-US')}
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-4 relative overflow-hidden">
                      {report.overall_score && (
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${((report.overall_score - minScore) / (maxScore - minScore)) * 100}%`,
                            backgroundColor: scaleToColor(report.overall_score),
                          }}
                        />
                      )}
                    </div>
                    <div className="w-12 text-right text-sm font-medium text-gray-900">
                      {report.overall_score ?? '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* System Scores Heatmap */}
        {reports.length > 0 && stats.systems.length > 0 && (
          <Card className="mb-6 overflow-x-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {locale === 'bg' ? 'Система оценки' : 'System Scores Heatmap'}
            </h3>
            <div className="flex">
              {/* Row labels */}
              <div className="flex flex-col justify-center mr-2">
                {stats.systems.map((sys) => (
                  <div key={sys} className="h-10 flex items-center text-xs font-medium text-gray-700 py-1 pr-2 text-right">
                    {SYSTEM_ICONS[sys] || '📊'} {sys}
                  </div>
                ))}
              </div>

              {/* Heatmap grid */}
              <div className="flex gap-px bg-gray-200 p-px rounded">
                {reports.map((report) => (
                  <div key={report.id} className="flex flex-col gap-px">
                    {/* Date header */}
                    <div className="h-6 flex items-center justify-center text-xs text-gray-600 px-1 whitespace-nowrap">
                      {new Date(report.test_date).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                    {/* Cells */}
                    {stats.systems.map((sys) => {
                      const score = report.system_scores[sys];
                      return (
                        <div
                          key={`${report.id}-${sys}`}
                          className="w-10 h-10 flex items-center justify-center text-xs font-medium text-white rounded-sm"
                          style={{ backgroundColor: scaleToColor(score || 0) }}
                          title={`${sys}: ${score || 0}`}
                        >
                          {score !== undefined && score !== null ? Math.round(score) : '—'}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Abnormal Biomarkers */}
        <Card className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {locale === 'bg' ? 'Биомаркери извън норма' : 'Abnormal Biomarkers'}
          </h3>

          {reports.some((r) => (r.flag_summary.abnormal || 0) + (r.flag_summary.critical || 0) + (r.flag_summary.borderline || 0) > 0) ? (
            <div className="space-y-3">
              {reports.map((report) => {
                const abnormalCount =
                  (report.flag_summary.abnormal || 0) +
                  (report.flag_summary.critical || 0) +
                  (report.flag_summary.borderline || 0);
                if (abnormalCount === 0) return null;

                return (
                  <Link key={report.id} href={`/health/report/${report.id}`}>
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 hover:bg-amber-100 transition cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {new Date(report.test_date).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-US')}
                          </p>
                          <p className="text-xs text-gray-600">
                            {abnormalCount} {locale === 'bg' ? 'биомаркера извън норма' : 'biomarkers out of range'}
                          </p>
                        </div>
                        <Badge color="red">{abnormalCount}</Badge>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-600 text-center py-6">
              {locale === 'bg'
                ? 'Всички биомаркери са в норма'
                : 'All biomarkers are within normal range'}
            </p>
          )}
        </Card>

        {/* Empty State */}
        {reports.length === 0 && (
          <Card className="text-center py-12">
            <p className="text-gray-600 mb-4">
              {locale === 'bg' ? 'Няма данни за анализ' : 'No data to display'}
            </p>
            <Link href="/health/upload">
              <button className="text-indigo-600 hover:text-indigo-700 font-medium">
                {locale === 'bg' ? 'Качи първия тест' : 'Upload first test'}
              </button>
            </Link>
          </Card>
        )}
      </PageContent>
    </PageShell>
  );
}
