'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { createVehicle, createVehiclePresets, getProperties } from '../../lib/api';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Select, Textarea, Alert } from '../../components/ui';

const FUEL_OPTIONS = [
  { value: '', label: '—' },
  { value: 'petrol', labelKey: 'fuel.petrol' },
  { value: 'diesel', labelKey: 'fuel.diesel' },
  { value: 'lpg', labelKey: 'fuel.lpg' },
  { value: 'electric', labelKey: 'fuel.electric' },
  { value: 'hybrid', labelKey: 'fuel.hybrid' },
  { value: 'plugin_hybrid', labelKey: 'fuel.plugin_hybrid' },
  { value: 'cng', labelKey: 'fuel.cng' },
];

export default function NewVehiclePage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [properties, setProperties] = useState<Array<{ id: number; name: string }>>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [addPresets, setAddPresets] = useState(true);

  const [form, setForm] = useState({
    plate_number: '',
    make: '',
    model: '',
    year: '',
    color: '',
    fuel_type: '',
    vin: '',
    engine_cc: '',
    first_registration_date: '',
    linked_property: '',
    notes: '',
  });

  useEffect(() => {
    getProperties().then(setProperties).catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data: Record<string, unknown> = {
        plate_number: form.plate_number.toUpperCase().trim(),
        make: form.make.trim(),
        model: form.model.trim(),
        color: form.color.trim(),
        fuel_type: form.fuel_type || undefined,
        vin: form.vin.trim() || undefined,
        notes: form.notes,
      };
      if (form.year) data.year = parseInt(form.year);
      if (form.engine_cc) data.engine_cc = parseInt(form.engine_cc);
      if (form.first_registration_date) data.first_registration_date = form.first_registration_date;
      if (form.linked_property) data.linked_property = parseInt(form.linked_property);

      const vehicle = await createVehicle(data);

      // Auto-add Bulgarian presets if checked
      if (addPresets) {
        await createVehiclePresets(vehicle.id);
      }

      router.push(`/vehicles/${vehicle.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create vehicle';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader title={t('vehicles.add', locale)} onBack={() => router.push('/vehicles')} />
        <Alert type="error" message={error} />

        <form onSubmit={handleSubmit}>
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t('vehicles.plate', locale)}
                name="plate_number"
                value={form.plate_number}
                onChange={handleChange}
                placeholder="CB1234AB"
                required
              />
              <Input
                label={t('vehicles.make', locale)}
                name="make"
                value={form.make}
                onChange={handleChange}
                placeholder="Toyota"
                required
              />
              <Input
                label={t('vehicles.model', locale)}
                name="model"
                value={form.model}
                onChange={handleChange}
                placeholder="Corolla"
                required
              />
              <Input
                label={t('vehicles.year', locale)}
                name="year"
                type="number"
                value={form.year}
                onChange={handleChange}
                placeholder="2020"
              />
              <Input
                label={t('vehicles.color', locale)}
                name="color"
                value={form.color}
                onChange={handleChange}
              />
              <Select
                label={t('vehicles.fuel', locale)}
                name="fuel_type"
                value={form.fuel_type}
                onChange={handleChange}
              >
                {FUEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.labelKey ? t(o.labelKey, locale) : o.label}
                  </option>
                ))}
              </Select>
              <Input
                label={t('vehicles.vin', locale)}
                name="vin"
                value={form.vin}
                onChange={handleChange}
                placeholder="WVWZZZ3CZWE123456"
              />
              <Input
                label={t('vehicles.engine_cc', locale)}
                name="engine_cc"
                type="number"
                value={form.engine_cc}
                onChange={handleChange}
                placeholder="1600"
              />
              <Input
                label={t('vehicles.first_reg', locale)}
                name="first_registration_date"
                type="date"
                value={form.first_registration_date}
                onChange={handleChange}
              />
              <Select
                label={t('vehicles.property', locale)}
                name="linked_property"
                value={form.linked_property}
                onChange={handleChange}
              >
                <option value="">—</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>

            <div className="mt-4">
              <Textarea
                label={t('vehicles.notes', locale)}
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={3}
              />
            </div>

            {/* BG Presets toggle */}
            <div className="mt-4 flex items-center gap-3">
              <input
                type="checkbox"
                id="presets"
                checked={addPresets}
                onChange={(e) => setAddPresets(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="presets" className="text-sm text-gray-700">
                {t('vehicles.add_presets', locale)}
              </label>
            </div>
          </Card>

          <div className="flex gap-3 mt-4">
            <Button type="submit" disabled={saving}>
              {saving ? '...' : t('common.save', locale)}
            </Button>
            <Button variant="secondary" type="button" onClick={() => router.push('/vehicles')}>
              {t('common.cancel', locale)}
            </Button>
          </div>
        </form>
      </PageContent>
    </PageShell>
  );
}
