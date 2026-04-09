'use client';

/**
 * §PAGE: Daily Health Check-In Wizard
 * §ROUTE: /health/checkin
 * §PURPOSE: Single-flow wizard for all daily health metrics.
 * §UX: 5 steps, each skippable, < 30 seconds total.
 * §MOBILE: Full-screen steps with large touch targets (48px+).
 * §NAV: daily_models.py → daily_services.py → daily_views.py → THIS
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { getHealthProfiles, getTodaySchedule, submitDailyWizard } from '../../lib/api';
import { PageShell, Button, Card, Spinner, Alert } from '../../components/ui';
import NavBar from '../../components/NavBar';

// §TYPE: Wizard state
interface WizardData {
  profile_id: number;
  mood: number | null;
  energy: number | null;
  sleep_hours: number | null;
  sleep_quality: number | null;
  pain_level: number;
  stress_level: number | null;
  water_ml: number;
  weight: { value: number | null; body_fat: number | null; fasted: boolean } | null;
  bp: { systolic: number | null; diastolic: number | null; pulse: number | null; context: string[] } | null;
  doses: { schedule_id: number; taken: boolean; reason?: string }[];
  notes: string;
}

// §CONST: Mood emoji map — large, universally understood icons
const MOODS = [
  { value: 1, emoji: '😫', label: 'Bad' },
  { value: 2, emoji: '😟', label: 'Poor' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '😊', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Great' },
];

// §CONST: BP context flags
const BP_CONTEXTS = [
  { key: 'caffeine', label: 'Caffeine', icon: '☕' },
  { key: 'exercise', label: 'Exercise', icon: '🏃' },
  { key: 'medication', label: 'Medication', icon: '💊' },
  { key: 'stressed', label: 'Stressed', icon: '😰' },
];

interface ScheduleItem {
  schedule_id: number;
  name: string;
  photo_closeup: string | null;
  strength: string;
  dose_amount: number;
  dose_unit: string;
  split_count: number;
  taken: boolean;
  taken_at: string | null;
  condition: string;
  is_optional: boolean;
}

interface TimeSlotGroup {
  time_slot: string;
  items: ScheduleItem[];
  taken: number;
  total: number;
}

export default function CheckInWizard() {
  const { locale } = useLanguage();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [schedule, setSchedule] = useState<TimeSlotGroup[]>([]);

  const [data, setData] = useState<WizardData>({
    profile_id: 0,
    mood: null, energy: null, sleep_hours: null, sleep_quality: null,
    pain_level: 0, stress_level: null, water_ml: 0,
    weight: null, bp: null, doses: [], notes: '',
  });

  // §INIT: Load profile + today's schedule
  useEffect(() => {
    (async () => {
      try {
        const profiles = await getHealthProfiles();
        const primary = profiles.find((p: any) => p.is_primary) || profiles[0];
        if (primary) {
          setProfileId(primary.id);
          setData(prev => ({ ...prev, profile_id: primary.id }));

          const sched = await getTodaySchedule(primary.id);
          setSchedule(sched);

          // Pre-populate doses from schedule
          const allDoses = sched.flatMap((g: TimeSlotGroup) =>
            g.items.map((item: ScheduleItem) => ({
              schedule_id: item.schedule_id,
              taken: item.taken,
            }))
          );
          setData(prev => ({ ...prev, doses: allDoses }));
        }
      } catch (e) {
        setError('Failed to load profile.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // §SUBMIT: Send all wizard data in one request
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError('');
    try {
      await submitDailyWizard(data as unknown as Record<string, unknown>);
      setSuccess(true);
      setTimeout(() => router.push('/health'), 2000);
    } catch (e: any) {
      setError(e.message || 'Failed to save.');
    } finally {
      setSubmitting(false);
    }
  }, [data, router]);

  // §DOSE: Toggle dose taken/skipped
  const toggleDose = (scheduleId: number) => {
    setData(prev => ({
      ...prev,
      doses: prev.doses.map(d =>
        d.schedule_id === scheduleId ? { ...d, taken: !d.taken } : d
      ),
    }));
  };

  // §DOSE: Mark all in a time slot as taken
  const markAllTaken = (items: ScheduleItem[]) => {
    const ids = new Set(items.map(i => i.schedule_id));
    setData(prev => ({
      ...prev,
      doses: prev.doses.map(d =>
        ids.has(d.schedule_id) ? { ...d, taken: true } : d
      ),
    }));
  };

  if (loading) {
    return (
      <PageShell>
        <NavBar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Spinner message="Loading..." />
        </div>
      </PageShell>
    );
  }

  // §SUCCESS: Show completion screen
  if (success) {
    return (
      <PageShell>
        <NavBar />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
          <div className="text-6xl">✅</div>
          <h2 className="text-2xl font-bold text-gray-900">Check-in saved!</h2>
          <p className="text-gray-500">Redirecting to Health Hub...</p>
        </div>
      </PageShell>
    );
  }

  const STEPS = ['How are you?', 'Weight', 'Blood Pressure', 'Water', 'Supplements'];
  const totalSteps = STEPS.length;

  return (
    <PageShell>
      <NavBar />
      <div className="max-w-lg mx-auto px-4 pb-32 pt-4">
        {/* §PROGRESS: Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-indigo-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        <div className="text-sm text-gray-500 mb-1">
          Step {step + 1} of {totalSteps}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{STEPS[step]}</h1>

        <Alert type="error" message={error} />

        {/* ────────────────────────────────────────────── */}
        {/* §STEP 1: How are you? */}
        {/* ────────────────────────────────────────────── */}
        {step === 0 && (
          <div className="space-y-6">
            {/* Mood */}
            <div>
              <label className="text-[13px] font-medium text-gray-700 mb-3 block">Mood</label>
              <div className="flex justify-between">
                {MOODS.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setData(prev => ({ ...prev, mood: m.value }))}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                      data.mood === m.value
                        ? 'bg-indigo-50 ring-2 ring-indigo-500 scale-110'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-4xl">{m.emoji}</span>
                    <span className="text-xs text-gray-500">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Energy */}
            <div>
              <label className="text-[13px] font-medium text-gray-700 mb-2 block">
                Energy Level
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(v => (
                  <button
                    key={v}
                    onClick={() => setData(prev => ({ ...prev, energy: v }))}
                    className={`flex-1 h-12 rounded-lg font-semibold text-lg transition-all ${
                      data.energy !== null && v <= data.energy
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Sleep */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-1 block">
                  Sleep (hours)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  max="24"
                  value={data.sleep_hours ?? ''}
                  onChange={e => setData(prev => ({
                    ...prev,
                    sleep_hours: e.target.value ? parseFloat(e.target.value) : null,
                  }))}
                  className="w-full h-12 text-center text-xl font-semibold border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="7.5"
                />
              </div>
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-1 block">
                  Sleep Quality
                </label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(v => (
                    <button
                      key={v}
                      onClick={() => setData(prev => ({ ...prev, sleep_quality: v }))}
                      className={`flex-1 h-12 rounded-lg text-lg transition-all ${
                        data.sleep_quality !== null && v <= data.sleep_quality
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Pain */}
            <div>
              <label className="text-[13px] font-medium text-gray-700 mb-2 block">
                Pain Level: {data.pain_level}
              </label>
              <input
                type="range"
                min="0"
                max="10"
                value={data.pain_level}
                onChange={e => setData(prev => ({ ...prev, pain_level: parseInt(e.target.value) }))}
                className="w-full h-3 accent-indigo-600"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>None</span>
                <span>Severe</span>
              </div>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────── */}
        {/* §STEP 2: Weight */}
        {/* ────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="20"
                max="300"
                value={data.weight?.value ?? ''}
                onChange={e => setData(prev => ({
                  ...prev,
                  weight: {
                    value: e.target.value ? parseFloat(e.target.value) : null,
                    body_fat: prev.weight?.body_fat ?? null,
                    fasted: prev.weight?.fasted ?? false,
                  },
                }))}
                className="w-48 h-16 text-center text-3xl font-bold border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mx-auto block"
                placeholder="82.4"
              />
              <span className="text-lg text-gray-500 mt-1 block">kg</span>
            </div>

            <div className="flex justify-center gap-4">
              <label className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.weight?.fasted ?? false}
                  onChange={e => setData(prev => ({
                    ...prev,
                    weight: {
                      value: prev.weight?.value ?? null,
                      body_fat: prev.weight?.body_fat ?? null,
                      fasted: e.target.checked,
                    },
                  }))}
                  className="w-5 h-5 rounded accent-indigo-600"
                />
                <span className="text-sm">Fasted</span>
              </label>
            </div>

            {/* Body fat (optional) */}
            <div>
              <label className="text-[13px] font-medium text-gray-700 mb-1 block">
                Body Fat % (optional)
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="3"
                max="60"
                value={data.weight?.body_fat ?? ''}
                onChange={e => setData(prev => ({
                  ...prev,
                  weight: {
                    value: prev.weight?.value ?? null,
                    body_fat: e.target.value ? parseFloat(e.target.value) : null,
                    fasted: prev.weight?.fasted ?? false,
                  },
                }))}
                className="w-full h-12 text-center text-xl border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="22.5"
              />
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────── */}
        {/* §STEP 3: Blood Pressure */}
        {/* ────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: 'systolic', label: 'SYS', placeholder: '128' },
                { key: 'diastolic', label: 'DIA', placeholder: '82' },
                { key: 'pulse', label: 'PUL', placeholder: '72' },
              ].map(f => (
                <div key={f.key} className="text-center">
                  <label className="text-[13px] font-medium text-gray-500 mb-1 block">
                    {f.label}
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={(data.bp as any)?.[f.key] ?? ''}
                    onChange={e => setData(prev => ({
                      ...prev,
                      bp: {
                        systolic: prev.bp?.systolic ?? null,
                        diastolic: prev.bp?.diastolic ?? null,
                        pulse: prev.bp?.pulse ?? null,
                        context: prev.bp?.context ?? [],
                        [f.key]: e.target.value ? parseInt(e.target.value) : null,
                      },
                    }))}
                    className="w-full h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder={f.placeholder}
                  />
                </div>
              ))}
            </div>

            {/* Context flags */}
            <div className="flex flex-wrap gap-2 justify-center">
              {BP_CONTEXTS.map(c => (
                <button
                  key={c.key}
                  onClick={() => setData(prev => {
                    const ctx = prev.bp?.context ?? [];
                    const next = ctx.includes(c.key)
                      ? ctx.filter(x => x !== c.key)
                      : [...ctx, c.key];
                    return {
                      ...prev,
                      bp: { ...prev.bp!, context: next },
                    };
                  })}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm transition-all ${
                    data.bp?.context?.includes(c.key)
                      ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <span>{c.icon}</span>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>

            {/* BP Stage indicator */}
            {data.bp?.systolic && data.bp?.diastolic && (
              <BPStageIndicator sys={data.bp.systolic} dia={data.bp.diastolic} />
            )}
          </div>
        )}

        {/* ────────────────────────────────────────────── */}
        {/* §STEP 4: Water */}
        {/* ────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="flex flex-wrap justify-center gap-3">
                {[...Array(8)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setData(prev => ({
                      ...prev,
                      water_ml: (i + 1) * 250,
                    }))}
                    className={`w-14 h-14 rounded-xl text-2xl transition-all ${
                      data.water_ml >= (i + 1) * 250
                        ? 'bg-blue-100 scale-110'
                        : 'bg-gray-50'
                    }`}
                  >
                    🥤
                  </button>
                ))}
              </div>
              <p className="text-lg font-semibold text-gray-900 mt-4">
                {Math.round(data.water_ml / 250)} / 8 glasses
              </p>
              <p className="text-sm text-gray-500">
                {data.water_ml} ml
              </p>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────── */}
        {/* §STEP 5: Supplements */}
        {/* ────────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            {schedule.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <p className="text-lg">No supplements scheduled</p>
                <p className="text-sm mt-1">Add supplements in Settings</p>
              </div>
            )}

            {schedule.map(group => (
              <Card key={group.time_slot}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 capitalize">
                    {group.time_slot.replace('_', ' ')}
                  </h3>
                  <button
                    onClick={() => markAllTaken(group.items)}
                    className="text-sm text-indigo-600 font-medium"
                  >
                    Mark All ✓
                  </button>
                </div>

                <div className="space-y-2">
                  {group.items.map(item => {
                    const dose = data.doses.find(d => d.schedule_id === item.schedule_id);
                    const isTaken = dose?.taken ?? false;

                    return (
                      <button
                        key={item.schedule_id}
                        onClick={() => toggleDose(item.schedule_id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                          isTaken
                            ? 'bg-green-50 border border-green-200'
                            : 'bg-gray-50 border border-gray-200'
                        }`}
                      >
                        {/* §PILL-PHOTO: Show actual pill image */}
                        <div className="w-12 h-12 rounded-lg bg-white border border-gray-200 flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {item.photo_closeup ? (
                            <img
                              src={item.photo_closeup}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-2xl">💊</span>
                          )}
                        </div>

                        <div className="flex-1 text-left">
                          <p className={`font-medium ${isTaken ? 'text-green-800' : 'text-gray-900'}`}>
                            {item.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {item.dose_amount}{item.split_count > 1 ? `/${item.split_count}` : ''} {item.dose_unit}
                            {item.strength && ` • ${item.strength}`}
                          </p>
                        </div>

                        {/* §CHECK: Large checkmark for elderly users */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isTaken
                            ? 'bg-green-500 text-white'
                            : 'border-2 border-gray-300'
                        }`}>
                          {isTaken && (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ────────────────────────────────────────────── */}
        {/* §NAV: Bottom navigation bar */}
        {/* ────────────────────────────────────────────── */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex gap-3 z-50">
          {step > 0 && (
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setStep(s => s - 1)}
              className="flex-1"
            >
              ← Back
            </Button>
          )}

          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              if (step < totalSteps - 1) {
                setStep(s => s + 1);
              } else {
                handleSubmit();
              }
            }}
            className="text-gray-500"
          >
            Skip
          </Button>

          {step < totalSteps - 1 ? (
            <Button
              variant="primary"
              size="lg"
              onClick={() => setStep(s => s + 1)}
              className="flex-1"
            >
              Next →
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1"
            >
              {submitting ? 'Saving...' : 'Done ✓'}
            </Button>
          )}
        </div>
      </div>
    </PageShell>
  );
}

/**
 * §COMPONENT: BP Stage indicator (inline, not a separate component file).
 * Shows AHA classification based on systolic/diastolic values.
 */
function BPStageIndicator({ sys, dia }: { sys: number; dia: number }) {
  let stage = 'Normal';
  let color = 'text-green-700 bg-green-50';

  if (sys >= 180 || dia >= 120) {
    stage = 'Crisis';
    color = 'text-red-700 bg-red-50';
  } else if (sys >= 140 || dia >= 90) {
    stage = 'Stage 2';
    color = 'text-orange-700 bg-orange-50';
  } else if (sys >= 130 || dia >= 80) {
    stage = 'Stage 1';
    color = 'text-yellow-700 bg-yellow-50';
  } else if (sys >= 120) {
    stage = 'Elevated';
    color = 'text-amber-700 bg-amber-50';
  }

  return (
    <div className={`text-center py-2 px-4 rounded-lg ${color} font-semibold`}>
      {stage}
    </div>
  );
}
