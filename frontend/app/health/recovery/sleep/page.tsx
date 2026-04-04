'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../context/LanguageContext';
import { t, Locale } from '../../../lib/i18n';
import { getWhoopSleepHistory } from '../../../lib/api';
import NavBar from '../../../components/NavBar';
import {
  PageShell, PageContent, PageHeader, Card, Badge, Alert, Spinner, EmptyState,
} from '../../../components/ui';

// ── Types ──────────────────────────────────────────────────────────

interface SleepEntry {
  date: string;
  total_minutes: number;
  light_minutes: number;
  deep_minutes: number;
  rem_minutes: number;
  awake_minutes: number;
  efficiency: number;
  respiratory_rate: number;
  sleep_debt_minutes: number;
  disturbances: number;
  is_nap: boolean;
  consistency_score: number | null;
}

interface SleepData {
  entries: SleepEntry[];
  averages: {
    duration: number;
    efficiency: number;
    respiratory_rate: number;
    consistency: number;
  };
  debt_trend: { date: string; debt: number }[];
  by_day_of_week: { day: number; avg_duration: number; avg_efficiency: number }[];
  naps: SleepEntry[];
}

// ── Helpers ────────────────────────────────────────────────────────

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}

const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_BG = ['\u041D\u0434', '\u041F\u043D', '\u0412\u0442', '\u0421\u0440', '\u0427\u0442', '\u041F\u0442', '\u0421\u0431'];

// ── Duration Trend Chart ─────────────────────────────────────────

function DurationTrendChart({ data, locale }: { data: SleepEntry[]; locale: Locale }) {
  const nights = data.filter(d => !d.is_nap).sort((a, b) => a.date.localeCompare(b.date));
  if (nights.length < 2) return null;

  const W = 800, H = 220, PX = 45, PY = 25;
  const values = nights.map(d => d.total_minutes / 60);
  const minV = Math.max(0, Math.min(...values) - 0.5);
  const maxV = Math.max(...values) + 0.5;

  const xScale = (i: number) => PX + (i / (nights.length - 1)) * (W - PX * 2);
  const yScale = (v: number) => PY + ((maxV - v) / (maxV - minV)) * (H - PY * 2);

  const points = nights.map((d, i) => `${xScale(i)},${yScale(d.total_minutes / 60)}`).join(' ');
  const areaPath = `M${nights.map((d, i) => `${xScale(i)},${yScale(d.total_minutes / 60)}`).join(' L')} L${xScale(nights.length - 1)},${H - PY} L${PX},${H - PY} Z`;

  // 8-hour target line
  const targetY = yScale(8);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[500px]" preserveAspectRatio="xMidYMid meet">
        {/* Target line */}
        {targetY > PY && targetY < H - PY && (
          <g>
            <line x1={PX} y1={targetY} x2={W - PX} y2={targetY} stroke="#d1d5db" strokeWidth="1" strokeDasharray="4 3" />
            <text x={W - PX + 5} y={targetY + 3} fontSize="9" fill="#9ca3af">8h</text>
          </g>
        )}

        {/* Y-axis */}
        {[minV, (minV + maxV) / 2, maxV].map((v) => (
          <text key={v} x={PX - 8} y={yScale(v) + 4} fontSize="10" fill="#9ca3af" textAnchor="end">{v.toFixed(1)}h</text>
        ))}

        {/* Area */}
        <path d={areaPath} fill="url(#sleepGradient)" />
        <defs>
          <linearGradient id="sleepGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Line */}
        <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />

        {/* Points */}
        {nights.map((d, i) => (
          <circle key={i} cx={xScale(i)} cy={yScale(d.total_minutes / 60)} r="3" fill="#6366f1" stroke="white" strokeWidth="1.5" />
        ))}

        {/* X labels */}
        {nights.filter((_, i) => i % Math.max(1, Math.floor(nights.length / 8)) === 0 || i === nights.length - 1).map((d) => {
          const idx = nights.indexOf(d);
          return (
            <text key={d.date} x={xScale(idx)} y={H - 5} fontSize="9" fill="#9ca3af" textAnchor="middle">
              {new Date(d.date).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB', { day: 'numeric', month: 'short' })}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ── Stage Stacked Bar Chart ──────────────────────────────────────

function StageStackedChart({ data, locale }: { data: SleepEntry[]; locale: Locale }) {
  const nights = data.filter(d => !d.is_nap).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  if (nights.length < 2) return null;

  const W = 800, H = 200, PX = 45, PY = 20;
  const barW = Math.max(8, Math.min(30, (W - PX * 2) / nights.length - 4));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[400px]" preserveAspectRatio="xMidYMid meet">
        {nights.map((d, i) => {
          const total = d.light_minutes + d.deep_minutes + d.rem_minutes + d.awake_minutes;
          if (total === 0) return null;
          const maxH = H - PY * 2;
          const x = PX + (i / (nights.length - 1)) * (W - PX * 2) - barW / 2;

          const stages = [
            { mins: d.awake_minutes, color: '#d1d5db' },
            { mins: d.rem_minutes, color: '#a78bfa' },
            { mins: d.deep_minutes, color: '#6366f1' },
            { mins: d.light_minutes, color: '#93c5fd' },
          ];

          let yOff = PY;
          return (
            <g key={d.date}>
              {stages.map((s, si) => {
                const h = (s.mins / total) * maxH;
                const rect = <rect key={si} x={x} y={yOff} width={barW} height={h} fill={s.color} rx="2" />;
                yOff += h;
                return rect;
              })}
              <text x={x + barW / 2} y={H - 3} fontSize="8" fill="#9ca3af" textAnchor="middle">
                {new Date(d.date).getDate()}
              </text>
            </g>
          );
        })}

        {/* Legend */}
        {[
          { label: locale === 'bg' ? '\u041B\u0435\u043A' : 'Light', color: '#93c5fd' },
          { label: locale === 'bg' ? '\u0414\u044A\u043B\u0431\u043E\u043A' : 'Deep', color: '#6366f1' },
          { label: 'REM', color: '#a78bfa' },
          { label: locale === 'bg' ? '\u0411\u0443\u0434\u0435\u043D' : 'Awake', color: '#d1d5db' },
        ].map((item, i) => (
          <g key={item.label} transform={`translate(${PX + i * 80}, ${H - 18})`}>
            <rect width="8" height="8" fill={item.color} rx="2" />
            <text x="12" y="8" fontSize="9" fill="#6b7280">{item.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── Day of Week Chart ────────────────────────────────────────────

function DayOfWeekChart({ data, locale }: { data: { day: number; avg_duration: number; avg_efficiency: number }[]; locale: Locale }) {
  if (data.length === 0) return null;
  const dayNames = locale === 'bg' ? DAY_NAMES_BG : DAY_NAMES_EN;
  const maxDur = Math.max(...data.map(d => d.avg_duration));

  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.day} className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-8">{dayNames[d.day]}</span>
          <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-400 rounded-full transition-all"
              style={{ width: `${(d.avg_duration / (maxDur || 1)) * 100}%` }} />
          </div>
          <span className="text-xs font-medium text-gray-700 w-12 text-right">{formatMinutes(d.avg_duration)}</span>
          <span className="text-xs text-gray-400 w-10 text-right">{d.avg_efficiency}%</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function SleepAnalysisPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<SleepData | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getWhoopSleepHistory('period=30d');
      setData(result);
      setError('');
    } catch {
      setError('Failed to load sleep data');
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

  if (!data || data.entries.length === 0) {
    return (
      <PageShell><NavBar /><PageContent size="lg">
        <PageHeader title={t('whoop.sleep_title', locale)} onBack={() => router.push('/health/recovery')} backLabel={t('whoop.title', locale)} />
        <Alert type="error" message={error} />
        <EmptyState icon="&#x1F634;" message={t('whoop.no_sleep_data', locale)} />
      </PageContent></PageShell>
    );
  }

  const avg = data.averages;

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('whoop.sleep_title', locale)}
          onBack={() => router.push('/health/recovery')}
          backLabel={t('whoop.title', locale)}
        />

        <Alert type="error" message={error} />

        {/* Average metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">{t('whoop.avg_duration', locale)}</div>
            <div className="text-2xl font-bold text-gray-900">{formatMinutes(avg.duration)}</div>
          </Card>
          <Card>
            <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">{t('whoop.avg_efficiency', locale)}</div>
            <div className="text-2xl font-bold" style={{ color: avg.efficiency >= 85 ? '#22c55e' : avg.efficiency >= 70 ? '#eab308' : '#ef4444' }}>
              {avg.efficiency}%
            </div>
          </Card>
          <Card>
            <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">{t('whoop.consistency', locale)}</div>
            <div className="text-2xl font-bold text-gray-900">{avg.consistency}%</div>
          </Card>
          <Card>
            <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">{t('whoop.avg_respiratory', locale)}</div>
            <div className="text-2xl font-bold text-gray-900">{avg.respiratory_rate} <span className="text-sm font-normal text-gray-400">{t('whoop.breaths_min', locale)}</span></div>
          </Card>
        </div>

        {/* Duration trend */}
        <Card className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('whoop.duration_trend', locale)}</h3>
          <DurationTrendChart data={data.entries} locale={locale} />
        </Card>

        {/* Stage breakdown stacked bars */}
        <Card className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('whoop.stage_breakdown', locale)}</h3>
          <StageStackedChart data={data.entries} locale={locale} />
        </Card>

        {/* Two columns: Sleep Debt + By Day of Week */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Sleep Debt Trend */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('whoop.sleep_debt_trend', locale)}</h3>
            {data.debt_trend.length >= 2 ? (() => {
              const sorted = [...data.debt_trend].sort((a, b) => a.date.localeCompare(b.date));
              const W = 380, H = 150, PX = 35, PY = 15;
              const values = sorted.map(d => d.debt / 60);
              const maxV = Math.max(...values, 1);
              const xScale = (i: number) => PX + (i / (sorted.length - 1)) * (W - PX * 2);
              const yScale = (v: number) => PY + ((maxV - v) / maxV) * (H - PY * 2);
              const points = sorted.map((d, i) => `${xScale(i)},${yScale(d.debt / 60)}`).join(' ');

              return (
                <div className="overflow-x-auto">
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[300px]" preserveAspectRatio="xMidYMid meet">
                    <polyline points={points} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" />
                    {sorted.map((d, i) => (
                      <circle key={i} cx={xScale(i)} cy={yScale(d.debt / 60)} r="2.5" fill="#ef4444" stroke="white" strokeWidth="1" />
                    ))}
                    {sorted.filter((_, i) => i % Math.max(1, Math.floor(sorted.length / 5)) === 0).map((d) => {
                      const idx = sorted.indexOf(d);
                      return <text key={d.date} x={xScale(idx)} y={H - 3} fontSize="8" fill="#9ca3af" textAnchor="middle">
                        {new Date(d.date).getDate()}/{new Date(d.date).getMonth() + 1}
                      </text>;
                    })}
                    <text x={PX - 5} y={PY + 5} fontSize="9" fill="#9ca3af" textAnchor="end">{maxV.toFixed(1)}h</text>
                    <text x={PX - 5} y={H - PY} fontSize="9" fill="#9ca3af" textAnchor="end">0h</text>
                  </svg>
                </div>
              );
            })() : (
              <div className="text-sm text-gray-400 text-center py-8">
                {locale === 'bg' ? 'Недостатъчно данни' : 'Not enough data'}
              </div>
            )}
          </Card>

          {/* By Day of Week */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('whoop.by_day_of_week', locale)}</h3>
            {data.by_day_of_week.length > 0 ? (
              <DayOfWeekChart data={data.by_day_of_week} locale={locale} />
            ) : (
              <div className="text-sm text-gray-400 text-center py-8">
                {locale === 'bg' ? 'Недостатъчно данни' : 'Not enough data'}
              </div>
            )}
          </Card>
        </div>

        {/* Naps */}
        {data.naps.length > 0 && (
          <Card className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('whoop.naps', locale)} ({data.naps.length})</h3>
            <div className="space-y-2">
              {data.naps.slice(0, 10).map((nap, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-600">
                    {new Date(nap.date).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <div className="flex items-center gap-3">
                    <Badge color="blue">{formatMinutes(nap.total_minutes)}</Badge>
                    <span className="text-xs text-gray-400">{nap.efficiency}% eff.</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </PageContent>
    </PageShell>
  );
}
