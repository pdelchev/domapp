'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import {
  getHealthProfiles,
  createBPReading, getBPReadings,
  createWeightReading, getWeightDashboard,
  createUricAcidReading, getUricAcidReadings, createGoutAttack, getGoutDashboard,
} from '../../lib/api';
import NavBar from '../../components/NavBar';
import {
  PageShell, PageContent, PageHeader, Card, Button, Badge, Input, Select, Textarea,
  Alert, Spinner,
} from '../../components/ui';

// ── Types ──────────────────────────────────────────────────────────

interface Profile { id: number; full_name: string; sex: string; is_primary: boolean; }

interface BpReading {
  id: number; systolic: number; diastolic: number; pulse: number | null;
  arm: string; posture: string; measured_at: string; stage: string;
  is_after_caffeine: boolean; is_after_exercise: boolean; is_after_medication: boolean;
  is_stressed: boolean; is_clinic_reading: boolean; is_fasting: boolean; notes: string;
}

interface WeightDashboard {
  latest_reading: { id: number; weight_kg: string; measured_at: string; bmi: number | null; body_fat_pct: string | null } | null;
  reading_count_90d: number;
  trend: { date: string; raw_kg: number; ewma_kg: number }[];
}

interface GoutDashboard {
  total_attacks: number; attacks_12_months: number; days_since_last: number | null;
  latest_uric_acid: { value: number; measured_at: string; status: string } | null;
}

interface UricReading { id: number; measured_at: string; value: string; status: string; notes: string; }

type Tab = 'bp' | 'weight' | 'gout';

// ── BP helpers ────────────────────────────────────────────────────

type BpStage = 'normal' | 'elevated' | 'stage1' | 'stage2' | 'crisis';

function classifyBp(sys: number, dia: number): BpStage {
  if (sys >= 180 || dia >= 120) return 'crisis';
  if (sys >= 140 || dia >= 90) return 'stage2';
  if (sys >= 130 || dia >= 80) return 'stage1';
  if (sys >= 120 && dia < 80) return 'elevated';
  return 'normal';
}

const STAGE_META: Record<BpStage, { en: string; bg: string; color: string; badge: 'green' | 'yellow' | 'red' | 'purple' }> = {
  normal:   { en: 'Normal',    bg: 'Нормално',       color: 'text-emerald-600', badge: 'green' },
  elevated: { en: 'Elevated',  bg: 'Повишено',       color: 'text-yellow-600',  badge: 'yellow' },
  stage1:   { en: 'Stage 1',   bg: 'Ст. 1',          color: 'text-orange-600',  badge: 'yellow' },
  stage2:   { en: 'Stage 2',   bg: 'Ст. 2',          color: 'text-red-600',     badge: 'red' },
  crisis:   { en: 'Crisis',    bg: 'Криза',           color: 'text-red-800',     badge: 'purple' },
};

const STAGE_BG_COLOR: Record<BpStage, string> = {
  normal: 'bg-emerald-50', elevated: 'bg-yellow-50', stage1: 'bg-orange-50', stage2: 'bg-red-50', crisis: 'bg-red-100',
};

const CONTEXT_OPTIONS = [
  { key: 'caffeine', icon: '☕', en: 'After caffeine', bg: 'След кафе' },
  { key: 'exercise', icon: '🏃', en: 'After exercise', bg: 'След упражнение' },
  { key: 'medication', icon: '💊', en: 'After medication', bg: 'След лекарство' },
  { key: 'stressed', icon: '😰', en: 'Stressed', bg: 'Стресиран' },
  { key: 'clinic', icon: '🏥', en: 'Clinic', bg: 'Клинично' },
  { key: 'fasting', icon: '🍴', en: 'Fasting', bg: 'На гладно' },
];

const UA_COLOR: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  normal: 'green', borderline: 'yellow', high: 'red', critical: 'red',
};

const JOINTS = ['big_toe', 'ankle', 'knee', 'wrist', 'finger', 'elbow', 'heel', 'other'];
const SIDES = ['left', 'right', 'both'];
const MEDICATIONS = ['colchicine', 'allopurinol', 'febuxostat', 'nsaid', 'prednisone', 'other'];

function timeAgo(dateStr: string, locale: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return locale === 'bg' ? 'Току-що' : 'Just now';
  if (mins < 60) return `${mins} ${locale === 'bg' ? 'мин назад' : 'min ago'}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ${locale === 'bg' ? 'ч назад' : 'h ago'}`;
  const days = Math.floor(hrs / 24);
  return `${days} ${locale === 'bg' ? 'дни назад' : 'd ago'}`;
}

// ══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════

export default function DailyTrackingPage() {
  const { locale } = useLanguage();
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('bp');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // BP state
  const [bpReadings, setBpReadings] = useState<BpReading[]>([]);
  const [bpForm, setBpForm] = useState<{ systolic: string; diastolic: string; pulse: string; arm: 'left' | 'right'; posture: 'sitting' | 'standing' | 'lying'; context: string[]; notes: string }>({ systolic: '', diastolic: '', pulse: '', arm: 'left', posture: 'sitting', context: [], notes: '' });
  const [bpSaving, setBpSaving] = useState(false);
  const sysRef = useRef<HTMLInputElement>(null);

  // Weight state
  const [weightData, setWeightData] = useState<WeightDashboard | null>(null);
  const [weightForm, setWeightForm] = useState({ weight_kg: '', body_fat_pct: '', notes: '' });
  const [weightSaving, setWeightSaving] = useState(false);

  // Gout state
  const [goutData, setGoutData] = useState<GoutDashboard | null>(null);
  const [uricReadings, setUricReadings] = useState<UricReading[]>([]);
  const [uaForm, setUaForm] = useState({ value: '', notes: '' });
  const [uaSaving, setUaSaving] = useState(false);
  const [attackForm, setAttackForm] = useState({
    onset_date: new Date().toISOString().slice(0, 10), joint: 'big_toe', side: 'left',
    severity: '5', medication: 'colchicine', medication_dose: '', notes: '',
  });
  const [attackSaving, setAttackSaving] = useState(false);
  const [showAttackForm, setShowAttackForm] = useState(false);

  // ── Load profiles ──
  useEffect(() => {
    getHealthProfiles()
      .then((ps: Profile[]) => {
        setProfiles(ps);
        const primary = ps.find(p => p.is_primary) || ps[0];
        if (primary) setProfileId(primary.id);
        setLoading(false);
      })
      .catch(() => { router.push('/login'); });
  }, [router]);

  // ── Load data when profile or tab changes ──
  const loadBP = useCallback(async (pid: number) => {
    try {
      const data = await getBPReadings(`profile=${pid}&days=30`);
      const list: BpReading[] = Array.isArray(data) ? data : data.results || [];
      setBpReadings(list.sort((a: BpReading, b: BpReading) => b.measured_at.localeCompare(a.measured_at)));
    } catch { /* ignore */ }
  }, []);

  const loadWeight = useCallback(async (pid: number) => {
    try { setWeightData(await getWeightDashboard(pid)); } catch { /* ignore */ }
  }, []);

  const loadGout = useCallback(async (pid: number) => {
    try {
      const [dash, ua] = await Promise.all([getGoutDashboard(pid), getUricAcidReadings(pid)]);
      setGoutData(dash);
      setUricReadings(ua.slice(0, 10));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!profileId) return;
    if (tab === 'bp') loadBP(profileId);
    else if (tab === 'weight') loadWeight(profileId);
    else if (tab === 'gout') loadGout(profileId);
  }, [profileId, tab, loadBP, loadWeight, loadGout]);

  // ── BP save ──
  const saveBP = async () => {
    if (!profileId) return;
    const sys = parseInt(bpForm.systolic), dia = parseInt(bpForm.diastolic);
    if (!sys || sys < 60 || sys > 300) { setError(locale === 'bg' ? 'Невалидно систолично' : 'Invalid systolic'); return; }
    if (!dia || dia < 30 || dia > 200) { setError(locale === 'bg' ? 'Невалидно диастолично' : 'Invalid diastolic'); return; }
    if (dia >= sys) { setError(locale === 'bg' ? 'Диастоличното < систоличното' : 'Diastolic must be < systolic'); return; }
    setBpSaving(true); setError('');
    try {
      await createBPReading({
        profile: profileId, systolic: sys, diastolic: dia,
        pulse: bpForm.pulse ? parseInt(bpForm.pulse) : null,
        measured_at: new Date().toISOString(), arm: bpForm.arm, posture: bpForm.posture,
        is_after_caffeine: bpForm.context.includes('caffeine'),
        is_after_exercise: bpForm.context.includes('exercise'),
        is_after_medication: bpForm.context.includes('medication'),
        is_stressed: bpForm.context.includes('stressed'),
        is_clinic_reading: bpForm.context.includes('clinic'),
        is_fasting: bpForm.context.includes('fasting'),
        notes: bpForm.notes,
      });
      setBpForm({ systolic: '', diastolic: '', pulse: '', arm: 'left', posture: 'sitting', context: [], notes: '' });
      loadBP(profileId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBpSaving(false); }
  };

  // ── Weight save ──
  const saveWeight = async () => {
    if (!profileId) return;
    const kg = parseFloat(weightForm.weight_kg);
    if (!kg || kg < 20 || kg > 400) { setError(locale === 'bg' ? 'Невалидно тегло' : 'Invalid weight'); return; }
    setWeightSaving(true); setError('');
    try {
      await createWeightReading({
        profile: profileId, weight_kg: kg,
        body_fat_pct: weightForm.body_fat_pct ? parseFloat(weightForm.body_fat_pct) : null,
        measured_at: new Date().toISOString(), source: 'manual', notes: weightForm.notes,
      });
      setWeightForm({ weight_kg: '', body_fat_pct: '', notes: '' });
      loadWeight(profileId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setWeightSaving(false); }
  };

  // ── Uric acid save ──
  const saveUA = async () => {
    if (!profileId) return;
    const val = parseFloat(uaForm.value);
    if (!val || val < 50 || val > 1500) { setError(locale === 'bg' ? 'Невалидна стойност' : 'Invalid value'); return; }
    setUaSaving(true); setError('');
    try {
      await createUricAcidReading({ profile: profileId, value: val, measured_at: new Date().toISOString(), notes: uaForm.notes });
      setUaForm({ value: '', notes: '' });
      loadGout(profileId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setUaSaving(false); }
  };

  // ── Gout attack save ──
  const saveAttack = async () => {
    if (!profileId) return;
    setAttackSaving(true); setError('');
    try {
      await createGoutAttack({
        profile: profileId, onset_date: attackForm.onset_date,
        joint: attackForm.joint, side: attackForm.side,
        severity: parseInt(attackForm.severity),
        medication: attackForm.medication, medication_dose: attackForm.medication_dose,
        notes: attackForm.notes,
      });
      setAttackForm({ onset_date: new Date().toISOString().slice(0, 10), joint: 'big_toe', side: 'left', severity: '5', medication: 'colchicine', medication_dose: '', notes: '' });
      setShowAttackForm(false);
      loadGout(profileId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setAttackSaving(false); }
  };

  const toggleCtx = (key: string) => setBpForm(prev => ({
    ...prev, context: prev.context.includes(key) ? prev.context.filter(c => c !== key) : [...prev.context, key],
  }));

  const TABS: { id: Tab; en: string; bg: string; icon: string }[] = [
    { id: 'bp', en: 'Blood Pressure', bg: 'Кръвно налягане', icon: '❤️' },
    { id: 'weight', en: 'Weight', bg: 'Килограми', icon: '⚖️' },
    { id: 'gout', en: 'Gout & Joints', bg: 'Подагра', icon: '🦴' },
  ];

  if (loading) return <PageShell><NavBar /><PageContent size="md"><Spinner /></PageContent></PageShell>;

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={t('nav.daily_tracking', locale)}
          onBack={() => router.push('/life')}
        />

        {/* Profile selector */}
        {profiles.length > 1 && (
          <div className="mb-4">
            <Select
              value={profileId?.toString() ?? ''}
              onChange={e => setProfileId(Number(e.target.value))}
            >
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </Select>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
          {TABS.map(tb => (
            <button
              key={tb.id}
              onClick={() => { setTab(tb.id); setError(''); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                tab === tb.id
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="mr-1">{tb.icon}</span>
              {locale === 'bg' ? tb.bg : tb.en}
            </button>
          ))}
        </div>

        <Alert type="error" message={error} />

        {/* ── BP Tab ── */}
        {tab === 'bp' && profileId && (
          <div className="space-y-4">
            <Card>
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                {locale === 'bg' ? 'Ново измерване' : 'New Reading'}
              </h3>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center">
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    {locale === 'bg' ? 'Систолично' : 'Systolic'}
                  </label>
                  <input
                    ref={sysRef} type="number" inputMode="numeric" value={bpForm.systolic}
                    onChange={e => setBpForm(prev => ({ ...prev, systolic: e.target.value }))}
                    placeholder="120"
                    className="w-full h-14 text-2xl font-bold text-center text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-[10px] text-gray-400">mmHg</span>
                </div>
                <div className="text-center">
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    {locale === 'bg' ? 'Диастолично' : 'Diastolic'}
                  </label>
                  <input
                    type="number" inputMode="numeric" value={bpForm.diastolic}
                    onChange={e => setBpForm(prev => ({ ...prev, diastolic: e.target.value }))}
                    placeholder="80"
                    className="w-full h-14 text-2xl font-bold text-center text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-[10px] text-gray-400">mmHg</span>
                </div>
                <div className="text-center">
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    {locale === 'bg' ? 'Пулс' : 'Pulse'}
                  </label>
                  <input
                    type="number" inputMode="numeric" value={bpForm.pulse}
                    onChange={e => setBpForm(prev => ({ ...prev, pulse: e.target.value }))}
                    placeholder="72"
                    className="w-full h-14 text-2xl font-bold text-center text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-[10px] text-gray-400">bpm</span>
                </div>
              </div>

              {/* Live stage indicator */}
              {bpForm.systolic && bpForm.diastolic && parseInt(bpForm.systolic) > 0 && parseInt(bpForm.diastolic) > 0 && (
                <div className={`text-center py-2 rounded-lg mb-4 ${STAGE_BG_COLOR[classifyBp(parseInt(bpForm.systolic), parseInt(bpForm.diastolic))]}`}>
                  <span className={`text-sm font-medium ${STAGE_META[classifyBp(parseInt(bpForm.systolic), parseInt(bpForm.diastolic))].color}`}>
                    {locale === 'bg'
                      ? STAGE_META[classifyBp(parseInt(bpForm.systolic), parseInt(bpForm.diastolic))].bg
                      : STAGE_META[classifyBp(parseInt(bpForm.systolic), parseInt(bpForm.diastolic))].en}
                  </span>
                </div>
              )}

              {/* Arm & posture */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    {locale === 'bg' ? 'Ръка' : 'Arm'}
                  </label>
                  <div className="flex gap-1">
                    {(['left', 'right'] as const).map(arm => (
                      <button key={arm} type="button" onClick={() => setBpForm(prev => ({ ...prev, arm }))}
                        className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
                          bpForm.arm === arm ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border border-gray-300'
                        }`}>
                        {arm === 'left' ? (locale === 'bg' ? 'Лява' : 'Left') : (locale === 'bg' ? 'Дясна' : 'Right')}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    {locale === 'bg' ? 'Поза' : 'Posture'}
                  </label>
                  <div className="flex gap-1">
                    {(['sitting', 'standing', 'lying'] as const).map(pos => (
                      <button key={pos} type="button" onClick={() => setBpForm(prev => ({ ...prev, posture: pos }))}
                        className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
                          bpForm.posture === pos ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border border-gray-300'
                        }`}>
                        {pos === 'sitting' ? (locale === 'bg' ? 'Седнал' : 'Sit') :
                         pos === 'standing' ? (locale === 'bg' ? 'Прав' : 'Stand') :
                         (locale === 'bg' ? 'Легнал' : 'Lie')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Context toggles */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {CONTEXT_OPTIONS.map(opt => (
                  <button key={opt.key} type="button" onClick={() => toggleCtx(opt.key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      bpForm.context.includes(opt.key) ? 'bg-indigo-100 text-indigo-700 border border-indigo-300' : 'bg-white text-gray-600 border border-gray-200'
                    }`}>
                    {opt.icon} {locale === 'bg' ? opt.bg : opt.en}
                  </button>
                ))}
              </div>

              <Textarea label={locale === 'bg' ? 'Бележки' : 'Notes'} value={bpForm.notes}
                onChange={e => setBpForm(prev => ({ ...prev, notes: e.target.value }))} rows={2}
                placeholder={locale === 'bg' ? 'Незадължително...' : 'Optional...'} />

              <div className="flex gap-3 mt-4">
                <Button className="flex-1" onClick={saveBP} disabled={bpSaving}>
                  {bpSaving ? '...' : (locale === 'bg' ? 'Запази' : 'Save')}
                </Button>
                <Button variant="secondary" onClick={() => router.push('/health/bp')}>
                  {locale === 'bg' ? 'Пълна статистика' : 'Full Dashboard'}
                </Button>
              </div>
            </Card>

            {/* Recent BP readings */}
            {bpReadings.length > 0 && (
              <Card>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  {locale === 'bg' ? 'Последни измервания' : 'Recent Readings'}
                </h3>
                <div className="space-y-2">
                  {bpReadings.slice(0, 8).map(r => {
                    const stage = classifyBp(r.systolic, r.diastolic);
                    return (
                      <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-gray-900">{r.systolic}/{r.diastolic}</span>
                          {r.pulse && <span className="text-sm text-gray-500">{r.pulse} bpm</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge color={STAGE_META[stage].badge}>{locale === 'bg' ? STAGE_META[stage].bg : STAGE_META[stage].en}</Badge>
                          <span className="text-xs text-gray-400">{timeAgo(r.measured_at, locale)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ── Weight Tab ── */}
        {tab === 'weight' && profileId && (
          <div className="space-y-4">
            <Card>
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                {locale === 'bg' ? 'Ново измерване' : 'New Weigh-in'}
              </h3>

              {/* Latest reading summary */}
              {weightData?.latest_reading && (
                <div className="flex items-center gap-4 mb-4 p-3 bg-gray-50 rounded-xl">
                  <div>
                    <span className="text-xs text-gray-500 block">{locale === 'bg' ? 'Последно' : 'Latest'}</span>
                    <span className="text-2xl font-bold text-gray-900">{parseFloat(weightData.latest_reading.weight_kg).toFixed(1)} kg</span>
                  </div>
                  {weightData.latest_reading.bmi && (
                    <div>
                      <span className="text-xs text-gray-500 block">BMI</span>
                      <span className="text-lg font-semibold text-gray-700">{weightData.latest_reading.bmi.toFixed(1)}</span>
                    </div>
                  )}
                  <div className="ml-auto text-xs text-gray-400">
                    {timeAgo(weightData.latest_reading.measured_at, locale)}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    {locale === 'bg' ? 'Тегло (кг)' : 'Weight (kg)'}
                  </label>
                  <input
                    type="number" inputMode="decimal" step="0.1" value={weightForm.weight_kg}
                    onChange={e => setWeightForm(prev => ({ ...prev, weight_kg: e.target.value }))}
                    placeholder="80.0"
                    className="w-full h-14 text-2xl font-bold text-center text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    {locale === 'bg' ? 'Мазнини (%)' : 'Body Fat (%)'}
                  </label>
                  <input
                    type="number" inputMode="decimal" step="0.1" value={weightForm.body_fat_pct}
                    onChange={e => setWeightForm(prev => ({ ...prev, body_fat_pct: e.target.value }))}
                    placeholder="—"
                    className="w-full h-14 text-2xl font-bold text-center text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <Textarea label={locale === 'bg' ? 'Бележки' : 'Notes'} value={weightForm.notes}
                onChange={e => setWeightForm(prev => ({ ...prev, notes: e.target.value }))} rows={2}
                placeholder={locale === 'bg' ? 'Незадължително...' : 'Optional...'} />

              <div className="flex gap-3 mt-4">
                <Button className="flex-1" onClick={saveWeight} disabled={weightSaving}>
                  {weightSaving ? '...' : (locale === 'bg' ? 'Запази' : 'Save')}
                </Button>
                <Button variant="secondary" onClick={() => router.push('/health/weight')}>
                  {locale === 'bg' ? 'Пълна статистика' : 'Full Dashboard'}
                </Button>
              </div>
            </Card>

            {/* Weight trend mini */}
            {weightData && weightData.trend.length > 1 && (
              <Card>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  {locale === 'bg' ? 'Тенденция (90 дни)' : 'Trend (90 days)'}
                </h3>
                <div className="flex items-end gap-1 h-16">
                  {weightData.trend.slice(-30).map((pt, i) => {
                    const min = Math.min(...weightData.trend.slice(-30).map(p => p.raw_kg));
                    const max = Math.max(...weightData.trend.slice(-30).map(p => p.raw_kg));
                    const range = max - min || 1;
                    const h = ((pt.raw_kg - min) / range) * 100;
                    return (
                      <div key={i} className="flex-1 bg-indigo-200 rounded-t" style={{ height: `${Math.max(h, 5)}%` }}
                        title={`${pt.date}: ${pt.raw_kg.toFixed(1)} kg`} />
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>{weightData.trend[Math.max(0, weightData.trend.length - 30)]?.date}</span>
                  <span>{weightData.trend[weightData.trend.length - 1]?.date}</span>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ── Gout Tab ── */}
        {tab === 'gout' && profileId && (
          <div className="space-y-4">
            {/* Summary cards */}
            {goutData && (
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <div className="text-center">
                    <span className="text-xs text-gray-500 block">{locale === 'bg' ? 'Пристъпи (12м)' : 'Attacks (12m)'}</span>
                    <span className="text-2xl font-bold text-gray-900">{goutData.attacks_12_months}</span>
                  </div>
                </Card>
                <Card>
                  <div className="text-center">
                    <span className="text-xs text-gray-500 block">{locale === 'bg' ? 'Дни от последен' : 'Days since last'}</span>
                    <span className="text-2xl font-bold text-gray-900">{goutData.days_since_last ?? '—'}</span>
                  </div>
                </Card>
                <Card>
                  <div className="text-center">
                    <span className="text-xs text-gray-500 block">{locale === 'bg' ? 'Пикочна к.' : 'Uric Acid'}</span>
                    <span className="text-2xl font-bold text-gray-900">
                      {goutData.latest_uric_acid ? goutData.latest_uric_acid.value : '—'}
                    </span>
                    {goutData.latest_uric_acid && (
                      <Badge color={UA_COLOR[goutData.latest_uric_acid.status] || 'gray'}>
                        {goutData.latest_uric_acid.status}
                      </Badge>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {/* Uric acid quick-add */}
            <Card>
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                {locale === 'bg' ? 'Пикочна киселина' : 'Uric Acid Reading'}
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    {locale === 'bg' ? 'Стойност (μmol/L)' : 'Value (μmol/L)'}
                  </label>
                  <input
                    type="number" inputMode="decimal" value={uaForm.value}
                    onChange={e => setUaForm(prev => ({ ...prev, value: e.target.value }))}
                    placeholder="350"
                    className="w-full h-14 text-2xl font-bold text-center text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                    <span>{locale === 'bg' ? 'Норма: <360' : 'Normal: <360'}</span>
                    <span>{locale === 'bg' ? 'Висока: >420' : 'High: >420'}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    {locale === 'bg' ? 'Бележки' : 'Notes'}
                  </label>
                  <input
                    type="text" value={uaForm.notes}
                    onChange={e => setUaForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder={locale === 'bg' ? 'Незадължително' : 'Optional'}
                    className="w-full h-14 text-sm text-gray-900 border border-gray-300 rounded-xl px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <Button className="w-full" onClick={saveUA} disabled={uaSaving}>
                {uaSaving ? '...' : (locale === 'bg' ? 'Запази' : 'Save')}
              </Button>
            </Card>

            {/* Log attack toggle */}
            {!showAttackForm ? (
              <Button variant="secondary" className="w-full" onClick={() => setShowAttackForm(true)}>
                🔥 {locale === 'bg' ? 'Логвай пристъп' : 'Log Flare-up'}
              </Button>
            ) : (
              <Card>
                <h3 className="text-base font-semibold text-gray-900 mb-4">
                  🔥 {locale === 'bg' ? 'Нов пристъп' : 'New Flare-up'}
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Input label={locale === 'bg' ? 'Начало' : 'Onset Date'} type="date"
                    value={attackForm.onset_date}
                    onChange={e => setAttackForm(prev => ({ ...prev, onset_date: e.target.value }))} />
                  <div>
                    <label className="block text-[13px] font-medium text-gray-700 mb-1">{locale === 'bg' ? 'Тежест' : 'Severity'}</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="1" max="10" value={attackForm.severity}
                        onChange={e => setAttackForm(prev => ({ ...prev, severity: e.target.value }))}
                        className="flex-1" />
                      <span className="text-lg font-bold text-gray-900 w-8 text-center">{attackForm.severity}</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <Select label={locale === 'bg' ? 'Става' : 'Joint'} value={attackForm.joint}
                    onChange={e => setAttackForm(prev => ({ ...prev, joint: e.target.value }))}>
                    {JOINTS.map(j => <option key={j} value={j}>{j.replace(/_/g, ' ')}</option>)}
                  </Select>
                  <Select label={locale === 'bg' ? 'Страна' : 'Side'} value={attackForm.side}
                    onChange={e => setAttackForm(prev => ({ ...prev, side: e.target.value }))}>
                    {SIDES.map(s => <option key={s} value={s}>{s}</option>)}
                  </Select>
                  <Select label={locale === 'bg' ? 'Лекарство' : 'Medication'} value={attackForm.medication}
                    onChange={e => setAttackForm(prev => ({ ...prev, medication: e.target.value }))}>
                    {MEDICATIONS.map(m => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </div>
                <Textarea label={locale === 'bg' ? 'Бележки' : 'Notes'} value={attackForm.notes}
                  onChange={e => setAttackForm(prev => ({ ...prev, notes: e.target.value }))} rows={2} />
                <div className="flex gap-3 mt-4">
                  <Button className="flex-1" onClick={saveAttack} disabled={attackSaving}>
                    {attackSaving ? '...' : (locale === 'bg' ? 'Запази' : 'Save')}
                  </Button>
                  <Button variant="secondary" onClick={() => setShowAttackForm(false)}>
                    {locale === 'bg' ? 'Откажи' : 'Cancel'}
                  </Button>
                </div>
              </Card>
            )}

            {/* Recent uric acid readings */}
            {uricReadings.length > 0 && (
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {locale === 'bg' ? 'Последни стойности' : 'Recent Readings'}
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => router.push('/health/gout')}>
                    {locale === 'bg' ? 'Виж всичко' : 'View All'}
                  </Button>
                </div>
                <div className="space-y-2">
                  {uricReadings.slice(0, 5).map(r => (
                    <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-gray-900">{parseFloat(r.value).toFixed(0)}</span>
                        <span className="text-xs text-gray-400">μmol/L</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge color={UA_COLOR[r.status] || 'gray'}>{r.status}</Badge>
                        <span className="text-xs text-gray-400">{new Date(r.measured_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}
