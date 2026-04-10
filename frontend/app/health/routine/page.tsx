'use client';

/**
 * §PAGE: Daily Medicine Routine
 * §ROUTE: /health/routine
 * §PURPOSE: Track which medicines/supplements were taken today
 * §UX: Simple checklist to mark medicines as taken or skipped
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import {
  PageShell, PageContent, PageHeader, Card, Button,
  Badge, Spinner, Alert, EmptyState, Input,
} from '../../components/ui';
import NavBar from '../../components/NavBar';

interface Schedule {
  id: number;
  supplement_id: number;
  supplement_name: string;
  time_slot: string;
  dose_amount: number;
  dose_unit: string;
  take_with_food: boolean;
  take_on_empty_stomach: boolean;
  is_active: boolean;
  color?: string;
}

interface DoseLog {
  id: number;
  schedule_id: number;
  date: string;
  taken: boolean | null; // null = not logged yet, true = taken, false = skipped
  taken_at?: string;
  skipped_reason?: string;
}

const TIME_SLOTS: Record<string, string> = {
  morning: '🌅',
  breakfast: '🍳',
  lunch: '🍽️',
  afternoon: '☕',
  dinner: '🍷',
  evening: '🌙',
  bedtime: '😴',
  as_needed: '⏰',
};

export default function DailyRoutinePage() {
  const { locale } = useLanguage();
  const router = useRouter();

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [doseLogs, setDoseLogs] = useState<Record<number, DoseLog>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<number | null>(null);
  const [today] = useState(() => new Date().toISOString().split('T')[0]);

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch today's schedules
      const response = await fetch(`/api/health/schedules/today/?profile=1`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch schedules');
      const data = await response.json();
      setSchedules(data);

      // Fetch dose logs for today
      const logsResponse = await fetch(`/api/health/doses/?date=${today}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`,
        },
      });
      if (logsResponse.ok) {
        const logs = await logsResponse.json();
        const logsMap = logs.reduce((acc: any, log: DoseLog) => {
          acc[log.schedule_id] = log;
          return acc;
        }, {});
        setDoseLogs(logsMap);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const handleToggleDose = async (scheduleId: number, currentTaken: boolean | null) => {
    const newTaken = currentTaken === true ? false : currentTaken === false ? null : true;
    setSaving(scheduleId);

    try {
      const response = await fetch('/api/health/doses/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`,
        },
        body: JSON.stringify({
          schedule_id: scheduleId,
          date: today,
          taken: newTaken !== null ? newTaken : undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to update dose log');
      const updatedLog = await response.json();
      setDoseLogs((prev) => ({
        ...prev,
        [scheduleId]: updatedLog,
      }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  // Sort schedules by time slot order
  const sortedSchedules = [...schedules].sort((a, b) => {
    const timeOrder = ['morning', 'breakfast', 'lunch', 'afternoon', 'dinner', 'evening', 'bedtime', 'as_needed'];
    return timeOrder.indexOf(a.time_slot) - timeOrder.indexOf(b.time_slot);
  });

  const takenCount = Object.values(doseLogs).filter((log) => log.taken === true).length;
  const skippedCount = Object.values(doseLogs).filter((log) => log.taken === false).length;
  const pendingCount = schedules.length - takenCount - skippedCount;

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={locale === 'bg' ? 'Дневен режим' : 'Daily Routine'}
          onBack={() => router.push('/health')}
        />

        <Alert type="error" message={error} />

        {/* Progress bar */}
        {schedules.length > 0 && (
          <Card className="mb-4">
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">
                {locale === 'bg' ? 'Днес' : 'Today'}
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${(takenCount / schedules.length) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-sm font-medium text-gray-700 min-w-fit">
                  {takenCount}/{schedules.length}
                </div>
              </div>
              <div className="flex gap-2 text-xs">
                <Badge color="green">✓ {takenCount} {locale === 'bg' ? 'приема' : 'taken'}</Badge>
                <Badge color="red">✗ {skippedCount} {locale === 'bg' ? 'пропуснати' : 'skipped'}</Badge>
                <Badge color="gray">{pendingCount} {locale === 'bg' ? 'очакване' : 'pending'}</Badge>
              </div>
            </div>
          </Card>
        )}

        {loading ? (
          <Spinner message={locale === 'bg' ? 'Зарежда режим...' : 'Loading routine...'} />
        ) : schedules.length === 0 ? (
          <EmptyState
            icon="💊"
            message={locale === 'bg'
              ? 'Няма планирани лекарства за днес'
              : 'No medicines scheduled for today'
            }
          />
        ) : (
          <div className="space-y-3">
            {sortedSchedules.map((schedule) => {
              const log = doseLogs[schedule.id];
              const taken = log?.taken;
              const timeEmoji = TIME_SLOTS[schedule.time_slot] || '🕐';

              return (
                <button
                  key={schedule.id}
                  onClick={() => handleToggleDose(schedule.id, taken)}
                  disabled={saving === schedule.id}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    taken === true
                      ? 'border-green-300 bg-green-50'
                      : taken === false
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-200 bg-white hover:border-indigo-200'
                  } ${saving === schedule.id ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <div className="flex-shrink-0 pt-0.5">
                      <div
                        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center text-sm font-bold ${
                          taken === true
                            ? 'bg-green-500 border-green-500 text-white'
                            : taken === false
                              ? 'bg-red-100 border-red-400 text-red-600'
                              : 'border-gray-300 bg-white'
                        }`}
                      >
                        {taken === true ? '✓' : taken === false ? '✗' : ''}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">{timeEmoji}</span>
                        <span className="font-medium text-gray-900">{schedule.supplement_name}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {schedule.dose_amount} {schedule.dose_unit}
                      </div>
                      {(schedule.take_with_food || schedule.take_on_empty_stomach) && (
                        <div className="mt-1.5 flex gap-1 flex-wrap">
                          {schedule.take_with_food && (
                            <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              {locale === 'bg' ? 'Със храна' : 'With food'}
                            </span>
                          )}
                          {schedule.take_on_empty_stomach && (
                            <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              {locale === 'bg' ? 'На празен стомах' : 'On empty stomach'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Status indicator */}
                    <div className="flex-shrink-0 text-right">
                      {taken === true && (
                        <span className="text-xs font-medium text-green-700">
                          {locale === 'bg' ? 'Взето' : 'Taken'}
                        </span>
                      )}
                      {taken === false && (
                        <span className="text-xs font-medium text-red-700">
                          {locale === 'bg' ? 'Пропуснато' : 'Skipped'}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Help text */}
        {schedules.length > 0 && (
          <Card className="mt-6 bg-blue-50 border-blue-200">
            <div className="text-sm text-blue-800">
              {locale === 'bg'
                ? '💡 Щракнете на лекарство, за да отбележите като взето. Щракнете отново, за да го отбележите като пропуснато.'
                : '💡 Click a medicine to mark as taken. Click again to mark as skipped.'}
            </div>
          </Card>
        )}
      </PageContent>
    </PageShell>
  );
}
