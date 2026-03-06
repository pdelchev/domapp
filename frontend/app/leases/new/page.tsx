'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createLease, getProperties, getTenants, getUnits } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Select, Textarea, Alert, FormSection } from '../../components/ui';

interface Property { id: number; name: string; units?: { id: number; unit_number: string }[] }
interface Tenant { id: number; full_name: string; }
interface UnitItem { id: number; unit_number: string; }

export default function NewLeasePage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [propertyUnits, setPropertyUnits] = useState<UnitItem[]>([]);
  const [form, setForm] = useState({
    property: '',
    unit: '',
    tenant: '',
    start_date: '',
    end_date: '',
    monthly_rent: '',
    rent_frequency: 'monthly',
    rent_due_day: '1',
    deposit: '',
    auto_generate_payments: true,
    notes: '',
    electricity_meter_in: '',
    water_meter_in: '',
    gas_meter_in: '',
  });

  useEffect(() => {
    Promise.all([getProperties(), getTenants()])
      .then(([p, t]) => { setProperties(p); setTenants(t); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (form.property) {
      getUnits(Number(form.property)).then(setPropertyUnits).catch(() => setPropertyUnits([]));
    } else {
      setPropertyUnits([]);
    }
    set('unit', '');
  }, [form.property]);

  const set = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        property: Number(form.property),
        unit: form.unit ? Number(form.unit) : null,
        tenant: Number(form.tenant),
        start_date: form.start_date,
        end_date: form.end_date,
        monthly_rent: Number(form.monthly_rent),
        rent_frequency: form.rent_frequency,
        rent_due_day: Number(form.rent_due_day),
        deposit: form.deposit ? Number(form.deposit) : null,
        auto_generate_payments: form.auto_generate_payments,
        notes: form.notes || null,
        electricity_meter_in: form.electricity_meter_in ? Number(form.electricity_meter_in) : null,
        water_meter_in: form.water_meter_in ? Number(form.water_meter_in) : null,
        gas_meter_in: form.gas_meter_in ? Number(form.gas_meter_in) : null,
      };
      await createLease(payload);
      router.push('/leases');
    } catch {
      setError(t('common.error', locale));
    } finally {
      setSaving(false);
    }
  };

  const isRecurring = form.rent_frequency !== 'one_time';

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={t('leases.add', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/leases')}
        />

        <Alert type="error" message={error} />

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label={t('leases.property', locale)} value={form.property} onChange={(e) => set('property', e.target.value)} required>
                <option value="">{t('common.select', locale)}</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
              {propertyUnits.length > 0 && (
                <Select label={t('leases.unit', locale)} value={form.unit} onChange={(e) => set('unit', e.target.value)}>
                  <option value="">{t('leases.no_unit', locale)}</option>
                  {propertyUnits.map((u) => (
                    <option key={u.id} value={u.id}>{u.unit_number}</option>
                  ))}
                </Select>
              )}
              <Select label={t('leases.tenant', locale)} value={form.tenant} onChange={(e) => set('tenant', e.target.value)} required>
                <option value="">{t('common.select', locale)}</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </Select>
              <Input label={t('leases.start_date', locale)} type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} required />
              <Input label={t('leases.end_date', locale)} type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} required />
              <Input label={t('leases.rent_amount', locale)} type="number" value={form.monthly_rent} onChange={(e) => set('monthly_rent', e.target.value)} required />
              <Select label={t('leases.rent_frequency', locale)} value={form.rent_frequency} onChange={(e) => set('rent_frequency', e.target.value)} required>
                <option value="monthly">{t('freq.monthly', locale)}</option>
                <option value="weekly">{t('freq.weekly', locale)}</option>
                <option value="biweekly">{t('freq.biweekly', locale)}</option>
                <option value="one_time">{t('freq.one_time', locale)}</option>
              </Select>
              {form.rent_frequency === 'monthly' && (
                <Input label={t('leases.rent_due_day', locale)} type="number" value={form.rent_due_day} onChange={(e) => set('rent_due_day', e.target.value)} />
              )}
              <Input label={t('leases.deposit', locale)} type="number" value={form.deposit} onChange={(e) => set('deposit', e.target.value)} />
            </div>

            {isRecurring && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.auto_generate_payments}
                  onChange={(e) => set('auto_generate_payments', e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                {t('leases.auto_generate', locale)}
              </label>
            )}

            <Textarea label={t('leases.notes', locale)} value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
          </form>
        </Card>

        {/* Meter Readings — Move-in */}
        <Card className="mt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <span>⚡</span> {t('leases.meters', locale)} — {t('leases.move_in', locale)}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label={t('leases.electricity_meter', locale)} type="number" value={form.electricity_meter_in} onChange={(e) => set('electricity_meter_in', e.target.value)} placeholder="kWh" />
            <Input label={t('leases.water_meter', locale)} type="number" value={form.water_meter_in} onChange={(e) => set('water_meter_in', e.target.value)} placeholder="m³" />
            <Input label={t('leases.gas_meter', locale)} type="number" value={form.gas_meter_in} onChange={(e) => set('gas_meter_in', e.target.value)} placeholder="m³" />
          </div>
        </Card>

        <Card className="mt-4">
          <form onSubmit={handleSubmit}>
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? '...' : t('common.save', locale)}
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.push('/leases')}>
                {t('common.cancel', locale)}
              </Button>
            </div>
          </form>
        </Card>
      </PageContent>
    </PageShell>
  );
}
