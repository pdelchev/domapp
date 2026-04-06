'use client';
// ── RitualModal: weight → BP session → adherence + add intervention → finalize ─
// §FLOW: step 1 weight, steps 2-4 BP readings w/ 60s rest timers, step 5
//        intervention adherence checklist with inline "add new" form,
//        step 6 summary + save-all. Creates VitalsSession first, then
//        weight + BP readings + intervention logs in parallel, finalize.
// §USE: shared across /life and potentially other entry points.

import { useState, useEffect, useRef } from 'react';
import { t } from '../lib/i18n';
import type { Locale } from '../lib/i18n';
import {
  createVitalsSession, finalizeVitalsSession,
  createWeightReading, createBPSession,
  getInterventionLogs, saveInterventionLogs,
  createIntervention,
} from '../lib/api';
import { Button, Badge, Alert, Input, Select, Textarea } from './ui';

interface BpDraft { systolic: string; diastolic: string; pulse: string; }
interface AdherenceItem {
  intervention_id: number; name: string; category: string; dose: string;
  taken_today: boolean | null; taken_yesterday: boolean | null;
}

const CATEGORIES = ['supplement', 'medication', 'diet', 'exercise', 'sleep', 'habit', 'other'];
const FREQUENCIES = [
  { value: 'daily', label: 'Once daily' },
  { value: 'twice_daily', label: 'Twice daily' },
  { value: 'three_daily', label: '3× daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'as_needed', label: 'As needed' },
  { value: 'one_time', label: 'One-time' },
];
const EVIDENCE_GRADES = [
  { value: 'A', label: 'A — Strong' },
  { value: 'B', label: 'B — Moderate' },
  { value: 'C', label: 'C — Preliminary' },
  { value: 'anecdote', label: 'Anecdote' },
];

const EMPTY_INTERVENTION = {
  name: '', category: 'supplement', dose: '', frequency: 'daily',
  reminder_times: ['08:00'],
  started_on: new Date().toISOString().slice(0, 10),
  hypothesis: '', evidence_grade: 'B', source_url: '', notes: '',
};

export function RitualModal({ profileId, locale, onClose, onDone }: {
  profileId: number; locale: Locale;
  onClose: () => void; onDone: () => void;
}) {
  // step: 1 weight, 2-4 bp, 5 adherence+add, 6 summary
  const [step, setStep] = useState<number>(1);
  const [weight, setWeight] = useState({ weight_kg: '', body_fat_pct: '', waist_cm: '', hip_cm: '' });
  const [skipWeight, setSkipWeight] = useState(false);
  const [bpReadings, setBpReadings] = useState<BpDraft[]>([]);
  const [currentBp, setCurrentBp] = useState<BpDraft>({ systolic: '', diastolic: '', pulse: '' });
  const [bpAfterMeds, setBpAfterMeds] = useState(false);
  const [timer, setTimer] = useState(0);
  const [adherence, setAdherence] = useState<AdherenceItem[]>([]);
  const [adhTaken, setAdhTaken] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sysInputRef = useRef<HTMLInputElement>(null);

  // Add intervention inline form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newIntervention, setNewIntervention] = useState({ ...EMPTY_INTERVENTION });
  const [addingSaving, setAddingSaving] = useState(false);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // §PREFILL: load active interventions + yesterday's log on mount
  useEffect(() => {
    getInterventionLogs().then((r: { items: AdherenceItem[] }) => {
      setAdherence(r.items || []);
      const initial: Record<number, boolean> = {};
      (r.items || []).forEach(it => {
        initial[it.intervention_id] = it.taken_today ?? it.taken_yesterday ?? true;
      });
      setAdhTaken(initial);
    }).catch(() => { /* no interventions yet — that's fine */ });
  }, []);

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
    else setStep(5);
  };

  const skipBp = () => {
    setStep(5);
  };

  const toggleAdh = (id: number) => setAdhTaken(p => ({ ...p, [id]: !p[id] }));

  const handleAddIntervention = async () => {
    if (!newIntervention.name.trim()) {
      setError(locale === 'bg' ? 'Въведете име' : 'Enter a name');
      return;
    }
    setAddingSaving(true); setError('');
    try {
      const created = await createIntervention({
        ...newIntervention,
        target_metrics: [],
      });
      // Add to adherence list immediately
      const newItem: AdherenceItem = {
        intervention_id: created.id,
        name: created.name,
        category: created.category,
        dose: created.dose,
        taken_today: null,
        taken_yesterday: null,
      };
      setAdherence(prev => [...prev, newItem]);
      setAdhTaken(prev => ({ ...prev, [created.id]: true }));
      setNewIntervention({ ...EMPTY_INTERVENTION });
      setShowAddForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add');
    } finally {
      setAddingSaving(false);
    }
  };

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
      if (bpReadings.length > 0) {
        posts.push(createBPSession({
          profile: profileId,
          measured_at: now.toISOString(),
          readings: bpReadings.map(r => ({
            systolic: parseInt(r.systolic),
            diastolic: parseInt(r.diastolic),
            pulse: r.pulse ? parseInt(r.pulse) : null,
            arm: 'left', posture: 'sitting',
            is_after_medication: bpAfterMeds,
          })),
        }));
      }
      await Promise.all(posts);
      await finalizeVitalsSession(session.id);
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

        <div className="flex items-center gap-2 mb-6 text-xs text-gray-500 flex-wrap">
          <span className={step > 1 ? 'text-green-600 font-medium' : step === 1 ? 'text-indigo-600 font-medium' : ''}>
            {progressIcon(1)} {locale === 'bg' ? 'тегло' : 'weight'}
          </span>
          <span className="text-gray-300">—</span>
          <span className={step > 4 ? 'text-green-600 font-medium' : step >= 2 ? 'text-indigo-600 font-medium' : ''}>
            {step > 4 ? '✓' : step >= 2 ? '●' : '○'} {locale === 'bg' ? 'кръвно' : 'bp'} ({bpReadings.length}/3)
          </span>
          <span className="text-gray-300">—</span>
          <span className={step > 5 ? 'text-green-600 font-medium' : step === 5 ? 'text-indigo-600 font-medium' : ''}>
            {progressIcon(5)} {locale === 'bg' ? 'приемане' : 'meds & supplements'}
          </span>
          <span className="text-gray-300">—</span>
          <span className={step === 6 ? 'text-indigo-600 font-medium' : ''}>
            {progressIcon(6)} {locale === 'bg' ? 'готово' : 'done'}
          </span>
        </div>

        <Alert type="error" message={error} />

        {/* ═══ STEP 1: WEIGHT ═══ */}
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

        {/* ═══ STEPS 2-4: BP READINGS ═══ */}
        {step >= 2 && step <= 4 && (
          <div className="space-y-4">
            <div className="text-[13px] font-medium text-gray-700">
              {t('vitals.step_bp', locale)} — {t('vitals.take_reading', locale).replace('{n}', String(bpReadings.length + 1))}
            </div>

            {/* Before/after medication toggle — shown on first reading */}
            {bpReadings.length === 0 && timer === 0 && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-xs text-gray-600">
                  {locale === 'bg' ? 'Измерване:' : 'Measured:'}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setBpAfterMeds(false)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      !bpAfterMeds
                        ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                        : 'bg-white text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {locale === 'bg' ? 'Преди хапчета' : 'Before pills'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBpAfterMeds(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      bpAfterMeds
                        ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                        : 'bg-white text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {locale === 'bg' ? 'След хапчета' : 'After pills'}
                  </button>
                </div>
              </div>
            )}

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

        {/* ═══ STEP 5: ADHERENCE + ADD NEW INTERVENTION ═══ */}
        {step === 5 && (
          <div className="space-y-4">
            <div>
              <div className="text-[13px] font-medium text-gray-700">
                {locale === 'bg' ? 'Лекарства и добавки' : 'Medications & Supplements'}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {locale === 'bg'
                  ? 'Отбележете какво сте взели днес. Добавете нови с бутона по-долу.'
                  : 'Check off what you took today. Add new ones below.'}
              </div>
            </div>

            {/* Existing interventions checklist */}
            {adherence.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
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
            )}

            {adherence.length === 0 && !showAddForm && (
              <div className="text-center py-6 text-sm text-gray-500">
                {locale === 'bg'
                  ? 'Все още нямате добавки или лекарства. Добавете първото по-долу.'
                  : 'No supplements or medications yet. Add your first one below.'}
              </div>
            )}

            {/* Add new intervention inline */}
            {!showAddForm ? (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
              >
                <span className="text-lg leading-none">+</span>
                {locale === 'bg' ? 'Добави лекарство / добавка' : 'Add medication / supplement'}
              </button>
            ) : (
              <div className="border border-indigo-200 rounded-lg p-4 bg-indigo-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-medium text-gray-700">
                    {locale === 'bg' ? 'Нова добавка' : 'New intervention'}
                  </div>
                  <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600 text-sm">×</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Input
                      label={locale === 'bg' ? 'Име *' : 'Name *'}
                      value={newIntervention.name}
                      onChange={e => setNewIntervention(p => ({ ...p, name: e.target.value }))}
                      placeholder="Magnesium glycinate 400mg"
                    />
                  </div>
                  <Select
                    label={locale === 'bg' ? 'Категория' : 'Category'}
                    value={newIntervention.category}
                    onChange={e => setNewIntervention(p => ({ ...p, category: e.target.value }))}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                  <Input
                    label={locale === 'bg' ? 'Доза' : 'Dose'}
                    value={newIntervention.dose}
                    onChange={e => setNewIntervention(p => ({ ...p, dose: e.target.value }))}
                    placeholder={locale === 'bg' ? '400 mg, 1.2 mL, 2 табл.' : '400 mg, 1.2 mL, 2 tabs'}
                  />
                  <Select
                    label={locale === 'bg' ? 'Честота' : 'Frequency'}
                    value={newIntervention.frequency}
                    onChange={e => setNewIntervention(p => ({ ...p, frequency: e.target.value }))}
                  >
                    {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </Select>
                  <Input
                    label={locale === 'bg' ? 'Напомняне в' : 'Remind at'}
                    type="time"
                    value={newIntervention.reminder_times[0] || '08:00'}
                    onChange={e => setNewIntervention(p => ({ ...p, reminder_times: [e.target.value] }))}
                  />
                  <Input
                    label={locale === 'bg' ? 'Начало' : 'Started on'}
                    type="date"
                    value={newIntervention.started_on}
                    onChange={e => setNewIntervention(p => ({ ...p, started_on: e.target.value }))}
                  />
                  <Select
                    label={locale === 'bg' ? 'Доказателства' : 'Evidence'}
                    value={newIntervention.evidence_grade}
                    onChange={e => setNewIntervention(p => ({ ...p, evidence_grade: e.target.value }))}
                  >
                    {EVIDENCE_GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </Select>
                </div>
                <details className="text-xs">
                  <summary className="text-gray-500 cursor-pointer">
                    {locale === 'bg' ? 'Допълнителни полета' : 'More fields'}
                  </summary>
                  <div className="grid grid-cols-1 gap-3 mt-3">
                    <Textarea
                      label={locale === 'bg' ? 'Хипотеза' : 'Hypothesis'}
                      value={newIntervention.hypothesis}
                      onChange={e => setNewIntervention(p => ({ ...p, hypothesis: e.target.value }))}
                      rows={2}
                      placeholder="Lower morning systolic, improve HRV"
                    />
                    <Input
                      label={locale === 'bg' ? 'Източник URL' : 'Source URL'}
                      type="url"
                      value={newIntervention.source_url}
                      onChange={e => setNewIntervention(p => ({ ...p, source_url: e.target.value }))}
                      placeholder="https://pubmed.ncbi.nlm.nih.gov/..."
                    />
                    <Textarea
                      label={locale === 'bg' ? 'Бележки' : 'Notes'}
                      value={newIntervention.notes}
                      onChange={e => setNewIntervention(p => ({ ...p, notes: e.target.value }))}
                      rows={2}
                    />
                  </div>
                </details>
                <div className="flex gap-2 justify-end pt-1">
                  <Button variant="secondary" size="sm" onClick={() => setShowAddForm(false)}>
                    {t('common.cancel', locale)}
                  </Button>
                  <Button size="sm" onClick={handleAddIntervention} disabled={addingSaving}>
                    {addingSaving
                      ? (locale === 'bg' ? 'Запазване...' : 'Saving...')
                      : (locale === 'bg' ? 'Добави' : 'Add')}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={() => setStep(6)}>
                {locale === 'bg' ? 'Напред →' : 'Next →'}
              </Button>
              {adherence.length === 0 && (
                <Button variant="ghost" onClick={() => setStep(6)}>
                  {locale === 'bg' ? 'Пропусни' : 'Skip'}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP 6: SUMMARY ═══ */}
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
                  {' · '}
                  {bpAfterMeds
                    ? <Badge color="blue">{locale === 'bg' ? 'след хапчета' : 'after pills'}</Badge>
                    : <Badge color="gray">{locale === 'bg' ? 'преди хапчета' : 'before pills'}</Badge>
                  }
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
                  {locale === 'bg' ? 'Лекарства и добавки' : 'Meds & Supplements'}
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
