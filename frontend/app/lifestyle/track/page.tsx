'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  getMeasurements, createMeasurement, deleteMeasurement,
  getFoodEntries, createFoodEntry, deleteFoodEntry,
  getDailyRituals, createDailyRitual, updateDailyRitual,
  getHealthSummary,
} from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import HealthFAB from '../../components/HealthFAB';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Input, Select, Alert, EmptyState, Spinner } from '../../components/ui';

// ---- Types ----
interface MeasurementItem { id: number; measurement_type: string; value: string; value2: string | null; unit: string; measured_at: string; notes: string; }
interface FoodItem { id: number; name: string; meal_type: string; calories: number; protein: string; carbs: string; fat: string; fiber: string; serving_size: string; eaten_at: string; }
interface RitualItem { id: number; date: string; water_liters: string; sleep_hours: string; exercise_minutes: number; exercise_type: string; supplements_taken: boolean; no_alcohol: boolean; no_sugar: boolean; meditation_minutes: number; steps: number; mood: number; notes: string; }
interface Summary { today: { calories: number; protein: number; carbs: number; fat: number; fiber: number; food_count: number }; ritual: RitualItem | null; latest_measurements: Record<string, { value: number; value2: number | null; unit: string; measured_at: string }>; week_avg_calories: number; }

const MEAS_TYPES = ['blood_pressure', 'weight', 'glucose', 'uric_acid', 'heart_rate', 'temperature', 'oxygen'] as const;
const MEAS_UNITS: Record<string, string> = { blood_pressure: 'mmHg', weight: 'kg', glucose: 'mmol/L', uric_acid: 'μmol/L', heart_rate: 'bpm', temperature: '°C', oxygen: '%' };
const MEAS_ICONS: Record<string, string> = { blood_pressure: '❤️', weight: '⚖️', glucose: '🩸', uric_acid: '🫘', heart_rate: '💓', temperature: '🌡️', oxygen: '🫁' };
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const MOODS = ['😞', '😐', '🙂', '😊', '🤩'];
const KCAL_TARGET = 2000;

function today() { return new Date().toISOString().split('T')[0]; }
function nowISO() { return new Date().toISOString(); }

export default function HealthTrackPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [tab, setTab] = useState<'measurements' | 'food' | 'ritual'>('food');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Data
  const [summary, setSummary] = useState<Summary | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementItem[]>([]);
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [ritual, setRitual] = useState<RitualItem | null>(null);
  const [selectedDate, setSelectedDate] = useState(today());

  // Forms
  const [showMeasForm, setShowMeasForm] = useState(false);
  const [measForm, setMeasForm] = useState({ type: 'weight', value: '', value2: '', notes: '' });
  const [showFoodForm, setShowFoodForm] = useState(false);
  const [foodForm, setFoodForm] = useState({ name: '', meal_type: 'lunch', calories: '', protein: '', carbs: '', fat: '', fiber: '', serving_size: '' });
  const [saving, setSaving] = useState(false);

  // Favorites from localStorage
  const [favorites, setFavorites] = useState<typeof foodForm[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('food_favorites');
    if (saved) setFavorites(JSON.parse(saved));
  }, []);

  const loadData = async (date: string) => {
    try {
      const [s, m, f, r] = await Promise.all([
        getHealthSummary(),
        getMeasurements(undefined, date, date),
        getFoodEntries(date),
        getDailyRituals(date),
      ]);
      setSummary(s);
      setMeasurements(m);
      setFoods(f);
      setRitual(r.length > 0 ? r[0] : null);
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(selectedDate); }, [selectedDate]);

  // ---- Measurement handlers ----
  const submitMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload: Record<string, unknown> = {
        measurement_type: measForm.type,
        value: Number(measForm.value),
        unit: MEAS_UNITS[measForm.type],
        measured_at: nowISO(),
      };
      if (measForm.type === 'blood_pressure' && measForm.value2) payload.value2 = Number(measForm.value2);
      const created = await createMeasurement(payload);
      setMeasurements((prev) => [created, ...prev]);
      setShowMeasForm(false);
      setMeasForm({ type: 'weight', value: '', value2: '', notes: '' });
    } catch { setError(t('common.error', locale)); }
    finally { setSaving(false); }
  };

  // ---- Food handlers ----
  const submitFood = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = {
        name: foodForm.name,
        meal_type: foodForm.meal_type,
        calories: Number(foodForm.calories) || 0,
        protein: Number(foodForm.protein) || 0,
        carbs: Number(foodForm.carbs) || 0,
        fat: Number(foodForm.fat) || 0,
        fiber: Number(foodForm.fiber) || 0,
        serving_size: foodForm.serving_size,
        eaten_at: nowISO(),
      };
      const created = await createFoodEntry(payload);
      setFoods((prev) => [created, ...prev]);
      setShowFoodForm(false);
      setFoodForm({ name: '', meal_type: 'lunch', calories: '', protein: '', carbs: '', fat: '', fiber: '', serving_size: '' });
    } catch { setError(t('common.error', locale)); }
    finally { setSaving(false); }
  };

  const saveFavorite = () => {
    if (!foodForm.name) return;
    const updated = [...favorites.filter((f) => f.name !== foodForm.name), foodForm];
    setFavorites(updated);
    localStorage.setItem('food_favorites', JSON.stringify(updated));
  };

  const useFavorite = (fav: typeof foodForm) => {
    setFoodForm(fav);
    setShowFoodForm(true);
  };

  // ---- Ritual handlers ----
  const updateRitualField = async (field: string, value: unknown) => {
    const dateStr = selectedDate;
    const newData = { ...(ritual || { date: dateStr, water_liters: 0, sleep_hours: 0, exercise_minutes: 0, exercise_type: '', supplements_taken: false, no_alcohol: true, no_sugar: true, meditation_minutes: 0, steps: 0, mood: 3, notes: '' }), [field]: value };
    try {
      if (ritual?.id) {
        const updated = await updateDailyRitual(ritual.id, newData);
        setRitual(updated);
      } else {
        const created = await createDailyRitual({ ...newData, date: dateStr });
        setRitual(created);
      }
    } catch { /* silent fail for auto-save */ }
  };

  const handleDeleteMeas = async (id: number) => {
    if (!confirm(t('health.delete_confirm', locale))) return;
    await deleteMeasurement(id);
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  };

  const handleDeleteFood = async (id: number) => {
    if (!confirm(t('health.delete_confirm', locale))) return;
    await deleteFoodEntry(id);
    setFoods((prev) => prev.filter((f) => f.id !== id));
  };

  // ---- Computed ----
  const todayCals = foods.reduce((s, f) => s + f.calories, 0);
  const todayProtein = foods.reduce((s, f) => s + Number(f.protein), 0);
  const todayCarbs = foods.reduce((s, f) => s + Number(f.carbs), 0);
  const todayFat = foods.reduce((s, f) => s + Number(f.fat), 0);
  const calPct = Math.min(100, Math.round((todayCals / KCAL_TARGET) * 100));

  if (loading) return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;

  const TABS = [
    { key: 'food' as const, label: t('health.food_log', locale), icon: '🍽️' },
    { key: 'measurements' as const, label: t('health.measurements', locale), icon: '📊' },
    { key: 'ritual' as const, label: t('health.daily_ritual', locale), icon: '✅' },
  ];

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('health.title', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/lifestyle')}
        />
        <Alert type="error" message={error} />

        {/* Date picker + Summary cards */}
        <div className="flex items-center gap-3 mb-4">
          <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="max-w-[160px]" />
          <span className="text-sm text-gray-500">{selectedDate === today() ? t('health.today', locale) : ''}</span>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card>
            <p className="text-[11px] font-medium text-gray-500 uppercase">{t('health.calories', locale)}</p>
            <p className="text-lg font-bold text-gray-900">{todayCals} <span className="text-sm font-normal text-gray-400">/ {KCAL_TARGET}</span></p>
            <div className="mt-1.5 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${calPct > 100 ? 'bg-red-500' : calPct > 80 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${calPct}%` }} />
            </div>
          </Card>
          <Card>
            <p className="text-[11px] font-medium text-gray-500 uppercase">{t('health.protein', locale)} / {t('health.carbs', locale)} / {t('health.fat', locale)}</p>
            <p className="text-lg font-bold text-gray-900">{todayProtein.toFixed(0)}g <span className="text-gray-400">/</span> {todayCarbs.toFixed(0)}g <span className="text-gray-400">/</span> {todayFat.toFixed(0)}g</p>
          </Card>
          <Card>
            <p className="text-[11px] font-medium text-gray-500 uppercase">{t('health.water', locale)}</p>
            <p className="text-lg font-bold text-gray-900">{ritual?.water_liters || 0} L</p>
          </Card>
          <Card>
            <p className="text-[11px] font-medium text-gray-500 uppercase">{t('health.mood', locale)}</p>
            <p className="text-2xl">{MOODS[(ritual?.mood || 3) - 1]}</p>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-gray-200 overflow-x-auto">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === tb.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <span>{tb.icon}</span> {tb.label}
            </button>
          ))}
        </div>

        {/* ========== FOOD TAB ========== */}
        {tab === 'food' && (
          <>
            {/* Favorites */}
            {favorites.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 mb-2">{t('health.favorites', locale)}</p>
                <div className="flex flex-wrap gap-2">
                  {favorites.map((fav, i) => (
                    <button key={i} onClick={() => useFavorite(fav)} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-lg hover:bg-indigo-100 transition-colors">
                      {fav.name} ({fav.calories} kcal)
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={() => setShowFoodForm(true)} className="mb-4">+ {t('health.add_food', locale)}</Button>

            {showFoodForm && (
              <Card className="mb-5">
                <form onSubmit={submitFood} className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Input label={t('health.food_name', locale)} value={foodForm.name} onChange={(e) => setFoodForm((p) => ({ ...p, name: e.target.value }))} required className="col-span-2 sm:col-span-1" />
                    <Select label={t('lifestyle.breakfast', locale)} value={foodForm.meal_type} onChange={(e) => setFoodForm((p) => ({ ...p, meal_type: e.target.value }))}>
                      {MEAL_TYPES.map((m) => <option key={m} value={m}>{t(`health.meal_${m}`, locale)}</option>)}
                    </Select>
                    <Input label={t('health.calories', locale)} type="number" inputMode="numeric" value={foodForm.calories} onChange={(e) => setFoodForm((p) => ({ ...p, calories: e.target.value }))} required />
                    <Input label={`${t('health.protein', locale)} (g)`} type="number" inputMode="decimal" value={foodForm.protein} onChange={(e) => setFoodForm((p) => ({ ...p, protein: e.target.value }))} />
                    <Input label={`${t('health.carbs', locale)} (g)`} type="number" inputMode="decimal" value={foodForm.carbs} onChange={(e) => setFoodForm((p) => ({ ...p, carbs: e.target.value }))} />
                    <Input label={`${t('health.fat', locale)} (g)`} type="number" inputMode="decimal" value={foodForm.fat} onChange={(e) => setFoodForm((p) => ({ ...p, fat: e.target.value }))} />
                    <Input label={`${t('health.fiber', locale)} (g)`} type="number" inputMode="decimal" value={foodForm.fiber} onChange={(e) => setFoodForm((p) => ({ ...p, fiber: e.target.value }))} />
                    <Input label={t('health.serving', locale)} value={foodForm.serving_size} onChange={(e) => setFoodForm((p) => ({ ...p, serving_size: e.target.value }))} placeholder="e.g. 200g" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button type="submit" disabled={saving}>{saving ? '...' : t('common.save', locale)}</Button>
                    <Button type="button" variant="secondary" onClick={() => setShowFoodForm(false)}>{t('common.cancel', locale)}</Button>
                    <Button type="button" variant="ghost" onClick={saveFavorite}>{t('health.save_favorite', locale)}</Button>
                  </div>
                </form>
              </Card>
            )}

            {/* Food list grouped by meal */}
            {foods.length === 0 ? (
              <EmptyState icon="🍽️" message={t('health.no_entries', locale)} />
            ) : (
              <>
                {MEAL_TYPES.map((meal) => {
                  const items = foods.filter((f) => f.meal_type === meal);
                  if (items.length === 0) return null;
                  const mealCals = items.reduce((s, f) => s + f.calories, 0);
                  return (
                    <div key={meal} className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-700">{t(`health.meal_${meal}`, locale)}</h3>
                        <Badge color="gray">{mealCals} kcal</Badge>
                      </div>
                      <Card padding={false}>
                        <div className="divide-y divide-gray-100">
                          {items.map((f) => (
                            <div key={f.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900">{f.name}</p>
                                <p className="text-xs text-gray-400">P:{Number(f.protein).toFixed(0)}g C:{Number(f.carbs).toFixed(0)}g F:{Number(f.fat).toFixed(0)}g {f.serving_size && `• ${f.serving_size}`}</p>
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
                })}
                <div className="flex items-center gap-3 mt-3 py-2 border-t border-gray-200">
                  <span className="text-sm font-semibold text-gray-900">{t('health.total', locale)}: {todayCals} kcal</span>
                  {summary && <Badge color="gray">{t('health.avg_week', locale)}: {summary.week_avg_calories} kcal</Badge>}
                </div>
              </>
            )}
          </>
        )}

        {/* ========== MEASUREMENTS TAB ========== */}
        {tab === 'measurements' && (
          <>
            {/* Latest values strip */}
            {summary?.latest_measurements && Object.keys(summary.latest_measurements).length > 0 && (
              <div className="flex flex-wrap gap-3 mb-5">
                {Object.entries(summary.latest_measurements).map(([type, m]) => (
                  <Card key={type} className="min-w-[140px]">
                    <p className="text-[11px] font-medium text-gray-500 flex items-center gap-1">{MEAS_ICONS[type]} {t(`health.${type}`, locale)}</p>
                    <p className="text-lg font-bold text-gray-900">
                      {m.value}{m.value2 ? `/${m.value2}` : ''} <span className="text-xs font-normal text-gray-400">{m.unit}</span>
                    </p>
                  </Card>
                ))}
              </div>
            )}

            <Button onClick={() => setShowMeasForm(true)} className="mb-4">+ {t('health.add_measurement', locale)}</Button>

            {showMeasForm && (
              <Card className="mb-5">
                <form onSubmit={submitMeasurement} className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Select label={t('lifestyle.test', locale)} value={measForm.type} onChange={(e) => setMeasForm((p) => ({ ...p, type: e.target.value }))}>
                      {MEAS_TYPES.map((mt) => <option key={mt} value={mt}>{t(`health.${mt}`, locale)}</option>)}
                    </Select>
                    <Input label={measForm.type === 'blood_pressure' ? t('health.systolic', locale) : t('lifestyle.result', locale)} type="number" inputMode="decimal" value={measForm.value} onChange={(e) => setMeasForm((p) => ({ ...p, value: e.target.value }))} required />
                    {measForm.type === 'blood_pressure' && (
                      <Input label={t('health.diastolic', locale)} type="number" inputMode="decimal" value={measForm.value2} onChange={(e) => setMeasForm((p) => ({ ...p, value2: e.target.value }))} required />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={saving}>{saving ? '...' : t('common.save', locale)}</Button>
                    <Button type="button" variant="secondary" onClick={() => setShowMeasForm(false)}>{t('common.cancel', locale)}</Button>
                  </div>
                </form>
              </Card>
            )}

            {measurements.length === 0 ? (
              <EmptyState icon="📊" message={t('health.no_entries', locale)} />
            ) : (
              <Card padding={false}>
                <div className="divide-y divide-gray-100">
                  {measurements.map((m) => (
                    <div key={m.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{MEAS_ICONS[m.measurement_type] || '📊'}</span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{t(`health.${m.measurement_type}`, locale)}</p>
                          <p className="text-xs text-gray-400">{new Date(m.measured_at).toLocaleTimeString(locale === 'bg' ? 'bg-BG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-gray-900">{m.value}{m.value2 ? `/${m.value2}` : ''} <span className="text-xs font-normal text-gray-400">{m.unit}</span></span>
                        <Button variant="danger" size="sm" onClick={() => handleDeleteMeas(m.id)}>×</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        {/* ========== DAILY RITUAL TAB ========== */}
        {tab === 'ritual' && (
          <Card>
            <div className="space-y-4">
              {/* Water */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">💧 {t('health.water', locale)}</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateRitualField('water_liters', Math.max(0, Number(ritual?.water_liters || 0) - 0.25))} className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 font-bold hover:bg-gray-200">−</button>
                  <span className="text-lg font-bold w-12 text-center">{ritual?.water_liters || 0}</span>
                  <button onClick={() => updateRitualField('water_liters', Number(ritual?.water_liters || 0) + 0.25)} className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 font-bold hover:bg-indigo-200">+</button>
                </div>
              </div>

              {/* Sleep */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">😴 {t('health.sleep', locale)}</label>
                <Input type="number" inputMode="decimal" step="0.5" value={ritual?.sleep_hours || ''} onChange={(e) => updateRitualField('sleep_hours', Number(e.target.value))} className="w-20 text-center" />
              </div>

              {/* Exercise */}
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2 shrink-0">🏃 {t('health.exercise', locale)}</label>
                <Input type="number" inputMode="numeric" value={ritual?.exercise_minutes || ''} onChange={(e) => updateRitualField('exercise_minutes', Number(e.target.value))} className="w-20 text-center" />
                <Input placeholder={t('health.exercise_type', locale)} value={ritual?.exercise_type || ''} onChange={(e) => updateRitualField('exercise_type', e.target.value)} className="flex-1" />
              </div>

              {/* Steps */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">👟 {t('health.steps', locale)}</label>
                <Input type="number" inputMode="numeric" value={ritual?.steps || ''} onChange={(e) => updateRitualField('steps', Number(e.target.value))} className="w-24 text-center" />
              </div>

              {/* Meditation */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">🧘 {t('health.meditation', locale)}</label>
                <Input type="number" inputMode="numeric" value={ritual?.meditation_minutes || ''} onChange={(e) => updateRitualField('meditation_minutes', Number(e.target.value))} className="w-20 text-center" />
              </div>

              {/* Checkboxes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-gray-100">
                {([
                  ['supplements_taken', '💊', t('health.supplements', locale)],
                  ['no_alcohol', '🚫🍺', t('health.no_alcohol', locale)],
                  ['no_sugar', '🚫🍬', t('health.no_sugar', locale)],
                ] as [string, string, string][]).map(([field, icon, label]) => (
                  <label key={field} className="flex items-center gap-2 cursor-pointer py-2 px-3 rounded-lg hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={ritual ? Boolean((ritual as Record<string, unknown>)[field]) : field !== 'supplements_taken'}
                      onChange={(e) => updateRitualField(field, e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-5 h-5"
                    />
                    <span className="text-sm text-gray-700">{icon} {label}</span>
                  </label>
                ))}
              </div>

              {/* Mood */}
              <div className="pt-2 border-t border-gray-100">
                <label className="text-sm font-medium text-gray-700 mb-2 block">{t('health.mood', locale)}</label>
                <div className="flex gap-2">
                  {MOODS.map((emoji, i) => (
                    <button
                      key={i}
                      onClick={() => updateRitualField('mood', i + 1)}
                      className={`w-12 h-12 text-2xl rounded-xl transition-all ${
                        (ritual?.mood || 3) === i + 1
                          ? 'bg-indigo-100 ring-2 ring-indigo-500 scale-110'
                          : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Spacer for FAB */}
        <div className="h-20" />
      </PageContent>

      {/* Quick-add FAB */}
      <HealthFAB
        onAddMeasurement={() => { setTab('measurements'); setShowMeasForm(true); }}
        onAddFood={() => { setTab('food'); setShowFoodForm(true); }}
        onAddRitual={() => { setTab('ritual'); }}
      />
    </PageShell>
  );
}
