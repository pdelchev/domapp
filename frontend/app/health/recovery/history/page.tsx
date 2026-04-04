'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../context/LanguageContext';
import { t, Locale } from '../../../lib/i18n';
import { getWhoopRecoveryHistory } from '../../../lib/api';
import NavBar from '../../../components/NavBar';
import {
  PageShell, PageContent, PageHeader, Card, Button, Badge, Alert, Spinner, EmptyState,
} from '../../../components/ui';

// ── Types ──────────────────────────────────────────────────────────

interface RecoveryEntry {
  date: string;
  recovery_score: number;
  hrv: number;
  resting_hr: number;
  spo2: number | null;
  skin_temp: number | null;
  sleep_performance: number;
  sleep_hours: number;
  day_strain: number;
}

interface HistoryData {
  entries: RecoveryEntry[];
  total: number;
  page: number;
  pages: number;
}

// ── Helpers ────────────────────────────────────────────────────────

function recoveryBadgeColor(score: number): 'green' | 'yellow' | 'red' {
  if (score >= 67) return 'green';
  if (score >= 34) return 'yellow';
  return 'red';
}

function recoveryColor(score: number): string {
  if (score >= 67) return '#22c55e';
  if (score >= 34) return '#eab308';
  return '#ef4444';
}

type SortField = 'date' | 'recovery_score' | 'hrv' | 'resting_hr' | 'sleep_hours' | 'day_strain';
type ZoneFilter = 'all' | 'green' | 'yellow' | 'red';

// ── HRV Trend Chart ──────────────────────────────────────────────

function HrvTrendChart({ data, locale }: { data: RecoveryEntry[]; locale: Locale }) {
  if (data.length < 2) return null;

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const W = 800, H = 200, PX = 45, PY = 20;
  const values = sorted.map(d => d.hrv);
  const minV = Math.min(...values) - 5;
  const maxV = Math.max(...values) + 5;

  const xScale = (i: number) => PX + (i / (sorted.length - 1)) * (W - PX * 2);
  const yScale = (v: number) => PY + ((maxV - v) / (maxV - minV)) * (H - PY * 2);

  const points = sorted.map((d, i) => `${xScale(i)},${yScale(d.hrv)}`).join(' ');

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[500px]" preserveAspectRatio="xMidYMid meet">
        {/* Y-axis */}
        {[minV, (minV + maxV) / 2, maxV].map((v) => (
          <g key={v}>
            <line x1={PX} y1={yScale(v)} x2={W - PX} y2={yScale(v)} stroke="#f3f4f6" strokeWidth="1" />
            <text x={PX - 8} y={yScale(v) + 4} fontSize="10" fill="#9ca3af" textAnchor="end">{Math.round(v)}</text>
          </g>
        ))}
        {/* Line */}
        <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />
        {/* Points */}
        {sorted.map((d, i) => (
          <circle key={i} cx={xScale(i)} cy={yScale(d.hrv)} r="3" fill="#6366f1" stroke="white" strokeWidth="1.5" />
        ))}
        {/* X labels */}
        {sorted.filter((_, i) => i % Math.max(1, Math.floor(sorted.length / 10)) === 0).map((d) => {
          const idx = sorted.indexOf(d);
          return (
            <text key={d.date} x={xScale(idx)} y={H - 3} fontSize="9" fill="#9ca3af" textAnchor="middle">
              {new Date(d.date).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB', { day: 'numeric', month: 'short' })}
            </text>
          );
        })}
        <text x={W / 2} y={12} fontSize="11" fill="#6366f1" textAnchor="middle" fontWeight="600">
          {t('whoop.hrv_trend', locale)}
        </text>
      </svg>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function RecoveryHistoryPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<HistoryData | null>(null);
  const [page, setPage] = useState(1);
  const [zone, setZone] = useState<ZoneFilter>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (zone !== 'all') params.set('zone', zone);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      params.set('sort', sortField);
      params.set('order', sortAsc ? 'asc' : 'desc');
      const result = await getWhoopRecoveryHistory(params.toString());
      setData(result);
      setError('');
    } catch {
      setError('Failed to load recovery history');
    } finally {
      setLoading(false);
    }
  }, [page, zone, sortField, sortAsc, dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return '\u2195';
    return sortAsc ? '\u2191' : '\u2193';
  };

  const entries = data?.entries || [];

  // Filter client-side by zone (if API doesn't handle)
  const filtered = zone === 'all' ? entries : entries.filter((e) => {
    if (zone === 'green') return e.recovery_score >= 67;
    if (zone === 'yellow') return e.recovery_score >= 34 && e.recovery_score < 67;
    return e.recovery_score < 34;
  });

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('whoop.history_title', locale)}
          onBack={() => router.push('/health/recovery')}
          backLabel={t('whoop.title', locale)}
        />

        <Alert type="error" message={error} />

        {/* HRV Trend */}
        {entries.length >= 2 && (
          <Card className="mb-6">
            <HrvTrendChart data={entries} locale={locale} />
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4 items-end">
          {/* Zone filter */}
          <div className="flex gap-1.5">
            {(['all', 'green', 'yellow', 'red'] as ZoneFilter[]).map((z) => {
              const label = z === 'all' ? t('whoop.filter_all', locale) : t(`whoop.filter_${z}`, locale);
              return (
                <button key={z} onClick={() => { setZone(z); setPage(1); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    zone === z ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                  }`}>
                  {z !== 'all' && <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                    z === 'green' ? 'bg-green-500' : z === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />}
                  {label}
                </button>
              );
            })}
          </div>

          {/* Date range */}
          <div className="flex gap-2 items-end ml-auto">
            <div>
              <label className="block text-[11px] text-gray-400 mb-0.5">{locale === 'bg' ? 'От' : 'From'}</label>
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="h-8 px-2 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 mb-0.5">{locale === 'bg' ? 'До' : 'To'}</label>
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="h-8 px-2 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
        </div>

        {loading ? (
          <Spinner message={t('common.loading', locale)} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="&#x1F4C9;" message={t('whoop.no_history', locale)} />
        ) : (
          <>
            <Card padding={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
                      <th className="px-6 py-3 cursor-pointer select-none" onClick={() => handleSort('date')}>
                        {t('whoop.date', locale)} {sortIcon('date')}
                      </th>
                      <th className="px-6 py-3 cursor-pointer select-none" onClick={() => handleSort('recovery_score')}>
                        {t('whoop.recovery', locale)} {sortIcon('recovery_score')}
                      </th>
                      <th className="px-6 py-3 cursor-pointer select-none" onClick={() => handleSort('hrv')}>
                        {t('whoop.hrv', locale)} ({t('whoop.ms', locale)}) {sortIcon('hrv')}
                      </th>
                      <th className="px-6 py-3 cursor-pointer select-none" onClick={() => handleSort('resting_hr')}>
                        {t('whoop.resting_hr', locale)} {sortIcon('resting_hr')}
                      </th>
                      <th className="px-6 py-3">{t('whoop.spo2', locale)}</th>
                      <th className="px-6 py-3">{t('whoop.skin_temp', locale)}</th>
                      <th className="px-6 py-3 cursor-pointer select-none" onClick={() => handleSort('sleep_hours')}>
                        {t('whoop.sleep_performance', locale)} {sortIcon('sleep_hours')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((entry) => (
                      <tr key={entry.date} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-600 whitespace-nowrap">
                          {new Date(entry.date).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: recoveryColor(entry.recovery_score) }} />
                            <Badge color={recoveryBadgeColor(entry.recovery_score)}>
                              {entry.recovery_score}%
                            </Badge>
                          </div>
                        </td>
                        <td className="px-6 py-3 font-medium text-gray-900">{entry.hrv}</td>
                        <td className="px-6 py-3 text-gray-600">{entry.resting_hr}</td>
                        <td className="px-6 py-3 text-gray-600">{entry.spo2 !== null ? `${entry.spo2}%` : '--'}</td>
                        <td className="px-6 py-3 text-gray-600">
                          {entry.skin_temp !== null ? `${entry.skin_temp > 0 ? '+' : ''}${entry.skin_temp.toFixed(1)}\u00B0` : '--'}
                        </td>
                        <td className="px-6 py-3 text-gray-600">{entry.sleep_performance}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Pagination */}
            {data && data.pages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  &lsaquo; {locale === 'bg' ? 'Предишна' : 'Previous'}
                </Button>
                <span className="text-xs text-gray-500">
                  {page} / {data.pages}
                </span>
                <Button variant="secondary" size="sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
                  {locale === 'bg' ? 'Следваща' : 'Next'} &rsaquo;
                </Button>
              </div>
            )}
          </>
        )}
      </PageContent>
    </PageShell>
  );
}
