'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageShell, PageContent, PageHeader, Card, Button, Alert, Badge, Spinner, Input, Select } from '@/app/components/ui';
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

interface Measurements {
  // Blood Pressure
  systolic?: string;
  diastolic?: string;
  pulse?: string;
  arm?: 'left' | 'right';
  posture?: 'sitting' | 'standing' | 'lying';
  context_tags?: string[];

  // Weight & Circumferences
  weight_kg?: string;
  waist_cm?: string;
  hip_cm?: string;
  chest_cm?: string;

  // Notes
  notes?: string;
}

export default function CheckinPage() {
  const { locale } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Measurements modal state
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);
  const [measurementStep, setMeasurementStep] = useState(1); // 1=BP, 2=Weight, 3=Circumferences, 4=Notes
  const [measurements, setMeasurements] = useState<Measurements>({
    arm: 'left',
    posture: 'sitting',
    context_tags: [],
  });
  const [savingMeasurement, setSavingMeasurement] = useState(false);

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

  const handleNextStep = () => {
    if (measurementStep < 4) {
      setMeasurementStep(measurementStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (measurementStep > 1) {
      setMeasurementStep(measurementStep - 1);
    }
  };

  const handleSkipStep = () => {
    if (measurementStep < 4) {
      setMeasurementStep(measurementStep + 1);
    }
  };

  const handleSaveMeasurements = async () => {
    try {
      setSavingMeasurement(true);
      // TODO: Call API to save measurements
      // await saveMeasurements(measurements)
      setShowMeasurementModal(false);
      setMeasurementStep(1);
      setMeasurements({ arm: 'left', posture: 'sitting', context_tags: [] });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : (locale === 'bg' ? 'Грешка' : 'Error'));
    } finally {
      setSavingMeasurement(false);
    }
  };

  const toggleContextTag = (tag: string) => {
    setMeasurements((prev) => {
      const tags = prev.context_tags || [];
      if (tags.includes(tag)) {
        return { ...prev, context_tags: tags.filter((t) => t !== tag) };
      } else {
        return { ...prev, context_tags: [...tags, tag] };
      }
    });
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

        {/* ADD MEASUREMENTS BUTTON */}
        <Button
          variant="primary"
          onClick={() => {
            setShowMeasurementModal(true);
            setMeasurementStep(1);
          }}
          className="w-full mb-6"
        >
          {locale === 'bg' ? '📏 Добави измервания' : '📏 Add Measurements'}
        </Button>

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

        {/* MEASUREMENTS MODAL */}
        {showMeasurementModal && (
          <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
            <div className="bg-white rounded-t-3xl md:rounded-xl w-full md:w-2xl max-h-[90vh] overflow-y-auto md:shadow-xl">
              {/* Modal Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-3xl md:rounded-t-xl">
                <h2 className="text-lg font-semibold text-gray-900">
                  {locale === 'bg' ? '📏 Добави измервания' : '📏 Add Measurements'}
                </h2>
                <button
                  onClick={() => {
                    setShowMeasurementModal(false);
                    setMeasurementStep(1);
                    setMeasurements({ arm: 'left', posture: 'sitting', context_tags: [] });
                  }}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ✕
                </button>
              </div>

              <div className="p-6">
                {/* Step Progress Indicator */}
                <div className="flex gap-2 mb-6">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`flex-1 h-2 rounded-full transition-colors ${
                        step <= measurementStep ? 'bg-indigo-600' : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>

                {/* STEP 1: BLOOD PRESSURE */}
                {measurementStep === 1 && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900 mb-4">🩸 {locale === 'bg' ? 'Кръвно налягане' : 'Blood Pressure'}</h3>

                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        label={locale === 'bg' ? 'Систолно' : 'Systolic'}
                        type="number"
                        value={measurements.systolic || ''}
                        onChange={(e) => setMeasurements({ ...measurements, systolic: e.target.value })}
                        inputMode="numeric"
                        placeholder="120"
                      />
                      <Input
                        label={locale === 'bg' ? 'Диастолно' : 'Diastolic'}
                        type="number"
                        value={measurements.diastolic || ''}
                        onChange={(e) => setMeasurements({ ...measurements, diastolic: e.target.value })}
                        inputMode="numeric"
                        placeholder="80"
                      />
                    </div>

                    <Input
                      label={locale === 'bg' ? 'Пулс' : 'Pulse (bpm)'}
                      type="number"
                      value={measurements.pulse || ''}
                      onChange={(e) => setMeasurements({ ...measurements, pulse: e.target.value })}
                      inputMode="numeric"
                      placeholder="72"
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <Select
                        label={locale === 'bg' ? 'Ръка' : 'Arm'}
                        value={measurements.arm || 'left'}
                        onChange={(e) => setMeasurements({ ...measurements, arm: e.target.value as 'left' | 'right' })}
                      >
                        <option value="left">{locale === 'bg' ? 'Лява' : 'Left'}</option>
                        <option value="right">{locale === 'bg' ? 'Дясна' : 'Right'}</option>
                      </Select>
                      <Select
                        label={locale === 'bg' ? 'Поза' : 'Posture'}
                        value={measurements.posture || 'sitting'}
                        onChange={(e) => setMeasurements({ ...measurements, posture: e.target.value as 'sitting' | 'standing' | 'lying' })}
                      >
                        <option value="sitting">{locale === 'bg' ? 'Седнал' : 'Sitting'}</option>
                        <option value="standing">{locale === 'bg' ? 'Правостоящ' : 'Standing'}</option>
                        <option value="lying">{locale === 'bg' ? 'Легнал' : 'Lying'}</option>
                      </Select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-3">
                        {locale === 'bg' ? 'Контекст' : 'Context'}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { tag: 'caffeine', emoji: '☕', label: locale === 'bg' ? 'След кафе' : 'After coffee' },
                          { tag: 'exercise', emoji: '🏃', label: locale === 'bg' ? 'След упражнение' : 'After exercise' },
                          { tag: 'medication', emoji: '💊', label: locale === 'bg' ? 'След лекарство' : 'After meds' },
                          { tag: 'stressed', emoji: '😰', label: locale === 'bg' ? 'Стресиран' : 'Stressed' },
                          { tag: 'clinic', emoji: '🏥', label: locale === 'bg' ? 'Клинично' : 'Clinical' },
                          { tag: 'fasting', emoji: '🍴', label: locale === 'bg' ? 'На гладно' : 'Fasting' },
                        ].map(({ tag, emoji, label }) => (
                          <button
                            key={tag}
                            onClick={() => toggleContextTag(tag)}
                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                              measurements.context_tags?.includes(tag)
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {emoji} {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: WEIGHT */}
                {measurementStep === 2 && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900 mb-4">⚖️ {locale === 'bg' ? 'Тегло' : 'Weight'}</h3>
                    <Input
                      label={locale === 'bg' ? 'Килограми' : 'Kilograms'}
                      type="number"
                      step="0.1"
                      value={measurements.weight_kg || ''}
                      onChange={(e) => setMeasurements({ ...measurements, weight_kg: e.target.value })}
                      inputMode="decimal"
                      placeholder="70.5"
                    />
                    <p className="text-xs text-gray-500">
                      {locale === 'bg'
                        ? 'Можеш да пропуснеш тази стъпка, ако не си претеглена днес'
                        : 'You can skip this step if you haven\'t weighed yourself'}
                    </p>
                  </div>
                )}

                {/* STEP 3: CIRCUMFERENCES */}
                {measurementStep === 3 && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900 mb-4">📏 {locale === 'bg' ? 'Обиколки' : 'Circumferences'}</h3>
                    <Input
                      label={locale === 'bg' ? 'Талия (см)' : 'Waist (cm)'}
                      type="number"
                      value={measurements.waist_cm || ''}
                      onChange={(e) => setMeasurements({ ...measurements, waist_cm: e.target.value })}
                      inputMode="numeric"
                      placeholder="85"
                    />
                    <Input
                      label={locale === 'bg' ? 'Бедро (см)' : 'Hip (cm)'}
                      type="number"
                      value={measurements.hip_cm || ''}
                      onChange={(e) => setMeasurements({ ...measurements, hip_cm: e.target.value })}
                      inputMode="numeric"
                      placeholder="100"
                    />
                    <Input
                      label={locale === 'bg' ? 'Гърди (см)' : 'Chest (cm)'}
                      type="number"
                      value={measurements.chest_cm || ''}
                      onChange={(e) => setMeasurements({ ...measurements, chest_cm: e.target.value })}
                      inputMode="numeric"
                      placeholder="98"
                    />
                    <p className="text-xs text-gray-500">
                      {locale === 'bg'
                        ? 'Всички полета са опционални. Попълни само това, което искаш да проследиш'
                        : 'All fields are optional. Fill in only what you want to track'}
                    </p>
                  </div>
                )}

                {/* STEP 4: NOTES */}
                {measurementStep === 4 && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900 mb-4">📝 {locale === 'bg' ? 'Бележки' : 'Notes'}</h3>
                    <textarea
                      value={measurements.notes || ''}
                      onChange={(e) => setMeasurements({ ...measurements, notes: e.target.value })}
                      placeholder={locale === 'bg' ? 'Условия, време на ден, други наблюдения...' : 'Time of day, conditions, other observations...'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 resize-none h-24"
                    />
                  </div>
                )}

                {/* Modal Actions */}
                <div className="flex gap-3 mt-8 pt-6 border-t border-gray-200">
                  {measurementStep > 1 && (
                    <Button
                      variant="secondary"
                      onClick={handlePrevStep}
                      className="flex-1"
                    >
                      {locale === 'bg' ? '← Назад' : '← Back'}
                    </Button>
                  )}
                  {measurementStep < 4 && (
                    <>
                      <Button
                        variant="ghost"
                        onClick={handleSkipStep}
                        className="flex-1"
                      >
                        {locale === 'bg' ? 'Пропусни' : 'Skip'}
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleNextStep}
                        className="flex-1"
                      >
                        {locale === 'bg' ? 'Напред →' : 'Next →'}
                      </Button>
                    </>
                  )}
                  {measurementStep === 4 && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setShowMeasurementModal(false);
                          setMeasurementStep(1);
                          setMeasurements({ arm: 'left', posture: 'sitting', context_tags: [] });
                        }}
                        className="flex-1"
                      >
                        {locale === 'bg' ? 'Отмени' : 'Cancel'}
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleSaveMeasurements}
                        disabled={savingMeasurement}
                        className="flex-1"
                      >
                        {savingMeasurement
                          ? (locale === 'bg' ? 'Запазване...' : 'Saving...')
                          : (locale === 'bg' ? '✓ Запази' : '✓ Save')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
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
