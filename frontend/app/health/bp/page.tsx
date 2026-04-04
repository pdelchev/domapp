'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t, Locale } from '../../lib/i18n';
import { getHealthProfiles, getHealthDashboard } from '../../lib/api';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, Card, Button, Badge, Alert, Spinner, Input, Textarea, EmptyState } from '../../components/ui';

// ── Types ──────────────────────────────────────────────────────────

interface Profile {
  id: number; full_name: string; sex: string; is_primary: boolean;
  date_of_birth: string | null;
}

interface BpReading {
  id: string;
  profile_id: number;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  arm: 'left' | 'right';
  posture: 'sitting' | 'standing' | 'lying';
  context: string[];
  notes: string;
  measured_at: string;
  session_id: string | null;
}

interface BpMedication {
  id: string;
  profile_id: number;
  name: string;
  dose: string;
  frequency: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  adherence: Record<string, boolean>;
}

interface SessionState {
  step: number;
  readings: BpReading[];
  timer: number;
  session_id: string;
}

type Period = '7d' | '30d' | '90d' | 'all';

// ── Storage helpers ────────────────────────────────────────────────

const BP_READINGS_KEY = 'domapp_bp_readings';
const BP_MEDS_KEY = 'domapp_bp_medications';

function loadReadings(): BpReading[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(BP_READINGS_KEY) || '[]'); } catch { return []; }
}

function saveReadings(readings: BpReading[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BP_READINGS_KEY, JSON.stringify(readings));
}

function loadMedications(): BpMedication[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(BP_MEDS_KEY) || '[]'); } catch { return []; }
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

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
  { key: 'caffeine',   icon: '\u2615', en: 'After caffeine', bg: '\u0421\u043b\u0435\u0434 \u043a\u0430\u0444\u0435' },
  { key: 'exercise',   icon: '\ud83c\udfc3', en: 'After exercise', bg: '\u0421\u043b\u0435\u0434 \u0443\u043f\u0440\u0430\u0436\u043d\u0435\u043d\u0438\u0435' },
  { key: 'medication', icon: '\ud83d\udc8a', en: 'After medication', bg: '\u0421\u043b\u0435\u0434 \u043b\u0435\u043a\u0430\u0440\u0441\u0442\u0432\u043e' },
  { key: 'stressed',   icon: '\ud83d\ude30', en: 'Stressed', bg: '\u0421\u0442\u0440\u0435\u0441\u0438\u0440\u0430\u043d' },
  { key: 'clinic',     icon: '\ud83c\udfe5', en: 'Clinic reading', bg: '\u041a\u043b\u0438\u043d\u0438\u0447\u043d\u043e' },
  { key: 'fasting',    icon: '\ud83c\udf74', en: 'Fasting', bg: '\u041d\u0430 \u0433\u043b\u0430\u0434\u043d\u043e' },
];

function contextIcon(key: string) {
  return CONTEXT_OPTIONS.find(c => c.key === key)?.icon || '';
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
        {/* Threshold lines */}
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

        {/* Y-axis labels */}
        {[minV, Math.round((minV + maxV) / 2), maxV].map(v => (
          <text key={v} x={PX - 8} y={yScale(v) + 4} fontSize="10" fill="#9ca3af" textAnchor="end">{v}</text>
        ))}

        {/* X-axis date labels */}
        {sorted.map((r, i) => {
          if (sorted.length > 10 && i % Math.ceil(sorted.length / 8) !== 0 && i !== sorted.length - 1) return null;
          const d = new Date(r.measured_at);
          const label = `${d.getDate()}/${d.getMonth() + 1}`;
          return <text key={i} x={xScale(i)} y={H - 5} fontSize="9" fill="#9ca3af" textAnchor="middle">{label}</text>;
        })}

        {/* Systolic line */}
        <polyline points={sysPoints} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" />
        {sorted.map((r, i) => {
          const stage = classifyBp(r.systolic, r.diastolic);
          const fill = stage === 'normal' ? '#10b981' : stage === 'elevated' ? '#f59e0b' : stage === 'stage1' ? '#f97316' : '#ef4444';
          return <circle key={`s${i}`} cx={xScale(i)} cy={yScale(r.systolic)} r="4" fill={fill} stroke="white" strokeWidth="1.5" />;
        })}

        {/* Diastolic line */}
        <polyline points={diaPoints} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />
        {sorted.map((r, i) => (
          <circle key={`d${i}`} cx={xScale(i)} cy={yScale(r.diastolic)} r="3.5" fill="#6366f1" stroke="white" strokeWidth="1.5" />
        ))}

        {/* Legend */}
        <circle cx={PX + 10} cy={15} r="4" fill="#ef4444" />
        <text x={PX + 18} y={19} fontSize="10" fill="#6b7280">{locale === 'bg' ? 'Систолично' : 'Systolic'}</text>
        <circle cx={PX + 100} cy={15} r="3.5" fill="#6366f1" />
        <text x={PX + 108} y={19} fontSize="10" fill="#6b7280">{locale === 'bg' ? 'Диастолично' : 'Diastolic'}</text>
      </svg>
    </div>
  );
}

// ── Quick Log Modal ───────────────────────────────────────────────

function QuickLogModal({ profileId, locale, onSave, onClose, sessionId }: {
  profileId: number; locale: Locale; onSave: (r: BpReading) => void; onClose: () => void; sessionId?: string | null;
}) {
  const [form, setForm] = useState({
    systolic: '', diastolic: '', pulse: '', arm: 'left' as 'left' | 'right',
    posture: 'sitting' as 'sitting' | 'standing' | 'lying', context: [] as string[], notes: '',
  });
  const [error, setError] = useState('');
  const sysRef = useRef<HTMLInputElement>(null);

  useEffect(() => { sysRef.current?.focus(); }, []);

  const handleContextToggle = (key: string) => {
    setForm(prev => ({
      ...prev,
      context: prev.context.includes(key) ? prev.context.filter(c => c !== key) : [...prev.context, key],
    }));
  };

  const handleSave = () => {
    const sys = parseInt(form.systolic);
    const dia = parseInt(form.diastolic);
    if (!sys || sys < 60 || sys > 300) { setError(locale === 'bg' ? 'Невалидно систолично' : 'Invalid systolic value'); return; }
    if (!dia || dia < 30 || dia > 200) { setError(locale === 'bg' ? 'Невалидно диастолично' : 'Invalid diastolic value'); return; }
    if (dia >= sys) { setError(locale === 'bg' ? 'Диастоличното трябва да е по-малко от систоличното' : 'Diastolic must be less than systolic'); return; }

    const reading: BpReading = {
      id: genId(), profile_id: profileId, systolic: sys, diastolic: dia,
      pulse: form.pulse ? parseInt(form.pulse) : null, arm: form.arm, posture: form.posture,
      context: form.context, notes: form.notes, measured_at: new Date().toISOString(),
      session_id: sessionId || null,
    };
    onSave(reading);
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

          {/* Systolic / Diastolic / Pulse */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {locale === 'bg' ? 'Систолично' : 'Systolic'}
              </label>
              <input
                ref={sysRef}
                type="number"
                inputMode="numeric"
                value={form.systolic}
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
                type="number"
                inputMode="numeric"
                value={form.diastolic}
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
                type="number"
                inputMode="numeric"
                value={form.pulse}
                onChange={e => setForm(prev => ({ ...prev, pulse: e.target.value }))}
                placeholder="72"
                className="w-full h-16 text-3xl font-bold text-center text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-gray-400 mt-1">bpm</span>
            </div>
          </div>

          {/* Preview stage */}
          {form.systolic && form.diastolic && parseInt(form.systolic) > 0 && parseInt(form.diastolic) > 0 && (
            <div className={`text-center py-2 rounded-lg mb-4 ${STAGE_BG[classifyBp(parseInt(form.systolic), parseInt(form.diastolic))]}`}>
              <span className={`text-sm font-medium ${STAGE_META[classifyBp(parseInt(form.systolic), parseInt(form.diastolic))].color}`}>
                {locale === 'bg'
                  ? STAGE_META[classifyBp(parseInt(form.systolic), parseInt(form.diastolic))].label_bg
                  : STAGE_META[classifyBp(parseInt(form.systolic), parseInt(form.diastolic))].label_en}
              </span>
            </div>
          )}

          {/* Arm selector */}
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

          {/* Posture selector */}
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

          {/* Context checkboxes */}
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

          {/* Notes */}
          <Textarea
            label={locale === 'bg' ? 'Бележки' : 'Notes'}
            value={form.notes}
            onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            rows={2}
            placeholder={locale === 'bg' ? 'Незадължително...' : 'Optional...'}
          />

          {/* Save */}
          <div className="flex gap-3 mt-6">
            <Button className="flex-1" onClick={handleSave}>
              {locale === 'bg' ? 'Запази' : 'Save Reading'}
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

function SessionFlow({ profileId, locale, onComplete, onCancel }: {
  profileId: number; locale: Locale;
  onComplete: (readings: BpReading[]) => void; onCancel: () => void;
}) {
  const [session, setSession] = useState<SessionState>({
    step: 1, readings: [], timer: 0, session_id: genId(),
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showInput, setShowInput] = useState(true);

  const handleReadingSave = (reading: BpReading) => {
    const newReadings = [...session.readings, reading];
    setShowInput(false);

    if (newReadings.length < 3) {
      // Start rest timer
      setSession(prev => ({ ...prev, readings: newReadings, step: prev.step + 1, timer: 60 }));
      timerRef.current = setInterval(() => {
        setSession(prev => {
          if (prev.timer <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return { ...prev, timer: 0 };
          }
          return { ...prev, timer: prev.timer - 1 };
        });
      }, 1000);
    } else {
      setSession(prev => ({ ...prev, readings: newReadings, step: 99 }));
    }
  };

  const startNextReading = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setShowInput(true);
  };

  const finishSession = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    onComplete(session.readings);
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Session complete view
  if (session.step === 99 || (session.readings.length >= 2 && !showInput && session.timer === 0 && session.step > 2)) {
    const allReadings = session.readings;
    const avgSys = avg(allReadings.map(r => r.systolic));
    const avgDia = avg(allReadings.map(r => r.diastolic));
    const avgPulse = avg(allReadings.filter(r => r.pulse !== null).map(r => r.pulse!));
    const stage = classifyBp(avgSys, avgDia);

    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
        <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {locale === 'bg' ? 'Резултати от сесията' : 'Session Results'}
          </h2>

          {/* Individual readings */}
          <div className="space-y-2 mb-4">
            {allReadings.map((r, i) => (
              <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-500">#{i + 1}</span>
                <span className="text-lg font-bold text-gray-900">{r.systolic}/{r.diastolic}</span>
                <span className="text-sm text-gray-500">{r.pulse ? `${r.pulse} bpm` : '—'}</span>
                <Badge color={STAGE_META[classifyBp(r.systolic, r.diastolic)].badgeColor}>
                  {locale === 'bg' ? STAGE_META[classifyBp(r.systolic, r.diastolic)].label_bg : STAGE_META[classifyBp(r.systolic, r.diastolic)].label_en}
                </Badge>
              </div>
            ))}
          </div>

          {/* Average */}
          <Card className={`${STAGE_BG[stage]} border-0`}>
            <div className="text-center">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                {locale === 'bg' ? 'Средно от сесията' : 'Session Average'}
              </div>
              <div className="text-4xl font-bold text-gray-900">{avgSys}/{avgDia}</div>
              {avgPulse > 0 && <div className="text-sm text-gray-500 mt-1">{avgPulse} bpm</div>}
              <div className={`text-sm font-medium mt-2 ${STAGE_META[stage].color}`}>
                {locale === 'bg' ? STAGE_META[stage].label_bg : STAGE_META[stage].label_en}
              </div>
            </div>
          </Card>

          <div className="flex gap-3 mt-6">
            <Button className="flex-1" onClick={finishSession}>
              {locale === 'bg' ? 'Запази и затвори' : 'Save & Close'}
            </Button>
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

        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map(step => (
            <div key={step} className={`flex-1 h-1.5 rounded-full ${
              session.readings.length >= step ? 'bg-indigo-600' : 'bg-gray-200'
            }`} />
          ))}
        </div>

        {/* Timer view */}
        {session.timer > 0 && !showInput && (
          <div className="text-center py-8">
            <div className="text-6xl font-bold text-indigo-600 tabular-nums mb-4">
              {session.timer}s
            </div>
            <p className="text-sm text-gray-500 mb-6">
              {locale === 'bg' ? 'Починете преди следващото измерване...' : 'Rest before next reading...'}
            </p>
            <Button variant="secondary" onClick={startNextReading}>
              {locale === 'bg' ? 'Пропусни таймера' : 'Skip Timer'}
            </Button>
          </div>
        )}

        {/* Ready for next reading */}
        {session.timer === 0 && !showInput && session.readings.length < 3 && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 mb-4">
              {locale === 'bg'
                ? `Вземете измерване #${session.readings.length + 1}`
                : `Take reading #${session.readings.length + 1}`}
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={startNextReading}>
                {locale === 'bg' ? 'Следващо измерване' : 'Next Reading'}
              </Button>
              {session.readings.length >= 2 && (
                <Button variant="secondary" onClick={() => setSession(prev => ({ ...prev, step: 99 }))}>
                  {locale === 'bg' ? 'Приключи сесията' : 'Finish Session'}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Input form */}
        {showInput && (
          <QuickLogModal
            profileId={profileId} locale={locale}
            sessionId={session.session_id}
            onSave={handleReadingSave}
            onClose={onCancel}
          />
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
  const [medications, setMedications] = useState<BpMedication[]>([]);
  const [period, setPeriod] = useState<Period>('30d');
  const [showLogModal, setShowLogModal] = useState(false);
  const [showSession, setShowSession] = useState(false);
  const [hasBloodData, setHasBloodData] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const profs = await getHealthProfiles();
      setProfiles(profs);
      const primary = profs.find((p: Profile) => p.is_primary) || profs[0];
      if (primary) {
        setSelectedProfile(primary.id);
        const allReadings = loadReadings().filter((r: BpReading) => r.profile_id === primary.id);
        setReadings(allReadings.sort((a: BpReading, b: BpReading) => b.measured_at.localeCompare(a.measured_at)));
        setMedications(loadMedications().filter((m: BpMedication) => m.profile_id === primary.id && m.is_active));
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
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleProfileChange = (id: string) => {
    const numId = Number(id);
    setSelectedProfile(numId);
    const allReadings = loadReadings().filter((r: BpReading) => r.profile_id === numId);
    setReadings(allReadings.sort((a: BpReading, b: BpReading) => b.measured_at.localeCompare(a.measured_at)));
    setMedications(loadMedications().filter((m: BpMedication) => m.profile_id === numId && m.is_active));
  };

  const handleSaveReading = (reading: BpReading) => {
    const all = loadReadings();
    all.push(reading);
    saveReadings(all);
    const profileReadings = all.filter(r => r.profile_id === selectedProfile).sort((a, b) => b.measured_at.localeCompare(a.measured_at));
    setReadings(profileReadings);
    setShowLogModal(false);
  };

  const handleSessionComplete = (sessionReadings: BpReading[]) => {
    const all = loadReadings();
    all.push(...sessionReadings);
    saveReadings(all);
    const profileReadings = all.filter(r => r.profile_id === selectedProfile).sort((a, b) => b.measured_at.localeCompare(a.measured_at));
    setReadings(profileReadings);
    setShowSession(false);
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
              <button onClick={() => router.push('/health')} className="text-gray-400 hover:text-gray-600">
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
              {/* Latest Reading */}
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

              {/* Period Average */}
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

              {/* Current Stage */}
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
              {/* Circadian Pattern */}
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

              {/* Cardiovascular Risk */}
              <Card>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  {locale === 'bg' ? 'Сърдечно-съдов риск' : 'Cardiovascular Risk'}
                </div>
                {hasBloodData ? (
                  <div className="space-y-3">
                    {/* Pulse pressure */}
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
                    {/* MAP */}
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
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => router.push('/health/bp/readings')}>
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
                            <span className="text-base">{r.context.map(c => contextIcon(c)).join(' ')}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 max-w-[150px] truncate">{r.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Active Medications */}
            <Card className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  {locale === 'bg' ? 'Активни медикаменти' : 'Active Medications'}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => router.push('/health/bp/medications')}>
                  {locale === 'bg' ? 'Управление' : 'Manage'} &rarr;
                </Button>
              </div>
              {medications.length > 0 ? (
                <div className="space-y-3">
                  {medications.map(med => {
                    const adherenceDays = Object.keys(med.adherence || {}).sort().reverse();
                    let streak = 0;
                    const today = new Date();
                    for (let i = 0; i < 30; i++) {
                      const day = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
                      if (med.adherence?.[day]) streak++;
                      else break;
                    }
                    return (
                      <div key={med.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="font-medium text-sm text-gray-900">{med.name}</div>
                          <div className="text-xs text-gray-500">{med.dose} &middot; {med.frequency}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">
                            {locale === 'bg' ? 'Поредни дни' : 'Streak'}: <span className="font-semibold text-emerald-600">{streak}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">
                  {locale === 'bg' ? 'Няма активни медикаменти.' : 'No active medications.'}
                </p>
              )}
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
