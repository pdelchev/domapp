'use client';

/**
 * §PAGE: Symptom Tracker
 * §ROUTE: /health/symptoms
 * §PURPOSE: Event-based symptom log + hypothesis-generating correlations
 *           with supplements, sleep, stress, hydration, mood, fasting.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import {
  getSymptoms, createSymptom, deleteSymptom, getSymptomCorrelations, getHealthProfiles,
} from '../../lib/api';
import NavBar from '../../components/NavBar';
import {
  PageShell, PageContent, PageHeader, Card, Button, Badge, Alert, Spinner, EmptyState,
  Input, Select, Textarea,
} from '../../components/ui';

interface SymptomRow {
  id: number;
  profile: number;
  category: string;
  category_display: string;
  severity: number;
  occurred_at: string;
  duration_minutes: number | null;
  body_location: string;
  triggers: string[];
  notes: string;
}

interface TriggerFinding {
  trigger_type: string;
  trigger_id: number | null;
  trigger_label: string;
  trigger_key: string;
  days_with_symptom_when_present: number;
  days_when_present: number;
  days_with_symptom_when_absent: number;
  days_when_absent: number;
  present_rate: number;
  absent_rate: number;
  lift: number;
}

interface CategoryAnalysis {
  occurrences: number;
  days_with_symptom: number;
  window_days: number;
  top_triggers: TriggerFinding[];
}

interface Correlations {
  window_days: number;
  total_symptoms: number;
  by_category: Record<string, CategoryAnalysis>;
}

const CATEGORIES: { value: string; en: string; bg: string; icon: string }[] = [
  { value: 'headache', en: 'Headache', bg: 'Главоболие', icon: '🤕' },
  { value: 'migraine', en: 'Migraine', bg: 'Мигрена', icon: '🧠' },
  { value: 'fatigue', en: 'Fatigue', bg: 'Умора', icon: '😴' },
  { value: 'nausea', en: 'Nausea', bg: 'Гадене', icon: '🤢' },
  { value: 'dizziness', en: 'Dizziness', bg: 'Замайване', icon: '💫' },
  { value: 'insomnia', en: 'Insomnia', bg: 'Безсъние', icon: '🌙' },
  { value: 'joint_pain', en: 'Joint Pain', bg: 'Болки в ставите', icon: '🦴' },
  { value: 'muscle_pain', en: 'Muscle Pain', bg: 'Мускулна болка', icon: '💪' },
  { value: 'back_pain', en: 'Back Pain', bg: 'Болки в гърба', icon: '🫠' },
  { value: 'digestive', en: 'Digestive Upset', bg: 'Храносмилане', icon: '🍽️' },
  { value: 'bloating', en: 'Bloating', bg: 'Подуване', icon: '🎈' },
  { value: 'skin', en: 'Skin Reaction', bg: 'Кожна реакция', icon: '🧴' },
  { value: 'allergy', en: 'Allergy', bg: 'Алергия', icon: '🤧' },
  { value: 'mood_low', en: 'Low Mood', bg: 'Ниско настроение', icon: '😔' },
  { value: 'anxiety', en: 'Anxiety', bg: 'Тревожност', icon: '😰' },
  { value: 'heart_palpitations', en: 'Palpitations', bg: 'Сърцебиене', icon: '💓' },
  { value: 'shortness_of_breath', en: 'Short of Breath', bg: 'Задух', icon: '🫁' },
  { value: 'brain_fog', en: 'Brain Fog', bg: 'Мъгла в главата', icon: '🌫️' },
  { value: 'other', en: 'Other', bg: 'Друго', icon: '❓' },
];

const CAT_INDEX: Record<string, { en: string; bg: string; icon: string }> = Object.fromEntries(
  CATEGORIES.map(c => [c.value, { en: c.en, bg: c.bg, icon: c.icon }])
);

function severityColor(s: number) {
  if (s >= 8) return 'bg-red-100 text-red-800 border-red-200';
  if (s >= 5) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-emerald-100 text-emerald-800 border-emerald-200';
}

function timeAgo(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return locale === 'bg' ? 'току-що' : 'just now';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return locale === 'bg' ? `преди ${min} мин` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return locale === 'bg' ? `преди ${hr} ч` : `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return locale === 'bg' ? `преди ${day} дни` : `${day}d ago`;
}

export default function SymptomTrackerPage() {
  const { locale } = useLanguage();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [symptoms, setSymptoms] = useState<SymptomRow[]>([]);
  const [correlations, setCorrelations] = useState<Correlations | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');

  const loadAll = useCallback(async (pid: number | null) => {
    setLoading(true);
    try {
      const params = pid ? { profile: pid, days: 90 } : { days: 90 };
      const [syms, corr] = await Promise.all([
        getSymptoms(params),
        getSymptomCorrelations(params).catch(() => null),
      ]);
      setSymptoms(syms);
      setCorrelations(corr);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const profiles = await getHealthProfiles();
        const primary = profiles.find((p: { is_primary: boolean }) => p.is_primary) || profiles[0];
        if (primary) {
          setProfileId(primary.id);
          await loadAll(primary.id);
        } else {
          setLoading(false);
        }
      } catch { router.push('/login'); }
    })();
  }, [loadAll, router]);

  const handleDelete = async (id: number) => {
    try {
      await deleteSymptom(id);
      setSymptoms(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const filtered = filterCategory
    ? symptoms.filter(s => s.category === filterCategory)
    : symptoms;

  // Group by day
  const grouped: Record<string, SymptomRow[]> = {};
  for (const s of filtered) {
    const day = new Date(s.occurred_at).toISOString().slice(0, 10);
    (grouped[day] = grouped[day] || []).push(s);
  }
  const groupedDays = Object.keys(grouped).sort().reverse();

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={locale === 'bg' ? 'Симптоми' : 'Symptoms'}
          onBack={() => router.push('/health')}
          action={
            <Button onClick={() => setShowAddModal(true)}>
              + {locale === 'bg' ? 'Нов симптом' : 'Log Symptom'}
            </Button>
          }
        />

        <Alert type="error" message={error} />

        {loading ? (
          <Spinner />
        ) : (
          <div className="space-y-6">
            {/* ─── Correlation insights ─── */}
            {correlations && Object.keys(correlations.by_category).length > 0 && (
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                      🔬 {locale === 'bg' ? 'Потенциални връзки' : 'Potential Correlations'}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {locale === 'bg'
                        ? `Анализ на последните ${correlations.window_days} дни · ${correlations.total_symptoms} записа`
                        : `Analysis of the last ${correlations.window_days} days · ${correlations.total_symptoms} entries`}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4 text-[11px] text-amber-800 leading-snug">
                  ⚠️ {locale === 'bg'
                    ? 'Това са статистически връзки, НЕ причинно-следствени. Използвай ги като хипотези за обсъждане с лекар.'
                    : 'These are statistical patterns, NOT proof of causation. Treat as hypotheses worth discussing with a clinician.'}
                </div>

                <div className="space-y-4">
                  {Object.entries(correlations.by_category).map(([cat, info]) => {
                    const meta = CAT_INDEX[cat] || { en: cat, bg: cat, icon: '❓' };
                    return (
                      <div key={cat}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl">{meta.icon}</span>
                          <span className="font-semibold text-sm text-gray-900">
                            {locale === 'bg' ? meta.bg : meta.en}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            · {info.days_with_symptom} {locale === 'bg' ? 'дни' : 'days'}
                          </span>
                        </div>
                        {info.top_triggers.length === 0 ? (
                          <p className="text-xs text-gray-500 pl-7">
                            {locale === 'bg'
                              ? 'Няма достатъчно силни връзки в данните.'
                              : 'No strong patterns detected in your data.'}
                          </p>
                        ) : (
                          <div className="space-y-2 pl-7">
                            {info.top_triggers.map(t => (
                              <div
                                key={t.trigger_key}
                                className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-sm text-gray-900 truncate">
                                        {t.trigger_label}
                                      </span>
                                      <Badge color={t.trigger_type === 'supplement' ? 'indigo' : 'blue'}>
                                        {t.trigger_type}
                                      </Badge>
                                    </div>
                                    <p className="text-[11px] text-gray-600 mt-1">
                                      {locale === 'bg'
                                        ? `Симптомът се появява в ${Math.round(t.present_rate * 100)}% от дните с този фактор, срещу ${Math.round(t.absent_rate * 100)}% без него.`
                                        : `Symptom appears on ${Math.round(t.present_rate * 100)}% of days with this factor, vs ${Math.round(t.absent_rate * 100)}% without.`}
                                    </p>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <div className="text-xl font-bold text-indigo-600 tabular-nums">
                                      +{Math.round(t.lift * 100)}%
                                    </div>
                                    <div className="text-[9px] text-gray-500 uppercase">
                                      {locale === 'bg' ? 'повече' : 'lift'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* ─── Filter pills ─── */}
            {symptoms.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilterCategory('')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    !filterCategory ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {locale === 'bg' ? 'Всички' : 'All'} ({symptoms.length})
                </button>
                {Array.from(new Set(symptoms.map(s => s.category))).map(cat => {
                  const meta = CAT_INDEX[cat] || { en: cat, bg: cat, icon: '' };
                  const count = symptoms.filter(s => s.category === cat).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => setFilterCategory(cat)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 transition-colors ${
                        filterCategory === cat ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      <span>{meta.icon}</span>
                      {locale === 'bg' ? meta.bg : meta.en} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* ─── Symptom log list ─── */}
            {filtered.length === 0 ? (
              <EmptyState
                icon="🩺"
                message={
                  locale === 'bg'
                    ? 'Още няма записани симптоми. Започни да записваш, за да видиш връзки.'
                    : 'No symptoms logged yet. Start tracking to surface correlations.'
                }
              />
            ) : (
              <div className="space-y-4">
                {groupedDays.map(day => (
                  <div key={day}>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                      {new Date(day).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-US', {
                        weekday: 'long', year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </h3>
                    <div className="space-y-2">
                      {grouped[day].map(s => {
                        const meta = CAT_INDEX[s.category] || { en: s.category, bg: s.category, icon: '❓' };
                        return (
                          <Card key={s.id} className="py-3">
                            <div className="flex items-start gap-3">
                              <div className="text-2xl flex-shrink-0">{meta.icon}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-gray-900 text-sm">
                                    {locale === 'bg' ? meta.bg : meta.en}
                                  </span>
                                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${severityColor(s.severity)}`}>
                                    {s.severity}/10
                                  </span>
                                  <span className="text-[11px] text-gray-400">
                                    {timeAgo(s.occurred_at, locale)}
                                  </span>
                                </div>
                                {s.body_location && (
                                  <p className="text-xs text-gray-600 mt-0.5">📍 {s.body_location}</p>
                                )}
                                {s.duration_minutes && (
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    ⏱️ {s.duration_minutes} {locale === 'bg' ? 'мин' : 'min'}
                                  </p>
                                )}
                                {s.notes && (
                                  <p className="text-sm text-gray-700 mt-1">{s.notes}</p>
                                )}
                                {s.triggers.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {s.triggers.map((t, i) => (
                                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDelete(s.id)}
                              >
                                ×
                              </Button>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showAddModal && profileId && (
          <AddSymptomModal
            profileId={profileId}
            onClose={() => setShowAddModal(false)}
            onSaved={() => { setShowAddModal(false); loadAll(profileId); }}
          />
        )}
      </PageContent>
    </PageShell>
  );
}

// ─── Add Modal ────────────────────────────────────────────────

function AddSymptomModal({
  profileId, onClose, onSaved,
}: {
  profileId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locale } = useLanguage();
  const [form, setForm] = useState({
    category: 'headache',
    severity: 5,
    duration_minutes: '',
    body_location: '',
    notes: '',
    triggers_text: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const triggers = form.triggers_text
        .split(',')
        .map(x => x.trim())
        .filter(Boolean);
      await createSymptom({
        profile: profileId,
        category: form.category,
        severity: form.severity,
        occurred_at: new Date().toISOString(),
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
        body_location: form.body_location,
        notes: form.notes,
        triggers,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">
            {locale === 'bg' ? 'Нов симптом' : 'Log Symptom'}
          </h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">&times;</button>
        </div>

        <Alert type="error" message={error} />

        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label={locale === 'bg' ? 'Категория' : 'Category'}
            value={form.category}
            onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
          >
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>
                {c.icon} {locale === 'bg' ? c.bg : c.en}
              </option>
            ))}
          </Select>

          <div>
            <label className="text-[13px] font-medium text-gray-700 mb-2 block">
              {locale === 'bg' ? 'Сила' : 'Severity'} ({form.severity}/10)
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={form.severity}
              onChange={e => setForm(prev => ({ ...prev, severity: parseInt(e.target.value) }))}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>{locale === 'bg' ? 'Леко' : 'Mild'}</span>
              <span>{locale === 'bg' ? 'Умерено' : 'Moderate'}</span>
              <span>{locale === 'bg' ? 'Силно' : 'Severe'}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={locale === 'bg' ? 'Продължителност (мин)' : 'Duration (min)'}
              type="number"
              inputMode="numeric"
              value={form.duration_minutes}
              onChange={e => setForm(prev => ({ ...prev, duration_minutes: e.target.value }))}
              placeholder="30"
            />
            <Input
              label={locale === 'bg' ? 'Място' : 'Body Location'}
              value={form.body_location}
              onChange={e => setForm(prev => ({ ...prev, body_location: e.target.value }))}
              placeholder={locale === 'bg' ? 'дясно слепоочие' : 'right temple'}
            />
          </div>

          <Textarea
            label={locale === 'bg' ? 'Бележки' : 'Notes'}
            value={form.notes}
            onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            rows={3}
          />

          <Input
            label={locale === 'bg' ? 'Предполагаеми тригери (разделени със запетаи)' : 'Suspected triggers (comma separated)'}
            value={form.triggers_text}
            onChange={e => setForm(prev => ({ ...prev, triggers_text: e.target.value }))}
            placeholder={locale === 'bg' ? 'стрес, малко сън' : 'stress, skipped meal'}
          />

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={onClose} className="flex-1">
              {locale === 'bg' ? 'Отказ' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" disabled={saving} className="flex-1">
              {saving ? '…' : locale === 'bg' ? 'Запиши' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
