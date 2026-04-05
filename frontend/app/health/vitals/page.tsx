'use client';
// §NAV: frontend unified Vitals dashboard — weight + BP + cardiometabolic age.
// §COMPOSES: /api/health/vitals/dashboard/ + cardiometabolic-age +
//            bp-per-kg-slope + stage-regression-forecast.
// §UI: ui.tsx components only.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import {
  getHealthProfiles, getVitalsDashboard, getCardiometabolicAge,
  getBPPerKgSlope, getStageRegressionForecast,
} from '../../lib/api';
import NavBar from '../../components/NavBar';
import {
  PageShell, PageContent, PageHeader, Card, Button, Badge,
  Alert, Spinner, EmptyState, Select,
} from '../../components/ui';

interface Profile { id: number; full_name: string; sex: string; is_primary: boolean; date_of_birth: string | null; height_cm: number | null; }
interface LatestWeight { id: number; weight_kg: string; bmi: number | null; waist_hip_ratio: number | null; measured_at: string; }
interface LatestBP { measured_at: string; avg_systolic: number; avg_diastolic: number; stage: string; }
interface Dashboard {
  profile: { id: number; full_name: string; height_cm: number | null; sex: string };
  latest_weight: LatestWeight | null;
  latest_bp_session: LatestBP | null;
  active_goal: unknown;
  insights: { id: number; insight_type: string; payload: Record<string, unknown>; confidence: string }[];
}
interface CMAge { chronological_age: number; cardiometabolic_age: number; delta_years: number; signals_present: number; confidence: number; }
interface Slope { status: string; slope_mmhg_per_kg?: number; r_squared?: number; paired_days?: number; need?: number; }
interface Forecast { status: string; kg_to_lose?: number; target_weight_kg?: number; target_systolic?: number; eta_date?: string; weeks?: number; }

const STAGE_COLORS: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  normal: 'green', elevated: 'yellow', stage_1: 'yellow', stage_2: 'red', crisis: 'red',
};

export default function VitalsDashboardPage() {
  const { locale } = useLanguage();
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [cmAge, setCmAge] = useState<CMAge | null>(null);
  const [slope, setSlope] = useState<Slope | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAll = useCallback(async (pid: number) => {
    setLoading(true); setError('');
    try {
      // §PARALLEL: 4 independent calls, render progressively
      const [d, age, s, f] = await Promise.all([
        getVitalsDashboard(pid),
        getCardiometabolicAge(pid).catch(() => null),
        getBPPerKgSlope(pid).catch(() => null),
        getStageRegressionForecast(pid).catch(() => null),
      ]);
      setDash(d); setCmAge(age); setSlope(s); setForecast(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    getHealthProfiles().then((ps: Profile[]) => {
      setProfiles(ps);
      const primary = ps.find(p => p.is_primary) || ps[0];
      if (primary) { setProfileId(primary.id); loadAll(primary.id); }
      else setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, [loadAll]);

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('nav.vitals', locale)}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => router.push('/health/bp')}>
                {t('nav.bp', locale)}
              </Button>
              <Button variant="secondary" onClick={() => router.push('/health/weight')}>
                {t('nav.weight', locale)}
              </Button>
              <Button onClick={() => router.push('/health/weight/new')}>
                + {t('weight.quick_add', locale)}
              </Button>
            </div>
          }
        />

        {profiles.length > 1 && (
          <div className="mb-4 max-w-xs">
            <Select
              label={t('health.profile', locale)}
              value={profileId || ''}
              onChange={(e) => { const id = Number(e.target.value); setProfileId(id); loadAll(id); }}
            >
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </Select>
          </div>
        )}

        <Alert type="error" message={error} />

        {loading ? <Spinner message={t('common.loading', locale)} /> : !dash ? <EmptyState icon="📊" message={t('vitals.no_data', locale)} /> : (
        <>
          {/* ── HERO: Cardiometabolic Age ── */}
          {cmAge && cmAge.signals_present > 0 && (
            <Card>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide">
                    {t('vitals.cm_age_title', locale)}
                  </div>
                  <div className="text-5xl font-bold text-gray-900 mt-1">
                    {cmAge.cardiometabolic_age}
                    <span className="text-xl text-gray-400 ml-2">yrs</span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {t('vitals.chronological', locale)} {cmAge.chronological_age}y •{' '}
                    <span className={cmAge.delta_years <= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      {cmAge.delta_years >= 0 ? '+' : ''}{cmAge.delta_years}y
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <Badge color={cmAge.delta_years <= 0 ? 'green' : 'red'}>
                    {cmAge.delta_years <= 0 ? t('vitals.younger', locale) : t('vitals.older', locale)}
                  </Badge>
                  <div className="text-xs text-gray-500 mt-2">
                    {cmAge.signals_present}/4 {t('vitals.signals', locale)} • conf {cmAge.confidence}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* ── 3-card snapshot: Weight / BP / Slope ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <Card>
              <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide mb-1">
                {t('nav.weight', locale)}
              </div>
              {dash.latest_weight ? (
                <>
                  <div className="text-3xl font-semibold text-gray-900">
                    {Number(dash.latest_weight.weight_kg).toFixed(1)}
                    <span className="text-lg text-gray-500 ml-1">kg</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(dash.latest_weight.measured_at).toLocaleDateString()}
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {dash.latest_weight.bmi && <Badge color="indigo">BMI {dash.latest_weight.bmi}</Badge>}
                    {dash.latest_weight.waist_hip_ratio && <Badge color="blue">WHR {dash.latest_weight.waist_hip_ratio}</Badge>}
                  </div>
                </>
              ) : <div className="text-sm text-gray-500 py-4">{t('weight.no_readings', locale)}</div>}
            </Card>

            <Card>
              <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide mb-1">
                {t('nav.bp', locale)}
              </div>
              {dash.latest_bp_session ? (
                <>
                  <div className="text-3xl font-semibold text-gray-900">
                    {Math.round(dash.latest_bp_session.avg_systolic)}/{Math.round(dash.latest_bp_session.avg_diastolic)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(dash.latest_bp_session.measured_at).toLocaleDateString()}
                  </div>
                  <Badge color={STAGE_COLORS[dash.latest_bp_session.stage] || 'gray'}>
                    {dash.latest_bp_session.stage.replace('_', ' ')}
                  </Badge>
                </>
              ) : <div className="text-sm text-gray-500 py-4">{t('vitals.no_bp', locale)}</div>}
            </Card>

            <Card>
              <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide mb-1">
                {t('vitals.bp_per_kg', locale)}
              </div>
              {slope?.status === 'ok' ? (
                <>
                  <div className="text-3xl font-semibold text-gray-900">
                    {slope.slope_mmhg_per_kg! > 0 ? '+' : ''}{slope.slope_mmhg_per_kg}
                    <span className="text-sm text-gray-500 ml-1">mmHg/kg</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    R² {slope.r_squared} • {slope.paired_days}d {t('vitals.paired', locale)}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm text-gray-600">
                    {slope?.paired_days || 0} / {slope?.need || 20} {t('vitals.paired_days_needed', locale)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {t('vitals.log_weight_bp', locale)}
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* ── Stage regression forecast ── */}
          {forecast?.status === 'ok' && (
            <Card>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide mb-1">
                    {t('vitals.forecast_title', locale)}
                  </div>
                  <div className="text-lg text-gray-900">
                    {t('vitals.forecast_lose', locale).replace('{kg}', String(forecast.kg_to_lose))}
                    {' → '}
                    <span className="font-medium">{forecast.target_systolic} mmHg</span>
                  </div>
                  {forecast.eta_date && (
                    <div className="text-sm text-gray-600 mt-1">
                      ETA: {new Date(forecast.eta_date).toLocaleDateString()} ({forecast.weeks} wks)
                    </div>
                  )}
                </div>
                <Badge color="indigo">{t('vitals.projection', locale)}</Badge>
              </div>
            </Card>
          )}

          {/* ── Insights feed ── */}
          {dash.insights.length > 0 && (
            <div className="mt-4">
              <div className="text-[13px] font-medium text-gray-700 mb-2">
                {t('weight.insights', locale)}
              </div>
              <div className="space-y-2">
                {dash.insights.map(ins => (
                  <Card key={ins.id}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="text-sm text-gray-800">
                        <span className="font-medium">{ins.insight_type.replace(/_/g, ' ')}</span>
                        <span className="text-gray-500 ml-2">
                          {JSON.stringify(ins.payload).slice(0, 120)}
                        </span>
                      </div>
                      <Badge color="gray">conf {ins.confidence}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
        )}
      </PageContent>
    </PageShell>
  );
}
