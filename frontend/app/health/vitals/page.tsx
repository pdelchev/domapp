'use client';
// §NAV: frontend unified Vitals hub — weight + BP + cardiometabolic age.
// §COMPOSES: /api/health/vitals/dashboard/ + cardiometabolic-age +
//            bp-per-kg-slope + stage-regression-forecast.
// §LOG: inline RitualModal fuses weight + BP session into one flow
//       (VitalsSession + WeightReading + 3 BPReadings → finalize).
// §UI: ui.tsx components only.

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import {
  getHealthProfiles, getVitalsDashboard, getCardiometabolicAge,
  getBPPerKgSlope, getStageRegressionForecast,
  createVitalsSession, finalizeVitalsSession,
  createWeightReading, createBPReading,
  getInterventionLogs, saveInterventionLogs,
} from '../../lib/api';
import NavBar from '../../components/NavBar';
import {
  PageShell, PageContent, PageHeader, Card, Button, Badge,
  Alert, Spinner, EmptyState, Select,
} from '../../components/ui';
import type { Locale } from '../../lib/i18n';

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

// ── RitualModal: weight → BP session → adherence → finalize ─────────
// §FLOW: step 1 weight, steps 2-4 BP readings w/ 60s rest timers, step 5
//        intervention adherence checklist (pre-filled from yesterday),
//        step 6 summary + save-all. Creates VitalsSession first, then
//        weight + BP readings + intervention logs in parallel, finalize.

interface BpDraft { systolic: string; diastolic: string; pulse: string; }
interface AdherenceItem {
  intervention_id: number; name: string; category: string; dose: string;
  taken_today: boolean | null; taken_yesterday: boolean | null;
}

function RitualModal({ profileId, locale, onClose, onDone }: {
  profileId: number; locale: Locale;
  onClose: () => void; onDone: () => void;
}) {
  // step: 1 weight, 2-4 bp, 5 adherence, 6 summary
  const [step, setStep] = useState<number>(1);
  const [weight, setWeight] = useState({ weight_kg: '', body_fat_pct: '', waist_cm: '', hip_cm: '' });
  const [skipWeight, setSkipWeight] = useState(false);
  const [bpReadings, setBpReadings] = useState<BpDraft[]>([]);
  const [currentBp, setCurrentBp] = useState<BpDraft>({ systolic: '', diastolic: '', pulse: '' });
  const [timer, setTimer] = useState(0);
  const [adherence, setAdherence] = useState<AdherenceItem[]>([]);
  const [adhTaken, setAdhTaken] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sysInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // §PREFILL: load active interventions + yesterday's log on mount
  useEffect(() => {
    getInterventionLogs().then((r: { items: AdherenceItem[] }) => {
      setAdherence(r.items || []);
      const initial: Record<number, boolean> = {};
      (r.items || []).forEach(it => {
        // prefill from today's log if exists, else yesterday, else true
        initial[it.intervention_id] = it.taken_today ?? it.taken_yesterday ?? true;
      });
      setAdhTaken(initial);
    }).catch(() => { /* no interventions yet — that's fine */ });
  }, []);

  // Focus systolic input when entering a BP step
  useEffect(() => {
    if (step >= 2 && step <= 4 && timer === 0) sysInputRef.current?.focus();
  }, [step, timer]);

  const startTimer = () => {
    setTimer(60);
    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const skipTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimer(0);
  };

  const handleWeightNext = () => {
    if (!skipWeight && !weight.weight_kg) {
      setError(locale === 'bg' ? 'Въведете тегло' : 'Enter weight'); return;
    }
    setError('');
    setStep(2);
  };

  const handleBpSave = () => {
    const sys = parseInt(currentBp.systolic);
    const dia = parseInt(currentBp.diastolic);
    if (!sys || sys < 60 || sys > 300) {
      setError(locale === 'bg' ? 'Невалидно систолично' : 'Invalid systolic'); return;
    }
    if (!dia || dia < 30 || dia > 200) {
      setError(locale === 'bg' ? 'Невалидно диастолично' : 'Invalid diastolic'); return;
    }
    if (dia >= sys) {
      setError(locale === 'bg' ? 'Диастоличното трябва да е по-малко' : 'Diastolic must be lower'); return;
    }
    setError('');
    const next = [...bpReadings, currentBp];
    setBpReadings(next);
    setCurrentBp({ systolic: '', diastolic: '', pulse: '' });
    if (next.length < 3) { setStep(step + 1); startTimer(); }
    else advanceAfterBp();
  };

  const advanceAfterBp = () => {
    // §SKIP: if no active interventions, jump past adherence to summary
    setStep(adherence.length > 0 ? 5 : 6);
  };

  const skipBp = () => {
    if (bpReadings.length === 0 && (skipWeight || !weight.weight_kg)) { onClose(); return; }
    advanceAfterBp();
  };

  const toggleAdh = (id: number) => setAdhTaken(p => ({ ...p, [id]: !p[id] }));

  const avg = (nums: number[]) => nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  const sysAvg = Math.round(avg(bpReadings.map(r => parseInt(r.systolic)).filter(n => n > 0)));
  const diaAvg = Math.round(avg(bpReadings.map(r => parseInt(r.diastolic)).filter(n => n > 0)));
  const pulseAvg = Math.round(avg(bpReadings.map(r => parseInt(r.pulse)).filter(n => n > 0)));

  const handleFinish = async () => {
    setSaving(true); setError('');
    try {
      const now = new Date();
      const session = await createVitalsSession({
        profile: profileId,
        started_at: now.toISOString(),
        ritual_type: 'morning',
      });
      const posts: Promise<unknown>[] = [];
      if (!skipWeight && weight.weight_kg) {
        const wPayload: Record<string, unknown> = {
          profile: profileId, session: session.id,
          measured_at: now.toISOString(), weight_kg: weight.weight_kg,
          source: 'manual', context_flags: { fasted: true, post_toilet: true },
        };
        if (weight.body_fat_pct) wPayload.body_fat_pct = weight.body_fat_pct;
        if (weight.waist_cm) wPayload.waist_cm = weight.waist_cm;
        if (weight.hip_cm) wPayload.hip_cm = weight.hip_cm;
        posts.push(createWeightReading(wPayload));
      }
      // BP readings: spaced 1 second apart so timestamps are distinct
      bpReadings.forEach((r, i) => {
        const t = new Date(now.getTime() + i * 1000).toISOString();
        posts.push(createBPReading({
          profile: profileId,
          systolic: parseInt(r.systolic),
          diastolic: parseInt(r.diastolic),
          pulse: r.pulse ? parseInt(r.pulse) : null,
          measured_at: t, arm: 'left', posture: 'sitting',
        }));
      });
      await Promise.all(posts);
      await finalizeVitalsSession(session.id);
      // §ADH: save adherence checklist (only if user saw that step)
      if (adherence.length > 0) {
        const today = now.toISOString().slice(0, 10);
        const logs = adherence.map(it => ({
          intervention: it.intervention_id,
          taken: !!adhTaken[it.intervention_id],
        }));
        await saveInterventionLogs(today, logs);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  const progressIcon = (target: number) => {
    if (step > target) return '✓';
    if (step === target) return '●';
    return '○';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('vitals.ritual_title', locale)}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-6 text-xs text-gray-500 flex-wrap">
          <span className={step > 1 ? 'text-green-600 font-medium' : step === 1 ? 'text-indigo-600 font-medium' : ''}>
            {progressIcon(1)} {locale === 'bg' ? 'тегло' : 'weight'}
          </span>
          <span className="text-gray-300">—</span>
          <span className={step > 4 ? 'text-green-600 font-medium' : step >= 2 ? 'text-indigo-600 font-medium' : ''}>
            {step > 4 ? '✓' : step >= 2 ? '●' : '○'} {locale === 'bg' ? 'кръвно' : 'bp'} ({bpReadings.length}/3)
          </span>
          {adherence.length > 0 && (
            <>
              <span className="text-gray-300">—</span>
              <span className={step > 5 ? 'text-green-600 font-medium' : step === 5 ? 'text-indigo-600 font-medium' : ''}>
                {progressIcon(5)} {locale === 'bg' ? 'приемане' : 'adherence'}
              </span>
            </>
          )}
          <span className="text-gray-300">—</span>
          <span className={step === 6 ? 'text-indigo-600 font-medium' : ''}>
            {progressIcon(6)} {locale === 'bg' ? 'готово' : 'done'}
          </span>
        </div>

        <Alert type="error" message={error} />

        {/* ── Step 1: Weight ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="text-[13px] font-medium text-gray-700">{t('vitals.step_weight', locale)}</div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">kg</label>
              <input
                type="number" step="0.1" min="20" max="400" inputMode="decimal"
                value={weight.weight_kg}
                onChange={e => setWeight(p => ({ ...p, weight_kg: e.target.value }))}
                placeholder="82.5"
                className="w-full h-16 text-3xl font-bold text-center text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>
            <details className="border-t border-gray-200 pt-3">
              <summary className="text-xs text-gray-500 cursor-pointer">{t('weight.optional_body_comp', locale)}</summary>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">{t('weight.body_fat', locale)} %</label>
                  <input type="number" step="0.1" value={weight.body_fat_pct}
                    onChange={e => setWeight(p => ({ ...p, body_fat_pct: e.target.value }))}
                    className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">{t('weight.waist', locale)} cm</label>
                  <input type="number" step="0.1" value={weight.waist_cm}
                    onChange={e => setWeight(p => ({ ...p, waist_cm: e.target.value }))}
                    className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">{t('weight.hip', locale)} cm</label>
                  <input type="number" step="0.1" value={weight.hip_cm}
                    onChange={e => setWeight(p => ({ ...p, hip_cm: e.target.value }))}
                    className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
            </details>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleWeightNext}>{t('vitals.next_bp', locale)}</Button>
              <Button variant="ghost" onClick={() => { setSkipWeight(true); setError(''); setStep(2); }}>
                {t('vitals.skip_weight', locale)}
              </Button>
            </div>
          </div>
        )}

        {/* ── Steps 2-4: BP reading inputs or rest timer ── */}
        {step >= 2 && step <= 4 && (
          <div className="space-y-4">
            <div className="text-[13px] font-medium text-gray-700">
              {t('vitals.step_bp', locale)} — {t('vitals.take_reading', locale).replace('{n}', String(bpReadings.length + 1))}
            </div>

            {timer > 0 ? (
              <div className="text-center py-10">
                <div className="text-6xl font-bold text-indigo-600 tabular-nums mb-3">{timer}s</div>
                <div className="text-sm text-gray-500 mb-4">
                  {locale === 'bg' ? 'Починете преди следващото измерване' : 'Rest before next reading'}
                </div>
                <Button variant="secondary" size="sm" onClick={skipTimer}>
                  {locale === 'bg' ? 'Пропусни таймера' : 'Skip timer'}
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">SYS</label>
                    <input
                      ref={sysInputRef}
                      type="number" inputMode="numeric" value={currentBp.systolic}
                      onChange={e => setCurrentBp(p => ({ ...p, systolic: e.target.value }))}
                      placeholder="120"
                      className="w-full h-14 text-2xl font-bold text-center border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="text-center">
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">DIA</label>
                    <input
                      type="number" inputMode="numeric" value={currentBp.diastolic}
                      onChange={e => setCurrentBp(p => ({ ...p, diastolic: e.target.value }))}
                      placeholder="80"
                      className="w-full h-14 text-2xl font-bold text-center border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="text-center">
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">PULSE</label>
                    <input
                      type="number" inputMode="numeric" value={currentBp.pulse}
                      onChange={e => setCurrentBp(p => ({ ...p, pulse: e.target.value }))}
                      placeholder="72"
                      className="w-full h-14 text-2xl font-bold text-center border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1" onClick={handleBpSave}>
                    {locale === 'bg' ? 'Запази' : 'Save reading'}
                  </Button>
                  <Button variant="ghost" onClick={skipBp}>{t('vitals.skip_bp', locale)}</Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Step 5: Adherence checklist ── */}
        {step === 5 && (
          <div className="space-y-4">
            <div>
              <div className="text-[13px] font-medium text-gray-700">{t('vitals.step_adherence', locale)}</div>
              <div className="text-xs text-gray-500 mt-0.5">{t('vitals.adherence_hint', locale)}</div>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {adherence.map(it => {
                const checked = !!adhTaken[it.intervention_id];
                return (
                  <label key={it.intervention_id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                      checked ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}>
                    <input type="checkbox" checked={checked}
                      onChange={() => toggleAdh(it.intervention_id)}
                      className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{it.name}</div>
                      {it.dose && <div className="text-xs text-gray-500">{it.dose}</div>}
                    </div>
                    <Badge color="gray">{it.category}</Badge>
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={() => setStep(6)}>
                {locale === 'bg' ? 'Напред →' : 'Next →'}
              </Button>
              <Button variant="ghost" onClick={() => setStep(6)}>{t('vitals.skip_adherence', locale)}</Button>
            </div>
          </div>
        )}

        {/* ── Step 6: Summary ── */}
        {step === 6 && (
          <div className="space-y-4">
            <div className="text-[13px] font-medium text-gray-700">{t('vitals.step_done', locale)}</div>

            {!skipWeight && weight.weight_kg && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">
                  {t('nav.weight', locale)}
                </div>
                <div className="text-2xl font-bold text-gray-900">{weight.weight_kg} kg</div>
              </div>
            )}

            {bpReadings.length > 0 && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">
                  {t('vitals.bp_avg', locale)} ({bpReadings.length})
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {sysAvg}/{diaAvg}{pulseAvg ? ` · ${pulseAvg} bpm` : ''}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {bpReadings.map((r, i) => `${i + 1}: ${r.systolic}/${r.diastolic}`).join(' · ')}
                </div>
              </div>
            )}

            {adherence.length > 0 && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">
                  {t('vitals.adherence_summary', locale)}
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {Object.values(adhTaken).filter(Boolean).length}/{adherence.length}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleFinish} disabled={saving}>
                {saving ? t('common.saving', locale) : t('vitals.finish', locale)}
              </Button>
              <Button variant="secondary" onClick={onClose}>{t('common.cancel', locale)}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VitalsDashboardPage() {
  const { locale } = useLanguage();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [cmAge, setCmAge] = useState<CMAge | null>(null);
  const [slope, setSlope] = useState<Slope | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ritualOpen, setRitualOpen] = useState(false);

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
            <Button onClick={() => setRitualOpen(true)} disabled={!profileId}>
              + {t('vitals.log_ritual', locale)}
            </Button>
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

        {/* ── Deep-link hub ── */}
        {!loading && dash && (
          <div className="mt-6">
            <div className="text-[13px] font-medium text-gray-700 mb-2">{t('vitals.deep_links', locale)}</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Link href="/health/bp"><Card><div className="text-sm font-medium text-gray-900">{t('nav.bp', locale)}</div><div className="text-xs text-gray-500 mt-0.5">{t('vitals.bp_history', locale)}</div></Card></Link>
              <Link href="/health/bp/statistics"><Card><div className="text-sm font-medium text-gray-900">{t('vitals.bp_stats', locale)}</div><div className="text-xs text-gray-500 mt-0.5">circadian · variability</div></Card></Link>
              <Link href="/health/bp/medications"><Card><div className="text-sm font-medium text-gray-900">{t('vitals.bp_meds', locale)}</div><div className="text-xs text-gray-500 mt-0.5">adherence</div></Card></Link>
              <Link href="/health/weight"><Card><div className="text-sm font-medium text-gray-900">{t('vitals.weight_trend', locale)}</div><div className="text-xs text-gray-500 mt-0.5">EWMA · 90d</div></Card></Link>
              <Link href="/health/weight/goals"><Card><div className="text-sm font-medium text-gray-900">{t('vitals.weight_goals', locale)}</div><div className="text-xs text-gray-500 mt-0.5">progress</div></Card></Link>
            </div>
          </div>
        )}

        {ritualOpen && profileId && (
          <RitualModal
            profileId={profileId}
            locale={locale}
            onClose={() => setRitualOpen(false)}
            onDone={() => { setRitualOpen(false); loadAll(profileId); }}
          />
        )}
      </PageContent>
    </PageShell>
  );
}
