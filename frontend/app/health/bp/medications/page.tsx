'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../context/LanguageContext';
import { t } from '../../../lib/i18n';
import { getHealthProfiles } from '../../../lib/api';
import NavBar from '../../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Alert, Spinner, Input, Select, EmptyState } from '../../../components/ui';

// ── Types ──────────────────────────────────────────────────────────

interface Profile {
  id: number; full_name: string; is_primary: boolean;
}

interface BpReading {
  id: string;
  profile_id: number;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  measured_at: string;
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

// ── Storage helpers ────────────────────────────────────────────────

const BP_READINGS_KEY = 'domapp_bp_readings';
const BP_MEDS_KEY = 'domapp_bp_medications';

function loadReadings(): BpReading[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(BP_READINGS_KEY) || '[]'); } catch { return []; }
}

function loadMedications(): BpMedication[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(BP_MEDS_KEY) || '[]'); } catch { return []; }
}

function saveMedications(meds: BpMedication[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BP_MEDS_KEY, JSON.stringify(meds));
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

// ── Adherence Calendar ────────────────────────────────────────────

function AdherenceCalendar({ adherence, locale }: { adherence: Record<string, boolean>; locale: string }) {
  const today = new Date();
  const days: { date: string; status: 'taken' | 'missed' | 'none' }[] = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const isFuture = d > today;
    days.push({
      date: key,
      status: isFuture ? 'none' : adherence[key] === true ? 'taken' : adherence[key] === false ? 'missed' : 'none',
    });
  }

  return (
    <div>
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
        {locale === 'bg' ? 'Последни 30 дни' : 'Last 30 Days'}
      </div>
      <div className="grid grid-cols-10 gap-1">
        {days.map(d => (
          <div
            key={d.date}
            title={d.date}
            className={`w-full aspect-square rounded-sm ${
              d.status === 'taken' ? 'bg-emerald-400' :
              d.status === 'missed' ? 'bg-red-400' :
              'bg-gray-100'
            }`}
          />
        ))}
      </div>
      <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />{locale === 'bg' ? 'Взето' : 'Taken'}</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" />{locale === 'bg' ? 'Пропуснато' : 'Missed'}</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gray-100" />{locale === 'bg' ? 'Няма данни' : 'No data'}</span>
      </div>
    </div>
  );
}

// ── Effectiveness Card ────────────────────────────────────────────

function EffectivenessCard({ med, readings, locale }: { med: BpMedication; readings: BpReading[]; locale: string }) {
  const medStart = new Date(med.start_date);
  const beforeReadings = readings.filter(r => new Date(r.measured_at) < medStart);
  const afterReadings = readings.filter(r => new Date(r.measured_at) >= medStart);

  if (beforeReadings.length < 3 || afterReadings.length < 3) {
    return (
      <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-400">
        {locale === 'bg'
          ? 'Необходими са поне 3 измервания преди и след старта за оценка на ефективността.'
          : 'Need at least 3 readings before and after start date for effectiveness analysis.'}
      </div>
    );
  }

  const beforeAvgSys = avg(beforeReadings.map(r => r.systolic));
  const beforeAvgDia = avg(beforeReadings.map(r => r.diastolic));
  const afterAvgSys = avg(afterReadings.map(r => r.systolic));
  const afterAvgDia = avg(afterReadings.map(r => r.diastolic));
  const sysDiff = afterAvgSys - beforeAvgSys;
  const diaDiff = afterAvgDia - beforeAvgDia;
  const isEffective = sysDiff < -3 || diaDiff < -3;

  return (
    <div className={`p-4 rounded-lg border ${isEffective ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {locale === 'bg' ? 'Ефективност' : 'Effectiveness'}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-gray-500 mb-1">{locale === 'bg' ? 'Преди' : 'Before'}</div>
          <div className="text-lg font-bold text-gray-900">{beforeAvgSys}/{beforeAvgDia}</div>
          <div className="text-[10px] text-gray-400">{beforeReadings.length} {locale === 'bg' ? 'изм.' : 'readings'}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">{locale === 'bg' ? 'След' : 'After'}</div>
          <div className="text-lg font-bold text-gray-900">{afterAvgSys}/{afterAvgDia}</div>
          <div className="text-[10px] text-gray-400">{afterReadings.length} {locale === 'bg' ? 'изм.' : 'readings'}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className={`text-sm font-medium ${sysDiff < -3 ? 'text-emerald-600' : sysDiff > 3 ? 'text-red-600' : 'text-gray-500'}`}>
          SYS: {sysDiff > 0 ? '+' : ''}{sysDiff}
        </span>
        <span className={`text-sm font-medium ${diaDiff < -3 ? 'text-emerald-600' : diaDiff > 3 ? 'text-red-600' : 'text-gray-500'}`}>
          DIA: {diaDiff > 0 ? '+' : ''}{diaDiff}
        </span>
        <Badge color={isEffective ? 'green' : 'gray'}>
          {isEffective ? (locale === 'bg' ? 'Ефективен' : 'Effective') : (locale === 'bg' ? 'Без промяна' : 'No change')}
        </Badge>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function BpMedicationsPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);
  const [medications, setMedications] = useState<BpMedication[]>([]);
  const [readings, setReadings] = useState<BpReading[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', dose: '', frequency: 'daily', start_date: '' });
  const [formError, setFormError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const profs = await getHealthProfiles();
      setProfiles(profs);
      const primary = profs.find((p: Profile) => p.is_primary) || profs[0];
      if (primary) {
        setSelectedProfile(primary.id);
        setMedications(loadMedications().filter((m: BpMedication) => m.profile_id === primary.id));
        setReadings(loadReadings().filter((r: BpReading) => r.profile_id === primary.id));
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
    setMedications(loadMedications().filter(m => m.profile_id === numId));
    setReadings(loadReadings().filter(r => r.profile_id === numId));
  };

  const resetForm = () => {
    setForm({ name: '', dose: '', frequency: 'daily', start_date: '' });
    setFormError('');
    setShowAdd(false);
    setEditId(null);
  };

  const handleSave = () => {
    if (!form.name.trim()) { setFormError(locale === 'bg' ? 'Името е задължително' : 'Name is required'); return; }
    if (!form.start_date) { setFormError(locale === 'bg' ? 'Датата е задължителна' : 'Start date is required'); return; }
    setFormError('');

    const all = loadMedications();

    if (editId) {
      const idx = all.findIndex(m => m.id === editId);
      if (idx >= 0) {
        all[idx] = { ...all[idx], name: form.name, dose: form.dose, frequency: form.frequency, start_date: form.start_date };
      }
    } else {
      const newMed: BpMedication = {
        id: genId(), profile_id: selectedProfile!, name: form.name, dose: form.dose,
        frequency: form.frequency, start_date: form.start_date, end_date: null,
        is_active: true, adherence: {},
      };
      all.push(newMed);
    }

    saveMedications(all);
    setMedications(all.filter(m => m.profile_id === selectedProfile));
    resetForm();
  };

  const handleEdit = (med: BpMedication) => {
    setForm({ name: med.name, dose: med.dose, frequency: med.frequency, start_date: med.start_date });
    setEditId(med.id);
    setShowAdd(true);
  };

  const handleDeactivate = (id: string) => {
    const all = loadMedications();
    const idx = all.findIndex(m => m.id === id);
    if (idx >= 0) {
      all[idx].is_active = false;
      all[idx].end_date = new Date().toISOString().slice(0, 10);
    }
    saveMedications(all);
    setMedications(all.filter(m => m.profile_id === selectedProfile));
  };

  const handleReactivate = (id: string) => {
    const all = loadMedications();
    const idx = all.findIndex(m => m.id === id);
    if (idx >= 0) {
      all[idx].is_active = true;
      all[idx].end_date = null;
    }
    saveMedications(all);
    setMedications(all.filter(m => m.profile_id === selectedProfile));
  };

  const handleMarkToday = (id: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const all = loadMedications();
    const idx = all.findIndex(m => m.id === id);
    if (idx >= 0) {
      all[idx].adherence = { ...all[idx].adherence, [today]: true };
    }
    saveMedications(all);
    setMedications(all.filter(m => m.profile_id === selectedProfile));
  };

  const handleMarkMissed = (id: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const all = loadMedications();
    const idx = all.findIndex(m => m.id === id);
    if (idx >= 0) {
      all[idx].adherence = { ...all[idx].adherence, [today]: false };
    }
    saveMedications(all);
    setMedications(all.filter(m => m.profile_id === selectedProfile));
  };

  if (loading) return (
    <PageShell><NavBar /><PageContent size="lg"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>
  );

  const activeMeds = medications.filter(m => m.is_active);
  const inactiveMeds = medications.filter(m => !m.is_active);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={locale === 'bg' ? 'Медикаменти' : 'Medications'}
          onBack={() => router.push('/health/bp')}
          backLabel={locale === 'bg' ? 'Назад' : 'Back'}
          action={
            <div className="flex items-center gap-3">
              {profiles.length > 1 && (
                <select
                  value={selectedProfile || ''}
                  onChange={e => handleProfileChange(e.target.value)}
                  className="h-10 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}{p.is_primary ? ' (me)' : ''}</option>
                  ))}
                </select>
              )}
              <Button onClick={() => { resetForm(); setShowAdd(true); }}>
                + {locale === 'bg' ? 'Добави' : 'Add'}
              </Button>
            </div>
          }
        />

        <Alert type="error" message={error} />

        {/* Add / Edit Form */}
        {showAdd && (
          <Card className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">
              {editId ? (locale === 'bg' ? 'Редактирай медикамент' : 'Edit Medication') : (locale === 'bg' ? 'Нов медикамент' : 'New Medication')}
            </h3>
            <Alert type="error" message={formError} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Input
                label={locale === 'bg' ? 'Име' : 'Name'} required
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder={locale === 'bg' ? 'напр. Лизиноприл' : 'e.g. Lisinopril'}
              />
              <Input
                label={locale === 'bg' ? 'Доза' : 'Dose'}
                value={form.dose}
                onChange={e => setForm(prev => ({ ...prev, dose: e.target.value }))}
                placeholder={locale === 'bg' ? 'напр. 10mg' : 'e.g. 10mg'}
              />
              <Select
                label={locale === 'bg' ? 'Честота' : 'Frequency'}
                value={form.frequency}
                onChange={e => setForm(prev => ({ ...prev, frequency: e.target.value }))}
              >
                <option value="daily">{locale === 'bg' ? 'Ежедневно' : 'Daily'}</option>
                <option value="twice_daily">{locale === 'bg' ? 'Два пъти дневно' : 'Twice Daily'}</option>
                <option value="weekly">{locale === 'bg' ? 'Седмично' : 'Weekly'}</option>
                <option value="as_needed">{locale === 'bg' ? 'При нужда' : 'As Needed'}</option>
              </Select>
              <Input
                label={locale === 'bg' ? 'Начална дата' : 'Start Date'} required
                type="date"
                value={form.start_date}
                onChange={e => setForm(prev => ({ ...prev, start_date: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave}>{t('common.save', locale)}</Button>
              <Button variant="secondary" onClick={resetForm}>{t('common.cancel', locale)}</Button>
            </div>
          </Card>
        )}

        {/* Active Medications */}
        {activeMeds.length === 0 && !showAdd && (
          <EmptyState icon="\ud83d\udc8a" message={locale === 'bg' ? 'Няма активни медикаменти.' : 'No active medications.'} />
        )}

        {activeMeds.map(med => {
          const takenToday = med.adherence?.[today] === true;
          const missedToday = med.adherence?.[today] === false;
          let streak = 0;
          const todayDate = new Date();
          for (let i = 0; i < 365; i++) {
            const day = new Date(todayDate.getTime() - i * 86400000).toISOString().slice(0, 10);
            if (med.adherence?.[day] === true) streak++;
            else break;
          }

          return (
            <Card key={med.id} className="mb-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{med.name}</h3>
                    <Badge color="green">{locale === 'bg' ? 'Активен' : 'Active'}</Badge>
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {med.dose && <span>{med.dose} &middot; </span>}
                    {med.frequency === 'daily' ? (locale === 'bg' ? 'Ежедневно' : 'Daily') :
                     med.frequency === 'twice_daily' ? (locale === 'bg' ? 'Два пъти дневно' : 'Twice Daily') :
                     med.frequency === 'weekly' ? (locale === 'bg' ? 'Седмично' : 'Weekly') :
                     (locale === 'bg' ? 'При нужда' : 'As Needed')}
                    {' '}&middot; {locale === 'bg' ? 'от' : 'since'} {med.start_date}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(med)}>
                    {locale === 'bg' ? 'Редактирай' : 'Edit'}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDeactivate(med.id)}>
                    {locale === 'bg' ? 'Спри' : 'Deactivate'}
                  </Button>
                </div>
              </div>

              {/* Mark today */}
              <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">
                  {locale === 'bg' ? 'Днес:' : 'Today:'}
                </span>
                {takenToday ? (
                  <Badge color="green">{locale === 'bg' ? 'Взето' : 'Taken'} \u2713</Badge>
                ) : missedToday ? (
                  <Badge color="red">{locale === 'bg' ? 'Пропуснато' : 'Missed'}</Badge>
                ) : (
                  <>
                    <Button size="sm" onClick={() => handleMarkToday(med.id)}>
                      \u2713 {locale === 'bg' ? 'Взето' : 'Taken'}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleMarkMissed(med.id)}>
                      \u2717 {locale === 'bg' ? 'Пропуснато' : 'Missed'}
                    </Button>
                  </>
                )}
                {streak > 0 && (
                  <span className="text-xs text-emerald-600 font-medium ml-auto">
                    \ud83d\udd25 {streak} {locale === 'bg' ? 'дни поред' : 'day streak'}
                  </span>
                )}
              </div>

              {/* Adherence Calendar */}
              <AdherenceCalendar adherence={med.adherence || {}} locale={locale} />

              {/* Effectiveness */}
              <div className="mt-4">
                <EffectivenessCard med={med} readings={readings} locale={locale} />
              </div>
            </Card>
          );
        })}

        {/* Inactive Medications */}
        {inactiveMeds.length > 0 && (
          <div className="mt-8">
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {locale === 'bg' ? 'Неактивни медикаменти' : 'Inactive Medications'}
            </h3>
            {inactiveMeds.map(med => (
              <Card key={med.id} className="mb-3 opacity-60">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-700">{med.name}</span>
                      <Badge color="gray">{locale === 'bg' ? 'Спрян' : 'Inactive'}</Badge>
                    </div>
                    <div className="text-xs text-gray-500">
                      {med.dose && <span>{med.dose} &middot; </span>}
                      {med.start_date} &rarr; {med.end_date || '—'}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleReactivate(med.id)}>
                    {locale === 'bg' ? 'Активирай' : 'Reactivate'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}
