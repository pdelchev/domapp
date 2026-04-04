'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { Locale } from '../../lib/i18n';
import {
  getWhoopStatus, getWhoopConnectUrl, whoopCallback, whoopSync,
  whoopDisconnect, getWhoopDashboard,
} from '../../lib/api';
import NavBar from '../../components/NavBar';
import {
  PageShell, PageContent, Card, Button, Badge, Alert, Spinner, EmptyState,
} from '../../components/ui';

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

interface SleepSummary {
  total_minutes: number;
  light_minutes: number;
  deep_minutes: number;
  rem_minutes: number;
  awake_minutes: number;
  efficiency: number;
  respiratory_rate: number;
  sleep_debt_minutes: number;
  disturbances: number;
}

interface Workout {
  sport: string;
  duration_minutes: number;
  strain: number;
  avg_hr: number;
  max_hr: number;
  calories: number;
  hr_zones: number[];
}

interface CvFactor {
  label: string;
  score: number;
  available: boolean;
}

interface DashboardData {
  connected: boolean;
  last_sync: string | null;
  recovery: RecoveryEntry | null;
  yesterday_recovery: number | null;
  hrv_sparkline: number[];
  rhr_sparkline: number[];
  sleep: SleepSummary | null;
  strain: { day_strain: number; calories: number } | null;
  latest_workout: Workout | null;
  cv_fitness: { score: number | null; factors: CvFactor[]; has_bp: boolean } | null;
  recent_history: RecoveryEntry[];
}

// ── Helpers ────────────────────────────────────────────────────────

function recoveryColor(score: number): string {
  if (score >= 67) return '#22c55e';
  if (score >= 34) return '#eab308';
  return '#ef4444';
}

function recoveryBadgeColor(score: number): 'green' | 'yellow' | 'red' {
  if (score >= 67) return 'green';
  if (score >= 34) return 'yellow';
  return 'red';
}

function recoveryZone(score: number, locale: Locale): string {
  if (score >= 67) return t('whoop.green_zone', locale);
  if (score >= 34) return t('whoop.yellow_zone', locale);
  return t('whoop.red_zone', locale);
}

function trendArrow(current: number, previous: number | null): string {
  if (previous === null) return '';
  if (current > previous) return '\u2191';
  if (current < previous) return '\u2193';
  return '\u2192';
}

function trendColor(current: number, previous: number | null): string {
  if (previous === null) return 'text-gray-400';
  if (current > previous) return 'text-emerald-600';
  if (current < previous) return 'text-red-600';
  return 'text-gray-500';
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}

function timeAgo(dateStr: string, locale: Locale): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return locale === 'bg' ? 'Току-що' : 'Just now';
  if (mins < 60) return `${mins} ${locale === 'bg' ? 'мин назад' : 'min ago'}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ${locale === 'bg' ? 'ч назад' : 'h ago'}`;
  const days = Math.floor(hrs / 24);
  return `${days} ${locale === 'bg' ? 'дни назад' : 'd ago'}`;
}

// ── Recovery Score Ring ───────────────────────────────────────────

function RecoveryRing({ score, size = 100 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = recoveryColor(score);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
      </svg>
      <span className="absolute text-3xl font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

// ── Mini Sparkline ───────────────────────────────────────────────

function Sparkline({ data, color = '#6366f1', height = 32, width = 100 }: {
  data: number[]; color?: string; height?: number; width?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`
  ).join(' ');

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Strain Gauge ─────────────────────────────────────────────────

function StrainGauge({ value, max = 21 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = value < 7 ? '#3b82f6' : value < 14 ? '#eab308' : '#ef4444';
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>0</span>
        <span>{max}</span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Sleep Stage Bar ──────────────────────────────────────────────

function SleepStageBar({ sleep, locale }: { sleep: SleepSummary; locale: Locale }) {
  const total = sleep.light_minutes + sleep.deep_minutes + sleep.rem_minutes + sleep.awake_minutes;
  if (total === 0) return null;
  const pct = (v: number) => ((v / total) * 100).toFixed(1);

  const stages = [
    { key: 'light', mins: sleep.light_minutes, color: 'bg-blue-300', label: t('whoop.light', locale) },
    { key: 'deep', mins: sleep.deep_minutes, color: 'bg-indigo-500', label: t('whoop.deep', locale) },
    { key: 'rem', mins: sleep.rem_minutes, color: 'bg-purple-400', label: t('whoop.rem', locale) },
    { key: 'awake', mins: sleep.awake_minutes, color: 'bg-gray-300', label: t('whoop.awake', locale) },
  ];

  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden mb-2">
        {stages.map((s) => (
          <div key={s.key} className={`${s.color} transition-all`} style={{ width: `${pct(s.mins)}%` }}
            title={`${s.label}: ${formatMinutes(s.mins)}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        {stages.map((s) => (
          <div key={s.key} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${s.color}`} />
            <span>{s.label} {formatMinutes(s.mins)} ({pct(s.mins)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── HR Zone Bar ──────────────────────────────────────────────────

function HrZoneBar({ zones }: { zones: number[] }) {
  const total = zones.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const colors = ['bg-gray-300', 'bg-blue-300', 'bg-green-400', 'bg-yellow-400', 'bg-red-400'];
  const labels = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden mb-1.5">
        {zones.map((z, i) => (
          <div key={i} className={`${colors[i] || 'bg-gray-200'} transition-all`}
            style={{ width: `${((z / total) * 100).toFixed(1)}%` }} />
        ))}
      </div>
      <div className="flex gap-2 text-[10px] text-gray-400">
        {zones.map((z, i) => (
          <span key={i} className="flex items-center gap-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${colors[i]}`} /> {labels[i]} {Math.round((z / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Recovery Trend Chart ─────────────────────────────────────────

function RecoveryTrendChart({ data, locale }: { data: RecoveryEntry[]; locale: Locale }) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        {locale === 'bg' ? 'Необходими са поне 2 записа за графика' : 'At least 2 records needed for chart'}
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const W = 800, H = 240, PX = 40, PY = 25;

  const xScale = (i: number) => PX + (i / (sorted.length - 1)) * (W - PX * 2);
  const yScale = (v: number) => PY + ((100 - v) / 100) * (H - PY * 2);

  // Area path
  const linePoints = sorted.map((d, i) => `${xScale(i)},${yScale(d.recovery_score)}`);
  const areaPath = `M${linePoints[0]} ${linePoints.slice(1).map(p => `L${p}`).join(' ')} L${xScale(sorted.length - 1)},${H - PY} L${PX},${H - PY} Z`;

  // Zone backgrounds
  const zones = [
    { y1: 0, y2: 33, color: 'rgba(239,68,68,0.06)' },
    { y1: 33, y2: 66, color: 'rgba(234,179,8,0.06)' },
    { y1: 66, y2: 100, color: 'rgba(34,197,94,0.06)' },
  ];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[500px]" preserveAspectRatio="xMidYMid meet">
        {/* Zone backgrounds */}
        {zones.map((z, i) => (
          <rect key={i} x={PX} y={yScale(z.y2)} width={W - PX * 2} height={yScale(z.y1) - yScale(z.y2)}
            fill={z.color} />
        ))}

        {/* Zone threshold lines */}
        {[33, 67].map((v) => (
          <line key={v} x1={PX} y1={yScale(v)} x2={W - PX} y2={yScale(v)}
            stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 3" />
        ))}

        {/* Y-axis labels */}
        {[0, 25, 50, 75, 100].map((v) => (
          <text key={v} x={PX - 8} y={yScale(v) + 4} fontSize="10" fill="#9ca3af" textAnchor="end">{v}%</text>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#recoveryGradient)" />
        <defs>
          <linearGradient id="recoveryGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Line */}
        <polyline points={linePoints.join(' ')} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinejoin="round" />

        {/* Points */}
        {sorted.map((d, i) => (
          <circle key={i} cx={xScale(i)} cy={yScale(d.recovery_score)} r="4"
            fill={recoveryColor(d.recovery_score)} stroke="white" strokeWidth="2" />
        ))}

        {/* X-axis dates */}
        {sorted.filter((_, i) => i % Math.max(1, Math.floor(sorted.length / 8)) === 0 || i === sorted.length - 1).map((d, _i, arr) => {
          const idx = sorted.indexOf(d);
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

// ── CV Fitness Card ──────────────────────────────────────────────

function CvFitnessCard({ cv, locale, router }: {
  cv: { score: number | null; factors: CvFactor[]; has_bp: boolean };
  locale: Locale;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <Card>
      <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('whoop.cv_fitness', locale)}</h3>

      {!cv.has_bp && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
          <span>&#x1F4CA;</span>
          <span>{t('whoop.add_bp_data', locale)}</span>
          <Button size="sm" variant="secondary" onClick={() => router.push('/health/bp')} className="ml-auto shrink-0">
            {t('nav.bp', locale)}
          </Button>
        </div>
      )}

      {cv.score !== null && (
        <div className="flex items-center gap-4 mb-4">
          <RecoveryRing score={cv.score} size={80} />
          <div>
            <div className="text-2xl font-bold text-gray-900">{cv.score}/100</div>
            <div className="text-xs text-gray-500">{t('whoop.cv_fitness', locale)}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cv.factors.map((f) => (
          <div key={f.label} className={`rounded-lg border p-3 text-center ${f.available ? 'border-gray-200' : 'border-gray-100 bg-gray-50'}`}>
            <div className={`text-lg font-bold ${f.available ? 'text-gray-900' : 'text-gray-300'}`}>
              {f.available ? f.score : '--'}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">{f.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function RecoveryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const status = await getWhoopStatus();
      if (status.connected) {
        const dashboard = await getWhoopDashboard();
        setData({ ...dashboard, connected: true, last_sync: status.last_sync });
      } else {
        setData({
          connected: false, last_sync: null, recovery: null, yesterday_recovery: null,
          hrv_sparkline: [], rhr_sparkline: [], sleep: null, strain: null,
          latest_workout: null, cv_fitness: null, recent_history: [],
        });
      }
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Handle OAuth callback
  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      setConnecting(true);
      whoopCallback(code)
        .then(() => {
          window.history.replaceState({}, '', '/health/recovery');
          loadData();
        })
        .catch(() => setError('Failed to connect WHOOP'))
        .finally(() => setConnecting(false));
    } else {
      loadData();
    }
  }, [searchParams, loadData]);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const { auth_url } = await getWhoopConnectUrl();
      window.location.href = auth_url;
    } catch {
      setError('Failed to initiate WHOOP connection');
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      await whoopSync();
      await loadData();
    } catch {
      setError('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await whoopDisconnect();
      await loadData();
    } catch {
      setError('Failed to disconnect');
    }
  };

  if (loading || connecting) {
    return (
      <PageShell><NavBar /><PageContent size="lg">
        <Spinner message={connecting ? t('whoop.connecting', locale) : t('common.loading', locale)} />
      </PageContent></PageShell>
    );
  }

  const rec = data?.recovery;
  const sleep = data?.sleep;

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('whoop.title', locale)}</h1>
          </div>
          <Button variant="secondary" size="sm" onClick={() => router.push('/health')}>
            {t('nav.health', locale)}
          </Button>
        </div>

        <Alert type="error" message={error} />

        {/* Connection Status Bar */}
        <Card className="mb-6">
          {!data?.connected ? (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{t('whoop.connect', locale)}</h3>
                <p className="text-sm text-gray-500 mt-1">{t('whoop.connect_desc', locale)}</p>
              </div>
              <Button onClick={handleConnect} disabled={connecting}>
                {connecting ? t('whoop.connecting', locale) : t('whoop.connect', locale)}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                <span className="font-medium text-gray-900">{t('whoop.connected', locale)}</span>
                {data.last_sync && (
                  <span className="text-xs text-gray-400 ml-2">
                    {t('whoop.last_sync', locale)}: {timeAgo(data.last_sync, locale)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleSync} disabled={syncing}>
                  {syncing ? t('whoop.syncing', locale) : t('whoop.sync_now', locale)}
                </Button>
                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={handleDisconnect}>
                  {t('whoop.disconnect', locale)}
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Not connected / No data */}
        {!data?.connected && (
          <EmptyState icon="&#x1F4F1;" message={t('whoop.no_data', locale)} />
        )}

        {/* Connected with data */}
        {data?.connected && rec && (
          <>
            {/* Top Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {/* Recovery Score */}
              <Card>
                <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">
                  {t('whoop.recovery_score', locale)}
                </div>
                <div className="flex items-center gap-3">
                  <RecoveryRing score={rec.recovery_score} size={72} />
                  <div>
                    <Badge color={recoveryBadgeColor(rec.recovery_score)}>
                      {recoveryZone(rec.recovery_score, locale)}
                    </Badge>
                    {data.yesterday_recovery !== null && (
                      <div className={`text-xs mt-1 font-medium ${trendColor(rec.recovery_score, data.yesterday_recovery)}`}>
                        {trendArrow(rec.recovery_score, data.yesterday_recovery)} {Math.abs(rec.recovery_score - data.yesterday_recovery)}% {t('whoop.vs_yesterday', locale)}
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* HRV */}
              <Card>
                <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">
                  {t('whoop.hrv', locale)}
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-3xl font-bold text-gray-900">{rec.hrv}</span>
                    <span className="text-xs text-gray-400 ml-1">{t('whoop.ms', locale)}</span>
                  </div>
                </div>
                <div className="mt-2">
                  <Sparkline data={data.hrv_sparkline} color="#6366f1" width={120} height={28} />
                </div>
                <div className="text-[10px] text-gray-400 mt-1">
                  {locale === 'bg' ? 'Последни 7 дни' : 'Last 7 days'}
                </div>
              </Card>

              {/* Resting HR */}
              <Card>
                <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">
                  {t('whoop.resting_hr', locale)}
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-3xl font-bold text-gray-900">{rec.resting_hr}</span>
                    <span className="text-xs text-gray-400 ml-1">{t('whoop.bpm', locale)}</span>
                  </div>
                </div>
                <div className="mt-2">
                  <Sparkline data={data.rhr_sparkline} color="#ef4444" width={120} height={28} />
                </div>
                <div className="text-[10px] text-gray-400 mt-1">
                  {locale === 'bg' ? 'Последни 7 дни' : 'Last 7 days'}
                </div>
              </Card>

              {/* Sleep Performance */}
              <Card>
                <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">
                  {t('whoop.sleep_performance', locale)}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-bold" style={{ color: rec.sleep_performance >= 85 ? '#22c55e' : rec.sleep_performance >= 70 ? '#eab308' : '#ef4444' }}>
                    {rec.sleep_performance}%
                  </span>
                  <Badge color={rec.sleep_performance >= 85 ? 'green' : rec.sleep_performance >= 70 ? 'yellow' : 'red'}>
                    {rec.sleep_performance >= 85 ? (locale === 'bg' ? 'Отлично' : 'Excellent') :
                     rec.sleep_performance >= 70 ? (locale === 'bg' ? 'Добро' : 'Good') :
                     (locale === 'bg' ? 'Слабо' : 'Poor')}
                  </Badge>
                </div>
                {sleep && (
                  <div className="text-xs text-gray-400 mt-2">
                    {formatMinutes(sleep.total_minutes)} {t('whoop.hours', locale)}
                  </div>
                )}
              </Card>
            </div>

            {/* Recovery Trend Chart */}
            {data.recent_history.length >= 2 && (
              <Card className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('whoop.recovery_trend', locale)}</h3>
                <RecoveryTrendChart data={data.recent_history} locale={locale} />
              </Card>
            )}

            {/* Sleep + Strain two-column */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Sleep Summary */}
              {sleep && (
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">{t('whoop.sleep_summary', locale)}</h3>
                    <Badge color="blue">{t('whoop.last_night', locale)}</Badge>
                  </div>

                  <div className="space-y-4">
                    {/* Duration */}
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-gray-500">{t('whoop.total_duration', locale)}</span>
                      <span className="text-lg font-bold text-gray-900">{formatMinutes(sleep.total_minutes)}</span>
                    </div>

                    {/* Stage breakdown */}
                    <div>
                      <span className="text-xs text-gray-500 block mb-1.5">{t('whoop.sleep_stages', locale)}</span>
                      <SleepStageBar sleep={sleep} locale={locale} />
                    </div>

                    {/* Metrics grid */}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase">{t('whoop.efficiency', locale)}</div>
                        <div className="text-sm font-semibold text-gray-900">{sleep.efficiency}%</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase">{t('whoop.respiratory_rate', locale)}</div>
                        <div className="text-sm font-semibold text-gray-900">{sleep.respiratory_rate} {t('whoop.breaths_min', locale)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase">{t('whoop.sleep_debt', locale)}</div>
                        <div className={`text-sm font-semibold ${sleep.sleep_debt_minutes > 60 ? 'text-red-600' : 'text-gray-900'}`}>
                          {formatMinutes(sleep.sleep_debt_minutes)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase">{t('whoop.disturbances', locale)}</div>
                        <div className="text-sm font-semibold text-gray-900">{sleep.disturbances}</div>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Strain & Activity */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900">{t('whoop.strain_activity', locale)}</h3>
                  <Badge color="indigo">{t('whoop.today', locale)}</Badge>
                </div>

                <div className="space-y-4">
                  {/* Day Strain */}
                  <div>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-xs text-gray-500">{t('whoop.day_strain', locale)}</span>
                      <span className="text-lg font-bold text-gray-900">{data.strain?.day_strain.toFixed(1) || '0.0'}</span>
                    </div>
                    <StrainGauge value={data.strain?.day_strain || 0} />
                  </div>

                  {/* Calories */}
                  <div className="flex items-baseline justify-between pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-500">{t('whoop.calories', locale)}</span>
                    <span className="text-sm font-semibold text-gray-900">{data.strain?.calories || 0} {t('whoop.cal', locale)}</span>
                  </div>

                  {/* Latest workout */}
                  <div className="pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-500 block mb-2">{t('whoop.latest_workout', locale)}</span>
                    {data.latest_workout ? (
                      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm text-gray-900">{data.latest_workout.sport}</span>
                          <Badge color="indigo">{data.latest_workout.duration_minutes} {t('whoop.minutes', locale)}</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                          <div>
                            <div className="text-[10px] text-gray-400">{t('whoop.strain', locale)}</div>
                            <div className="font-semibold text-gray-900">{data.latest_workout.strain.toFixed(1)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-gray-400">{t('whoop.avg_hr', locale)}</div>
                            <div className="font-semibold text-gray-900">{data.latest_workout.avg_hr}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-gray-400">{t('whoop.max_hr', locale)}</div>
                            <div className="font-semibold text-gray-900">{data.latest_workout.max_hr}</div>
                          </div>
                        </div>
                        {data.latest_workout.hr_zones.length > 0 && (
                          <div className="pt-1">
                            <div className="text-[10px] text-gray-400 mb-1">{t('whoop.hr_zones', locale)}</div>
                            <HrZoneBar zones={data.latest_workout.hr_zones} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-400 italic">{t('whoop.no_workouts_today', locale)}</div>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            {/* Cardiovascular Fitness */}
            {data.cv_fitness && (
              <div className="mb-6">
                <CvFitnessCard cv={data.cv_fitness} locale={locale} router={router} />
              </div>
            )}

            {/* Recent History Table */}
            {data.recent_history.length > 0 && (
              <Card padding={false} className="mb-6">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">{t('whoop.recent_history', locale)}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
                        <th className="px-6 py-3">{t('whoop.date', locale)}</th>
                        <th className="px-6 py-3">{t('whoop.recovery', locale)}</th>
                        <th className="px-6 py-3">{t('whoop.hrv', locale)}</th>
                        <th className="px-6 py-3">{t('whoop.resting_hr', locale)}</th>
                        <th className="px-6 py-3">{t('whoop.spo2', locale)}</th>
                        <th className="px-6 py-3">{t('whoop.sleep_hrs', locale)}</th>
                        <th className="px-6 py-3">{t('whoop.strain', locale)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_history.slice(0, 7).map((entry) => (
                        <tr key={entry.date} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-6 py-3 text-gray-600">
                            {new Date(entry.date).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </td>
                          <td className="px-6 py-3">
                            <Badge color={recoveryBadgeColor(entry.recovery_score)}>
                              {entry.recovery_score}%
                            </Badge>
                          </td>
                          <td className="px-6 py-3 font-medium text-gray-900">{entry.hrv} {t('whoop.ms', locale)}</td>
                          <td className="px-6 py-3 text-gray-600">{entry.resting_hr}</td>
                          <td className="px-6 py-3 text-gray-600">{entry.spo2 !== null ? `${entry.spo2}%` : '--'}</td>
                          <td className="px-6 py-3 text-gray-600">{entry.sleep_hours.toFixed(1)}h</td>
                          <td className="px-6 py-3 text-gray-600">{entry.day_strain.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Navigation Links */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { href: '/health/recovery/history', label: t('whoop.view_all_recovery', locale), icon: '\uD83D\uDCC8' },
                { href: '/health/recovery/sleep', label: t('whoop.sleep_analysis', locale), icon: '\uD83D\uDE34' },
                { href: '/health/recovery/workouts', label: t('whoop.workout_history', locale), icon: '\uD83C\uDFCB\uFE0F' },
                { href: '/health/recovery/stats', label: t('whoop.deep_stats', locale), icon: '\uD83D\uDCCA' },
              ].map((link) => (
                <button key={link.href} onClick={() => router.push(link.href)}
                  className="flex items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-all text-left">
                  <span className="text-xl">{link.icon}</span>
                  <span className="text-sm font-medium text-gray-700">{link.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Connected but no data yet */}
        {data?.connected && !rec && (
          <EmptyState icon="&#x23F3;" message={locale === 'bg' ? 'Очакваме данни от WHOOP...' : 'Waiting for WHOOP data...'} />
        )}
      </PageContent>
    </PageShell>
  );
}
