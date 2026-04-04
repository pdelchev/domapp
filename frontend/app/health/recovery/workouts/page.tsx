'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../context/LanguageContext';
import { t, Locale } from '../../../lib/i18n';
import { getWhoopWorkouts } from '../../../lib/api';
import NavBar from '../../../components/NavBar';
import {
  PageShell, PageContent, PageHeader, Card, Badge, Alert, Spinner, EmptyState,
} from '../../../components/ui';

// ── Types ──────────────────────────────────────────────────────────

interface Workout {
  id: number;
  date: string;
  sport: string;
  duration_minutes: number;
  strain: number;
  avg_hr: number;
  max_hr: number;
  calories: number;
  hr_zones: number[];
}

interface WorkoutData {
  workouts: Workout[];
  strain_trend: { date: string; strain: number }[];
  top_activities: { sport: string; count: number; avg_strain: number; total_calories: number }[];
  weekly_summary: { week: string; total_strain: number; workout_count: number; avg_strain: number }[];
}

// ── Helpers ────────────────────────────────────────────────────────

const SPORT_ICONS: Record<string, string> = {
  'Running': '\uD83C\uDFC3', 'Cycling': '\uD83D\uDEB4', 'Swimming': '\uD83C\uDFCA',
  'Weightlifting': '\uD83C\uDFCB\uFE0F', 'CrossFit': '\uD83D\uDCAA', 'Yoga': '\uD83E\uDDD8',
  'HIIT': '\u26A1', 'Walking': '\uD83D\uDEB6', 'Rowing': '\uD83D\uDEA3',
  'Boxing': '\uD83E\uDD4A', 'Tennis': '\uD83C\uDFBE', 'Basketball': '\uD83C\uDFC0',
  'Football': '\u26BD', 'Hiking': '\u26F0\uFE0F', 'Dance': '\uD83D\uDC83',
  'Pilates': '\uD83E\uDDD8', 'Skiing': '\u26F7\uFE0F', 'Golf': '\u26F3',
};

function sportIcon(sport: string): string {
  return SPORT_ICONS[sport] || '\uD83C\uDFCB\uFE0F';
}

function strainColor(strain: number): string {
  if (strain < 7) return 'blue';
  if (strain < 14) return 'yellow';
  return 'red';
}

// ── Strain Trend Chart ──────────────────────────────────────────

function StrainTrendChart({ data, locale }: { data: { date: string; strain: number }[]; locale: Locale }) {
  if (data.length < 2) return null;

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const W = 800, H = 200, PX = 40, PY = 20;
  const values = sorted.map(d => d.strain);
  const maxV = Math.max(...values, 21);

  const xScale = (i: number) => PX + (i / (sorted.length - 1)) * (W - PX * 2);
  const yScale = (v: number) => PY + ((maxV - v) / maxV) * (H - PY * 2);

  const barW = Math.max(4, Math.min(20, (W - PX * 2) / sorted.length - 2));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[500px]" preserveAspectRatio="xMidYMid meet">
        {/* Threshold lines */}
        {[7, 14].map((v) => (
          <line key={v} x1={PX} y1={yScale(v)} x2={W - PX} y2={yScale(v)} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 3" />
        ))}

        {/* Bars */}
        {sorted.map((d, i) => {
          const x = xScale(i) - barW / 2;
          const barH = H - PY - yScale(d.strain);
          const color = d.strain < 7 ? '#93c5fd' : d.strain < 14 ? '#fbbf24' : '#f87171';
          return (
            <rect key={i} x={x} y={yScale(d.strain)} width={barW} height={barH} fill={color} rx="2" />
          );
        })}

        {/* Y labels */}
        {[0, 7, 14, 21].map((v) => (
          <text key={v} x={PX - 8} y={yScale(v) + 4} fontSize="9" fill="#9ca3af" textAnchor="end">{v}</text>
        ))}

        {/* X labels */}
        {sorted.filter((_, i) => i % Math.max(1, Math.floor(sorted.length / 8)) === 0).map((d) => {
          const idx = sorted.indexOf(d);
          return (
            <text key={d.date} x={xScale(idx)} y={H - 3} fontSize="8" fill="#9ca3af" textAnchor="middle">
              {new Date(d.date).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB', { day: 'numeric', month: 'short' })}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ── HR Zone Bar ──────────────────────────────────────────────────

function HrZoneBar({ zones }: { zones: number[] }) {
  const total = zones.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const colors = ['bg-gray-300', 'bg-blue-300', 'bg-green-400', 'bg-yellow-400', 'bg-red-400'];

  return (
    <div className="flex h-2 rounded-full overflow-hidden">
      {zones.map((z, i) => (
        <div key={i} className={`${colors[i] || 'bg-gray-200'}`}
          style={{ width: `${((z / total) * 100).toFixed(1)}%` }} />
      ))}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function WorkoutHistoryPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<WorkoutData | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getWhoopWorkouts('period=30d');
      setData(result);
      setError('');
    } catch {
      setError('Failed to load workout data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <PageShell><NavBar /><PageContent size="lg">
        <Spinner message={t('common.loading', locale)} />
      </PageContent></PageShell>
    );
  }

  if (!data || data.workouts.length === 0) {
    return (
      <PageShell><NavBar /><PageContent size="lg">
        <PageHeader title={t('whoop.workouts_title', locale)} onBack={() => router.push('/health/recovery')} backLabel={t('whoop.title', locale)} />
        <Alert type="error" message={error} />
        <EmptyState icon="&#x1F3CB;&#xFE0F;" message={t('whoop.no_workouts', locale)} />
      </PageContent></PageShell>
    );
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('whoop.workouts_title', locale)}
          onBack={() => router.push('/health/recovery')}
          backLabel={t('whoop.title', locale)}
        />

        <Alert type="error" message={error} />

        {/* Strain trend */}
        {data.strain_trend.length >= 2 && (
          <Card className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('whoop.strain_trend', locale)}</h3>
            <StrainTrendChart data={data.strain_trend} locale={locale} />
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Top Activities */}
          <Card className="lg:col-span-1">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('whoop.top_activities', locale)}</h3>
            <div className="space-y-3">
              {data.top_activities.map((act) => (
                <div key={act.sport} className="flex items-center gap-3">
                  <span className="text-xl">{sportIcon(act.sport)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{act.sport}</div>
                    <div className="text-[10px] text-gray-400">
                      {act.count}x &middot; {t('whoop.strain', locale)}: {act.avg_strain.toFixed(1)} &middot; {act.total_calories} {t('whoop.cal', locale)}
                    </div>
                  </div>
                  <Badge color="indigo">{act.count}</Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* Weekly Summary */}
          <Card className="lg:col-span-2">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('whoop.weekly_summary', locale)}</h3>
            {data.weekly_summary.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
                      <th className="px-4 py-2">{locale === 'bg' ? 'Седмица' : 'Week'}</th>
                      <th className="px-4 py-2">{locale === 'bg' ? 'Тренировки' : 'Workouts'}</th>
                      <th className="px-4 py-2">{locale === 'bg' ? 'Общо натоварване' : 'Total Strain'}</th>
                      <th className="px-4 py-2">{locale === 'bg' ? 'Ср. натоварване' : 'Avg Strain'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.weekly_summary.map((w) => (
                      <tr key={w.week} className="border-b border-gray-50">
                        <td className="px-4 py-2 text-gray-600">{w.week}</td>
                        <td className="px-4 py-2 font-medium text-gray-900">{w.workout_count}</td>
                        <td className="px-4 py-2">
                          <Badge color={strainColor(w.total_strain / Math.max(w.workout_count, 1)) as 'blue' | 'yellow' | 'red'}>
                            {w.total_strain.toFixed(1)}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-gray-600">{w.avg_strain.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-gray-400 text-center py-8">{locale === 'bg' ? 'Недостатъчно данни' : 'Not enough data'}</div>
            )}
          </Card>
        </div>

        {/* Workout List */}
        <Card padding={false}>
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">{t('whoop.workouts_title', locale)}</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {data.workouts.map((w) => (
              <div key={w.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  {/* Sport icon */}
                  <span className="text-2xl">{sportIcon(w.sport)}</span>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-gray-900">{w.sport}</span>
                      <Badge color={strainColor(w.strain) as 'blue' | 'yellow' | 'red'}>
                        {t('whoop.strain', locale)}: {w.strain.toFixed(1)}
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(w.date).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {' \u00B7 '}{w.duration_minutes} {t('whoop.minutes', locale)}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="flex gap-4 text-xs text-gray-500 shrink-0">
                    <div className="text-center">
                      <div className="text-[10px] text-gray-400">{t('whoop.calories', locale)}</div>
                      <div className="font-semibold text-gray-900">{w.calories}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-gray-400">{t('whoop.avg_hr', locale)}</div>
                      <div className="font-semibold text-gray-900">{w.avg_hr}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-gray-400">{t('whoop.max_hr', locale)}</div>
                      <div className="font-semibold text-gray-900">{w.max_hr}</div>
                    </div>
                  </div>
                </div>

                {/* HR Zones */}
                {w.hr_zones.length > 0 && (
                  <div className="mt-2 ml-10">
                    <HrZoneBar zones={w.hr_zones} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </PageContent>
    </PageShell>
  );
}
