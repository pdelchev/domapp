'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  getRitualDashboard, toggleRitualItem, seedRitualProtocol, getRitualAdherence,
  createRitualItem, uploadRxImage,
  createBPReading,
  createWeightReading, createBodyMeasurement,
  getFoodEntries, createFoodEntry, deleteFoodEntry,
  getHealthProfiles,
} from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import {
  PageShell, PageContent, Card, Button, Badge, Input, Select,
  Alert, Spinner, BottomSheet,
} from '../components/ui';

// ══════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════

interface RitualItem {
  id: number; name: string; category: string; category_display: string;
  dose: string; instructions: string; scheduled_time: string | null;
  timing: string; condition: string; warning: string; color: string;
  sort_order: number; completed: boolean; completed_at: string | null;
  skipped: boolean; log_id: number | null;
  prescription_note: string; prescription_image: string | null;
}

interface Dashboard { date: string; items: RitualItem[]; total: number; completed: number; pct: number; }
interface AdherenceDay { date: string; pct: number }
interface Adherence { days: number; avg_pct: number; streak: number; daily: AdherenceDay[] }
interface Profile { id: number; full_name: string; sex: string; is_primary: boolean; }
interface FoodItem { id: number; name: string; meal_type: string; calories: number; protein: string; carbs: string; fat: string; fiber: string; serving_size: string; eaten_at: string; }

// ══════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════

const CAT_ICON: Record<string, string> = {
  medication: '💊', supplement: '🧬', injection: '💉', meal: '🍽️',
  exercise: '🏋️', work: '💻', social: '👥', sleep: '😴', hydration: '💧', other: '📌',
};

const CAT_BG: Record<string, string> = {
  medication: 'bg-red-50 border-red-200', supplement: 'bg-amber-50 border-amber-200',
  injection: 'bg-purple-50 border-purple-200', meal: 'bg-green-50 border-green-200',
  exercise: 'bg-emerald-50 border-emerald-200', work: 'bg-gray-50 border-gray-200',
  social: 'bg-violet-50 border-violet-200', sleep: 'bg-indigo-50 border-indigo-200',
  hydration: 'bg-blue-50 border-blue-200', other: 'bg-gray-50 border-gray-200',
};

const TIME_SECTIONS = [
  { key: 'morning', label_en: 'Morning', label_bg: 'Сутрин', icon: '🌅', times: ['morning'] },
  { key: 'fasted', label_en: 'Fasted Window', label_bg: 'Гладуване', icon: '⏳', times: ['fasted'] },
  { key: 'meal1', label_en: 'First Meal (13:00)', label_bg: 'Първо хранене (13:00)', icon: '🍽️', times: ['with_meal_1'] },
  { key: 'afternoon', label_en: 'Afternoon / Pre-workout', label_bg: 'Следобед / Преди тренировка', icon: '☀️', times: ['pre_workout'] },
  { key: 'meal2', label_en: 'Last Meal (17:30)', label_bg: 'Последно хранене (17:30)', icon: '🥗', times: ['with_meal_2'] },
  { key: 'evening', label_en: 'Evening', label_bg: 'Вечер', icon: '🌙', times: ['evening'] },
  { key: 'bedtime', label_en: 'Bedtime', label_bg: 'Преди сън', icon: '🛌', times: ['bedtime'] },
  { key: 'anytime', label_en: 'Anytime', label_bg: 'По всяко време', icon: '📋', times: ['anytime'] },
];

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const KCAL_TARGET = 2000;

type BpStage = 'normal' | 'elevated' | 'stage1' | 'stage2' | 'crisis';
function classifyBp(sys: number, dia: number): BpStage {
  if (sys >= 180 || dia >= 120) return 'crisis';
  if (sys >= 140 || dia >= 90) return 'stage2';
  if (sys >= 130 || dia >= 80) return 'stage1';
  if (sys >= 120 && dia < 80) return 'elevated';
  return 'normal';
}
const STAGE_COLORS: Record<BpStage, string> = {
  normal: 'text-emerald-600', elevated: 'text-yellow-600', stage1: 'text-orange-600', stage2: 'text-red-600', crisis: 'text-red-800',
};
const STAGE_LABELS: Record<BpStage, { en: string; bg: string }> = {
  normal: { en: 'Normal', bg: 'Нормално' }, elevated: { en: 'Elevated', bg: 'Повишено' },
  stage1: { en: 'Stage 1 HTN', bg: 'Хипертония ст. 1' }, stage2: { en: 'Stage 2 HTN', bg: 'Хипертония ст. 2' },
  crisis: { en: 'Hypertensive Crisis', bg: 'Хипертензивна криза' },
};

const BODY_SITES = [
  { key: 'waist', en: 'Waist', bg: 'Талия' },
  { key: 'hips', en: 'Hips', bg: 'Ханш' },
  { key: 'chest', en: 'Chest', bg: 'Гърди' },
  { key: 'belly_under', en: 'Belly (Navel)', bg: 'Корем (пъп)' },
  { key: 'belly_mid', en: 'Mid Belly', bg: 'Среден корем' },
  { key: 'bicep_right', en: 'R. Bicep', bg: 'Д. Бицепс' },
  { key: 'bicep_left', en: 'L. Bicep', bg: 'Л. Бицепс' },
  { key: 'thigh_right', en: 'R. Thigh', bg: 'Д. Бедро' },
  { key: 'thigh_left', en: 'L. Thigh', bg: 'Л. Бедро' },
  { key: 'neck', en: 'Neck', bg: 'Врат' },
  { key: 'forearm_right', en: 'R. Forearm', bg: 'Д. Предмишница' },
  { key: 'forearm_left', en: 'L. Forearm', bg: 'Л. Предмишница' },
];

const TIMING_OPTIONS = [
  { value: 'morning', en: 'Morning', bg: 'Сутрин' },
  { value: 'fasted', en: 'Fasted Window', bg: 'Гладуване' },
  { value: 'with_meal_1', en: 'With First Meal', bg: 'С първо хранене' },
  { value: 'pre_workout', en: 'Afternoon / Pre-workout', bg: 'Следобед / Преди тренировка' },
  { value: 'with_meal_2', en: 'With Last Meal', bg: 'С последно хранене' },
  { value: 'evening', en: 'Evening', bg: 'Вечер' },
  { value: 'bedtime', en: 'Bedtime', bg: 'Преди сън' },
  { value: 'anytime', en: 'Anytime', bg: 'По всяко време' },
];

// ══════════════════════════════════════════════════════════════════
// LOG MODAL STEPS
// ══════════════════════════════════════════════════════════════════

type LogStep = 'bp' | 'weight' | 'supplements' | 'additional' | 'done';
const LOG_STEPS: LogStep[] = ['bp', 'weight', 'supplements', 'additional', 'done'];

function stepTitle(step: LogStep, locale: string): string {
  const titles: Record<LogStep, { en: string; bg: string }> = {
    bp: { en: 'Blood Pressure', bg: 'Кръвно налягане' },
    weight: { en: 'Weight & Body', bg: 'Тегло и тяло' },
    supplements: { en: 'Supplements & Pills', bg: 'Добавки и лекарства' },
    additional: { en: 'Additional Vitals', bg: 'Допълнителни показатели' },
    done: { en: 'Done!', bg: 'Готово!' },
  };
  return titles[step]?.[locale as 'en' | 'bg'] || titles[step]?.en || '';
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════

export default function DailyHubPage() {
  const router = useRouter();
  const { locale } = useLanguage();

  // ---- State ----
  const [tab, setTab] = useState<'ritual' | 'food'>('ritual');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Ritual
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [adherence, setAdherence] = useState<Adherence | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [toggling, setToggling] = useState<number | null>(null);
  const [showRx, setShowRx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const rxFileRef = useRef<HTMLInputElement>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // Food
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [showFoodForm, setShowFoodForm] = useState(false);
  const [foodForm, setFoodForm] = useState({ name: '', meal_type: 'lunch', calories: '', protein: '', carbs: '', fat: '', fiber: '', serving_size: '' });
  const [favorites, setFavorites] = useState<typeof foodForm[]>([]);
  const [savingFood, setSavingFood] = useState(false);

  // Log Modal
  const [logOpen, setLogOpen] = useState(false);
  const [logStep, setLogStep] = useState<LogStep>('bp');
  const [logSaving, setLogSaving] = useState(false);
  const [logSummary, setLogSummary] = useState<string[]>([]);

  // BP form
  const [bpForm, setBpForm] = useState({ systolic: '', diastolic: '', pulse: '', arm: 'left', posture: 'sitting' });

  // Weight form
  const [weightForm, setWeightForm] = useState({ weight_kg: '', body_fat_pct: '' });
  const [bodyMeas, setBodyMeas] = useState<Record<string, string>>({});
  const [showBodyMeas, setShowBodyMeas] = useState(false);

  // Additional vitals form
  const [vitalsForm, setVitalsForm] = useState({ glucose: '', uric_acid: '', heart_rate: '', temperature: '', oxygen: '' });

  // Add new supplement form
  const [showAddSupplement, setShowAddSupplement] = useState(false);
  const [newSupp, setNewSupp] = useState({ name: '', category: 'supplement', dose: '', timing: 'morning', condition: 'daily' });

  // ---- Load data ----
  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === todayStr;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, adh, profs, foodData] = await Promise.allSettled([
        getRitualDashboard(selectedDate),
        getRitualAdherence(14),
        getHealthProfiles(),
        getFoodEntries(selectedDate),
      ]);

      if (dash.status === 'fulfilled') {
        setDashboard(dash.value);
        // Auto-seed if empty
        if (dash.value.items.length === 0) {
          await seedRitualProtocol();
          const newDash = await getRitualDashboard(selectedDate);
          setDashboard(newDash);
        }
      }
      if (adh.status === 'fulfilled') setAdherence(adh.value);
      if (profs.status === 'fulfilled') setProfiles(profs.value);
      if (foodData.status === 'fulfilled') setFoods(foodData.value);
    } catch {
      setError('Failed to load data');
    }
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const saved = localStorage.getItem('food_favorites');
    if (saved) setFavorites(JSON.parse(saved));
  }, []);

  // ---- Ritual handlers ----
  const handleToggle = async (itemId: number) => {
    setToggling(itemId);
    try {
      await toggleRitualItem(itemId, selectedDate);
      setDashboard((prev) => {
        if (!prev) return prev;
        const items = prev.items.map((item) => {
          if (item.id !== itemId) return item;
          const newCompleted = !item.completed;
          return { ...item, completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null };
        });
        const done = items.filter(i => i.completed).length;
        const total = items.filter(i => i.condition === 'daily' || i.condition === 'gym_day').length;
        return { ...prev, items, completed: done, total, pct: total > 0 ? Math.round(done / total * 100) : 0 };
      });
    } catch { /* */ }
    setToggling(null);
  };

  const handleUploadRx = async (itemId: number) => {
    const file = rxFileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadRxImage(itemId, file);
      setDashboard((prev) => {
        if (!prev) return prev;
        return { ...prev, items: prev.items.map((i) => i.id === itemId ? { ...i, prescription_image: result.prescription_image } : i) };
      });
    } catch { /* */ }
    setUploading(false);
    if (rxFileRef.current) rxFileRef.current.value = '';
  };

  // ---- Food handlers ----
  const submitFood = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingFood(true);
    try {
      const created = await createFoodEntry({
        name: foodForm.name, meal_type: foodForm.meal_type,
        calories: Number(foodForm.calories) || 0, protein: Number(foodForm.protein) || 0,
        carbs: Number(foodForm.carbs) || 0, fat: Number(foodForm.fat) || 0,
        fiber: Number(foodForm.fiber) || 0, serving_size: foodForm.serving_size,
        eaten_at: new Date().toISOString(),
      });
      setFoods((prev) => [created, ...prev]);
      setShowFoodForm(false);
      setFoodForm({ name: '', meal_type: 'lunch', calories: '', protein: '', carbs: '', fat: '', fiber: '', serving_size: '' });
    } catch { setError('Failed to save'); }
    setSavingFood(false);
  };

  const saveFavorite = () => {
    if (!foodForm.name) return;
    const updated = [...favorites.filter((f) => f.name !== foodForm.name), foodForm];
    setFavorites(updated);
    localStorage.setItem('food_favorites', JSON.stringify(updated));
  };

  const handleDeleteFood = async (id: number) => {
    if (!confirm(locale === 'bg' ? 'Изтриване?' : 'Delete?')) return;
    await deleteFoodEntry(id);
    setFoods((prev) => prev.filter((f) => f.id !== id));
  };

  // ---- Log Modal handlers ----
  const openLogModal = () => {
    setLogOpen(true);
    setLogStep('bp');
    setLogSummary([]);
    setBpForm({ systolic: '', diastolic: '', pulse: '', arm: 'left', posture: 'sitting' });
    setWeightForm({ weight_kg: '', body_fat_pct: '' });
    setBodyMeas({});
    setShowBodyMeas(false);
    setVitalsForm({ glucose: '', uric_acid: '', heart_rate: '', temperature: '', oxygen: '' });
  };

  const nextStep = () => {
    const idx = LOG_STEPS.indexOf(logStep);
    if (idx < LOG_STEPS.length - 1) setLogStep(LOG_STEPS[idx + 1]);
  };

  const skipStep = () => nextStep();

  const saveBP = async () => {
    if (!bpForm.systolic || !bpForm.diastolic) return nextStep();
    setLogSaving(true);
    try {
      const primaryProfile = profiles.find(p => p.is_primary);
      await createBPReading({
        systolic: Number(bpForm.systolic), diastolic: Number(bpForm.diastolic),
        pulse: bpForm.pulse ? Number(bpForm.pulse) : null,
        arm: bpForm.arm, posture: bpForm.posture,
        measured_at: new Date().toISOString(),
        ...(primaryProfile ? { profile: primaryProfile.id } : {}),
      });
      const stage = classifyBp(Number(bpForm.systolic), Number(bpForm.diastolic));
      setLogSummary(prev => [...prev, `BP: ${bpForm.systolic}/${bpForm.diastolic} (${STAGE_LABELS[stage][locale as 'en' | 'bg']})`]);
    } catch { /* continue anyway */ }
    setLogSaving(false);
    nextStep();
  };

  const saveWeight = async () => {
    if (!weightForm.weight_kg) {
      // Still save body measurements if any were entered
      const filledMeas = Object.entries(bodyMeas).filter(([, v]) => v);
      if (filledMeas.length > 0) {
        setLogSaving(true);
        try {
          await Promise.all(filledMeas.map(([site, val]) =>
            createBodyMeasurement({ site, value_cm: Number(val), measured_at: todayStr })
          ));
          setLogSummary(prev => [...prev, `${locale === 'bg' ? 'Измервания' : 'Body'}: ${filledMeas.length} ${locale === 'bg' ? 'измервания' : 'measurements'}`]);
        } catch { /* */ }
        setLogSaving(false);
      }
      if (filledMeas.length === 0) return nextStep();
      nextStep();
      return;
    }
    setLogSaving(true);
    try {
      const primaryProfile = profiles.find(p => p.is_primary);
      const data: Record<string, unknown> = {
        weight_kg: Number(weightForm.weight_kg),
        measured_at: new Date().toISOString(),
        ...(primaryProfile ? { profile: primaryProfile.id } : {}),
      };
      if (weightForm.body_fat_pct) data.body_fat_pct = Number(weightForm.body_fat_pct);
      // Include waist/hip in weight reading if provided
      if (bodyMeas.waist) data.waist_cm = Number(bodyMeas.waist);
      if (bodyMeas.hips) data.hip_cm = Number(bodyMeas.hips);
      await createWeightReading(data);
      setLogSummary(prev => [...prev, `${locale === 'bg' ? 'Тегло' : 'Weight'}: ${weightForm.weight_kg} kg`]);

      // Save remaining body measurements
      const otherMeas = Object.entries(bodyMeas).filter(([k, v]) => v && k !== 'waist' && k !== 'hips');
      if (otherMeas.length > 0) {
        await Promise.all(otherMeas.map(([site, val]) =>
          createBodyMeasurement({ site, value_cm: Number(val), measured_at: todayStr })
        ));
        setLogSummary(prev => [...prev, `${locale === 'bg' ? 'Тяло' : 'Body'}: ${otherMeas.length + (bodyMeas.waist ? 1 : 0) + (bodyMeas.hips ? 1 : 0)} ${locale === 'bg' ? 'измервания' : 'measurements'}`]);
      }
    } catch { /* */ }
    setLogSaving(false);
    nextStep();
  };

  const saveSupplements = async () => {
    // Supplements are toggled in-place, just move to next step
    nextStep();
  };

  const saveAdditional = async () => {
    const entries: string[] = [];
    // These go through the simple measurements API
    setLogSaving(true);
    try {
      const { createMeasurement } = await import('../lib/api');
      if (vitalsForm.glucose) {
        await createMeasurement({ measurement_type: 'glucose', value: Number(vitalsForm.glucose), unit: 'mmol/L', measured_at: new Date().toISOString() });
        entries.push(`${locale === 'bg' ? 'Глюкоза' : 'Glucose'}: ${vitalsForm.glucose}`);
      }
      if (vitalsForm.uric_acid) {
        await createMeasurement({ measurement_type: 'uric_acid', value: Number(vitalsForm.uric_acid), unit: 'μmol/L', measured_at: new Date().toISOString() });
        entries.push(`${locale === 'bg' ? 'Пик. к-на' : 'Uric acid'}: ${vitalsForm.uric_acid}`);
      }
      if (vitalsForm.heart_rate) {
        await createMeasurement({ measurement_type: 'heart_rate', value: Number(vitalsForm.heart_rate), unit: 'bpm', measured_at: new Date().toISOString() });
        entries.push(`${locale === 'bg' ? 'Пулс' : 'HR'}: ${vitalsForm.heart_rate}`);
      }
      if (vitalsForm.temperature) {
        await createMeasurement({ measurement_type: 'temperature', value: Number(vitalsForm.temperature), unit: '°C', measured_at: new Date().toISOString() });
        entries.push(`${locale === 'bg' ? 'Темп' : 'Temp'}: ${vitalsForm.temperature}`);
      }
      if (vitalsForm.oxygen) {
        await createMeasurement({ measurement_type: 'oxygen', value: Number(vitalsForm.oxygen), unit: '%', measured_at: new Date().toISOString() });
        entries.push(`SpO2: ${vitalsForm.oxygen}%`);
      }
    } catch { /* */ }
    if (entries.length > 0) setLogSummary(prev => [...prev, ...entries]);
    setLogSaving(false);
    nextStep();
  };

  const closeLogModal = () => {
    setLogOpen(false);
    // Refresh data after logging
    loadData();
  };

  // Add new supplement
  const handleAddSupplement = async () => {
    if (!newSupp.name) return;
    try {
      await createRitualItem(newSupp);
      setShowAddSupplement(false);
      setNewSupp({ name: '', category: 'supplement', dose: '', timing: 'morning', condition: 'daily' });
      // Reload ritual dashboard to show new item
      const dash = await getRitualDashboard(selectedDate);
      setDashboard(dash);
    } catch { /* */ }
  };

  // ---- Computed ----
  const todayCals = foods.reduce((s, f) => s + f.calories, 0);
  const todayProtein = foods.reduce((s, f) => s + Number(f.protein), 0);
  const todayCarbs = foods.reduce((s, f) => s + Number(f.carbs), 0);
  const todayFat = foods.reduce((s, f) => s + Number(f.fat), 0);
  const calPct = Math.min(100, Math.round((todayCals / KCAL_TARGET) * 100));

  const bpStage = (bpForm.systolic && bpForm.diastolic)
    ? classifyBp(Number(bpForm.systolic), Number(bpForm.diastolic))
    : null;

  const stepIdx = LOG_STEPS.indexOf(logStep);

  if (loading) return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        {/* Header with date nav */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">
            {locale === 'bg' ? 'Дневен хъб' : 'Daily Hub'}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() - 1);
                setSelectedDate(d.toISOString().split('T')[0]);
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 active:scale-90"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
              onClick={() => setSelectedDate(todayStr)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${isToday ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {isToday ? (locale === 'bg' ? 'Днес' : 'Today') : selectedDate}
            </button>
            <button
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() + 1);
                if (d.toISOString().split('T')[0] <= todayStr) setSelectedDate(d.toISOString().split('T')[0]);
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 active:scale-90"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        <Alert type="error" message={error} />

        {/* Progress card */}
        {dashboard && (
          <Card className="mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Progress ring */}
                <div className="relative w-14 h-14">
                  <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                    <circle cx="28" cy="28" r="24" fill="none" stroke="#f3f4f6" strokeWidth="4.5" />
                    <circle cx="28" cy="28" r="24" fill="none"
                      stroke={dashboard.pct >= 80 ? '#10b981' : dashboard.pct >= 50 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="4.5" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 24}`}
                      strokeDashoffset={`${2 * Math.PI * 24 * (1 - dashboard.pct / 100)}`}
                      style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-900">{dashboard.pct}%</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{dashboard.completed}/{dashboard.total} {locale === 'bg' ? 'завършени' : 'done'}</p>
                  {adherence && adherence.streak > 0 && (
                    <p className="text-xs text-amber-600 mt-0.5">🔥 {adherence.streak} {locale === 'bg' ? 'дни поред' : 'day streak'}</p>
                  )}
                </div>
              </div>
              {/* Adherence mini chart */}
              {adherence && adherence.daily.length > 0 && (
                <div className="flex items-end gap-px h-8 w-32">
                  {adherence.daily.map((day, i) => (
                    <div key={i} className="flex-1">
                      <div
                        className={`w-full rounded-sm ${day.pct >= 80 ? 'bg-green-400' : day.pct >= 50 ? 'bg-amber-400' : day.pct > 0 ? 'bg-red-300' : 'bg-gray-200'}`}
                        style={{ height: `${Math.max(day.pct * 0.3, 2)}px` }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Tabs: Ritual | Food */}
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          <button
            onClick={() => setTab('ritual')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'ritual' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            💊 {locale === 'bg' ? 'Дневен ритуал' : 'Daily Ritual'}
          </button>
          <button
            onClick={() => setTab('food')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'food' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            🍽️ {locale === 'bg' ? 'Храна и напитки' : 'Food & Drink'}
          </button>
        </div>

        {/* ═══════════ RITUAL TAB ═══════════ */}
        {tab === 'ritual' && dashboard && (
          <div className="space-y-4">
            {TIME_SECTIONS.map((section) => {
              const sectionItems = dashboard.items.filter((item) => section.times.includes(item.timing));
              if (sectionItems.length === 0) return null;
              const allDone = sectionItems.every(i => i.completed || i.skipped);

              return (
                <div key={section.key}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="text-base">{section.icon}</span>
                    <h3 className="text-sm font-semibold text-gray-700">{locale === 'bg' ? section.label_bg : section.label_en}</h3>
                    {allDone && <span className="text-green-500 text-xs">✓</span>}
                  </div>
                  <div className="space-y-1.5">
                    {sectionItems.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                          item.completed ? 'bg-green-50 border-green-200 opacity-70' : CAT_BG[item.category] || 'bg-white border-gray-200'
                        }`}
                      >
                        <button
                          onClick={() => handleToggle(item.id)}
                          disabled={toggling === item.id}
                          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                            item.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-indigo-400'
                          }`}
                        >
                          {item.completed && (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs">{CAT_ICON[item.category] || '📌'}</span>
                            <span className={`text-sm font-medium ${item.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>{item.name}</span>
                            {item.condition === 'gym_day' && <Badge color="blue">Gym</Badge>}
                            {item.condition === 'sex_day' && <Badge color="purple">Sex</Badge>}
                          </div>
                          {item.dose && (
                            <p className="text-xs text-gray-500 mt-0.5">{item.dose}{item.scheduled_time && <span className="text-gray-400 ml-2">{item.scheduled_time}</span>}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {item.prescription_note && (
                            <button onClick={(e) => { e.stopPropagation(); setShowRx(item.id); }}
                              className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 active:scale-95">Rx</button>
                          )}
                          {item.warning && !item.completed && <span className="text-amber-500 text-sm" title={item.warning}>⚠️</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Warnings summary */}
            {(() => {
              const warnings = dashboard.items.filter(i => i.warning && !i.completed);
              if (warnings.length === 0) return null;
              return (
                <Card className="!bg-amber-50 !border-amber-200">
                  <h3 className="text-sm font-semibold text-amber-800 mb-2">⚠️ {locale === 'bg' ? 'Предупреждения' : 'Warnings'}</h3>
                  <div className="space-y-1.5">
                    {warnings.map((item) => (
                      <div key={item.id} className="text-xs text-amber-700"><span className="font-medium">{item.name}:</span> {item.warning}</div>
                    ))}
                  </div>
                </Card>
              );
            })()}
          </div>
        )}

        {/* ═══════════ FOOD TAB ═══════════ */}
        {tab === 'food' && (
          <>
            {/* Calorie summary */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Card>
                <p className="text-[11px] font-medium text-gray-500 uppercase">{locale === 'bg' ? 'Калории' : 'Calories'}</p>
                <p className="text-lg font-bold text-gray-900">{todayCals} <span className="text-sm font-normal text-gray-400">/ {KCAL_TARGET}</span></p>
                <div className="mt-1.5 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${calPct > 100 ? 'bg-red-500' : calPct > 80 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${calPct}%` }} />
                </div>
              </Card>
              <Card>
                <p className="text-[11px] font-medium text-gray-500 uppercase">P / C / F</p>
                <p className="text-lg font-bold text-gray-900">{todayProtein.toFixed(0)}g / {todayCarbs.toFixed(0)}g / {todayFat.toFixed(0)}g</p>
              </Card>
            </div>

            {/* Favorites */}
            {favorites.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 mb-2">{locale === 'bg' ? 'Любими' : 'Favorites'}</p>
                <div className="flex flex-wrap gap-2">
                  {favorites.map((fav, i) => (
                    <button key={i} onClick={() => { setFoodForm(fav); setShowFoodForm(true); }} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-lg hover:bg-indigo-100">{fav.name} ({fav.calories})</button>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={() => setShowFoodForm(true)} className="mb-4">+ {locale === 'bg' ? 'Добави храна' : 'Add Food'}</Button>

            {showFoodForm && (
              <Card className="mb-5">
                <form onSubmit={submitFood} className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Input label={locale === 'bg' ? 'Име' : 'Name'} value={foodForm.name} onChange={(e) => setFoodForm((p) => ({ ...p, name: e.target.value }))} required className="col-span-2 sm:col-span-1" />
                    <Select label={locale === 'bg' ? 'Хранене' : 'Meal'} value={foodForm.meal_type} onChange={(e) => setFoodForm((p) => ({ ...p, meal_type: e.target.value }))}>
                      {MEAL_TYPES.map((m) => <option key={m} value={m}>{t(`health.meal_${m}`, locale)}</option>)}
                    </Select>
                    <Input label={locale === 'bg' ? 'Калории' : 'Calories'} type="number" inputMode="numeric" value={foodForm.calories} onChange={(e) => setFoodForm((p) => ({ ...p, calories: e.target.value }))} required />
                    <Input label="Protein (g)" type="number" inputMode="decimal" value={foodForm.protein} onChange={(e) => setFoodForm((p) => ({ ...p, protein: e.target.value }))} />
                    <Input label="Carbs (g)" type="number" inputMode="decimal" value={foodForm.carbs} onChange={(e) => setFoodForm((p) => ({ ...p, carbs: e.target.value }))} />
                    <Input label="Fat (g)" type="number" inputMode="decimal" value={foodForm.fat} onChange={(e) => setFoodForm((p) => ({ ...p, fat: e.target.value }))} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button type="submit" disabled={savingFood}>{savingFood ? '...' : t('common.save', locale)}</Button>
                    <Button type="button" variant="secondary" onClick={() => setShowFoodForm(false)}>{t('common.cancel', locale)}</Button>
                    <Button type="button" variant="ghost" onClick={saveFavorite}>⭐</Button>
                  </div>
                </form>
              </Card>
            )}

            {/* Food list */}
            {foods.length === 0 ? (
              <div className="text-center py-8 text-gray-400">{locale === 'bg' ? 'Няма записи за днес' : 'No entries today'}</div>
            ) : (
              MEAL_TYPES.map((meal) => {
                const items = foods.filter((f) => f.meal_type === meal);
                if (items.length === 0) return null;
                return (
                  <div key={meal} className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-gray-700">{t(`health.meal_${meal}`, locale)}</h3>
                      <Badge color="gray">{items.reduce((s, f) => s + f.calories, 0)} kcal</Badge>
                    </div>
                    <Card padding={false}>
                      <div className="divide-y divide-gray-100">
                        {items.map((f) => (
                          <div key={f.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900">{f.name}</p>
                              <p className="text-xs text-gray-400">P:{Number(f.protein).toFixed(0)}g C:{Number(f.carbs).toFixed(0)}g F:{Number(f.fat).toFixed(0)}g</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">{f.calories} kcal</span>
                              <Button variant="danger" size="sm" onClick={() => handleDeleteFood(f.id)}>×</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* Spacer for FAB */}
        <div className="h-24" />
      </PageContent>

      {/* ═══════════ LOG BUTTON (FAB) ═══════════ */}
      <button
        onClick={openLogModal}
        className="fixed bottom-6 right-5 z-[50] h-14 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-full shadow-xl flex items-center gap-2 active:scale-95 transition-all"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {locale === 'bg' ? 'Запис' : 'Log'}
      </button>

      {/* ═══════════ LOG MODAL (Multi-step Bottom Sheet) ═══════════ */}
      <BottomSheet open={logOpen} onClose={closeLogModal} title={stepTitle(logStep, locale)}>
        {/* Step indicator */}
        {logStep !== 'done' && (
          <div className="flex gap-1.5 mb-5">
            {LOG_STEPS.filter(s => s !== 'done').map((s, i) => (
              <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${i <= stepIdx ? 'bg-indigo-600' : 'bg-gray-200'}`} />
            ))}
          </div>
        )}

        {/* ── Step 1: Blood Pressure ── */}
        {logStep === 'bp' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Input label={locale === 'bg' ? 'Систолично' : 'Systolic'} type="number" inputMode="numeric" placeholder="120" value={bpForm.systolic}
                onChange={(e) => setBpForm(p => ({ ...p, systolic: e.target.value }))} />
              <Input label={locale === 'bg' ? 'Диастолично' : 'Diastolic'} type="number" inputMode="numeric" placeholder="80" value={bpForm.diastolic}
                onChange={(e) => setBpForm(p => ({ ...p, diastolic: e.target.value }))} />
              <Input label={locale === 'bg' ? 'Пулс' : 'Pulse'} type="number" inputMode="numeric" placeholder="72" value={bpForm.pulse}
                onChange={(e) => setBpForm(p => ({ ...p, pulse: e.target.value }))} />
            </div>
            {bpStage && (
              <div className={`text-center py-2 rounded-xl font-semibold text-sm ${STAGE_COLORS[bpStage]} ${bpStage === 'normal' ? 'bg-emerald-50' : bpStage === 'elevated' ? 'bg-yellow-50' : 'bg-red-50'}`}>
                {STAGE_LABELS[bpStage][locale as 'en' | 'bg']}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Select label={locale === 'bg' ? 'Ръка' : 'Arm'} value={bpForm.arm} onChange={(e) => setBpForm(p => ({ ...p, arm: e.target.value }))}>
                <option value="left">{locale === 'bg' ? 'Лява' : 'Left'}</option>
                <option value="right">{locale === 'bg' ? 'Дясна' : 'Right'}</option>
              </Select>
              <Select label={locale === 'bg' ? 'Позиция' : 'Posture'} value={bpForm.posture} onChange={(e) => setBpForm(p => ({ ...p, posture: e.target.value }))}>
                <option value="sitting">{locale === 'bg' ? 'Седнал' : 'Sitting'}</option>
                <option value="standing">{locale === 'bg' ? 'Прав' : 'Standing'}</option>
                <option value="lying">{locale === 'bg' ? 'Легнал' : 'Lying'}</option>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={saveBP} disabled={logSaving} className="flex-1">
                {logSaving ? '...' : bpForm.systolic ? (locale === 'bg' ? 'Запази и продължи' : 'Save & Next') : (locale === 'bg' ? 'Напред' : 'Next')}
              </Button>
              <Button variant="ghost" onClick={skipStep}>{locale === 'bg' ? 'Пропусни' : 'Skip'}</Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Weight & Body Measurements ── */}
        {logStep === 'weight' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label={locale === 'bg' ? 'Тегло (kg)' : 'Weight (kg)'} type="number" inputMode="decimal" step="0.1" placeholder="85.0" value={weightForm.weight_kg}
                onChange={(e) => setWeightForm(p => ({ ...p, weight_kg: e.target.value }))} />
              <Input label={locale === 'bg' ? 'Мазнини (%)' : 'Body fat (%)'} type="number" inputMode="decimal" step="0.1" placeholder="22.0" value={weightForm.body_fat_pct}
                onChange={(e) => setWeightForm(p => ({ ...p, body_fat_pct: e.target.value }))} />
            </div>

            {/* Body measurements toggle */}
            <button
              onClick={() => setShowBodyMeas(!showBodyMeas)}
              className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              <svg className={`w-4 h-4 transition-transform ${showBodyMeas ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              📏 {locale === 'bg' ? 'Измервания на тялото (cm)' : 'Body measurements (cm)'}
            </button>

            {showBodyMeas && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pl-1">
                {BODY_SITES.map((site) => (
                  <Input
                    key={site.key}
                    label={locale === 'bg' ? site.bg : site.en}
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={bodyMeas[site.key] || ''}
                    onChange={(e) => setBodyMeas(p => ({ ...p, [site.key]: e.target.value }))}
                  />
                ))}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button onClick={saveWeight} disabled={logSaving} className="flex-1">
                {logSaving ? '...' : weightForm.weight_kg ? (locale === 'bg' ? 'Запази и продължи' : 'Save & Next') : (locale === 'bg' ? 'Напред' : 'Next')}
              </Button>
              <Button variant="ghost" onClick={skipStep}>{locale === 'bg' ? 'Пропусни' : 'Skip'}</Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Supplements & Pills ── */}
        {logStep === 'supplements' && dashboard && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 mb-2">
              {locale === 'bg' ? 'Отбележете какво сте взели днес:' : 'Check off what you took today:'}
            </p>
            <div className="max-h-[40vh] overflow-y-auto space-y-1.5">
              {dashboard.items
                .filter(i => ['supplement', 'medication', 'injection'].includes(i.category))
                .map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleToggle(item.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all active:scale-[0.98] ${
                      item.completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:border-indigo-200'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      item.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'
                    }`}>
                      {item.completed && (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900">{CAT_ICON[item.category]} {item.name}</span>
                      {item.dose && <span className="text-xs text-gray-400 ml-2">{item.dose}</span>}
                    </div>
                  </div>
                ))}
            </div>

            {/* Add new supplement */}
            {!showAddSupplement ? (
              <button
                onClick={() => setShowAddSupplement(true)}
                className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 py-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                {locale === 'bg' ? 'Добави нов' : 'Add new supplement / pill'}
              </button>
            ) : (
              <Card className="!bg-indigo-50 !border-indigo-200">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input label={locale === 'bg' ? 'Име' : 'Name'} value={newSupp.name}
                      onChange={(e) => setNewSupp(p => ({ ...p, name: e.target.value }))} required />
                    <Select label={locale === 'bg' ? 'Тип' : 'Type'} value={newSupp.category}
                      onChange={(e) => setNewSupp(p => ({ ...p, category: e.target.value }))}>
                      <option value="supplement">{locale === 'bg' ? 'Добавка' : 'Supplement'}</option>
                      <option value="medication">{locale === 'bg' ? 'Лекарство' : 'Medication'}</option>
                      <option value="injection">{locale === 'bg' ? 'Инжекция' : 'Injection'}</option>
                    </Select>
                    <Input label={locale === 'bg' ? 'Доза' : 'Dose'} value={newSupp.dose} placeholder="e.g. 500mg"
                      onChange={(e) => setNewSupp(p => ({ ...p, dose: e.target.value }))} />
                    <Select label={locale === 'bg' ? 'Кога' : 'When'} value={newSupp.timing}
                      onChange={(e) => setNewSupp(p => ({ ...p, timing: e.target.value }))}>
                      {TIMING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{locale === 'bg' ? o.bg : o.en}</option>)}
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddSupplement}>{locale === 'bg' ? 'Добави' : 'Add'}</Button>
                    <Button size="sm" variant="secondary" onClick={() => setShowAddSupplement(false)}>{t('common.cancel', locale)}</Button>
                  </div>
                </div>
              </Card>
            )}

            <div className="flex gap-3 pt-2">
              <Button onClick={saveSupplements} className="flex-1">{locale === 'bg' ? 'Продължи' : 'Continue'}</Button>
              <Button variant="ghost" onClick={skipStep}>{locale === 'bg' ? 'Пропусни' : 'Skip'}</Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Additional Vitals ── */}
        {logStep === 'additional' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              {locale === 'bg' ? 'Попълнете само ако сте измерили:' : 'Fill in only if measured:'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Input label={`🩸 ${locale === 'bg' ? 'Глюкоза (mmol/L)' : 'Glucose (mmol/L)'}`} type="number" inputMode="decimal" step="0.01" value={vitalsForm.glucose}
                onChange={(e) => setVitalsForm(p => ({ ...p, glucose: e.target.value }))} />
              <Input label={`🫘 ${locale === 'bg' ? 'Пик. к-на (μmol/L)' : 'Uric acid (μmol/L)'}`} type="number" inputMode="numeric" value={vitalsForm.uric_acid}
                onChange={(e) => setVitalsForm(p => ({ ...p, uric_acid: e.target.value }))} />
              <Input label={`💓 ${locale === 'bg' ? 'Пулс (bpm)' : 'Heart rate (bpm)'}`} type="number" inputMode="numeric" value={vitalsForm.heart_rate}
                onChange={(e) => setVitalsForm(p => ({ ...p, heart_rate: e.target.value }))} />
              <Input label={`🌡️ ${locale === 'bg' ? 'Темп. (°C)' : 'Temp (°C)'}`} type="number" inputMode="decimal" step="0.1" value={vitalsForm.temperature}
                onChange={(e) => setVitalsForm(p => ({ ...p, temperature: e.target.value }))} />
              <Input label={`🫁 SpO2 (%)`} type="number" inputMode="numeric" value={vitalsForm.oxygen}
                onChange={(e) => setVitalsForm(p => ({ ...p, oxygen: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={saveAdditional} disabled={logSaving} className="flex-1">
                {logSaving ? '...' : locale === 'bg' ? 'Завърши' : 'Finish'}
              </Button>
              <Button variant="ghost" onClick={skipStep}>{locale === 'bg' ? 'Пропусни' : 'Skip'}</Button>
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {logStep === 'done' && (
          <div className="text-center py-6">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">{locale === 'bg' ? 'Записано!' : 'Logged!'}</h3>
            {logSummary.length > 0 ? (
              <div className="text-left bg-gray-50 rounded-xl p-4 mb-4 space-y-1">
                {logSummary.map((line, i) => (
                  <p key={i} className="text-sm text-gray-700">✓ {line}</p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-4">{locale === 'bg' ? 'Нищо не беше записано' : 'Nothing was logged'}</p>
            )}
            <Button onClick={closeLogModal} className="w-full">{locale === 'bg' ? 'Затвори' : 'Close'}</Button>
          </div>
        )}
      </BottomSheet>

      {/* Prescription detail bottom sheet */}
      <BottomSheet
        open={showRx !== null}
        onClose={() => setShowRx(null)}
        title={locale === 'bg' ? 'Рецепта' : 'Prescription'}
      >
        {showRx !== null && dashboard && (() => {
          const item = dashboard.items.find(i => i.id === showRx);
          if (!item) return null;
          return (
            <div className="space-y-4">
              {item.prescription_image ? (
                <div className="rounded-2xl overflow-hidden border border-gray-200">
                  <img src={item.prescription_image} alt="Rx" className="w-full max-h-[400px] object-contain bg-gray-50" />
                </div>
              ) : (
                <div className="p-6 bg-gray-50 border-2 border-dashed border-gray-300 rounded-2xl text-center">
                  <p className="text-sm text-gray-500 mb-3">{locale === 'bg' ? 'Няма снимка' : 'No photo'}</p>
                  <input ref={rxFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={() => handleUploadRx(item.id)} />
                  <Button variant="secondary" size="sm" onClick={() => rxFileRef.current?.click()} disabled={uploading}>
                    {uploading ? '...' : locale === 'bg' ? '📷 Снимай' : '📷 Take photo'}
                  </Button>
                </div>
              )}
              <div className="p-4 bg-gray-50 rounded-2xl">
                <p className="text-base font-bold text-gray-900">{item.name}</p>
                <p className="text-sm text-gray-600 mt-1">{item.dose}</p>
                {item.instructions && <p className="text-xs text-gray-500 mt-1">{item.instructions}</p>}
              </div>
              {item.prescription_note && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                  <p className="text-xs font-semibold text-blue-800 mb-2">{locale === 'bg' ? '📋 Покажи в аптеката:' : '📋 Show at pharmacy:'}</p>
                  <pre className="text-sm text-blue-900 whitespace-pre-wrap font-sans">{item.prescription_note}</pre>
                </div>
              )}
              {item.prescription_image && (
                <div className="text-center">
                  <input ref={rxFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={() => handleUploadRx(item.id)} />
                  <Button variant="ghost" size="sm" onClick={() => rxFileRef.current?.click()} disabled={uploading}>
                    {uploading ? '...' : locale === 'bg' ? '📷 Смени' : '📷 Replace'}
                  </Button>
                </div>
              )}
            </div>
          );
        })()}
      </BottomSheet>
    </PageShell>
  );
}
