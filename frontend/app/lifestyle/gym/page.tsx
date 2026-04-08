'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Badge } from '../../components/ui';

interface WorkoutDay {
  day: { en: string; bg: string };
  type: { en: string; bg: string };
  exercises: { name: { en: string; bg: string }; sets: string; notes: { en: string; bg: string } }[];
  duration: string;
  intensity: 'low' | 'moderate' | 'high';
  linkedResults: string[];
}

const WEEKLY_PLAN: WorkoutDay[] = [
  {
    day: { en: 'Monday', bg: 'Понеделник' },
    type: { en: 'Strength — Upper Body', bg: 'Сила — Горна част' },
    duration: '45-50 min',
    intensity: 'moderate',
    linkedResults: ['GLU', 'ALT'],
    exercises: [
      { name: { en: 'Brisk Walking Warmup', bg: 'Бързо ходене за загряване' }, sets: '5 min', notes: { en: 'Get heart rate up gradually', bg: 'Повишете пулса постепенно' } },
      { name: { en: 'Dumbbell Bench Press', bg: 'Жим с дъмбели на пейка' }, sets: '3×12', notes: { en: 'Moderate weight, controlled tempo', bg: 'Умерено тегло, контролирано темпо' } },
      { name: { en: 'Seated Row (Cable/Machine)', bg: 'Гребане на машина' }, sets: '3×12', notes: { en: 'Squeeze shoulder blades', bg: 'Стискайте лопатките' } },
      { name: { en: 'Dumbbell Shoulder Press', bg: 'Раменна преса с дъмбели' }, sets: '3×10', notes: { en: '', bg: '' } },
      { name: { en: 'Lat Pulldown', bg: 'Горен скрипец' }, sets: '3×12', notes: { en: '', bg: '' } },
      { name: { en: 'Bicep Curls + Tricep Pushdowns', bg: 'Бицепсови свивания + Трицепсови разгъвания' }, sets: '2×15 each', notes: { en: 'Superset', bg: 'Суперсет' } },
      { name: { en: 'Plank Hold', bg: 'Планк' }, sets: '3×30s', notes: { en: 'Core stability for metabolic health', bg: 'Стабилност на кора за метаболитно здраве' } },
    ],
  },
  {
    day: { en: 'Tuesday', bg: 'Вторник' },
    type: { en: 'Cardio — Zone 2 (Fat Burning)', bg: 'Кардио — Зона 2 (Горене на мазнини)' },
    duration: '40-50 min',
    intensity: 'low',
    linkedResults: ['GLU', 'ALT', 'URIC'],
    exercises: [
      { name: { en: 'Brisk Walking or Light Jogging', bg: 'Бързо ходене или лек бяг' }, sets: '40-50 min', notes: { en: 'Heart rate 120-140 BPM. This is THE most important session for glucose control and liver fat reduction', bg: 'Пулс 120-140. Това е НАЙ-важната тренировка за контрол на глюкозата и намаляване на мастния черен дроб' } },
    ],
  },
  {
    day: { en: 'Wednesday', bg: 'Сряда' },
    type: { en: 'Strength — Lower Body', bg: 'Сила — Долна част' },
    duration: '45-50 min',
    intensity: 'moderate',
    linkedResults: ['GLU'],
    exercises: [
      { name: { en: 'Warmup: Bike or Walking', bg: 'Загряване: Велоергометър или ходене' }, sets: '5 min', notes: { en: '', bg: '' } },
      { name: { en: 'Goblet Squats', bg: 'Клек с дъмбел' }, sets: '3×12', notes: { en: 'Large muscle groups = best glucose uptake', bg: 'Големи мускулни групи = най-добро усвояване на глюкоза' } },
      { name: { en: 'Romanian Deadlift', bg: 'Румънска мъртва тяга' }, sets: '3×10', notes: { en: 'Light to moderate weight, focus on hamstrings', bg: 'Леко до умерено тегло, фокус на задното бедро' } },
      { name: { en: 'Leg Press', bg: 'Преса за крака' }, sets: '3×12', notes: { en: '', bg: '' } },
      { name: { en: 'Walking Lunges', bg: 'Напади с ходене' }, sets: '2×10/leg', notes: { en: '', bg: '' } },
      { name: { en: 'Calf Raises', bg: 'Повдигане на пръсти' }, sets: '3×15', notes: { en: '', bg: '' } },
      { name: { en: 'Dead Bug', bg: 'Dead Bug (Корем)' }, sets: '3×10/side', notes: { en: 'Core work without liver compression', bg: 'Работа на кора без натиск върху черния дроб' } },
    ],
  },
  {
    day: { en: 'Thursday', bg: 'Четвъртък' },
    type: { en: 'Active Recovery + Flexibility', bg: 'Активно възстановяване + Гъвкавост' },
    duration: '30-40 min',
    intensity: 'low',
    linkedResults: ['URIC', 'TP'],
    exercises: [
      { name: { en: 'Yoga / Stretching', bg: 'Йога / Стречинг' }, sets: '20 min', notes: { en: 'Reduces cortisol, helps uric acid clearance', bg: 'Намалява кортизола, помага за изчистване на пикочната киселина' } },
      { name: { en: 'Light Walking', bg: 'Леко ходене' }, sets: '15-20 min', notes: { en: 'Gentle movement, stay hydrated (reduces uric acid)', bg: 'Леко движение, пийте вода (намалява пикочната киселина)' } },
    ],
  },
  {
    day: { en: 'Friday', bg: 'Петък' },
    type: { en: 'Strength — Full Body', bg: 'Сила — Цяло тяло' },
    duration: '45-50 min',
    intensity: 'moderate',
    linkedResults: ['GLU', 'ALT'],
    exercises: [
      { name: { en: 'Warmup: Jump Rope or Bike', bg: 'Загряване: Въже или велоергометър' }, sets: '5 min', notes: { en: '', bg: '' } },
      { name: { en: 'Dumbbell Squat to Press', bg: 'Клек с преса с дъмбели' }, sets: '3×10', notes: { en: 'Compound movement = max insulin sensitivity benefit', bg: 'Комбинирано движение = максимална полза за инсулинова чувствителност' } },
      { name: { en: 'Bent-over Row', bg: 'Наведен гребен' }, sets: '3×12', notes: { en: '', bg: '' } },
      { name: { en: 'Push-ups', bg: 'Лицеви опори' }, sets: '3×max', notes: { en: '', bg: '' } },
      { name: { en: 'Step-ups (bench)', bg: 'Стъпване на пейка' }, sets: '2×10/leg', notes: { en: '', bg: '' } },
      { name: { en: 'Farmer Walk', bg: 'Фермерско ходене' }, sets: '3×30m', notes: { en: 'Full-body metabolic conditioning', bg: 'Метаболитно кондициониране на цялото тяло' } },
      { name: { en: 'Hanging Knee Raises', bg: 'Повдигане на колене на лост' }, sets: '3×10', notes: { en: '', bg: '' } },
    ],
  },
  {
    day: { en: 'Saturday', bg: 'Събота' },
    type: { en: 'Cardio — Sport Day', bg: 'Кардио — Спортен ден' },
    duration: '60+ min',
    intensity: 'moderate',
    linkedResults: ['GLU', 'ALT', 'URIC'],
    exercises: [
      { name: { en: 'Choose a sport (see recommendations below)', bg: 'Изберете спорт (вижте препоръките долу)' }, sets: '60+ min', notes: { en: 'Swimming, cycling, hiking, basketball, or tennis. Social sports improve adherence!', bg: 'Плуване, колоездене, туризъм, баскетбол или тенис. Социалните спортове подобряват мотивацията!' } },
    ],
  },
  {
    day: { en: 'Sunday', bg: 'Неделя' },
    type: { en: 'Rest + Light Walk', bg: 'Почивка + Леко ходене' },
    duration: '20-30 min',
    intensity: 'low',
    linkedResults: [],
    exercises: [
      { name: { en: 'Gentle Walk in Nature', bg: 'Лека разходка сред природата' }, sets: '20-30 min', notes: { en: 'Recovery is crucial. Walk for circulation, not intensity', bg: 'Възстановяването е критично. Ходете за циркулация, не за интензивност' } },
    ],
  },
];

interface Sport {
  name: { en: string; bg: string };
  icon: string;
  benefit: { en: string; bg: string };
  frequency: { en: string; bg: string };
  linkedResults: string[];
}

const SPORTS: Sport[] = [
  { name: { en: 'Swimming', bg: 'Плуване' }, icon: '🏊', benefit: { en: 'Low-impact cardio, excellent for liver fat reduction and insulin sensitivity. Joint-friendly.', bg: 'Нискоударно кардио, отлично за намаляване на мастния черен дроб и инсулинова чувствителност.' }, frequency: { en: '2-3x/week', bg: '2-3 пъти/седмица' }, linkedResults: ['GLU', 'ALT'] },
  { name: { en: 'Cycling', bg: 'Колоездене' }, icon: '🚴', benefit: { en: 'Zone 2 cardio that burns glucose efficiently. Great for metabolic syndrome reversal.', bg: 'Кардио в зона 2, което изгаря глюкозата ефективно. Отлично за обратен ефект на метаболитен синдром.' }, frequency: { en: '2-3x/week, 30-60min', bg: '2-3 пъти/седмица, 30-60 мин' }, linkedResults: ['GLU'] },
  { name: { en: 'Hiking', bg: 'Туризъм/Планински преходи' }, icon: '🥾', benefit: { en: 'Long steady-state cardio. Burns fat, reduces stress hormones, improves vitamin D.', bg: 'Дълго кардио с постоянен ритъм. Горене на мазнини, намаляване на стрес хормоните, подобрява витамин D.' }, frequency: { en: '1-2x/week (weekends)', bg: '1-2 пъти/седмица (уикенди)' }, linkedResults: ['GLU', 'ALT', 'URIC'] },
  { name: { en: 'Tennis / Padel', bg: 'Тенис / Падел' }, icon: '🎾', benefit: { en: 'Interval-style cardio. Great for insulin sensitivity and fun factor (motivation).', bg: 'Интервално кардио. Отлично за инсулинова чувствителност и забавление (мотивация).' }, frequency: { en: '1-2x/week', bg: '1-2 пъти/седмица' }, linkedResults: ['GLU'] },
  { name: { en: 'Basketball', bg: 'Баскетбол' }, icon: '🏀', benefit: { en: 'High-intensity intervals with social component. Excellent glucose burn.', bg: 'Високоинтензивни интервали със социален компонент. Отлично горене на глюкоза.' }, frequency: { en: '1-2x/week', bg: '1-2 пъти/седмица' }, linkedResults: ['GLU'] },
  { name: { en: 'Yoga', bg: 'Йога' }, icon: '🧘', benefit: { en: 'Reduces cortisol (which raises glucose), improves flexibility, helps liver detox through deep breathing.', bg: 'Намалява кортизола (който повишава глюкозата), подобрява гъвкавостта, помага за детоксикация на черния дроб.' }, frequency: { en: '1-2x/week', bg: '1-2 пъти/седмица' }, linkedResults: ['GLU', 'ALT', 'TP'] },
];

const INTENSITY_COLORS: Record<string, 'green' | 'yellow' | 'red'> = { low: 'green', moderate: 'yellow', high: 'red' };

export default function GymRoutinePage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [selectedDay, setSelectedDay] = useState(0);
  const workout = WEEKLY_PLAN[selectedDay];

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('lifestyle.gym_routine', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/lifestyle')}
        />
        <p className="text-sm text-gray-500 -mt-4 mb-6">
          {locale === 'en'
            ? 'Designed for: glucose control (strength + Zone 2 cardio), liver fat reduction, uric acid clearance'
            : 'Проектирано за: контрол на глюкозата (сила + зона 2 кардио), намаляване на мастния черен дроб, изчистване на пикочната киселина'}
        </p>

        {/* Day selector */}
        <div className="flex flex-wrap gap-2 mb-5">
          {WEEKLY_PLAN.map((d, i) => (
            <button
              key={i}
              onClick={() => setSelectedDay(i)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedDay === i ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d.day[locale]}
            </button>
          ))}
        </div>

        {/* Selected day detail */}
        <Card className="mb-6">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h2 className="text-base font-semibold text-gray-900">{workout.day[locale]} — {workout.type[locale]}</h2>
            <Badge color={INTENSITY_COLORS[workout.intensity]}>{workout.duration}</Badge>
            {workout.linkedResults.length > 0 && (
              <div className="flex gap-1">
                {workout.linkedResults.map((r) => <Badge key={r} color="indigo">{r}</Badge>)}
              </div>
            )}
          </div>
          <div className="space-y-3">
            {workout.exercises.map((ex, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm font-mono text-gray-400 w-6 text-right">{i + 1}.</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{ex.name[locale]}</span>
                    <Badge color="gray">{ex.sets}</Badge>
                  </div>
                  {ex.notes[locale] && <p className="text-xs text-gray-500 mt-0.5">{ex.notes[locale]}</p>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Weekly overview */}
        <h2 className="text-base font-semibold text-gray-900 mb-3">{t('lifestyle.weekly_routine', locale)}</h2>
        <Card padding={false} className="mb-8">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">{t('lifestyle.day', locale)}</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">{t('lifestyle.exercise', locale)}</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">{t('lifestyle.duration_label', locale)}</th>
                <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">{t('lifestyle.intensity', locale)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {WEEKLY_PLAN.map((d, i) => (
                <tr key={i} className={`hover:bg-gray-50 cursor-pointer ${selectedDay === i ? 'bg-indigo-50' : ''}`} onClick={() => setSelectedDay(i)}>
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{d.day[locale]}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600">{d.type[locale]}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500 hidden sm:table-cell">{d.duration}</td>
                  <td className="px-4 py-2.5 hidden sm:table-cell"><Badge color={INTENSITY_COLORS[d.intensity]}>{d.intensity}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Recommended sports */}
        <h2 className="text-base font-semibold text-gray-900 mb-3">{t('lifestyle.sports', locale)}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {SPORTS.map((sport, i) => (
            <Card key={i}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{sport.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-sm font-semibold text-gray-900">{sport.name[locale]}</h3>
                    <Badge color="gray">{sport.frequency[locale]}</Badge>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{sport.benefit[locale]}</p>
                  <div className="mt-1.5 flex gap-1">
                    {sport.linkedResults.map((r) => <Badge key={r} color="indigo">{r}</Badge>)}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Supplements link */}
        <button
          onClick={() => router.push('/lifestyle')}
          className="w-full flex items-center justify-between p-4 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors mb-8"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">💊</span>
            <div className="text-left">
              <p className="text-sm font-semibold text-indigo-800">
                {locale === 'bg' ? 'Добавки и лекарства' : 'Supplements & Medication'}
              </p>
              <p className="text-xs text-indigo-500">
                {locale === 'bg' ? 'Управлявайте от Дневния ритуал с точни дози и графици' : 'Managed in Daily Ritual with exact doses and schedules'}
              </p>
            </div>
          </div>
          <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </PageContent>
    </PageShell>
  );
}
