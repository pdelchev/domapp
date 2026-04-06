'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  getGoutDashboard, getGoutAttacks, createGoutAttack, updateGoutAttack, deleteGoutAttack,
  getUricAcidReadings, createUricAcidReading, getGoutProcedures, createGoutProcedure,
  getHealthProfiles,
} from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import {
  PageShell, PageContent, PageHeader, Card, Button, Badge, Input, Select, Textarea,
  Spinner, Alert, BottomSheet, StickyActionBar,
} from '../../components/ui';

// ── Types ──────────────────────────────────────────────────────────

interface Dashboard {
  total_attacks: number;
  attacks_12_months: number;
  days_since_last: number | null;
  avg_severity: number | null;
  last_attack: { id: number; onset_date: string; joint: string; joint_display: string; severity: number; is_resolved: boolean } | null;
  latest_uric_acid: { value: number; measured_at: string; status: string } | null;
  uric_acid_trend: { date: string; value: number }[];
  joint_distribution: { joint: string; count: number }[];
  trigger_patterns: { food: TriggerItem[]; drink: TriggerItem[]; activity: TriggerItem[] };
  total_procedures: number;
}
interface TriggerItem { name: string; count: number; pct: number }
interface Attack {
  id: number; onset_date: string; resolved_date: string | null; joint: string; joint_display: string;
  side: string; side_display: string; severity: number; medication: string; medication_display: string;
  medication_dose: string; uric_acid_level: string | null; day_before_food: string; day_before_activity: string;
  notes: string; triggers: { id: number; category: string; name: string }[];
  duration_days: number | null; is_resolved: boolean;
}
interface UricReading { id: number; measured_at: string; value: string; status: string; notes: string }
interface Procedure { id: number; procedure_date: string; procedure_type: string; procedure_type_display: string; joint: string; joint_display: string; side: string; doctor: string; findings: string; notes: string }
interface Profile { id: number; full_name: string; is_primary: boolean }

const JOINTS = ['big_toe', 'ankle', 'knee', 'wrist', 'finger', 'elbow', 'heel', 'other'];
const SIDES = ['left', 'right', 'both'];
const MEDICATIONS = ['colchicine', 'allopurinol', 'febuxostat', 'nsaid', 'prednisone', 'other'];
const PROCEDURES = ['fluid_drainage', 'injection', 'blood_test', 'xray', 'ultrasound', 'mri', 'other'];

const UA_STATUS_COLOR: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  normal: 'green', borderline: 'yellow', high: 'red', critical: 'red',
};
const SEVERITY_COLOR = (s: number) => s >= 8 ? 'text-red-600' : s >= 5 ? 'text-amber-600' : 'text-green-600';

// ── Main Component ─────────────────────────────────────────────────

export default function GoutDashboardPage() {
  const router = useRouter();
  const { locale } = useLanguage();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [attacks, setAttacks] = useState<Attack[]>([]);
  const [readings, setReadings] = useState<UricReading[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'attacks' | 'uric' | 'procedures'>('overview');

  // Forms
  const [showAttackForm, setShowAttackForm] = useState(false);
  const [showUAForm, setShowUAForm] = useState(false);
  const [showProcForm, setShowProcForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [attackForm, setAttackForm] = useState({
    onset_date: new Date().toISOString().split('T')[0], resolved_date: '',
    joint: 'knee', side: 'right', severity: '5', medication: '', medication_dose: '',
    uric_acid_level: '', day_before_food: '', day_before_activity: '', notes: '',
  });
  const [uaForm, setUaForm] = useState({ measured_at: new Date().toISOString().split('T')[0], value: '', notes: '' });
  const [procForm, setProcForm] = useState({
    procedure_date: new Date().toISOString().split('T')[0], procedure_type: 'fluid_drainage',
    joint: '', side: '', doctor: '', findings: '', notes: '',
  });

  // Load data
  useEffect(() => {
    getHealthProfiles().then((ps) => {
      setProfiles(ps);
      const primary = ps.find((p: Profile) => p.is_primary) || ps[0];
      if (primary) setProfileId(primary.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (profileId === null) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      getGoutDashboard(profileId),
      getGoutAttacks(profileId),
      getUricAcidReadings(profileId),
      getGoutProcedures(profileId),
    ]).then(([d, a, r, p]) => {
      setDashboard(d);
      setAttacks(a);
      setReadings(r);
      setProcedures(p);
    }).catch(() => setError('Failed to load data'))
      .finally(() => setLoading(false));
  }, [profileId]);

  // Handlers
  const handleSaveAttack = async () => {
    setSaving(true); setError('');
    try {
      const data = {
        ...attackForm,
        profile: profileId,
        severity: Number(attackForm.severity),
        uric_acid_level: attackForm.uric_acid_level || null,
        resolved_date: attackForm.resolved_date || null,
      };
      const created = await createGoutAttack(data);
      setAttacks((prev) => [created, ...prev]);
      setShowAttackForm(false);
      setAttackForm({ onset_date: new Date().toISOString().split('T')[0], resolved_date: '', joint: 'knee', side: 'right', severity: '5', medication: '', medication_dose: '', uric_acid_level: '', day_before_food: '', day_before_activity: '', notes: '' });
      // Refresh dashboard
      const d = await getGoutDashboard(profileId!);
      setDashboard(d);
    } catch { setError('Failed to save'); }
    setSaving(false);
  };

  const handleSaveUA = async () => {
    setSaving(true);
    try {
      const created = await createUricAcidReading({ ...uaForm, profile: profileId });
      setReadings((prev) => [created, ...prev]);
      setShowUAForm(false);
      setUaForm({ measured_at: new Date().toISOString().split('T')[0], value: '', notes: '' });
      const d = await getGoutDashboard(profileId!);
      setDashboard(d);
    } catch { setError('Failed to save'); }
    setSaving(false);
  };

  const handleSaveProc = async () => {
    setSaving(true);
    try {
      const created = await createGoutProcedure({ ...procForm, profile: profileId });
      setProcedures((prev) => [created, ...prev]);
      setShowProcForm(false);
    } catch { setError('Failed to save'); }
    setSaving(false);
  };

  const handleDeleteAttack = async (id: number) => {
    if (!confirm(t('common.delete_confirm', locale))) return;
    await deleteGoutAttack(id);
    setAttacks((prev) => prev.filter((a) => a.id !== id));
  };

  const handleResolve = async (attack: Attack) => {
    const today = new Date().toISOString().split('T')[0];
    const updated = await updateGoutAttack(attack.id, { resolved_date: today });
    setAttacks((prev) => prev.map((a) => a.id === attack.id ? updated : a));
  };

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  const tabs = [
    { key: 'overview' as const, label: locale === 'bg' ? 'Общ преглед' : 'Overview' },
    { key: 'attacks' as const, label: t('gout.attacks', locale) },
    { key: 'uric' as const, label: t('gout.uric_acid', locale) },
    { key: 'procedures' as const, label: t('gout.procedures', locale) },
  ];

  return (
    <PageShell>
      <NavBar />
      <PageContent>
        <PageHeader
          title={t('gout.title', locale)}
          onBack={() => router.push('/health')}
          backLabel={t('common.back', locale)}
          action={
            <div className="flex gap-2">
              {profiles.length > 1 && (
                <Select value={profileId ?? ''} onChange={(e) => setProfileId(Number(e.target.value))} className="w-auto">
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </Select>
              )}
              <Button onClick={() => setShowAttackForm(true)}>+ {t('gout.log_attack', locale)}</Button>
            </div>
          }
        />

        <Alert type="error" message={error} />

        {/* Tab navigation */}
        <div className="flex gap-1 mb-5 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition-colors active:scale-95 ${
                tab === tb.key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* ═══ OVERVIEW TAB ═══ */}
        {tab === 'overview' && dashboard && (
          <div className="space-y-4">
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <p className="text-xs text-gray-500">{t('gout.days_since', locale)}</p>
                <p className={`text-2xl font-bold ${dashboard.days_since_last !== null && dashboard.days_since_last < 30 ? 'text-red-600' : 'text-green-600'}`}>
                  {dashboard.days_since_last ?? '—'}
                </p>
              </Card>
              <Card>
                <p className="text-xs text-gray-500">{t('gout.total_attacks', locale)}</p>
                <p className="text-2xl font-bold text-gray-900">{dashboard.total_attacks}</p>
                <p className="text-[10px] text-gray-400">{dashboard.attacks_12_months} {t('gout.attacks_12m', locale)}</p>
              </Card>
              <Card>
                <p className="text-xs text-gray-500">{t('gout.uric_acid', locale)}</p>
                {dashboard.latest_uric_acid ? (
                  <>
                    <p className="text-2xl font-bold text-gray-900">{dashboard.latest_uric_acid.value}</p>
                    <Badge color={UA_STATUS_COLOR[dashboard.latest_uric_acid.status] || 'gray'}>
                      {t(`gout.${dashboard.latest_uric_acid.status}`, locale)} — {t('gout.target', locale)}
                    </Badge>
                  </>
                ) : <p className="text-lg text-gray-300">—</p>}
              </Card>
              <Card>
                <p className="text-xs text-gray-500">{t('gout.avg_severity', locale)}</p>
                <p className={`text-2xl font-bold ${SEVERITY_COLOR(dashboard.avg_severity || 0)}`}>
                  {dashboard.avg_severity ?? '—'}<span className="text-sm text-gray-400">/10</span>
                </p>
              </Card>
            </div>

            {/* Last attack */}
            {dashboard.last_attack && (
              <Card>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">{locale === 'bg' ? 'Последна криза' : 'Last Flare-up'}</h3>
                  <Badge color={dashboard.last_attack.is_resolved ? 'green' : 'red'}>
                    {dashboard.last_attack.is_resolved ? (locale === 'bg' ? 'Отминала' : 'Resolved') : (locale === 'bg' ? 'Активна' : 'Active')}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>{dashboard.last_attack.onset_date}</span>
                  <span>{dashboard.last_attack.joint_display}</span>
                  <span className={SEVERITY_COLOR(dashboard.last_attack.severity)}>
                    {locale === 'bg' ? 'Сила' : 'Severity'}: {dashboard.last_attack.severity}/10
                  </span>
                </div>
              </Card>
            )}

            {/* Uric acid trend */}
            {dashboard.uric_acid_trend.length > 0 && (
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">{t('gout.uric_acid', locale)} — {locale === 'bg' ? 'Тренд' : 'Trend'}</h3>
                  <Button variant="ghost" size="sm" onClick={() => setShowUAForm(true)}>+ {t('gout.add_reading', locale)}</Button>
                </div>
                <div className="flex items-end gap-1 h-20">
                  {dashboard.uric_acid_trend.map((r, i) => {
                    const maxVal = Math.max(...dashboard.uric_acid_trend.map(x => x.value), 600);
                    const pct = (r.value / maxVal) * 100;
                    const color = r.value > 480 ? 'bg-red-500' : r.value > 360 ? 'bg-amber-500' : 'bg-green-500';
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <span className="text-[9px] text-gray-500">{r.value}</span>
                        <div className={`w-full ${color} rounded-t`} style={{ height: `${Math.max(pct, 8)}%` }} />
                      </div>
                    );
                  })}
                </div>
                {/* Target line label */}
                <div className="flex justify-between text-[10px] text-gray-400 mt-1 border-t border-dashed border-gray-200 pt-1">
                  <span>{locale === 'bg' ? 'Цел <360 µmol/L' : 'Target <360 µmol/L'}</span>
                </div>
              </Card>
            )}

            {/* Trigger patterns */}
            {(dashboard.trigger_patterns.food.length > 0 || dashboard.trigger_patterns.drink.length > 0 || dashboard.trigger_patterns.activity.length > 0) && (
              <Card>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('gout.triggers', locale)} — {locale === 'bg' ? 'Модели' : 'Patterns'}</h3>
                {(['food', 'drink', 'activity'] as const).map((cat) => {
                  const items = dashboard.trigger_patterns[cat];
                  if (items.length === 0) return null;
                  return (
                    <div key={cat} className="mb-3 last:mb-0">
                      <p className="text-xs font-medium text-gray-500 mb-1">{t(`gout.${cat}_triggers`, locale)}</p>
                      <div className="space-y-1">
                        {items.map((item) => (
                          <div key={item.name} className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${item.pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-600 min-w-[80px]">{item.name}</span>
                            <span className="text-[10px] text-gray-400">{item.pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}

            {/* Joint distribution */}
            {dashboard.joint_distribution.length > 0 && (
              <Card>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">{locale === 'bg' ? 'Засегнати стави' : 'Affected Joints'}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {dashboard.joint_distribution.map((j) => (
                    <div key={j.joint} className="p-2 bg-gray-50 rounded-xl text-center">
                      <p className="text-lg font-bold text-gray-900">{j.count}</p>
                      <p className="text-xs text-gray-500">{t(`joint.${j.joint}`, locale)}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ═══ ATTACKS TAB ═══ */}
        {tab === 'attacks' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowAttackForm(true)}>+ {t('gout.log_attack', locale)}</Button>
            </div>
            {attacks.length === 0 ? (
              <Card className="text-center !py-12">
                <p className="text-3xl mb-2">🦴</p>
                <p className="text-sm text-gray-500">{t('common.no_data', locale)}</p>
              </Card>
            ) : attacks.map((attack) => (
              <Card key={attack.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900">{attack.onset_date}</span>
                      <Badge color={attack.is_resolved ? 'green' : 'red'}>
                        {attack.is_resolved ? (locale === 'bg' ? 'Отминала' : 'Resolved') : (locale === 'bg' ? 'Активна' : 'Active')}
                      </Badge>
                      {attack.duration_days !== null && (
                        <span className="text-xs text-gray-400">{attack.duration_days}d</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
                      <span>{attack.joint_display} ({attack.side_display})</span>
                      <span className={SEVERITY_COLOR(attack.severity)}>{locale === 'bg' ? 'Сила' : 'Severity'}: {attack.severity}/10</span>
                      {attack.medication_display && <span>{attack.medication_display} {attack.medication_dose}</span>}
                      {attack.uric_acid_level && <span>UA: {attack.uric_acid_level}</span>}
                    </div>
                    {attack.day_before_food && (
                      <p className="text-xs text-gray-400 mt-1.5">🍽️ {attack.day_before_food}</p>
                    )}
                    {attack.day_before_activity && (
                      <p className="text-xs text-gray-400 mt-0.5">🏃 {attack.day_before_activity}</p>
                    )}
                    {attack.notes && (
                      <p className="text-xs text-gray-400 mt-0.5 italic">{attack.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!attack.is_resolved && (
                      <Button variant="ghost" size="sm" onClick={() => handleResolve(attack)}>
                        <span className="text-green-600">✓</span>
                      </Button>
                    )}
                    <Button variant="danger" size="sm" onClick={() => handleDeleteAttack(attack.id)}>
                      {t('common.delete', locale)}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ═══ URIC ACID TAB ═══ */}
        {tab === 'uric' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowUAForm(true)}>+ {t('gout.add_reading', locale)}</Button>
            </div>
            {readings.length === 0 ? (
              <Card className="text-center !py-12">
                <p className="text-3xl mb-2">🧪</p>
                <p className="text-sm text-gray-500">{t('common.no_data', locale)}</p>
              </Card>
            ) : readings.map((r) => (
              <Card key={r.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-gray-900">{r.value} µmol/L</span>
                    <span className="ml-2"><Badge color={UA_STATUS_COLOR[r.status] || 'gray'}>
                      {t(`gout.${r.status}`, locale)}
                    </Badge></span>
                  </div>
                  <span className="text-xs text-gray-400">{r.measured_at}</span>
                </div>
                {r.notes && <p className="text-xs text-gray-400 mt-1">{r.notes}</p>}
              </Card>
            ))}
          </div>
        )}

        {/* ═══ PROCEDURES TAB ═══ */}
        {tab === 'procedures' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowProcForm(true)}>+ {t('gout.add_procedure', locale)}</Button>
            </div>
            {procedures.length === 0 ? (
              <Card className="text-center !py-12">
                <p className="text-3xl mb-2">🏥</p>
                <p className="text-sm text-gray-500">{t('common.no_data', locale)}</p>
              </Card>
            ) : procedures.map((p) => (
              <Card key={p.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-gray-900">{p.procedure_type_display}</span>
                  <span className="text-xs text-gray-400">{p.procedure_date}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 text-xs text-gray-500">
                  {p.joint_display && <span>{p.joint_display}</span>}
                  {p.doctor && <span>{locale === 'bg' ? 'Д-р' : 'Dr.'} {p.doctor}</span>}
                </div>
                {p.findings && <p className="text-xs text-gray-400 mt-1">{p.findings}</p>}
              </Card>
            ))}
          </div>
        )}

        {/* ═══ LOG ATTACK BOTTOM SHEET ═══ */}
        <BottomSheet open={showAttackForm} onClose={() => setShowAttackForm(false)} title={t('gout.log_attack', locale)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label={t('gout.onset_date', locale)} type="date" value={attackForm.onset_date}
                onChange={(e) => setAttackForm((p) => ({ ...p, onset_date: e.target.value }))} required />
              <Input label={t('gout.resolved_date', locale)} type="date" value={attackForm.resolved_date}
                onChange={(e) => setAttackForm((p) => ({ ...p, resolved_date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Select label={t('gout.joint', locale)} value={attackForm.joint}
                onChange={(e) => setAttackForm((p) => ({ ...p, joint: e.target.value }))}>
                {JOINTS.map((j) => <option key={j} value={j}>{t(`joint.${j}`, locale)}</option>)}
              </Select>
              <Select label={t('gout.side', locale)} value={attackForm.side}
                onChange={(e) => setAttackForm((p) => ({ ...p, side: e.target.value }))}>
                {SIDES.map((s) => <option key={s} value={s}>{s === 'left' ? (locale === 'bg' ? 'Ляво' : 'Left') : s === 'right' ? (locale === 'bg' ? 'Дясно' : 'Right') : (locale === 'bg' ? 'Двете' : 'Both')}</option>)}
              </Select>
              <Input label={t('gout.severity', locale)} type="number" min="1" max="10" value={attackForm.severity}
                onChange={(e) => setAttackForm((p) => ({ ...p, severity: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label={t('gout.medication', locale)} value={attackForm.medication}
                onChange={(e) => setAttackForm((p) => ({ ...p, medication: e.target.value }))}>
                <option value="">—</option>
                {MEDICATIONS.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </Select>
              <Input label={t('gout.medication_dose', locale)} value={attackForm.medication_dose} placeholder="e.g. 2+1"
                onChange={(e) => setAttackForm((p) => ({ ...p, medication_dose: e.target.value }))} />
            </div>
            <Input label={`${t('gout.uric_acid', locale)} (µmol/L)`} type="number" value={attackForm.uric_acid_level}
              onChange={(e) => setAttackForm((p) => ({ ...p, uric_acid_level: e.target.value }))} placeholder="520" />
            <Textarea label={t('gout.day_before_food', locale)} value={attackForm.day_before_food} rows={2}
              placeholder={locale === 'bg' ? '2 бири, кроасани, кренвирши...' : '2 beers, pastries, processed meat...'}
              onChange={(e) => setAttackForm((p) => ({ ...p, day_before_food: e.target.value }))} />
            <Textarea label={t('gout.day_before_activity', locale)} value={attackForm.day_before_activity} rows={2}
              placeholder={locale === 'bg' ? 'Клякане, дълго шофиране...' : 'Squatting, long drive...'}
              onChange={(e) => setAttackForm((p) => ({ ...p, day_before_activity: e.target.value }))} />
            <Textarea label={t('common.notes', locale)} value={attackForm.notes} rows={2}
              onChange={(e) => setAttackForm((p) => ({ ...p, notes: e.target.value }))} />
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleSaveAttack} disabled={saving}>
                {saving ? '...' : t('common.save', locale)}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setShowAttackForm(false)}>
                {t('common.cancel', locale)}
              </Button>
            </div>
          </div>
        </BottomSheet>

        {/* ═══ URIC ACID BOTTOM SHEET ═══ */}
        <BottomSheet open={showUAForm} onClose={() => setShowUAForm(false)} title={t('gout.add_reading', locale)}>
          <div className="space-y-3">
            <Input label={locale === 'bg' ? 'Дата' : 'Date'} type="date" value={uaForm.measured_at}
              onChange={(e) => setUaForm((p) => ({ ...p, measured_at: e.target.value }))} required />
            <Input label={`${t('gout.uric_acid', locale)} (µmol/L)`} type="number" value={uaForm.value}
              onChange={(e) => setUaForm((p) => ({ ...p, value: e.target.value }))} required placeholder="360" />
            <Input label={t('common.notes', locale)} value={uaForm.notes}
              onChange={(e) => setUaForm((p) => ({ ...p, notes: e.target.value }))} />
            <div className="p-2 bg-blue-50 rounded-xl text-xs text-blue-700">
              {locale === 'bg' ? 'Нормално: <360 µmol/L. Високо: >360. Критично: >480.' : 'Normal: <360 µmol/L. High: >360. Critical: >480.'}
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleSaveUA} disabled={saving || !uaForm.value}>
                {saving ? '...' : t('common.save', locale)}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setShowUAForm(false)}>
                {t('common.cancel', locale)}
              </Button>
            </div>
          </div>
        </BottomSheet>

        {/* ═══ PROCEDURE BOTTOM SHEET ═══ */}
        <BottomSheet open={showProcForm} onClose={() => setShowProcForm(false)} title={t('gout.add_procedure', locale)}>
          <div className="space-y-3">
            <Input label={locale === 'bg' ? 'Дата' : 'Date'} type="date" value={procForm.procedure_date}
              onChange={(e) => setProcForm((p) => ({ ...p, procedure_date: e.target.value }))} required />
            <Select label={locale === 'bg' ? 'Тип' : 'Type'} value={procForm.procedure_type}
              onChange={(e) => setProcForm((p) => ({ ...p, procedure_type: e.target.value }))}>
              {PROCEDURES.map((pr) => <option key={pr} value={pr}>{t(`proc.${pr}`, locale)}</option>)}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Select label={t('gout.joint', locale)} value={procForm.joint}
                onChange={(e) => setProcForm((p) => ({ ...p, joint: e.target.value }))}>
                <option value="">—</option>
                {JOINTS.map((j) => <option key={j} value={j}>{t(`joint.${j}`, locale)}</option>)}
              </Select>
              <Input label={locale === 'bg' ? 'Лекар' : 'Doctor'} value={procForm.doctor}
                onChange={(e) => setProcForm((p) => ({ ...p, doctor: e.target.value }))} />
            </div>
            <Textarea label={locale === 'bg' ? 'Резултати' : 'Findings'} value={procForm.findings} rows={2}
              onChange={(e) => setProcForm((p) => ({ ...p, findings: e.target.value }))} />
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleSaveProc} disabled={saving}>
                {saving ? '...' : t('common.save', locale)}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setShowProcForm(false)}>
                {t('common.cancel', locale)}
              </Button>
            </div>
          </div>
        </BottomSheet>
      </PageContent>
    </PageShell>
  );
}
