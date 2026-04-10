'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t, Locale } from '../../lib/i18n';
import {
  getHealthProfiles, getHealthDashboard,
  getBPReadings, createBPReading, createBPSession,
} from '../../lib/api';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, Card, Button, Badge, Alert, Spinner, Textarea, EmptyState } from '../../components/ui';

// ── Types ──────────────────────────────────────────────────────────

interface Profile {
  id: number; full_name: string; sex: string; is_primary: boolean;
  date_of_birth: string | null;
}

interface BpReading {
  id: number;
  profile: number;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  arm: 'left' | 'right';
  posture: 'sitting' | 'standing' | 'lying';
  is_after_caffeine: boolean;
  is_after_exercise: boolean;
  is_after_medication: boolean;
  is_stressed: boolean;
  is_clinic_reading: boolean;
  is_fasting: boolean;
  notes: string;
  measured_at: string;
  session: number | null;
  stage: string;
}

type Period = '7d' | '30d' | '90d' | 'all';

// ── BP Classification (AHA) ───────────────────────────────────────

type BpStage = 'normal' | 'elevated' | 'stage1' | 'stage2' | 'crisis';

function classifyBp(sys: number, dia: number): BpStage {
  if (sys >= 180 || dia >= 120) return 'crisis';
  if (sys >= 140 || dia >= 90) return 'stage2';
  if (sys >= 130 || dia >= 80) return 'stage1';
  if (sys >= 120 && dia < 80) return 'elevated';
  return 'normal';
}

const STAGE_META: Record<BpStage, { label_en: string; label_bg: string; color: string; badgeColor: 'green' | 'yellow' | 'red' | 'purple' }> = {
  normal:   { label_en: 'Normal',           label_bg: 'Нормално',          color: 'text-emerald-600', badgeColor: 'green' },
  elevated: { label_en: 'Elevated',         label_bg: 'Повишено',          color: 'text-yellow-600',  badgeColor: 'yellow' },
  stage1:   { label_en: 'Stage 1 HTN',      label_bg: 'Хипертония ст. 1', color: 'text-orange-600',  badgeColor: 'yellow' },
  stage2:   { label_en: 'Stage 2 HTN',      label_bg: 'Хипертония ст. 2', color: 'text-red-600',     badgeColor: 'red' },
  crisis:   { label_en: 'Hypertensive Crisis', label_bg: 'Хипертонична криза', color: 'text-red-800', badgeColor: 'purple' },
};

const STAGE_BG: Record<BpStage, string> = {
  normal: 'bg-emerald-50', elevated: 'bg-yellow-50', stage1: 'bg-orange-50', stage2: 'bg-red-50', crisis: 'bg-red-100',
};

const CONTEXT_OPTIONS = [
  { key: 'caffeine',   flag: 'is_after_caffeine',   icon: '\u2615', en: 'After caffeine', bg: 'След кафе' },
  { key: 'exercise',   flag: 'is_after_exercise',   icon: '\ud83c\udfc3', en: 'After exercise', bg: 'След упражнение' },
  { key: 'medication', flag: 'is_after_medication', icon: '\ud83d\udc8a', en: 'After medication', bg: 'След лекарство' },
  { key: 'stressed',   flag: 'is_stressed',         icon: '\ud83d\ude30', en: 'Stressed', bg: 'Стресиран' },
  { key: 'clinic',     flag: 'is_clinic_reading',   icon: '\ud83c\udfe5', en: 'Clinic reading', bg: 'Клинично' },
  { key: 'fasting',    flag: 'is_fasting',          icon: '\ud83c\udf74', en: 'Fasting', bg: 'На гладно' },
];

function getContextIcons(r: BpReading): string {
  const icons: string[] = [];
  if (r.is_after_caffeine) icons.push('\u2615');
  if (r.is_after_exercise) icons.push('\ud83c\udfc3');
  if (r.is_after_medication) icons.push('\ud83d\udc8a');
  if (r.is_stressed) icons.push('\ud83d\ude30');
  if (r.is_clinic_reading) icons.push('\ud83c\udfe5');
  if (r.is_fasting) icons.push('\ud83c\udf74');
  return icons.join(' ');
}

// ── Helpers ────────────────────────────────────────────────────────

function timeAgo(dateStr: string, locale: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return locale === 'bg' ? 'Току-що' : 'Just now';
  if (mins < 60) return `${mins} ${locale === 'bg' ? 'мин' : 'min'} ${locale === 'bg' ? 'назад' : 'ago'}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ${locale === 'bg' ? 'ч' : 'h'} ${locale === 'bg' ? 'назад' : 'ago'}`;
  const days = Math.floor(hrs / 24);
  return `${days} ${locale === 'bg' ? 'дни' : 'd'} ${locale === 'bg' ? 'назад' : 'ago'}`;
}

function filterByPeriod(readings: BpReading[], period: Period): BpReading[] {
  if (period === 'all') return readings;
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  return readings.filter(r => r.measured_at >= cutoff);
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function formatDateTime(dateStr: string, locale: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function getMorningEvening(readings: BpReading[]): { morning: BpReading[]; evening: BpReading[] } {
  const morning: BpReading[] = [];
  const evening: BpReading[] = [];
  for (const r of readings) {
    const h = new Date(r.measured_at).getHours();
    if (h >= 5 && h < 12) morning.push(r);
    else if (h >= 17 && h < 23) evening.push(r);
  }
  return { morning, evening };
}

// ── SVG Trend Chart ───────────────────────────────────────────────

function TrendChart({ readings, locale }: { readings: BpReading[]; locale: Locale }) {
  if (readings.length < 2) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        {locale === 'bg' ? 'Необходими са поне 2 измервания за графика' : 'At least 2 readings needed for chart'}
      </div>
    );
  }

  const sorted = [...readings].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const W = 800, H = 280, PX = 50, PY = 30;
  const allVals = sorted.flatMap(r => [r.systolic, r.diastolic]);
  const minV = Math.min(...allVals, 60) - 10;
  const maxV = Math.max(...allVals, 180) + 10;

  const xScale = (i: number) => PX + (i / (sorted.length - 1)) * (W - PX * 2);
  const yScale = (v: number) => PY + ((maxV - v) / (maxV - minV)) * (H - PY * 2);

  const sysPoints = sorted.map((r, i) => `${xScale(i)},${yScale(r.systolic)}`).join(' ');
  const diaPoints = sorted.map((r, i) => `${xScale(i)},${yScale(r.diastolic)}`).join(' ');

  const thresholds = [
    { value: 120, label: '120', color: '#d1d5db' },
    { value: 130, label: '130', color: '#fbbf24' },
    { value: 140, label: '140', color: '#f87171' },
  ];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[500px]" preserveAspectRatio="xMidYMid meet">
        {thresholds.map(th => {
          const y = yScale(th.value);
          if (y < PY || y > H - PY) return null;
          return (
            <g key={th.value}>
              <line x1={PX} y1={y} x2={W - PX} y2={y} stroke={th.color} strokeWidth="1" strokeDasharray="4 3" />
              <text x={W - PX + 5} y={y + 4} fontSize="10" fill={th.color}>{th.label}</text>
            </g>
          );
        })}
        {[minV, Math.round((minV + maxV) / 2), maxV].map(v => (
          <text key={v} x={PX - 8} y={yScale(v) + 4} fontSize="10" fill="#9ca3af" textAnchor="end">{v}</text>
        ))}
        {sorted.map((r, i) => {
          if (sorted.length > 10 && i % Math.ceil(sorted.length / 8) !== 0 && i !== sorted.length - 1) return null;
          const d = new Date(r.measured_at);
          const label = `${d.getDate()}/${d.getMonth() + 1}`;
          return <text key={i} x={xScale(i)} y={H - 5} fontSize="9" fill="#9ca3af" textAnchor="middle">{label}</text>;
        })}
        <polyline points={sysPoints} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" />
        {sorted.map((r, i) => {
          const stage = classifyBp(r.systolic, r.diastolic);
          const fill = stage === 'normal' ? '#10b981' : stage === 'elevated' ? '#f59e0b' : stage === 'stage1' ? '#f97316' : '#ef4444';
          return <circle key={`s${i}`} cx={xScale(i)} cy={yScale(r.systolic)} r="4" fill={fill} stroke="white" strokeWidth="1.5" />;
        })}
        <polyline points={diaPoints} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />
        {sorted.map((r, i) => (
          <circle key={`d${i}`} cx={xScale(i)} cy={yScale(r.diastolic)} r="3.5" fill="#6366f1" stroke="white" strokeWidth="1.5" />
        ))}
        {/* Medication markers */}
        {sorted.map((r, i) => {
          if (!r.is_after_medication) return null;
          const topY = Math.min(yScale(r.systolic), yScale(r.diastolic)) - 18;
          return (
            <g key={`med${i}`}>
              <rect x={xScale(i) - 6} y={topY} width="12" height="12" fill="#ec4899" opacity="0.15" rx="2" />
              <text x={xScale(i)} y={topY + 9} fontSize="11" fontWeight="bold" textAnchor="middle" fill="#ec4899">💊</text>
            </g>
          );
        })}
        <circle cx={PX + 10} cy={15} r="4" fill="#ef4444" />
        <text x={PX + 18} y={19} fontSize="10" fill="#6b7280">{locale === 'bg' ? 'Систолично' : 'Systolic'}</text>
        <circle cx={PX + 100} cy={15} r="3.5" fill="#6366f1" />
        <text x={PX + 108} y={19} fontSize="10" fill="#6b7280">{locale === 'bg' ? 'Диастолично' : 'Diastolic'}</text>
        <text x={PX + 200} y={19} fontSize="10" fill="#ec4899">💊</text>
        <text x={PX + 215} y={19} fontSize="10" fill="#6b7280">{locale === 'bg' ? 'След лекарство' : 'After medication'}</text>
      </svg>
    </div>
  );
}

// ── Quick Log Modal ───────────────────────────────────────────────

function QuickLogModal({ profileId, locale, onSave, onClose }: {
  profileId: number; locale: Locale; onSave: () => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    systolic: '', diastolic: '', pulse: '', arm: 'left' as 'left' | 'right',
    posture: 'sitting' as 'sitting' | 'standing' | 'lying', context: [] as string[], notes: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const sysRef = useRef<HTMLInputElement>(null);

  useEffect(() => { sysRef.current?.focus(); }, []);

  const handleContextToggle = (key: string) => {
    setForm(prev => ({
      ...prev,
      context: prev.context.includes(key) ? prev.context.filter(c => c !== key) : [...prev.context, key],
    }));
  };

  const handleSave = async () => {
    const sys = parseInt(form.systolic);
    const dia = parseInt(form.diastolic);
    if (!sys || sys < 60 || sys > 300) { setError(locale === 'bg' ? 'Невалидно систолично' : 'Invalid systolic value'); return; }
    if (!dia || dia < 30 || dia > 200) { setError(locale === 'bg' ? 'Невалидно диастолично' : 'Invalid diastolic value'); return; }
    if (dia >= sys) { setError(locale === 'bg' ? 'Диастоличното трябва да е по-малко от систоличното' : 'Diastolic must be less than systolic'); return; }

    setSaving(true);
    try {
      await createBPReading({
        profile: profileId,
        systolic: sys,
        diastolic: dia,
        pulse: form.pulse ? parseInt(form.pulse) : null,
        measured_at: new Date().toISOString(),
        arm: form.arm,
        posture: form.posture,
        is_after_caffeine: form.context.includes('caffeine'),
        is_after_exercise: form.context.includes('exercise'),
        is_after_medication: form.context.includes('medication'),
        is_stressed: form.context.includes('stressed'),
        is_clinic_reading: form.context.includes('clinic'),
        is_fasting: form.context.includes('fasting'),
        notes: form.notes,
      });
      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              {locale === 'bg' ? 'Ново измерване' : 'Log Reading'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <Alert type="error" message={error} />

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {locale === 'bg' ? 'Систолично' : 'Systolic'}
              </label>
              <input
                ref={sysRef} type="number" inputMode="numeric" value={form.systolic}
                onChange={e => setForm(prev => ({ ...prev, systolic: e.target.value }))}
                placeholder="120"
                className="w-full h-16 text-3xl font-bold text-center text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-gray-400 mt-1">mmHg</span>
            </div>
            <div className="text-center">
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {locale === 'bg' ? 'Диастолично' : 'Diastolic'}
              </label>
              <input
                type="number" inputMode="numeric" value={form.diastolic}
                onChange={e => setForm(prev => ({ ...prev, diastolic: e.target.value }))}
                placeholder="80"
                className="w-full h-16 text-3xl font-bold text-center text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-gray-400 mt-1">mmHg</span>
            </div>
            <div className="text-center">
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {locale === 'bg' ? 'Пулс' : 'Pulse'}
              </label>
              <input
                type="number" inputMode="numeric" value={form.pulse}
                onChange={e => setForm(prev => ({ ...prev, pulse: e.target.value }))}
                placeholder="72"
                className="w-full h-16 text-3xl font-bold text-center text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-gray-400 mt-1">bpm</span>
            </div>
          </div>

          {form.systolic && form.diastolic && parseInt(form.systolic) > 0 && parseInt(form.diastolic) > 0 && (
            <div className={`text-center py-2 rounded-lg mb-4 ${STAGE_BG[classifyBp(parseInt(form.systolic), parseInt(form.diastolic))]}`}>
              <span className={`text-sm font-medium ${STAGE_META[classifyBp(parseInt(form.systolic), parseInt(form.diastolic))].color}`}>
                {locale === 'bg'
                  ? STAGE_META[classifyBp(parseInt(form.systolic), parseInt(form.diastolic))].label_bg
                  : STAGE_META[classifyBp(parseInt(form.systolic), parseInt(form.diastolic))].label_en}
              </span>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {locale === 'bg' ? 'Ръка' : 'Arm'}
            </label>
            <div className="flex gap-2">
              {(['left', 'right'] as const).map(arm => (
                <button key={arm} type="button" onClick={() => setForm(prev => ({ ...prev, arm }))}
                  className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
                    form.arm === arm ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {arm === 'left' ? (locale === 'bg' ? 'Лява' : 'Left') : (locale === 'bg' ? 'Дясна' : 'Right')}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {locale === 'bg' ? 'Поза' : 'Posture'}
            </label>
            <div className="flex gap-2">
              {(['sitting', 'standing', 'lying'] as const).map(pos => (
                <button key={pos} type="button" onClick={() => setForm(prev => ({ ...prev, posture: pos }))}
                  className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
                    form.posture === pos ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {pos === 'sitting' ? (locale === 'bg' ? 'Седнал' : 'Sitting') :
                   pos === 'standing' ? (locale === 'bg' ? 'Правостоящ' : 'Standing') :
                   (locale === 'bg' ? 'Легнал' : 'Lying')}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {locale === 'bg' ? 'Контекст' : 'Context'}
            </label>
            <div className="flex flex-wrap gap-2">
              {CONTEXT_OPTIONS.map(opt => (
                <button key={opt.key} type="button" onClick={() => handleContextToggle(opt.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    form.context.includes(opt.key) ? 'bg-indigo-100 text-indigo-700 border border-indigo-300' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {opt.icon} {locale === 'bg' ? opt.bg : opt.en}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            label={locale === 'bg' ? 'Бележки' : 'Notes'}
            value={form.notes}
            onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            rows={2}
            placeholder={locale === 'bg' ? 'Незадължително...' : 'Optional...'}
          />

          <div className="flex gap-3 mt-6">
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? (locale === 'bg' ? 'Запазване...' : 'Saving...') : (locale === 'bg' ? 'Запази' : 'Save Reading')}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel', locale)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Session Flow ──────────────────────────────────────────────────

interface SessionDraft { systolic: string; diastolic: string; pulse: string; }

function SessionFlow({ profileId, locale, onComplete, onCancel }: {
  profileId: number; locale: Locale;
  onComplete: () => void; onCancel: () => void;
}) {
  const [readings, setReadings] = useState<SessionDraft[]>([]);
  const [current, setCurrent] = useState<SessionDraft>({ systolic: '', diastolic: '', pulse: '' });
  const [timer, setTimer] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sysRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);
  useEffect(() => { if (timer === 0 && !done) sysRef.current?.focus(); }, [timer, done]);

  const startTimer = () => {
    setTimer(60);
    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSaveReading = () => {
    const sys = parseInt(current.systolic);
    const dia = parseInt(current.diastolic);
    if (!sys || sys < 60 || sys > 300) { setError(locale === 'bg' ? 'Невалидно систолично' : 'Invalid systolic'); return; }
    if (!dia || dia < 30 || dia > 200) { setError(locale === 'bg' ? 'Невалидно диастолично' : 'Invalid diastolic'); return; }
    if (dia >= sys) { setError(locale === 'bg' ? 'Диастоличното трябва да е по-малко' : 'Diastolic must be lower'); return; }
    setError('');
    const next = [...readings, current];
    setReadings(next);
    setCurrent({ systolic: '', diastolic: '', pulse: '' });
    if (next.length >= 3) { setDone(true); }
    else { startTimer(); }
  };

  const skipTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimer(0);
  };

  const avgN = (nums: number[]) => nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
  const sysAvg = avgN(readings.map(r => parseInt(r.systolic)).filter(n => n > 0));
  const diaAvg = avgN(readings.map(r => parseInt(r.diastolic)).filter(n => n > 0));
  const pulseAvg = avgN(readings.map(r => parseInt(r.pulse)).filter(n => n > 0));

  const handleFinish = async () => {
    setSaving(true); setError('');
    try {
      await createBPSession({
        profile: profileId,
        measured_at: new Date().toISOString(),
        readings: readings.map(r => ({
          systolic: parseInt(r.systolic),
          diastolic: parseInt(r.diastolic),
          pulse: r.pulse ? parseInt(r.pulse) : null,
          arm: 'left',
          posture: 'sitting',
        })),
      });
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save session');
      setSaving(false);
    }
  };

  if (done || (readings.length >= 2 && timer === 0)) {
    const stage = classifyBp(sysAvg, diaAvg);
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
        <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {locale === 'bg' ? 'Резултати от сесията' : 'Session Results'}
          </h2>
          <Alert type="error" message={error} />

          <div className="space-y-2 mb-4">
            {readings.map((r, i) => {
              const s = classifyBp(parseInt(r.systolic), parseInt(r.diastolic));
              return (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-500">#{i + 1}</span>
                  <span className="text-lg font-bold text-gray-900">{r.systolic}/{r.diastolic}</span>
                  <span className="text-sm text-gray-500">{r.pulse ? `${r.pulse} bpm` : '—'}</span>
                  <Badge color={STAGE_META[s].badgeColor}>
                    {locale === 'bg' ? STAGE_META[s].label_bg : STAGE_META[s].label_en}
                  </Badge>
                </div>
              );
            })}
          </div>

          <Card className={`${STAGE_BG[stage]} border-0`}>
            <div className="text-center">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                {locale === 'bg' ? 'Средно от сесията' : 'Session Average'}
              </div>
              <div className="text-4xl font-bold text-gray-900">{sysAvg}/{diaAvg}</div>
              {pulseAvg > 0 && <div className="text-sm text-gray-500 mt-1">{pulseAvg} bpm</div>}
              <div className={`text-sm font-medium mt-2 ${STAGE_META[stage].color}`}>
                {locale === 'bg' ? STAGE_META[stage].label_bg : STAGE_META[stage].label_en}
              </div>
            </div>
          </Card>

          <div className="flex gap-3 mt-6">
            <Button className="flex-1" onClick={handleFinish} disabled={saving}>
              {saving ? (locale === 'bg' ? 'Запазване...' : 'Saving...') : (locale === 'bg' ? 'Запази и затвори' : 'Save & Close')}
            </Button>
            {!done && readings.length < 3 && (
              <Button variant="secondary" onClick={() => { setDone(false); }}>
                {locale === 'bg' ? 'Още едно' : 'One more'}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {locale === 'bg' ? 'Сесия за измерване' : 'Measurement Session'}
          </h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map(step => (
            <div key={step} className={`flex-1 h-1.5 rounded-full ${
              readings.length >= step ? 'bg-indigo-600' : 'bg-gray-200'
            }`} />
          ))}
        </div>

        <Alert type="error" message={error} />

        {timer > 0 ? (
          <div className="text-center py-8">
            <div className="text-6xl font-bold text-indigo-600 tabular-nums mb-4">{timer}s</div>
            <p className="text-sm text-gray-500 mb-6">
              {locale === 'bg' ? 'Починете преди следващото измерване...' : 'Rest before next reading...'}
            </p>
            <Button variant="secondary" onClick={skipTimer}>
              {locale === 'bg' ? 'Пропусни таймера' : 'Skip Timer'}
            </Button>
          </div>
        ) : (
          <>
            <div className="text-[13px] font-medium text-gray-700 mb-4">
              {locale === 'bg'
                ? `Измерване #${readings.length + 1}`
                : `Reading #${readings.length + 1}`}
            </div>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center">
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">SYS</label>
                <input ref={sysRef} type="number" inputMode="numeric" value={current.systolic}
                  onChange={e => setCurrent(p => ({ ...p, systolic: e.target.value }))}
                  placeholder="120"
                  className="w-full h-14 text-2xl font-bold text-center border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="text-center">
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">DIA</label>
                <input type="number" inputMode="numeric" value={current.diastolic}
                  onChange={e => setCurrent(p => ({ ...p, diastolic: e.target.value }))}
                  placeholder="80"
                  className="w-full h-14 text-2xl font-bold text-center border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="text-center">
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">PULSE</label>
                <input type="number" inputMode="numeric" value={current.pulse}
                  onChange={e => setCurrent(p => ({ ...p, pulse: e.target.value }))}
                  placeholder="72"
                  className="w-full h-14 text-2xl font-bold text-center border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleSaveReading}>
                {locale === 'bg' ? 'Запази' : 'Save reading'}
              </Button>
              {readings.length >= 2 && (
                <Button variant="secondary" onClick={() => setDone(true)}>
                  {locale === 'bg' ? 'Приключи' : 'Finish'}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function BpDashboardPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);
  const [readings, setReadings] = useState<BpReading[]>([]);
  const [period, setPeriod] = useState<Period>('30d');
  const [showLogModal, setShowLogModal] = useState(false);
  const [showSession, setShowSession] = useState(false);
  const [hasBloodData, setHasBloodData] = useState(false);

  const fetchReadings = useCallback(async (profileId: number) => {
    try {
      const data = await getBPReadings(`profile=${profileId}`);
      const list: BpReading[] = Array.isArray(data) ? data : data.results || [];
      setReadings(list.sort((a: BpReading, b: BpReading) => b.measured_at.localeCompare(a.measured_at)));
    } catch {
      setReadings([]);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const profs = await getHealthProfiles();
      setProfiles(profs);
      const primary = profs.find((p: Profile) => p.is_primary) || profs[0];
      if (primary) {
        setSelectedProfile(primary.id);
        await fetchReadings(primary.id);
        try {
          const dash = await getHealthDashboard(primary.id);
          setHasBloodData(dash?.has_data || false);
        } catch { setHasBloodData(false); }
      }
      setError('');
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [router, fetchReadings]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleProfileChange = async (id: string) => {
    const numId = Number(id);
    setSelectedProfile(numId);
    await fetchReadings(numId);
  };

  const handleSaveReading = async () => {
    setShowLogModal(false);
    if (selectedProfile) await fetchReadings(selectedProfile);
  };

  const handleSessionComplete = async () => {
    setShowSession(false);
    if (selectedProfile) await fetchReadings(selectedProfile);
  };

  if (loading) return (
    <PageShell><NavBar /><PageContent size="lg"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>
  );

  const profileId = selectedProfile || 0;
  const filtered = filterByPeriod(readings, period);
  const latest = readings[0] || null;
  const avgSys = avg(filtered.map(r => r.systolic));
  const avgDia = avg(filtered.map(r => r.diastolic));
  const avgStage = filtered.length > 0 ? classifyBp(avgSys, avgDia) : null;
  const { morning, evening } = getMorningEvening(filtered);
  const morningSys = avg(morning.map(r => r.systolic));
  const morningDia = avg(morning.map(r => r.diastolic));
  const eveningSys = avg(evening.map(r => r.systolic));
  const eveningDia = avg(evening.map(r => r.diastolic));
  const morningSurge = morningSys - eveningSys;
  const recent10 = readings.slice(0, 10);

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <button onClick={() => router.push('/life')} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                {locale === 'bg' ? 'Кръвно налягане' : 'Blood Pressure'}
              </h1>
            </div>
            {profiles.find(p => p.id === selectedProfile) && (
              <p className="text-sm text-gray-500 mt-1 ml-7">{profiles.find(p => p.id === selectedProfile)!.full_name}</p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {profiles.length > 1 && (
              <select
                value={selectedProfile || ''}
                onChange={(e) => handleProfileChange(e.target.value)}
                className="h-10 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}{p.is_primary ? ' (me)' : ''}</option>
                ))}
              </select>
            )}
            <Button variant="secondary" onClick={() => setShowSession(true)}>
              {locale === 'bg' ? 'Сесия' : 'Session'}
            </Button>
            <Button onClick={() => setShowLogModal(true)}>
              + {locale === 'bg' ? 'Измерване' : 'Log Reading'}
            </Button>
          </div>
        </div>

        <Alert type="error" message={error} />

        {/* Period Toggle */}
        <div className="flex gap-1.5 mb-6">
          {(['7d', '30d', '90d', 'all'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                period === p ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {p === '7d' ? (locale === 'bg' ? '7 дни' : '7d') :
               p === '30d' ? (locale === 'bg' ? '30 дни' : '30d') :
               p === '90d' ? (locale === 'bg' ? '90 дни' : '90d') :
               (locale === 'bg' ? 'Всички' : 'All')}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {readings.length === 0 && (
          <EmptyState icon="\u2764\ufe0f\u200d\ud83e\ude79" message={
            locale === 'bg' ? 'Няма измервания все още. Натиснете "+ Измерване" за да започнете.' : 'No readings yet. Tap "+ Log Reading" to get started.'
          } />
        )}

        {readings.length > 0 && (
          <>
            {/* Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <Card>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {locale === 'bg' ? 'Последно измерване' : 'Latest Reading'}
                </div>
                {latest && (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-4xl font-bold ${STAGE_META[classifyBp(latest.systolic, latest.diastolic)].color}`}>
                        {latest.systolic}
                      </span>
                      <span className="text-2xl text-gray-400">/</span>
                      <span className={`text-4xl font-bold ${STAGE_META[classifyBp(latest.systolic, latest.diastolic)].color}`}>
                        {latest.diastolic}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {latest.pulse && <span className="text-sm text-gray-500">{latest.pulse} bpm</span>}
                      <span className="text-xs text-gray-400">{timeAgo(latest.measured_at, locale)}</span>
                    </div>
                  </>
                )}
              </Card>

              <Card>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {locale === 'bg' ? 'Средно за периода' : 'Period Average'}
                </div>
                {filtered.length > 0 ? (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-gray-900">{avgSys}</span>
                      <span className="text-2xl text-gray-400">/</span>
                      <span className="text-4xl font-bold text-gray-900">{avgDia}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {filtered.length} {locale === 'bg' ? 'измервания' : 'readings'}
                    </div>
                  </>
                ) : (
                  <span className="text-2xl font-bold text-gray-300">—</span>
                )}
              </Card>

              <Card className={avgStage ? STAGE_BG[avgStage] : ''}>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {locale === 'bg' ? 'Текущ стадий' : 'Current Stage'}
                </div>
                {avgStage ? (
                  <>
                    <Badge color={STAGE_META[avgStage].badgeColor}>
                      {locale === 'bg' ? STAGE_META[avgStage].label_bg : STAGE_META[avgStage].label_en}
                    </Badge>
                    <p className="text-xs text-gray-500 mt-2">
                      {avgStage === 'normal' ? (locale === 'bg' ? 'Отлично! Поддържайте здравословния начин на живот.' : 'Excellent! Keep up the healthy lifestyle.') :
                       avgStage === 'elevated' ? (locale === 'bg' ? 'Леко повишено. Помислете за промени в начина на живот.' : 'Slightly elevated. Consider lifestyle changes.') :
                       avgStage === 'stage1' ? (locale === 'bg' ? 'Консултирайте се с лекар. Промените в начина на живот са важни.' : 'Consult your doctor. Lifestyle changes are important.') :
                       avgStage === 'stage2' ? (locale === 'bg' ? 'Необходима е лекарска консултация и може би медикаменти.' : 'Medical consultation and possibly medication needed.') :
                       (locale === 'bg' ? 'СПЕШНО! Потърсете незабавна медицинска помощ.' : 'EMERGENCY! Seek immediate medical attention.')}
                    </p>
                  </>
                ) : (
                  <span className="text-2xl font-bold text-gray-300">—</span>
                )}
              </Card>
            </div>

            {/* Trend Chart */}
            <Card className="mb-6">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {locale === 'bg' ? 'Тенденция' : 'Trend'}
              </div>
              <TrendChart readings={filtered} locale={locale} />
            </Card>

            {/* Two-column: Circadian + Cardiovascular */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              <Card>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  {locale === 'bg' ? 'Денонощен ритъм' : 'Circadian Pattern'}
                </div>
                {morning.length > 0 || evening.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🌅</span>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {locale === 'bg' ? 'Сутрин' : 'Morning'} <span className="text-xs text-gray-400">(5-12h)</span>
                          </div>
                          <div className="text-xs text-gray-500">{morning.length} {locale === 'bg' ? 'измервания' : 'readings'}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-gray-900">{morning.length > 0 ? `${morningSys}/${morningDia}` : '—'}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🌙</span>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {locale === 'bg' ? 'Вечер' : 'Evening'} <span className="text-xs text-gray-400">(17-23h)</span>
                          </div>
                          <div className="text-xs text-gray-500">{evening.length} {locale === 'bg' ? 'измервания' : 'readings'}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-gray-900">{evening.length > 0 ? `${eveningSys}/${eveningDia}` : '—'}</div>
                      </div>
                    </div>
                    {morning.length > 0 && evening.length > 0 && morningSurge > 20 && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                        <span className="font-medium">{locale === 'bg' ? 'Сутрешен скок:' : 'Morning surge:'}</span>{' '}
                        +{morningSurge} mmHg.{' '}
                        {locale === 'bg'
                          ? 'Сутрешният скок над 20 mmHg е рисков фактор. Обсъдете с лекар.'
                          : 'Morning surge >20 mmHg is a risk factor. Discuss with your doctor.'}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    {locale === 'bg' ? 'Измервайте сутрин и вечер за анализ на ритъма.' : 'Log morning and evening readings for circadian analysis.'}
                  </p>
                )}
              </Card>

              <Card>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  {locale === 'bg' ? 'Сърдечно-съдов риск' : 'Cardiovascular Risk'}
                </div>
                {hasBloodData ? (
                  <div className="space-y-3">
                    {latest && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">{locale === 'bg' ? 'Пулсово налягане' : 'Pulse Pressure'}</span>
                        <div className="text-right">
                          <span className={`text-lg font-bold ${latest.systolic - latest.diastolic > 60 ? 'text-red-600' : 'text-gray-900'}`}>
                            {latest.systolic - latest.diastolic} mmHg
                          </span>
                          {latest.systolic - latest.diastolic > 60 && (
                            <div className="text-[10px] text-red-500">
                              {locale === 'bg' ? 'Повишено (норма <60)' : 'Elevated (normal <60)'}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {latest && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">{locale === 'bg' ? 'Средно артер. налягане' : 'Mean Arterial Pressure'}</span>
                        <span className="text-lg font-bold text-gray-900">
                          {Math.round(latest.diastolic + (latest.systolic - latest.diastolic) / 3)} mmHg
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      {locale === 'bg' ? 'Комбиниран анализ с кръвни резултати.' : 'Combined analysis with blood results.'}
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => router.push('/health')}>
                      {locale === 'bg' ? 'Виж кръвни резултати' : 'View Blood Results'} &rarr;
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <span className="text-3xl block mb-2">🩸</span>
                    <p className="text-sm text-gray-500 mb-3">
                      {locale === 'bg'
                        ? 'Качете кръвни резултати за оценка на риска.'
                        : 'Upload blood results for risk assessment.'}
                    </p>
                    <Button variant="secondary" size="sm" onClick={() => router.push('/health/upload')}>
                      {locale === 'bg' ? 'Качи резултати' : 'Upload Results'}
                    </Button>
                  </div>
                )}
              </Card>
            </div>

            {/* Recent Readings Table */}
            <Card padding={false} className="mb-6">
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  {locale === 'bg' ? 'Последни измервания' : 'Recent Readings'}
                </h3>
                {readings.length > 10 && (
                  <Button variant="ghost" size="sm" onClick={() => router.push('/health/bp/readings')}>
                    {locale === 'bg' ? 'Виж всички' : 'View All'} &rarr;
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">{locale === 'bg' ? 'Дата/Час' : 'Date/Time'}</th>
                      <th className="text-center px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">SYS/DIA</th>
                      <th className="text-center px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">{locale === 'bg' ? 'Пулс' : 'Pulse'}</th>
                      <th className="text-center px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">{locale === 'bg' ? 'Стадий' : 'Stage'}</th>
                      <th className="text-center px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">{locale === 'bg' ? 'Контекст' : 'Context'}</th>
                      <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">{locale === 'bg' ? 'Бележки' : 'Notes'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent10.map(r => {
                      const stage = classifyBp(r.systolic, r.diastolic);
                      return (
                        <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50 ${r.is_after_medication ? 'bg-pink-50' : ''}`}>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDateTime(r.measured_at, locale)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-lg font-bold ${STAGE_META[stage].color}`}>{r.systolic}/{r.diastolic}</span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">{r.pulse || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge color={STAGE_META[stage].badgeColor}>
                              {locale === 'bg' ? STAGE_META[stage].label_bg : STAGE_META[stage].label_en}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-base">{getContextIcons(r)}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 max-w-[150px] truncate">{r.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Navigation links */}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => router.push('/health/bp/readings')}>
                {locale === 'bg' ? 'Всички измервания' : 'All Readings'}
              </Button>
              <Button variant="secondary" onClick={() => router.push('/health/bp/statistics')}>
                {locale === 'bg' ? 'Статистики' : 'Statistics'}
              </Button>
              <Button variant="secondary" onClick={() => router.push('/health/bp/medications')}>
                {locale === 'bg' ? 'Медикаменти' : 'Medications'}
              </Button>
            </div>
          </>
        )}

        {/* Modals */}
        {showLogModal && profileId > 0 && (
          <QuickLogModal
            profileId={profileId} locale={locale}
            onSave={handleSaveReading} onClose={() => setShowLogModal(false)}
          />
        )}
        {showSession && profileId > 0 && (
          <SessionFlow
            profileId={profileId} locale={locale}
            onComplete={handleSessionComplete} onCancel={() => setShowSession(false)}
          />
        )}
      </PageContent>
    </PageShell>
  );
}
