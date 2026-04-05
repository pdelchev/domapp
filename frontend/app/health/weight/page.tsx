'use client';
// §NAV: frontend weight dashboard → uses /api/health/weight/dashboard/
// §UI: ui.tsx components only (CLAUDE.md mandate)
// §FLOW: select profile → show latest reading + EWMA trend + goal + insights

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { getHealthProfiles, getWeightDashboard, deleteWeightReading } from '../../lib/api';
import NavBar from '../../components/NavBar';
import {
  PageShell, PageContent, PageHeader, Card, Button, Badge,
  Alert, Spinner, EmptyState, Select,
} from '../../components/ui';

interface Profile { id: number; full_name: string; sex: string; is_primary: boolean; date_of_birth: string | null; }
interface Reading { id: number; weight_kg: string; measured_at: string; bmi: number | null; waist_hip_ratio: number | null; body_fat_pct: string | null; notes: string; source: string; }
interface Goal { id: number; start_weight_kg: string; target_weight_kg: string; target_date: string; goal_type: string; progress: { percent_complete: number; current_weight_kg: number; actual_weekly_rate_kg: number; needed_weekly_rate_kg: number; days_remaining: number; on_track: boolean } | null; }
interface TrendPoint { date: string; raw_kg: number; ewma_kg: number; }
interface Insight { id: number; insight_type: string; payload: Record<string, unknown>; confidence: string; computed_at: string; }
interface Dashboard { latest_reading: Reading | null; active_goal: Goal | null; trend: TrendPoint[]; insights: Insight[]; reading_count_90d: number; }

export default function WeightDashboardPage() {
  const { locale } = useLanguage();
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (pid: number) => {
    setLoading(true); setError('');
    try { setData(await getWeightDashboard(pid)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    getHealthProfiles().then((ps: Profile[]) => {
      setProfiles(ps);
      const primary = ps.find(p => p.is_primary) || ps[0];
      if (primary) { setProfileId(primary.id); loadDashboard(primary.id); }
      else setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, [loadDashboard]);

  const handleDelete = async (id: number) => {
    if (!confirm(t('weight.confirm_delete', locale))) return;
    try { await deleteWeightReading(id); if (profileId) loadDashboard(profileId); }
    catch (e) { setError(e instanceof Error ? e.message : 'Delete failed'); }
  };

  const latest = data?.latest_reading;
  const trend = data?.trend || [];
  const goal = data?.active_goal;

  // §TREND: inline SVG sparkline — no chart library
  const renderTrend = () => {
    if (trend.length < 2) return <div className="text-sm text-gray-500 py-8 text-center">{t('weight.need_more_data', locale)}</div>;
    const kgs = trend.map(p => p.ewma_kg);
    const min = Math.min(...kgs) - 0.5, max = Math.max(...kgs) + 0.5;
    const range = max - min || 1;
    const w = 600, h = 160;
    const xs = (i: number) => (i / (trend.length - 1)) * w;
    const ys = (v: number) => h - ((v - min) / range) * h;
    const ewmaPath = trend.map((p, i) => `${i === 0 ? 'M' : 'L'}${xs(i)},${ys(p.ewma_kg)}`).join(' ');
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40">
        {/* raw dots */}
        {trend.map((p, i) => (
          <circle key={i} cx={xs(i)} cy={ys(p.raw_kg)} r="2" fill="#d1d5db" />
        ))}
        {/* EWMA line */}
        <path d={ewmaPath} stroke="#4f46e5" strokeWidth="2" fill="none" />
        {/* min/max labels */}
        <text x="4" y="14" fontSize="10" fill="#6b7280">{max.toFixed(1)}kg</text>
        <text x="4" y={h - 4} fontSize="10" fill="#6b7280">{min.toFixed(1)}kg</text>
      </svg>
    );
  };

  const formatInsight = (ins: Insight) => {
    const p = ins.payload as Record<string, number | string>;
    switch (ins.insight_type) {
      case 'osmotic_spike':
        return `${t('weight.insight.osmotic_spike', locale)}: ${p.direction === 'up' ? '+' : ''}${p.delta_kg}kg (${p.delta_pct}% vs 3d EWMA) — ${p.likely_cause}`;
      case 'cardiometabolic_age':
        return `${t('weight.insight.cm_age', locale)}: ${p.cardiometabolic_age} (${t('weight.chronological', locale)} ${p.chronological_age}, Δ${Number(p.delta_years) >= 0 ? '+' : ''}${p.delta_years}y)`;
      case 'bp_per_kg_slope':
        return `${t('weight.insight.slope', locale)}: ${p.slope_mmhg_per_kg} mmHg/kg (R²=${p.r_squared}, ${p.paired_days}d paired)`;
      case 'stage_regression_forecast':
        return p.status === 'ok'
          ? `${t('weight.insight.forecast', locale)}: -${p.kg_to_lose}kg → ${p.target_systolic} mmHg by ${p.eta_date}`
          : `${t('weight.insight.forecast', locale)}: ${p.status}`;
      default: return `${ins.insight_type}: ${JSON.stringify(p).slice(0, 80)}`;
    }
  };

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('nav.weight', locale)}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => router.push('/health/vitals')}>
                {t('weight.view_vitals', locale)}
              </Button>
              <Button onClick={() => router.push('/health/weight/new')}>
                + {t('weight.add', locale)}
              </Button>
            </div>
          }
        />

        {profiles.length > 1 && (
          <div className="mb-4 max-w-xs">
            <Select
              label={t('health.profile', locale)}
              value={profileId || ''}
              onChange={(e) => { const id = Number(e.target.value); setProfileId(id); loadDashboard(id); }}
            >
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </Select>
          </div>
        )}

        <Alert type="error" message={error} />

        {loading ? <Spinner message={t('common.loading', locale)} /> :
         !data ? <EmptyState icon="⚖️" message={t('weight.no_data', locale)} /> :
        (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* ── Latest reading card ── */}
          <Card>
            <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide mb-1">
              {t('weight.latest', locale)}
            </div>
            {latest ? (
              <>
                <div className="text-3xl font-semibold text-gray-900">
                  {Number(latest.weight_kg).toFixed(1)} <span className="text-lg text-gray-500">kg</span>
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {new Date(latest.measured_at).toLocaleDateString()}
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {latest.bmi && <Badge color="indigo">BMI {latest.bmi}</Badge>}
                  {latest.body_fat_pct && <Badge color="purple">{latest.body_fat_pct}% fat</Badge>}
                  {latest.waist_hip_ratio && <Badge color="blue">WHR {latest.waist_hip_ratio}</Badge>}
                </div>
                <div className="mt-3">
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(latest.id)}>
                    {t('common.delete', locale)}
                  </Button>
                </div>
              </>
            ) : <div className="text-sm text-gray-500 py-4">{t('weight.no_readings', locale)}</div>}
          </Card>

          {/* ── Active goal card ── */}
          <Card>
            <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide mb-1">
              {t('weight.active_goal', locale)}
            </div>
            {goal ? (
              <>
                <div className="text-2xl font-semibold text-gray-900">
                  {goal.start_weight_kg} → {goal.target_weight_kg} kg
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {t('weight.by', locale)} {new Date(goal.target_date).toLocaleDateString()}
                </div>
                {goal.progress && (
                  <>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                      <div
                        className={`h-2 rounded-full ${goal.progress.on_track ? 'bg-green-500' : 'bg-amber-500'}`}
                        style={{ width: `${goal.progress.percent_complete}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-600 mt-2">
                      {goal.progress.percent_complete}% • {goal.progress.actual_weekly_rate_kg}/
                      {goal.progress.needed_weekly_rate_kg} kg/wk •{' '}
                      <Badge color={goal.progress.on_track ? 'green' : 'yellow'}>
                        {goal.progress.on_track ? t('weight.on_track', locale) : t('weight.off_track', locale)}
                      </Badge>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="text-sm text-gray-500 py-3">{t('weight.no_goal', locale)}</div>
                <Button size="sm" variant="secondary" onClick={() => router.push('/health/weight/goals')}>
                  {t('weight.set_goal', locale)}
                </Button>
              </>
            )}
          </Card>

          {/* ── 90-day stats card ── */}
          <Card>
            <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide mb-1">
              {t('weight.last_90d', locale)}
            </div>
            <div className="text-3xl font-semibold text-gray-900">{data.reading_count_90d}</div>
            <div className="text-sm text-gray-600 mt-1">{t('weight.readings_logged', locale)}</div>
            {trend.length >= 2 && (
              <div className="mt-3 text-sm">
                <span className="text-gray-500">{t('weight.trend', locale)}: </span>
                <span className={trend[trend.length - 1].ewma_kg < trend[0].ewma_kg ? 'text-green-600' : 'text-red-600'}>
                  {(trend[trend.length - 1].ewma_kg - trend[0].ewma_kg).toFixed(1)} kg
                </span>
              </div>
            )}
          </Card>
        </div>
        )}

        {/* ── Trend chart ── */}
        {!loading && data && (
          <Card>
            <div className="text-[13px] font-medium text-gray-700 mb-3">
              {t('weight.trend_90d', locale)} • <span className="text-gray-500">EWMA (indigo) vs raw (gray)</span>
            </div>
            {renderTrend()}
          </Card>
        )}

        {/* ── Insights feed ── */}
        {!loading && data && data.insights.length > 0 && (
          <div className="mt-4">
            <div className="text-[13px] font-medium text-gray-700 mb-2">
              {t('weight.insights', locale)}
            </div>
            <div className="space-y-2">
              {data.insights.map(ins => (
                <Card key={ins.id}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="text-sm text-gray-800">{formatInsight(ins)}</div>
                    <Badge color="gray">conf {ins.confidence}</Badge>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}
