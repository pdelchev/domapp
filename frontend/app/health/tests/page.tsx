'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { getBloodReports, getHealthProfiles, apiFetch } from '../../lib/api';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Spinner, Alert, Badge } from '../../components/ui';
import Link from 'next/link';

interface BloodReport {
  id: number;
  profile: number;
  profile_name: string;
  test_date: string;
  lab_name: string;
  lab_type: string;
  overall_score: number | null;
  system_scores: Record<string, number>;
  result_count: number;
  flag_summary: Record<string, number>;
  abnormal_count: number;
  score_change: number | null;
  trend: 'up' | 'down' | 'stable' | null;
}

interface Profile {
  id: number;
  full_name: string;
}

const SYSTEM_ICONS: Record<string, string> = {
  blood: '🩸', heart: '❤️', metabolic: '⚡', liver: '🫁',
  kidney: '🫘', thyroid: '🦋', nutrition: '💊', immune: '🔥', hormonal: '⚖️',
};

type SortBy = 'date' | 'score' | 'abnormal';

export default function HealthTestsPage() {
  const { locale } = useLanguage();
  const [tab, setTab] = useState<'blood' | 'genetic'>('blood');
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<BloodReport[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [searchBiomarker, setSearchBiomarker] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [labTypeFilter, setLabTypeFilter] = useState<string>('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  const profileReports = selectedProfile
    ? reports.filter((r) => r.profile === selectedProfile)
    : [];

  // Apply filters
  const filteredReports = profileReports.filter((r) => {
    const dateTest = (!dateFrom || new Date(r.test_date) >= new Date(dateFrom))
      && (!dateTo || new Date(r.test_date) <= new Date(dateTo));
    const labTest = !labTypeFilter || r.lab_type === labTypeFilter;
    return dateTest && labTest;
  });

  // Sort
  const sortedReports = [...filteredReports].sort((a, b) => {
    if (sortBy === 'date') {
      return new Date(b.test_date).getTime() - new Date(a.test_date).getTime();
    } else if (sortBy === 'score') {
      const scoreA = a.overall_score ?? 0;
      const scoreB = b.overall_score ?? 0;
      return scoreB - scoreA;
    } else if (sortBy === 'abnormal') {
      return (b.abnormal_count ?? 0) - (a.abnormal_count ?? 0);
    }
    return 0;
  });

  const latestReport = sortedReports[0];

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/health/reports/${id}/`, { method: 'DELETE' });
      setReports(reports.filter((r) => r.id !== id));
      setDeleteConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete report');
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      for (const id of Array.from(selected)) {
        await apiFetch(`/api/health/reports/${id}/`, { method: 'DELETE' });
      }
      setReports(reports.filter((r) => !selected.has(r.id)));
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete reports');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleExportCSV = async (id?: number) => {
    setExporting(true);
    try {
      if (id) {
        const res = await fetch(`/api/health/reports/${id}/export/?format=csv`);
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `blood_report_${id}.csv`;
        a.click();
      } else if (selected.size > 0) {
        for (const reportId of Array.from(selected)) {
          const res = await fetch(`/api/health/reports/${reportId}/export/?format=csv`);
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `blood_report_${reportId}.csv`;
          a.click();
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to export');
    } finally {
      setExporting(false);
    }
  };

  const toggleSelect = (id: number) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const toggleSelectAll = () => {
    if (selected.size === sortedReports.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sortedReports.map((r) => r.id)));
    }
  };

  const getTrendIcon = (trend: string | null) => {
    if (trend === 'up') return '📈';
    if (trend === 'down') return '📉';
    if (trend === 'stable') return '→';
    return '';
  };

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

  const labs = Array.from(new Set(profileReports.map((r) => r.lab_type).filter(Boolean)));

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader title={locale === 'bg' ? 'Тестове' : 'Tests'} />

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
                  onClick={() => {
                    setSelectedProfile(profile.id);
                    setSelected(new Set());
                  }}
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

        {/* Tabs */}
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
            {/* Upload buttons */}
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

            {/* Quick Stats Bar */}
            {latestReport && (
              <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 uppercase font-medium mb-1">
                      {locale === 'bg' ? 'Последен тест' : 'Latest Test'}
                    </p>
                    <p className="text-sm font-semibold text-gray-900">
                      {new Date(latestReport.test_date).toLocaleDateString(
                        locale === 'bg' ? 'bg-BG' : 'en-US'
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase font-medium mb-1">
                      {locale === 'bg' ? 'Оценка' : 'Score'}
                    </p>
                    <p className="text-2xl font-bold text-emerald-600">
                      {latestReport.overall_score ?? '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase font-medium mb-1">
                      {locale === 'bg' ? 'Извън норма' : 'Out of Range'}
                    </p>
                    <div className="flex items-center gap-1">
                      <span className="text-2xl font-bold text-red-600">
                        {latestReport.abnormal_count ?? 0}
                      </span>
                      <span className="text-xs text-gray-600">
                        / {latestReport.result_count}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 uppercase font-medium mb-1">
                      {locale === 'bg' ? 'Тенденция' : 'Trend'}
                    </p>
                    <p className="text-2xl">
                      {getTrendIcon(latestReport.trend)}
                      <span className="text-xs text-gray-600 ml-1">
                        {latestReport.score_change
                          ? latestReport.score_change > 0
                            ? `+${latestReport.score_change}`
                            : latestReport.score_change
                          : '—'}
                      </span>
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Search & Filter */}
            <Card>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {locale === 'bg' ? 'От дата' : 'From Date'}
                    </label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {locale === 'bg' ? 'До дата' : 'To Date'}
                    </label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {locale === 'bg' ? 'Лаборатория' : 'Lab Type'}
                    </label>
                    <select
                      value={labTypeFilter}
                      onChange={(e) => setLabTypeFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="">
                        {locale === 'bg' ? 'Всички' : 'All'}
                      </option>
                      {labs.map((lab) => (
                        <option key={lab} value={lab}>
                          {lab}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </Card>

            {/* Sorting */}
            <div className="flex gap-2">
              {(['date', 'score', 'abnormal'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setSortBy(option)}
                  className={`px-3 py-2 text-sm rounded-lg transition ${
                    sortBy === option
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {option === 'date'
                    ? locale === 'bg'
                      ? '📅 Дата'
                      : '📅 Date'
                    : option === 'score'
                    ? locale === 'bg'
                      ? '⭐ Оценка'
                      : '⭐ Score'
                    : locale === 'bg'
                    ? '🔴 Извън норма'
                    : '🔴 Abnormal'}
                </button>
              ))}
            </div>

            {/* Reports Table */}
            {sortedReports.length > 0 ? (
              <Card padding={false}>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={selected.size === sortedReports.length}
                          onChange={toggleSelectAll}
                          className="rounded"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">
                        {locale === 'bg' ? 'Дата' : 'Date'}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">
                        {locale === 'bg' ? 'Лаборатория' : 'Lab'}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">
                        {locale === 'bg' ? 'Оценка' : 'Score'}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">
                        {locale === 'bg' ? 'Резултати' : 'Results'}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">
                        {locale === 'bg' ? 'Извън норма' : 'Out of Range'}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700">
                        {locale === 'bg' ? 'Действия' : 'Actions'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedReports.map((report) => (
                      <tr
                        key={report.id}
                        className="border-b border-gray-100 hover:bg-gray-50 transition"
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(report.id)}
                            onChange={() => toggleSelect(report.id)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                          {new Date(report.test_date).toLocaleDateString(
                            locale === 'bg' ? 'bg-BG' : 'en-US'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {report.lab_name}
                        </td>
                        <td className="px-4 py-3">
                          {report.overall_score !== null ? (
                            <Badge color="indigo">{report.overall_score}</Badge>
                          ) : (
                            <span className="text-sm text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {report.result_count}
                        </td>
                        <td className="px-4 py-3">
                          {report.abnormal_count > 0 ? (
                            <Badge color="red">{report.abnormal_count}</Badge>
                          ) : (
                            <span className="text-sm text-gray-500">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right space-x-1">
                          <Link href={`/health/report/${report.id}`}>
                            <Button variant="ghost" size="sm">
                              {locale === 'bg' ? 'Виж' : 'View'}
                            </Button>
                          </Link>
                          <button
                            onClick={() => handleExportCSV(report.id)}
                            disabled={exporting}
                            className="px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          >
                            {locale === 'bg' ? 'CSV' : 'CSV'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(report.id)}
                            className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg transition"
                          >
                            {locale === 'bg' ? 'Изтрий' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ) : (
              <Card className="bg-gray-50">
                <p className="text-gray-600 text-center py-8">
                  {locale === 'bg' ? 'Няма резултати' : 'No reports found'}
                </p>
              </Card>
            )}

            {/* Bulk Actions Toolbar */}
            {selected.size > 0 && (
              <div className="fixed bottom-20 left-4 right-4 bg-white border border-gray-300 rounded-lg shadow-lg p-4 flex items-center justify-between gap-4 z-50">
                <span className="text-sm font-medium text-gray-900">
                  {locale === 'bg'
                    ? `${selected.size} избрани`
                    : `${selected.size} selected`}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleExportCSV()}
                    disabled={exporting}
                  >
                    {locale === 'bg' ? 'Експортирай' : 'Export'}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteConfirm(-1)}
                    disabled={bulkDeleting}
                  >
                    {locale === 'bg' ? 'Изтрий' : 'Delete'}
                  </Button>
                </div>
              </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm !== null && (
              <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
                <Card className="w-full max-w-md">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {locale === 'bg' ? 'Изтриване на резултати' : 'Delete Reports'}
                  </h3>
                  <p className="text-sm text-gray-600 mb-6">
                    {deleteConfirm === -1
                      ? locale === 'bg'
                        ? `Сигурни ли сте, че искате да изтриете ${selected.size} резултатите?`
                        : `Are you sure you want to delete ${selected.size} reports?`
                      : locale === 'bg'
                      ? 'Сигурни ли сте, че искате да изтриете този резултат?'
                      : 'Are you sure you want to delete this report?'}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => setDeleteConfirm(null)}
                      disabled={bulkDeleting}
                    >
                      {locale === 'bg' ? 'Отмени' : 'Cancel'}
                    </Button>
                    <Button
                      variant="danger"
                      className="flex-1"
                      onClick={() => {
                        if (deleteConfirm === -1) {
                          handleBulkDelete();
                        } else {
                          handleDelete(deleteConfirm);
                        }
                      }}
                      disabled={bulkDeleting}
                    >
                      {bulkDeleting
                        ? locale === 'bg'
                          ? 'Изтриване...'
                          : 'Deleting...'
                        : locale === 'bg'
                        ? 'Изтрий'
                        : 'Delete'}
                    </Button>
                  </div>
                </Card>
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
                  {locale === 'bg' ? '🧬 Генетични тестове' : '🧬 Genetic Testing'}
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
