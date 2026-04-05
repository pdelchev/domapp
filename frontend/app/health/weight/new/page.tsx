'use client';
// §NAV: frontend weight entry form → POSTs to /api/health/weight/readings/
// §FIELDS: weight_kg required. Impedance + anthropometrics optional.

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../context/LanguageContext';
import { t } from '../../../lib/i18n';
import { getHealthProfiles, createWeightReading } from '../../../lib/api';
import NavBar from '../../../components/NavBar';
import {
  PageShell, PageContent, PageHeader, Card, Button, Input, Select,
  Textarea, Alert,
} from '../../../components/ui';

interface Profile { id: number; full_name: string; is_primary: boolean; }

export default function NewWeightReadingPage() {
  const { locale } = useLanguage();
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const nowISO = () => {
    const d = new Date(); d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);  // datetime-local format
  };

  const [form, setForm] = useState({
    profile: 0,
    measured_at: nowISO(),
    weight_kg: '',
    body_fat_pct: '',
    muscle_mass_kg: '',
    body_water_pct: '',
    visceral_fat_rating: '',
    waist_cm: '',
    hip_cm: '',
    notes: '',
  });
  const [ctxFlags, setCtxFlags] = useState<Record<string, boolean>>({
    fasted: true, post_toilet: true, post_workout: false, clothed: false, evening: false,
  });

  useEffect(() => {
    getHealthProfiles().then((ps: Profile[]) => {
      setProfiles(ps);
      const primary = ps.find(p => p.is_primary) || ps[0];
      if (primary) setForm(prev => ({ ...prev, profile: primary.id }));
    }).catch(e => setError(e.message));
  }, []);

  const toggleCtx = (k: string) => setCtxFlags(p => ({ ...p, [k]: !p[k] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        profile: form.profile,
        measured_at: new Date(form.measured_at).toISOString(),
        weight_kg: form.weight_kg,
        context_flags: ctxFlags,
        source: 'manual',
        notes: form.notes,
      };
      // include optional numeric fields only if filled
      for (const k of ['body_fat_pct', 'muscle_mass_kg', 'body_water_pct',
                       'visceral_fat_rating', 'waist_cm', 'hip_cm'] as const) {
        if (form[k]) payload[k] = form[k];
      }
      await createWeightReading(payload);
      router.push('/health/weight');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={t('weight.new_reading', locale)}
          onBack={() => router.push('/health/weight')}
        />
        <Alert type="error" message={error} />
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            {profiles.length > 1 && (
              <Select
                label={t('health.profile', locale)}
                value={form.profile}
                onChange={(e) => setForm(p => ({ ...p, profile: Number(e.target.value) }))}
                required
              >
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t('weight.measured_at', locale)} type="datetime-local"
                value={form.measured_at}
                onChange={e => setForm(p => ({ ...p, measured_at: e.target.value }))}
                required
              />
              <Input
                label={t('weight.kg', locale)} type="number" step="0.1" min="20" max="400"
                value={form.weight_kg}
                onChange={e => setForm(p => ({ ...p, weight_kg: e.target.value }))}
                required
              />
            </div>

            {/* ── Context chips ── */}
            <div>
              <div className="text-[13px] font-medium text-gray-700 mb-2">
                {t('weight.context', locale)}
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.keys(ctxFlags).map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleCtx(k)}
                    className={`px-3 h-10 rounded-lg border text-sm transition ${
                      ctxFlags[k]
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {t(`weight.ctx.${k}`, locale)}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Optional body composition ── */}
            <details className="border-t border-gray-200 pt-4">
              <summary className="text-[13px] font-medium text-gray-700 cursor-pointer">
                {t('weight.optional_body_comp', locale)}
              </summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <Input label={t('weight.body_fat', locale) + ' (%)'} type="number" step="0.1"
                       value={form.body_fat_pct}
                       onChange={e => setForm(p => ({ ...p, body_fat_pct: e.target.value }))} />
                <Input label={t('weight.muscle', locale) + ' (kg)'} type="number" step="0.1"
                       value={form.muscle_mass_kg}
                       onChange={e => setForm(p => ({ ...p, muscle_mass_kg: e.target.value }))} />
                <Input label={t('weight.water', locale) + ' (%)'} type="number" step="0.1"
                       value={form.body_water_pct}
                       onChange={e => setForm(p => ({ ...p, body_water_pct: e.target.value }))} />
                <Input label={t('weight.visceral', locale)} type="number"
                       value={form.visceral_fat_rating}
                       onChange={e => setForm(p => ({ ...p, visceral_fat_rating: e.target.value }))} />
                <Input label={t('weight.waist', locale) + ' (cm)'} type="number" step="0.1"
                       value={form.waist_cm}
                       onChange={e => setForm(p => ({ ...p, waist_cm: e.target.value }))} />
                <Input label={t('weight.hip', locale) + ' (cm)'} type="number" step="0.1"
                       value={form.hip_cm}
                       onChange={e => setForm(p => ({ ...p, hip_cm: e.target.value }))} />
              </div>
            </details>

            <Textarea
              label={t('common.notes', locale)}
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2}
            />

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving || !form.weight_kg}>
                {saving ? t('common.saving', locale) : t('common.save', locale)}
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.push('/health/weight')}>
                {t('common.cancel', locale)}
              </Button>
            </div>
          </form>
        </Card>
      </PageContent>
    </PageShell>
  );
}
