'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { getEmergencyCard, updateEmergencyCard } from '../../lib/api';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, Card, Button, Input, Select, Textarea, Alert, Spinner } from '../../components/ui';

// ── Types ──────────────────────────────────────────────────────────

interface ActiveMedication {
  name: string;
  strength: string;
  form: string;
  is_prescription: boolean;
}

interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
  primary?: boolean;
}

interface EmergencyCard {
  profile: number;
  profile_full_name: string;
  profile_dob: string | null;
  profile_sex: string;
  blood_type: string;
  allergies: string;
  chronic_conditions: string;
  current_medications_text: string;
  active_medications: ActiveMedication[];
  recent_surgeries: string;
  implants: string;
  organ_donor: boolean;
  dnr: boolean;
  advance_directive_url: string;
  insurance_provider: string;
  insurance_number: string;
  emergency_contacts: EmergencyContact[];
  primary_doctor_name: string;
  primary_doctor_phone: string;
  notes: string;
  updated_at: string;
}

const STORAGE_KEY = 'domapp_emergency_card';
const BLOOD_TYPES = ['unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// ── Page ───────────────────────────────────────────────────────────

export default function EmergencyCardPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [card, setCard] = useState<EmergencyCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [offlineMode, setOfflineMode] = useState(false);

  // Load: try API → fall back to localStorage cache
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEmergencyCard();
      setCard(data);
      setOfflineMode(false);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
    } catch {
      // Offline / API down → read cache
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          setCard(JSON.parse(cached));
          setOfflineMode(true);
        } else {
          setError(locale === 'bg' ? 'Няма достъп до картата офлайн.' : 'No cached card available offline.');
        }
      } catch {
        setError('Failed to load emergency card.');
      }
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!card) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateEmergencyCard({
        blood_type: card.blood_type,
        allergies: card.allergies,
        chronic_conditions: card.chronic_conditions,
        current_medications_text: card.current_medications_text,
        recent_surgeries: card.recent_surgeries,
        implants: card.implants,
        organ_donor: card.organ_donor,
        dnr: card.dnr,
        advance_directive_url: card.advance_directive_url,
        insurance_provider: card.insurance_provider,
        insurance_number: card.insurance_number,
        emergency_contacts: card.emergency_contacts,
        primary_doctor_name: card.primary_doctor_name,
        primary_doctor_phone: card.primary_doctor_phone,
        notes: card.notes,
      });
      setCard(updated);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
      setEditing(false);
    } catch {
      setError(locale === 'bg' ? 'Записът се провали. Опитай отново.' : 'Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const update = (k: keyof EmergencyCard, v: unknown) => {
    setCard(prev => prev ? { ...prev, [k]: v } as EmergencyCard : prev);
  };

  const addContact = () => {
    if (!card) return;
    update('emergency_contacts', [...card.emergency_contacts, { name: '', relation: '', phone: '' }]);
  };

  const updateContact = (i: number, k: keyof EmergencyContact, v: string) => {
    if (!card) return;
    const next = card.emergency_contacts.map((c, idx) => idx === i ? { ...c, [k]: v } : c);
    update('emergency_contacts', next);
  };

  const removeContact = (i: number) => {
    if (!card) return;
    update('emergency_contacts', card.emergency_contacts.filter((_, idx) => idx !== i));
  };

  if (loading) return (
    <PageShell><NavBar /><PageContent size="md"><Spinner message="" /></PageContent></PageShell>
  );

  if (!card) return (
    <PageShell><NavBar /><PageContent size="md">
      <Alert type="error" message={error} />
      <Button onClick={() => router.push('/health')}>← {locale === 'bg' ? 'Назад' : 'Back'}</Button>
    </PageContent></PageShell>
  );

  // ─── VIEW MODE (designed for first responders) ───
  if (!editing) {
    const dobAge = card.profile_dob
      ? Math.floor((Date.now() - new Date(card.profile_dob).getTime()) / 31557600000)
      : null;

    return (
      <PageShell>
        <NavBar />
        <PageContent size="md">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => router.push('/health')} className="text-sm text-indigo-600 font-medium">
              ← {locale === 'bg' ? 'Здраве' : 'Health'}
            </button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              ✎ {locale === 'bg' ? 'Редактирай' : 'Edit'}
            </Button>
          </div>

          {offlineMode && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              📡 {locale === 'bg' ? 'Офлайн режим — показва кеширана версия' : 'Offline mode — showing cached version'}
            </div>
          )}

          {/* ── HERO: Big red header ── */}
          <div className="rounded-2xl bg-gradient-to-br from-red-600 to-red-700 text-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest opacity-90">
                  {locale === 'bg' ? '🚨 Спешна Медицинска Карта' : '🚨 Emergency Medical Card'}
                </div>
                <h1 className="text-3xl font-bold mt-1">{card.profile_full_name}</h1>
                <div className="text-sm opacity-90 mt-1">
                  {dobAge !== null && <span>{dobAge} {locale === 'bg' ? 'г.' : 'yrs'} · </span>}
                  {card.profile_sex === 'female' ? (locale === 'bg' ? 'Жена' : 'Female') : (locale === 'bg' ? 'Мъж' : 'Male')}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold uppercase tracking-widest opacity-90">
                  {locale === 'bg' ? 'Кръвна Група' : 'Blood Type'}
                </div>
                <div className="text-5xl font-black mt-1">{card.blood_type}</div>
              </div>
            </div>

            {(card.organ_donor || card.dnr) && (
              <div className="flex gap-2 mt-4">
                {card.organ_donor && (
                  <span className="px-3 py-1 rounded-full bg-white/20 text-xs font-bold uppercase tracking-wider">
                    💚 {locale === 'bg' ? 'Донор на органи' : 'Organ Donor'}
                  </span>
                )}
                {card.dnr && (
                  <span className="px-3 py-1 rounded-full bg-yellow-300 text-red-900 text-xs font-bold uppercase tracking-wider">
                    ⚠️ DNR
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── ALLERGIES (most critical for paramedics) ── */}
          {card.allergies && (
            <Card className="mt-4 border-red-300 bg-red-50/50">
              <div className="text-xs font-bold uppercase tracking-widest text-red-700">
                ⚠️ {locale === 'bg' ? 'Алергии' : 'Allergies'}
              </div>
              <div className="mt-2 text-lg font-semibold text-red-900 whitespace-pre-line">{card.allergies}</div>
            </Card>
          )}

          {/* ── CONDITIONS ── */}
          {card.chronic_conditions && (
            <Card className="mt-3">
              <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
                {locale === 'bg' ? 'Хронични заболявания' : 'Chronic Conditions'}
              </div>
              <div className="mt-1.5 text-base text-gray-900 whitespace-pre-line">{card.chronic_conditions}</div>
            </Card>
          )}

          {/* ── MEDICATIONS (active from catalog + manual override) ── */}
          {(card.current_medications_text || card.active_medications.length > 0) && (
            <Card className="mt-3">
              <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
                💊 {locale === 'bg' ? 'Текущи лекарства' : 'Current Medications'}
              </div>
              {card.current_medications_text && (
                <div className="mt-1.5 text-base text-gray-900 whitespace-pre-line">{card.current_medications_text}</div>
              )}
              {card.active_medications.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {card.active_medications.map((m, i) => (
                    <li key={i} className="text-sm flex items-baseline gap-2">
                      <span className="font-semibold text-gray-900">{m.name}</span>
                      {m.strength && <span className="text-gray-600">{m.strength}</span>}
                      {m.is_prescription && (
                        <span className="text-[10px] uppercase font-bold text-indigo-600">Rx</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {/* ── IMPLANTS (MRI safety) ── */}
          {card.implants && (
            <Card className="mt-3 border-amber-200 bg-amber-50/30">
              <div className="text-xs font-bold uppercase tracking-widest text-amber-700">
                ⚙️ {locale === 'bg' ? 'Импланти' : 'Implants / Devices'}
              </div>
              <div className="mt-1.5 text-base text-gray-900 whitespace-pre-line">{card.implants}</div>
            </Card>
          )}

          {/* ── EMERGENCY CONTACTS ── */}
          {card.emergency_contacts.length > 0 && (
            <Card className="mt-3">
              <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
                📞 {locale === 'bg' ? 'Спешен контакт' : 'Emergency Contacts'}
              </div>
              <div className="mt-2 space-y-2">
                {card.emergency_contacts.map((c, i) => (
                  <a
                    key={i}
                    href={`tel:${c.phone}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-gray-900">{c.name}</div>
                      <div className="text-xs text-gray-600">{c.relation}</div>
                    </div>
                    <div className="text-indigo-700 font-bold">{c.phone}</div>
                  </a>
                ))}
              </div>
            </Card>
          )}

          {/* ── DOCTOR ── */}
          {(card.primary_doctor_name || card.primary_doctor_phone) && (
            <Card className="mt-3">
              <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
                🩺 {locale === 'bg' ? 'Личен лекар' : 'Primary Doctor'}
              </div>
              <div className="mt-1.5 text-base text-gray-900">{card.primary_doctor_name}</div>
              {card.primary_doctor_phone && (
                <a href={`tel:${card.primary_doctor_phone}`} className="text-sm text-indigo-600 font-medium">
                  {card.primary_doctor_phone}
                </a>
              )}
            </Card>
          )}

          {/* ── INSURANCE ── */}
          {(card.insurance_provider || card.insurance_number) && (
            <Card className="mt-3">
              <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
                {locale === 'bg' ? 'Здравна осигуровка' : 'Insurance'}
              </div>
              <div className="mt-1.5 text-base text-gray-900">{card.insurance_provider}</div>
              {card.insurance_number && (
                <div className="text-sm text-gray-600 font-mono">{card.insurance_number}</div>
              )}
            </Card>
          )}

          {/* ── NOTES ── */}
          {card.notes && (
            <Card className="mt-3">
              <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
                {locale === 'bg' ? 'Бележки' : 'Notes'}
              </div>
              <div className="mt-1.5 text-sm text-gray-700 whitespace-pre-line">{card.notes}</div>
            </Card>
          )}

          <div className="mt-4 text-[11px] text-gray-400 text-center">
            {locale === 'bg' ? 'Последно обновяване' : 'Last updated'}: {new Date(card.updated_at).toLocaleDateString()}
          </div>
        </PageContent>
      </PageShell>
    );
  }

  // ─── EDIT MODE ───
  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setEditing(false)} className="text-sm text-gray-600 font-medium">
            ← {locale === 'bg' ? 'Откажи' : 'Cancel'}
          </button>
          <Button onClick={save} disabled={saving}>
            {saving ? '...' : (locale === 'bg' ? 'Запази' : 'Save')}
          </Button>
        </div>

        <Alert type="error" message={error} />

        <Card>
          <h2 className="font-semibold text-gray-900 mb-3">
            {locale === 'bg' ? 'Редактиране на спешна карта' : 'Edit Emergency Card'}
          </h2>

          <div className="space-y-4">
            <Select label={locale === 'bg' ? 'Кръвна група' : 'Blood Type'}
              value={card.blood_type}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => update('blood_type', e.target.value)}>
              {BLOOD_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
            </Select>

            <Textarea label={locale === 'bg' ? 'Алергии' : 'Allergies'}
              placeholder={locale === 'bg' ? 'Пеницилин, ядки...' : 'Penicillin, peanuts...'}
              value={card.allergies}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('allergies', e.target.value)} />

            <Textarea label={locale === 'bg' ? 'Хронични заболявания' : 'Chronic Conditions'}
              placeholder={locale === 'bg' ? 'Диабет, астма...' : 'Diabetes, asthma...'}
              value={card.chronic_conditions}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('chronic_conditions', e.target.value)} />

            <Textarea label={locale === 'bg' ? 'Допълнителни лекарства' : 'Additional Medications (manual)'}
              placeholder={locale === 'bg' ? 'Активните се извличат автоматично' : 'Active prescriptions auto-pulled from your catalog'}
              value={card.current_medications_text}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('current_medications_text', e.target.value)} />

            <Textarea label={locale === 'bg' ? 'Импланти / устройства' : 'Implants / Devices'}
              placeholder={locale === 'bg' ? 'Пейсмейкър, стент...' : 'Pacemaker, stent, prosthetic...'}
              value={card.implants}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('implants', e.target.value)} />

            <Textarea label={locale === 'bg' ? 'Скорошни операции' : 'Recent Surgeries'}
              value={card.recent_surgeries}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('recent_surgeries', e.target.value)} />

            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={card.organ_donor}
                  onChange={(e) => update('organ_donor', e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-indigo-600" />
                {locale === 'bg' ? 'Донор на органи' : 'Organ Donor'}
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={card.dnr}
                  onChange={(e) => update('dnr', e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-indigo-600" />
                DNR
              </label>
            </div>
          </div>
        </Card>

        {/* Emergency contacts */}
        <Card className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">
              📞 {locale === 'bg' ? 'Спешни контакти' : 'Emergency Contacts'}
            </h3>
            <Button size="sm" variant="secondary" onClick={addContact}>
              + {locale === 'bg' ? 'Добави' : 'Add'}
            </Button>
          </div>

          <div className="space-y-3">
            {card.emergency_contacts.map((c, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 rounded-lg border border-gray-200">
                <Input label={locale === 'bg' ? 'Име' : 'Name'} value={c.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateContact(i, 'name', e.target.value)} />
                <Input label={locale === 'bg' ? 'Връзка' : 'Relation'} value={c.relation}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateContact(i, 'relation', e.target.value)} />
                <Input label={locale === 'bg' ? 'Телефон' : 'Phone'} type="tel" inputMode="tel" value={c.phone}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateContact(i, 'phone', e.target.value)} />
                <button onClick={() => removeContact(i)} className="text-xs text-red-600 font-medium md:col-span-3 text-right">
                  {locale === 'bg' ? 'Премахни' : 'Remove'}
                </button>
              </div>
            ))}
            {card.emergency_contacts.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-3">
                {locale === 'bg' ? 'Няма добавени контакти' : 'No contacts yet'}
              </p>
            )}
          </div>
        </Card>

        {/* Doctor + insurance */}
        <Card className="mt-4">
          <h3 className="font-semibold text-gray-900 mb-3">
            🩺 {locale === 'bg' ? 'Лекар и осигуровка' : 'Doctor & Insurance'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label={locale === 'bg' ? 'Личен лекар' : 'Primary Doctor'}
              value={card.primary_doctor_name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('primary_doctor_name', e.target.value)} />
            <Input label={locale === 'bg' ? 'Телефон на лекаря' : 'Doctor Phone'} type="tel" inputMode="tel"
              value={card.primary_doctor_phone}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('primary_doctor_phone', e.target.value)} />
            <Input label={locale === 'bg' ? 'Здравна каса' : 'Insurance Provider'}
              value={card.insurance_provider}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('insurance_provider', e.target.value)} />
            <Input label={locale === 'bg' ? 'Номер на осигуровка' : 'Insurance Number'}
              value={card.insurance_number}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('insurance_number', e.target.value)} />
          </div>

          <div className="mt-3">
            <Textarea label={locale === 'bg' ? 'Бележки' : 'Notes'}
              value={card.notes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('notes', e.target.value)} />
          </div>
        </Card>

        <div className="mt-4 flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setEditing(false)}>
            {locale === 'bg' ? 'Откажи' : 'Cancel'}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? '...' : (locale === 'bg' ? 'Запази' : 'Save')}
          </Button>
        </div>
      </PageContent>
    </PageShell>
  );
}
