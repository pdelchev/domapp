'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageShell, PageContent, PageHeader, Card, Button, Alert, Badge, Spinner } from '@/app/components/ui';
import NavBar from '@/app/components/NavBar';
import { useLanguage } from '@/app/context/LanguageContext';
import { getLifeSummary } from '@/app/lib/api';

interface Intervention {
  id: number;
  name: string;
  dose: string;
  category: string;
  frequency: string;
  taken_today: boolean;
  reminder_times: string[];
  evidence_grade: string;
}

interface DailyLog {
  mood: string;
  energy: string;
  sleep_hours: string;
  water_ml: string;
  completed: boolean;
}

export default function CheckinPage() {
  const { locale } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dailyLog, setDailyLog] = useState<DailyLog>({
    mood: '5',
    energy: '5',
    sleep_hours: '7',
    water_ml: '2000',
    completed: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await getLifeSummary();
      setData(res);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : (locale === 'bg' ? 'Грешка при зареждане' : 'Error loading data'));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLog = async () => {
    try {
      setSaving(true);
      // TODO: Call API to save daily log
      // await saveDailyLog(dailyLog)
      setDailyLog({ ...dailyLog, completed: true });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : (locale === 'bg' ? 'Грешка' : 'Error'));
    } finally {
      setSaving(false);
    }
  };

  const todaysMeds = data?.active_interventions?.filter((iv: Intervention) => iv.reminder_times?.length > 0) ?? [];
  const takenMeds = todaysMeds.filter((iv: Intervention) => iv.taken_today === true).length;
  const progressPercent = todaysMeds.length > 0 ? (takenMeds / todaysMeds.length) * 100 : 0;

  if (loading) {
    return (
      <PageShell>
        <NavBar />
        <PageContent>
          <Spinner message={locale === 'bg' ? 'Зареждане...' : 'Loading...'} />
        </PageContent>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title="🏥 Daily Check-In"
          onBack={() => (typeof window !== 'undefined' ? window.history.back() : null)}
        />

        {error && <Alert type="error" message={error} />}

        {/* TODAY'S PROGRESS */}
        {todaysMeds.length > 0 && (
          <Card className="mb-4">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {locale === 'bg' ? '📋 Дневен прогрес' : '📋 Today\'s Progress'}
                  </h3>
                  <Badge color={progressPercent === 100 ? 'green' : progressPercent >= 50 ? 'blue' : 'gray'}>
                    {takenMeds}/{todaysMeds.length}
                  </Badge>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* MEDICATIONS TO TAKE TODAY */}
        {todaysMeds.length > 0 && (
          <div className="mb-6">
            <div className="text-xs font-semibold text-gray-600 mb-3">
              💊 {locale === 'bg' ? 'Лекарства днес' : 'Medications Today'}
            </div>
            <div className="space-y-2">
              {todaysMeds.map((med: Intervention) => (
                <Card key={med.id} className="!p-0 overflow-hidden">
                  <div className="flex">
                    <button
                      type="button"
                      className={`flex-shrink-0 w-14 flex flex-col items-center justify-center gap-1 transition-colors ${
                        med.taken_today
                          ? 'bg-green-50 text-green-600'
                          : 'bg-gray-50 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600'
                      }`}
                    >
                      <span className="text-lg">{med.taken_today ? '✓' : '○'}</span>
                      <span className="text-[8px] font-medium">{med.taken_today ? 'Done' : 'Pending'}</span>
                    </button>
                    <div className="flex-1 min-w-0 p-3">
                      <div className="font-medium text-sm text-gray-900">{med.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {med.dose && <span className="text-xs text-gray-600">{med.dose}</span>}
                        {med.reminder_times && med.reminder_times.length > 0 && (
                          <span className="text-xs text-gray-500">⏰ {med.reminder_times[0]}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* DAILY LOG FORM */}
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">
            {locale === 'bg' ? '📊 Дневен дневник' : '📊 Daily Log'}
          </h3>

          <div className="space-y-4">
            {/* Mood */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                😊 {locale === 'bg' ? 'Настроение (1-10)' : 'Mood (1-10)'}
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={dailyLog.mood}
                onChange={(e) => setDailyLog({ ...dailyLog, mood: e.target.value })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>😢</span>
                <span className="font-medium text-gray-900">{dailyLog.mood}/10</span>
                <span>😄</span>
              </div>
            </div>

            {/* Energy */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                ⚡ {locale === 'bg' ? 'Енергия (1-10)' : 'Energy (1-10)'}
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={dailyLog.energy}
                onChange={(e) => setDailyLog({ ...dailyLog, energy: e.target.value })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>😴</span>
                <span className="font-medium text-gray-900">{dailyLog.energy}/10</span>
                <span>🚀</span>
              </div>
            </div>

            {/* Sleep */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                😴 {locale === 'bg' ? 'Сън (часа)' : 'Sleep (hours)'}
              </label>
              <input
                type="number"
                step="0.5"
                value={dailyLog.sleep_hours}
                onChange={(e) => setDailyLog({ ...dailyLog, sleep_hours: e.target.value })}
                inputMode="decimal"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Water */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                💧 {locale === 'bg' ? 'Вода (мл)' : 'Water (ml)'}
              </label>
              <input
                type="number"
                value={dailyLog.water_ml}
                onChange={(e) => setDailyLog({ ...dailyLog, water_ml: e.target.value })}
                inputMode="numeric"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Save Button */}
            <Button
              variant="primary"
              onClick={handleSaveLog}
              disabled={saving || dailyLog.completed}
              className="w-full"
            >
              {saving
                ? (locale === 'bg' ? 'Запазване...' : 'Saving...')
                : dailyLog.completed
                  ? (locale === 'bg' ? '✓ Запазено' : '✓ Saved')
                  : (locale === 'bg' ? 'Запази чек-ин' : 'Save Check-In')}
            </Button>
          </div>
        </Card>

        {/* AI RECOMMENDATIONS */}
        {data?.today?.composite_score !== null && (
          <Card className="mt-6 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200">
            <h3 className="font-semibold text-gray-900 mb-3">
              🤖 {locale === 'bg' ? 'ИИ препоръки' : 'AI Recommendations'}
            </h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>
                • {locale === 'bg'
                  ? 'Продължи да приемаш лекарствата си редовно'
                  : 'Continue taking your medications consistently'}
              </li>
              <li>
                • {locale === 'bg'
                  ? 'Целта е 8 часа сън всяка нощ'
                  : 'Aim for 8 hours of sleep each night'}
              </li>
              <li>
                • {locale === 'bg'
                  ? 'Пий поне 2.5л вода дневно'
                  : 'Drink at least 2.5L of water daily'}
              </li>
            </ul>
          </Card>
        )}

        {/* BACK BUTTON */}
        <div className="mt-8">
          <Link href="/health">
            <Button variant="secondary" className="w-full">
              {locale === 'bg' ? '← Назад към Health Hub' : '← Back to Health Hub'}
            </Button>
          </Link>
        </div>
      </PageContent>
    </PageShell>
  );
}
