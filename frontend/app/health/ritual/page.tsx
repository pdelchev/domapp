'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getRitualDashboard, toggleRitualItem, seedRitualProtocol, getRitualAdherence } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Spinner, Alert, BottomSheet } from '../../components/ui';

// ── Types ──────────────────────────────────────────────────────────

interface RitualItem {
  id: number; name: string; category: string; category_display: string;
  dose: string; instructions: string; scheduled_time: string | null;
  timing: string; condition: string; warning: string; color: string;
  sort_order: number; completed: boolean; completed_at: string | null;
  skipped: boolean; log_id: number | null;
  prescription_note: string;
}

interface Dashboard {
  date: string; items: RitualItem[]; total: number; completed: number; pct: number;
}

interface AdherenceDay { date: string; pct: number }
interface Adherence { days: number; avg_pct: number; streak: number; daily: AdherenceDay[] }

// ── Helpers ─────────────────────────────────────────────────────────

const CAT_ICON: Record<string, string> = {
  medication: '💊', supplement: '🧬', injection: '💉', meal: '🍽️',
  exercise: '🏋️', work: '💻', social: '👥', sleep: '😴',
  hydration: '💧', other: '📌',
};

const CAT_BG: Record<string, string> = {
  medication: 'bg-red-50 border-red-200',
  supplement: 'bg-amber-50 border-amber-200',
  injection: 'bg-purple-50 border-purple-200',
  meal: 'bg-green-50 border-green-200',
  exercise: 'bg-emerald-50 border-emerald-200',
  work: 'bg-gray-50 border-gray-200',
  social: 'bg-violet-50 border-violet-200',
  sleep: 'bg-indigo-50 border-indigo-200',
  hydration: 'bg-blue-50 border-blue-200',
  other: 'bg-gray-50 border-gray-200',
};

const TIME_SECTIONS = [
  { key: 'morning', label_en: 'Morning', label_bg: 'Сутрин', icon: '🌅', times: ['morning'] },
  { key: 'fasted', label_en: 'Fasted Window', label_bg: 'Гладуване', icon: '⏳', times: ['fasted'] },
  { key: 'meal1', label_en: 'First Meal (13:00)', label_bg: 'Първо хранене (13:00)', icon: '🍽️', times: ['with_meal_1'] },
  { key: 'afternoon', label_en: 'Afternoon', label_bg: 'Следобед', icon: '☀️', times: ['pre_workout'] },
  { key: 'meal2', label_en: 'Last Meal (17:30)', label_bg: 'Последно хранене (17:30)', icon: '🥗', times: ['with_meal_2'] },
  { key: 'evening', label_en: 'Evening', label_bg: 'Вечер', icon: '🌙', times: ['evening'] },
  { key: 'bedtime', label_en: 'Bedtime', label_bg: 'Преди сън', icon: '🛌', times: ['bedtime'] },
  { key: 'anytime', label_en: 'Anytime', label_bg: 'По всяко време', icon: '📋', times: ['anytime'] },
];

// ── Main Component ─────────────────────────────────────────────────

export default function RitualPage() {
  const router = useRouter();
  const { locale } = useLanguage();

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [adherence, setAdherence] = useState<Adherence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showRx, setShowRx] = useState<number | null>(null); // prescription detail popup

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dash, adh] = await Promise.all([
        getRitualDashboard(selectedDate),
        getRitualAdherence(14),
      ]);
      setDashboard(dash);
      setAdherence(adh);

      // Auto-seed if empty
      if (dash.items.length === 0) {
        await seedRitualProtocol();
        const newDash = await getRitualDashboard(selectedDate);
        setDashboard(newDash);
      }
    } catch {
      setError('Failed to load ritual');
    }
    setLoading(false);
  };

  const handleToggle = async (itemId: number) => {
    setToggling(itemId);
    try {
      await toggleRitualItem(itemId, selectedDate);
      // Optimistic update
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

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  if (!dashboard) {
    return <PageShell><NavBar /><Alert type="error" message={error} /></PageShell>;
  }

  const today = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === today;

  return (
    <PageShell>
      <NavBar />
      <PageContent>
        <PageHeader
          title={locale === 'bg' ? 'Дневен ритуал' : 'Daily Ritual'}
          onBack={() => router.push('/health')}
          backLabel={t('common.back', locale)}
        />

        <Alert type="error" message={error} />

        {/* Progress ring + date nav */}
        <Card className="mb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Progress ring */}
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#f3f4f6" strokeWidth="5" />
                  <circle cx="32" cy="32" r="28" fill="none"
                    stroke={dashboard.pct >= 80 ? '#10b981' : dashboard.pct >= 50 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 28}`}
                    strokeDashoffset={`${2 * Math.PI * 28 * (1 - dashboard.pct / 100)}`}
                    style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-gray-900">
                  {dashboard.pct}%
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {dashboard.completed}/{dashboard.total} {locale === 'bg' ? 'завършени' : 'completed'}
                </p>
                {adherence && adherence.streak > 0 && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    🔥 {adherence.streak} {locale === 'bg' ? 'дни поред' : 'day streak'}
                  </p>
                )}
              </div>
            </div>

            {/* Date nav */}
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
                onClick={() => setSelectedDate(today)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${isToday ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {isToday ? (locale === 'bg' ? 'Днес' : 'Today') : selectedDate}
              </button>
              <button
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() + 1);
                  if (d.toISOString().split('T')[0] <= today) {
                    setSelectedDate(d.toISOString().split('T')[0]);
                  }
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600 active:scale-90"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>

          {/* Adherence mini chart */}
          {adherence && adherence.daily.length > 0 && (
            <div className="flex items-end gap-0.5 mt-4 h-8">
              {adherence.daily.map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div
                    className={`w-full rounded-sm ${day.pct >= 80 ? 'bg-green-400' : day.pct >= 50 ? 'bg-amber-400' : day.pct > 0 ? 'bg-red-300' : 'bg-gray-200'}`}
                    style={{ height: `${Math.max(day.pct * 0.3, 2)}px` }}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Timeline sections */}
        <div className="space-y-4">
          {TIME_SECTIONS.map((section) => {
            const sectionItems = dashboard.items.filter((item) =>
              section.times.includes(item.timing)
            );
            if (sectionItems.length === 0) return null;

            const allDone = sectionItems.every(i => i.completed || i.skipped);

            return (
              <div key={section.key}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-base">{section.icon}</span>
                  <h3 className="text-sm font-semibold text-gray-700">
                    {locale === 'bg' ? section.label_bg : section.label_en}
                  </h3>
                  {allDone && <span className="text-green-500 text-xs">✓</span>}
                </div>

                <div className="space-y-1.5">
                  {sectionItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                        item.completed
                          ? 'bg-green-50 border-green-200 opacity-70'
                          : CAT_BG[item.category] || 'bg-white border-gray-200'
                      }`}
                    >
                      {/* Check button */}
                      <button
                        onClick={() => handleToggle(item.id)}
                        disabled={toggling === item.id}
                        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                          item.completed
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-300 hover:border-indigo-400'
                        }`}
                      >
                        {item.completed && (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{CAT_ICON[item.category] || '📌'}</span>
                          <span className={`text-sm font-medium ${item.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                            {item.name}
                          </span>
                          {item.condition === 'gym_day' && (
                            <Badge color="blue">{locale === 'bg' ? 'Gym' : 'Gym'}</Badge>
                          )}
                          {item.condition === 'sex_day' && (
                            <Badge color="purple">{locale === 'bg' ? 'Sex' : 'Sex'}</Badge>
                          )}
                        </div>
                        {item.dose && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {item.dose}
                            {item.scheduled_time && <span className="text-gray-400 ml-2">{item.scheduled_time}</span>}
                          </p>
                        )}
                        {item.instructions && !item.completed && (
                          <p className="text-[11px] text-gray-400 mt-0.5">{item.instructions}</p>
                        )}
                      </div>

                      {/* Rx + Warning badges */}
                      <div className="flex items-center gap-1 shrink-0">
                        {item.prescription_note && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowRx(item.id); }}
                            className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 active:scale-95"
                            title={locale === 'bg' ? 'Рецепта' : 'Prescription'}
                          >
                            Rx
                          </button>
                        )}
                        {item.warning && !item.completed && (
                          <span className="text-amber-500 text-sm cursor-help" title={item.warning}>⚠️</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Interaction warnings summary */}
        {(() => {
          const warnings = dashboard.items.filter(i => i.warning && !i.completed);
          if (warnings.length === 0) return null;
          return (
            <Card className="mt-6 !bg-amber-50 !border-amber-200">
              <h3 className="text-sm font-semibold text-amber-800 mb-2">
                ⚠️ {locale === 'bg' ? 'Взаимодействия и предупреждения' : 'Interactions & Warnings'}
              </h3>
              <div className="space-y-1.5">
                {warnings.map((item) => (
                  <div key={item.id} className="text-xs text-amber-700">
                    <span className="font-medium">{item.name}:</span> {item.warning}
                  </div>
                ))}
              </div>
            </Card>
          );
        })()}

        {/* Prescription detail bottom sheet */}
        <BottomSheet
          open={showRx !== null}
          onClose={() => setShowRx(null)}
          title={locale === 'bg' ? 'Рецепта / Prescription' : 'Prescription Details'}
        >
          {showRx !== null && (() => {
            const item = dashboard.items.find(i => i.id === showRx);
            if (!item) return null;
            return (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-2xl">
                  <p className="text-base font-bold text-gray-900">{item.name}</p>
                  <p className="text-sm text-gray-600 mt-1">{item.dose}</p>
                  {item.instructions && <p className="text-xs text-gray-500 mt-1">{item.instructions}</p>}
                </div>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                  <p className="text-xs font-semibold text-blue-800 mb-2">
                    {locale === 'bg' ? '📋 Показване в аптека:' : '📋 Show at pharmacy:'}
                  </p>
                  <pre className="text-sm text-blue-900 whitespace-pre-wrap font-sans leading-relaxed">
                    {item.prescription_note}
                  </pre>
                </div>
                {item.warning && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-xs text-amber-700">⚠️ {item.warning}</p>
                  </div>
                )}
              </div>
            );
          })()}
        </BottomSheet>

        {/* Bottom padding for mobile tab bar */}
        <div className="h-4" />
      </PageContent>
    </PageShell>
  );
}
