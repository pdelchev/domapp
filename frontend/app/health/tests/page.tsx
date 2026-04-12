'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { getBloodReports, getHealthProfiles } from '../../lib/api';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Spinner, Alert, Badge } from '../../components/ui';
import Link from 'next/link';

interface BloodReport {
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

const SYSTEM_ICONS: Record<string, string> = {
  blood: '🩸', heart: '❤️', metabolic: '⚡', liver: '🫁',
  kidney: '🫘', thyroid: '🦋', nutrition: '💊', immune: '🔥', hormonal: '⚖️',
};

export default function HealthTestsPage() {
  const { locale } = useLanguage();
  const [tab, setTab] = useState<'blood' | 'genetic'>('blood');
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<BloodReport[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const [reportsData, profilesData] = await Promise.all([
          getBloodReports(),
          getHealthProfiles(),
        ]);
        setReports(reportsData || []);
        setProfiles(profilesData || []);
        if (profilesData && profilesData.length > 0) {
          setSelectedProfile(profilesData[0].id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load tests');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const filteredReports = selectedProfile
    ? reports.filter((r) => r.profile === selectedProfile)
    : [];

  const sortedReports = [...filteredReports].sort(
    (a, b) => new Date(b.test_date).getTime() - new Date(a.test_date).getTime()
  );

  const latestReport = sortedReports[0];

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

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={locale === 'bg' ? 'Тестове' : 'Tests'}
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

        {/* Tab buttons */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            onClick={() => setTab('blood')}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition ${
              tab === 'blood'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            🩸 {locale === 'bg' ? 'Кръвни резултати' : 'Blood Results'}
          </button>
          <button
            onClick={() => setTab('genetic')}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition ${
              tab === 'genetic'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            🧬 {locale === 'bg' ? 'Генетични тестове' : 'Genetic Testing'}
          </button>
        </div>

        {/* Blood Results Tab */}
        {tab === 'blood' && (
          <div className="space-y-6">
            {/* Upload button */}
            <div className="flex gap-2">
              <Link href="/health/upload" className="flex-1">
                <Button variant="primary" className="w-full">
                  ⬆️ {locale === 'bg' ? 'Качи резултати' : 'Upload Results'}
                </Button>
              </Link>
              <Link href="/health/upload" className="flex-1">
                <Button variant="secondary" className="w-full">
                  ✏️ {locale === 'bg' ? 'Въведи ръчно' : 'Manual Entry'}
                </Button>
              </Link>
            </div>

            {/* Latest Report Summary */}
            {latestReport ? (
              <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {locale === 'bg' ? 'Последни резултати' : 'Latest Results'}
                  </h3>
                  <span className="text-sm text-gray-600">
                    {new Date(latestReport.test_date).toLocaleDateString(
                      locale === 'bg' ? 'bg-BG' : 'en-US'
                    )}
                  </span>
                </div>

                {/* Lab info */}
                <div className="mb-4 text-sm text-gray-700">
                  <p>{latestReport.lab_name}</p>
                </div>

                {/* Overall Score */}
                {latestReport.overall_score !== null && (
                  <div className="mb-6">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl font-bold text-emerald-600">
                        {latestReport.overall_score}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          {locale === 'bg' ? 'Обща оценка' : 'Overall Score'}
                        </p>
                        <p className="text-xs text-gray-600">
                          {locale === 'bg' ? 'от 100' : 'out of 100'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* System Scores */}
                {Object.keys(latestReport.system_scores).length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(latestReport.system_scores).map(([system, score]) => (
                      <div
                        key={system}
                        className="bg-white rounded-lg p-3 border border-emerald-200"
                      >
                        <div className="text-lg mb-1">
                          {SYSTEM_ICONS[system] || '📊'}
                        </div>
                        <p className="text-xs font-medium text-gray-700 capitalize mb-1">
                          {system}
                        </p>
                        <p className="text-sm font-bold text-emerald-600">{score}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* View Full Report Link */}
                <div className="mt-6 pt-4 border-t border-emerald-200">
                  <Link href={`/health/report/${latestReport.id}`}>
                    <Button variant="secondary" className="w-full">
                      {locale === 'bg' ? 'Виж подробно' : 'View Full Report'} →
                    </Button>
                  </Link>
                </div>
              </Card>
            ) : (
              <Card className="bg-gray-50">
                <p className="text-gray-600 text-center py-8">
                  {locale === 'bg'
                    ? 'Няма качени резултати'
                    : 'No uploaded results'}
                </p>
              </Card>
            )}

            {/* Previous Reports */}
            {sortedReports.length > 1 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {locale === 'bg' ? 'Предишни резултати' : 'Previous Results'}
                </h3>
                <div className="space-y-2">
                  {sortedReports.slice(1).map((report) => (
                    <Link key={report.id} href={`/health/report/${report.id}`}>
                      <Card className="hover:bg-gray-50 transition cursor-pointer">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">
                              {report.lab_name}
                            </p>
                            <p className="text-sm text-gray-600">
                              {new Date(report.test_date).toLocaleDateString(
                                locale === 'bg' ? 'bg-BG' : 'en-US'
                              )}
                            </p>
                          </div>
                          {report.overall_score !== null && (
                            <Badge color="indigo">{report.overall_score}</Badge>
                          )}
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Genetic Testing Tab */}
        {tab === 'genetic' && (
          <div className="space-y-6">
            <Card className="bg-blue-50 border border-blue-200">
              <div className="text-center py-8">
                <p className="text-lg text-gray-700 mb-4">
                  {locale === 'bg'
                    ? '🧬 Генетични тестове'
                    : '🧬 Genetic Testing'}
                </p>
                <p className="text-gray-600 mb-6">
                  {locale === 'bg'
                    ? 'Управление и анализ на генетични резултати'
                    : 'Manage and analyze genetic test results'}
                </p>
                <Link href="/health/genetic">
                  <Button variant="primary">
                    {locale === 'bg' ? 'Отвори генетични данни' : 'Open Genetic Data'}
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}
