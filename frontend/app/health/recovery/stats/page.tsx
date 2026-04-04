'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../context/LanguageContext';
import { t, Locale } from '../../../lib/i18n';
import { getWhoopStats } from '../../../lib/api';
import NavBar from '../../../components/NavBar';
import {
  PageShell, PageContent, PageHeader, Card, Badge, Alert, Spinner, EmptyState,
} from '../../../components/ui';

// ── Types ──────────────────────────────────────────────────────────

interface PeriodAvg {
  '7d': number;
  '30d': number;
  '90d': number;
}

interface DayAvg {
  day: number;
  value: number;
}

interface CorrelationItem {
  factor: string;
  correlation: number;
  description: string;
  description_bg: string;
}

interface StatsData {
  hrv: {
    trend: { date: string; value: number }[];
    averages: PeriodAvg;
    min: number;
    max: number;
    variability: number;
    by_day: DayAvg[];
  };
  rhr: {
    trend: { date: string; value: number }[];
    averages: PeriodAvg;
    min: number;
    max: number;
    by_day: DayAvg[];
  };
  recovery_patterns: {
    high_recovery_correlations: CorrelationItem[];
    low_recovery_correlations: CorrelationItem[];
  };
  sleep_vs_recovery: { sleep_hours: number; recovery: number }[];
  strain_vs_recovery: { strain: number; next_recovery: number }[];
  cv_fitness: {
    score: number | null;
    factors: { label: string; score: number; weight: number }[];
    has_bp: boolean;
    has_blood: boolean;
  } | null;
}

type Period = '7d' | '30d' | '90d';

// ── Helpers ────────────────────────────────────────────────────────

const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_BG = ['\u041D\u0434', '\u041F\u043D', '\u0412\u0442', '\u0421\u0440', '\u0427\u0442', '\u041F\u0442', '\u0421\u0431'];

// ── Trend Chart ──────────────────────────────────────────────────

function TrendChart({ data, color, unit, locale }: {
  data: { date: string; value: number }[];
  color: string;
  unit: string;
  locale: Locale;
}) {
  if (data.length < 2) return null;

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const W = 380, H = 160, PX = 35, PY = 15;
  const values = sorted.map(d => d.value);
  const minV = Math.min(...values) - Math.max(1, Math.min(...values) * 0.05);
  const maxV = Math.max(...values) + Math.max(1, Math.max(...values) * 0.05);

  const xScale = (i: number) => PX + (i / (sorted.length - 1)) * (W - PX * 2);
  const yScale = (v: number) => PY + ((maxV - v) / (maxV - minV)) * (H - PY * 2);

  const points = sorted.map((d, i) => `${xScale(i)},${yScale(d.value)}`).join(' ');

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[300px]" preserveAspectRatio="xMidYMid meet">
        {/* Y labels */}
        <text x={PX - 5} y={PY + 5} fontSize="9" fill="#9ca3af" textAnchor="end">{Math.round(maxV)}{unit}</text>
        <text x={PX - 5} y={H - PY} fontSize="9" fill="#9ca3af" textAnchor="end">{Math.round(minV)}{unit}</text>

        {/* Line */}
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />

        {/* Points */}
        {sorted.map((d, i) => (
          <circle key={i} cx={xScale(i)} cy={yScale(d.value)} r="2.5" fill={color} stroke="white" strokeWidth="1" />
        ))}

        {/* X labels */}
        {sorted.filter((_, i) => i % Math.max(1, Math.floor(sorted.length / 6)) === 0).map((d) => {
          const idx = sorted.indexOf(d);
          return (
            <text key={d.date} x={xScale(idx)} y={H - 2} fontSize="8" fill="#9ca3af" textAnchor="middle">
              {new Date(d.date).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB', { day: 'numeric', month: 'short' })}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ── Day of Week Bars ─────────────────────────────────────────────

function DayOfWeekBars({ data, color, locale }: { data: DayAvg[]; color: string; locale: Locale }) {
  if (data.length === 0) return null;
  const dayNames = locale === 'bg' ? DAY_NAMES_BG : DAY_NAMES_EN;
  const maxVal = Math.max(...data.map(d => d.value));

  return (
    <div className="space-y-1.5">
      {data.map((d) => (
        <div key={d.day} className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 w-6">{dayNames[d.day]}</span>
          <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{
              width: `${(d.value / (maxVal || 1)) * 100}%`,
              backgroundColor: color,
            }} />
          </div>
          <span className="text-[10px] font-medium text-gray-600 w-8 text-right">{Math.round(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Scatter Plot ─────────────────────────────────────────────────

function ScatterPlot({ data, xLabel, yLabel, color, locale }: {
  data: { x: number; y: number }[];
  xLabel: string;
  yLabel: string;
  color: string;
  locale: Locale;
}) {
  if (data.length < 3) {
    return <div className="text-sm text-gray-400 text-center py-6">{locale === 'bg' ? 'Недостатъчно данни' : 'Not enough data'}</div>;
  }

  const W = 380, H = 200, PX = 35, PY = 20;
  const xs = data.map(d => d.x);
  const ys = data.map(d => d.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const scaleX = (v: number) => PX + ((v - xMin) / xRange) * (W - PX * 2);
  const scaleY = (v: number) => PY + ((yMax - v) / yRange) * (H - PY * 2);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[300px]" preserveAspectRatio="xMidYMid meet">
        {/* Axes */}
        <line x1={PX} y1={PY} x2={PX} y2={H - PY} stroke="#e5e7eb" strokeWidth="1" />
        <line x1={PX} y1={H - PY} x2={W - PX} y2={H - PY} stroke="#e5e7eb" strokeWidth="1" />

        {/* Labels */}
        <text x={W / 2} y={H - 2} fontSize="9" fill="#9ca3af" textAnchor="middle">{xLabel}</text>
        <text x={5} y={H / 2} fontSize="9" fill="#9ca3af" textAnchor="middle" transform={`rotate(-90, 8, ${H / 2})`}>{yLabel}</text>

        {/* Points */}
        {data.map((d, i) => (
          <circle key={i} cx={scaleX(d.x)} cy={scaleY(d.y)} r="3.5" fill={color} opacity="0.6" />
        ))}

        {/* Axis values */}
        <text x={PX - 3} y={PY + 4} fontSize="8" fill="#9ca3af" textAnchor="end">{Math.round(yMax)}</text>
        <text x={PX - 3} y={H - PY + 4} fontSize="8" fill="#9ca3af" textAnchor="end">{Math.round(yMin)}</text>
        <text x={PX} y={H - PY + 12} fontSize="8" fill="#9ca3af" textAnchor="start">{Math.round(xMin)}</text>
        <text x={W - PX} y={H - PY + 12} fontSize="8" fill="#9ca3af" textAnchor="end">{Math.round(xMax)}</text>
      </svg>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function DeepStatsPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<StatsData | null>(null);
  const [period, setPeriod] = useState<Period>('30d');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getWhoopStats(`period=${period}`);
      setData(result);
      setError('');
    } catch {
      setError('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <PageShell><NavBar /><PageContent size="lg">
        <Spinner message={t('common.loading', locale)} />
      </PageContent></PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell><NavBar /><PageContent size="lg">
        <PageHeader title={t('whoop.stats_title', locale)} onBack={() => router.push('/health/recovery')} backLabel={t('whoop.title', locale)} />
        <Alert type="error" message={error} />
        <EmptyState icon="&#x1F4CA;" message={t('whoop.no_stats', locale)} />
      </PageContent></PageShell>
    );
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('whoop.stats_title', locale)}
          onBack={() => router.push('/health/recovery')}
          backLabel={t('whoop.title', locale)}
        />

        <Alert type="error" message={error} />

        {/* Period selector */}
        <div className="flex gap-1.5 mb-6">
          {(['7d', '30d', '90d'] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                period === p ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
              }`}>
              {t(`whoop.${p}_avg`, locale)}
            </button>
          ))}
        </div>

        {/* HRV Analysis */}
        <Card className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('whoop.hrv_analysis', locale)}</h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Trend */}
            <div>
              <TrendChart data={data.hrv.trend} color="#6366f1" unit="ms" locale={locale} />
            </div>

            {/* Stats */}
            <div className="space-y-4">
              {/* Period averages */}
              <div className="grid grid-cols-3 gap-3">
                {(['7d', '30d', '90d'] as const).map((p) => (
                  <div key={p} className={`rounded-lg border p-3 text-center ${period === p ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'}`}>
                    <div className="text-lg font-bold text-gray-900">{Math.round(data.hrv.averages[p])}</div>
                    <div className="text-[10px] text-gray-400">{t(`whoop.${p}_avg`, locale)}</div>
                  </div>
                ))}
              </div>

              {/* Min/Max */}
              <div className="flex gap-4">
                <div className="flex-1 p-3 bg-red-50 rounded-lg text-center">
                  <div className="text-sm font-bold text-red-600">{data.hrv.min}</div>
                  <div className="text-[10px] text-gray-400">{t('whoop.min', locale)}</div>
                </div>
                <div className="flex-1 p-3 bg-emerald-50 rounded-lg text-center">
                  <div className="text-sm font-bold text-emerald-600">{data.hrv.max}</div>
                  <div className="text-[10px] text-gray-400">{t('whoop.max', locale)}</div>
                </div>
              </div>

              {/* Variability */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500">{locale === 'bg' ? 'Вариабилност (CV)' : 'Variability (CV)'}</div>
                <div className="text-lg font-bold text-gray-900">{data.hrv.variability.toFixed(1)}%</div>
              </div>

              {/* By day */}
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">{t('whoop.by_day_of_week', locale)}</div>
                <DayOfWeekBars data={data.hrv.by_day} color="#6366f1" locale={locale} />
              </div>
            </div>
          </div>
        </Card>

        {/* Resting HR Analysis */}
        <Card className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('whoop.rhr_analysis', locale)}</h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <TrendChart data={data.rhr.trend} color="#ef4444" unit="" locale={locale} />
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {(['7d', '30d', '90d'] as const).map((p) => (
                  <div key={p} className={`rounded-lg border p-3 text-center ${period === p ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                    <div className="text-lg font-bold text-gray-900">{Math.round(data.rhr.averages[p])}</div>
                    <div className="text-[10px] text-gray-400">{t(`whoop.${p}_avg`, locale)}</div>
                  </div>
                ))}
              </div>

              <div className="flex gap-4">
                <div className="flex-1 p-3 bg-emerald-50 rounded-lg text-center">
                  <div className="text-sm font-bold text-emerald-600">{data.rhr.min}</div>
                  <div className="text-[10px] text-gray-400">{t('whoop.min', locale)}</div>
                </div>
                <div className="flex-1 p-3 bg-red-50 rounded-lg text-center">
                  <div className="text-sm font-bold text-red-600">{data.rhr.max}</div>
                  <div className="text-[10px] text-gray-400">{t('whoop.max', locale)}</div>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">{t('whoop.by_day_of_week', locale)}</div>
                <DayOfWeekBars data={data.rhr.by_day} color="#ef4444" locale={locale} />
              </div>
            </div>
          </div>
        </Card>

        {/* Recovery Patterns */}
        <Card className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('whoop.recovery_patterns', locale)}</h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* High recovery correlations */}
            <div>
              <h4 className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-3">
                {t('whoop.correlations', locale)} &#x2191;
              </h4>
              {data.recovery_patterns.high_recovery_correlations.length > 0 ? (
                <div className="space-y-2">
                  {data.recovery_patterns.high_recovery_correlations.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg">
                      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-sm font-bold text-emerald-700">
                        {(c.correlation * 100).toFixed(0)}%
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{c.factor}</div>
                        <div className="text-xs text-gray-500">
                          {locale === 'bg' && c.description_bg ? c.description_bg : c.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400 py-4">{locale === 'bg' ? 'Недостатъчно данни' : 'Not enough data'}</div>
              )}
            </div>

            {/* Low recovery correlations */}
            <div>
              <h4 className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-3">
                {locale === 'bg' ? 'Ниско възстановяване' : 'Low Recovery'} &#x2193;
              </h4>
              {data.recovery_patterns.low_recovery_correlations.length > 0 ? (
                <div className="space-y-2">
                  {data.recovery_patterns.low_recovery_correlations.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-sm font-bold text-red-700">
                        {(c.correlation * 100).toFixed(0)}%
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{c.factor}</div>
                        <div className="text-xs text-gray-500">
                          {locale === 'bg' && c.description_bg ? c.description_bg : c.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400 py-4">{locale === 'bg' ? 'Недостатъчно данни' : 'Not enough data'}</div>
              )}
            </div>
          </div>
        </Card>

        {/* Correlation Scatter Plots */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Sleep vs Recovery */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('whoop.sleep_vs_recovery', locale)}</h3>
            <ScatterPlot
              data={data.sleep_vs_recovery.map(d => ({ x: d.sleep_hours, y: d.recovery }))}
              xLabel={t('whoop.sleep_hrs', locale) + ' (h)'}
              yLabel={t('whoop.recovery', locale) + ' (%)'}
              color="#6366f1"
              locale={locale}
            />
          </Card>

          {/* Strain vs Next-Day Recovery */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('whoop.strain_vs_recovery', locale)}</h3>
            <ScatterPlot
              data={data.strain_vs_recovery.map(d => ({ x: d.strain, y: d.next_recovery }))}
              xLabel={t('whoop.strain', locale)}
              yLabel={t('whoop.recovery', locale) + ' (%)'}
              color="#22c55e"
              locale={locale}
            />
          </Card>
        </div>

        {/* CV Fitness Breakdown */}
        {data.cv_fitness && data.cv_fitness.score !== null && (
          <Card className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('whoop.cv_breakdown', locale)}</h3>

            <div className="flex items-center gap-6 mb-6">
              {/* Score ring */}
              <div className="relative inline-flex items-center justify-center" style={{ width: 80, height: 80 }}>
                <svg width={80} height={80} className="-rotate-90">
                  <circle cx={40} cy={40} r={33} fill="none" stroke="#f3f4f6" strokeWidth="6" />
                  <circle cx={40} cy={40} r={33} fill="none"
                    stroke={data.cv_fitness.score >= 70 ? '#22c55e' : data.cv_fitness.score >= 50 ? '#eab308' : '#ef4444'}
                    strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 33}
                    strokeDashoffset={2 * Math.PI * 33 - (data.cv_fitness.score / 100) * 2 * Math.PI * 33}
                    style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
                </svg>
                <span className="absolute text-xl font-bold text-gray-900">{data.cv_fitness.score}</span>
              </div>
              <div>
                <div className="text-sm text-gray-500">{t('whoop.cv_fitness', locale)}</div>
                {!data.cv_fitness.has_bp && (
                  <div className="text-xs text-amber-600 mt-1">
                    + {t('whoop.add_bp_data', locale)}
                  </div>
                )}
                {!data.cv_fitness.has_blood && (
                  <div className="text-xs text-amber-600 mt-0.5">
                    + {locale === 'bg' ? 'Добавете кръвни резултати за пълна оценка' : 'Add blood results for full assessment'}
                  </div>
                )}
              </div>
            </div>

            {/* Factor breakdown */}
            <div className="space-y-3">
              {data.cv_fitness.factors.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-32 shrink-0">{f.label}</span>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${f.score}%`,
                        backgroundColor: f.score >= 70 ? '#22c55e' : f.score >= 50 ? '#eab308' : '#ef4444',
                      }} />
                  </div>
                  <span className="text-xs font-medium text-gray-700 w-8 text-right">{f.score}</span>
                  <span className="text-[10px] text-gray-400 w-8 text-right">{Math.round(f.weight * 100)}%</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </PageContent>
    </PageShell>
  );
}
