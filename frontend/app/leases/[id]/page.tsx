'use client';

import React, { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { getLease, updateLease, getProperties, getTenants, getRentPayments, generateLeasePayments, updateRentPayment } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Select, Textarea, Alert, Spinner, Badge } from '../../components/ui';

interface Property { id: number; name: string; }
interface Tenant { id: number; full_name: string; }
interface Payment {
  id: number;
  due_date: string;
  amount_due: string;
  amount_paid: string;
  status: string;
  payment_date: string | null;
  method: string | null;
}

export default function EditLeasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { locale } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [markingId, setMarkingId] = useState<number | null>(null);
  const [markMethod, setMarkMethod] = useState('bank');
  const [markDate, setMarkDate] = useState('');
  const [form, setForm] = useState({
    property: '',
    tenant: '',
    start_date: '',
    end_date: '',
    monthly_rent: '',
    rent_frequency: 'monthly',
    rent_due_day: '1',
    deposit: '',
    status: 'active',
    auto_generate_payments: true,
    notes: '',
    electricity_meter_in: '',
    electricity_meter_out: '',
    water_meter_in: '',
    water_meter_out: '',
    gas_meter_in: '',
    gas_meter_out: '',
  });

  useEffect(() => {
    Promise.all([
      getLease(Number(id)),
      getProperties(),
      getTenants(),
      getRentPayments(Number(id)),
    ])
      .then(([data, props, allTenants, pmts]) => {
        setForm({
          property: String(data.property),
          tenant: String(data.tenant),
          start_date: data.start_date || '',
          end_date: data.end_date || '',
          monthly_rent: data.monthly_rent || '',
          rent_frequency: data.rent_frequency || 'monthly',
          rent_due_day: String(data.rent_due_day || 1),
          deposit: data.deposit || '',
          status: data.status || 'active',
          auto_generate_payments: data.auto_generate_payments ?? true,
          notes: data.notes || '',
          electricity_meter_in: data.electricity_meter_in ?? '',
          electricity_meter_out: data.electricity_meter_out ?? '',
          water_meter_in: data.water_meter_in ?? '',
          water_meter_out: data.water_meter_out ?? '',
          gas_meter_in: data.gas_meter_in ?? '',
          gas_meter_out: data.gas_meter_out ?? '',
        });
        setProperties(props);
        setTenants(allTenants);
        setPayments(pmts);
      })
      .catch(() => router.push('/leases'))
      .finally(() => setLoading(false));
  }, [id, router]);

  const set = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const filteredTenants = tenants;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        property: Number(form.property),
        tenant: Number(form.tenant),
        start_date: form.start_date,
        end_date: form.end_date,
        monthly_rent: Number(form.monthly_rent),
        rent_frequency: form.rent_frequency,
        rent_due_day: Number(form.rent_due_day),
        deposit: form.deposit ? Number(form.deposit) : null,
        status: form.status,
        auto_generate_payments: form.auto_generate_payments,
        notes: form.notes || null,
        electricity_meter_in: form.electricity_meter_in ? Number(form.electricity_meter_in) : null,
        electricity_meter_out: form.electricity_meter_out ? Number(form.electricity_meter_out) : null,
        water_meter_in: form.water_meter_in ? Number(form.water_meter_in) : null,
        water_meter_out: form.water_meter_out ? Number(form.water_meter_out) : null,
        gas_meter_in: form.gas_meter_in ? Number(form.gas_meter_in) : null,
        gas_meter_out: form.gas_meter_out ? Number(form.gas_meter_out) : null,
      };
      await updateLease(Number(id), payload);
      setSuccess(t('common.saved', locale));
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError(t('common.error', locale));
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePayments = async () => {
    try {
      const result = await generateLeasePayments(Number(id));
      setSuccess(`${result.payments_created} payments generated`);
      // Reload payments
      const pmts = await getRentPayments(Number(id));
      setPayments(pmts);
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError(t('common.error', locale));
    }
  };

  const openMarkPaid = (id: number) => {
    setMarkingId(id);
    setMarkMethod('bank');
    setMarkDate(new Date().toISOString().split('T')[0]);
  };

  const handleMarkPaid = async (payment: Payment) => {
    try {
      const updated = await updateRentPayment(payment.id, {
        status: 'paid',
        amount_paid: payment.amount_due,
        payment_date: markDate,
        method: markMethod,
      });
      setPayments((prev) => prev.map((p) => (p.id === payment.id ? { ...p, ...updated } : p)));
      setMarkingId(null);
    } catch {
      setError(t('common.error', locale));
    }
  };

  const fmt = (v: string | number) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { style: 'currency', currency: 'EUR' }).format(Number(v));

  const paymentStatusColor = (s: string) => {
    if (s === 'paid') return 'green' as const;
    if (s === 'overdue') return 'red' as const;
    return 'yellow' as const;
  };

  const isRecurring = form.rent_frequency !== 'one_time';

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={t('leases.edit', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/leases')}
        />

        <Alert type="error" message={error} />
        <Alert type="success" message={success} />

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label={t('leases.property', locale)} value={form.property} onChange={(e) => set('property', e.target.value)} required>
                <option value="">{t('common.select', locale)}</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
              <Select label={t('leases.tenant', locale)} value={form.tenant} onChange={(e) => set('tenant', e.target.value)} required>
                <option value="">{t('common.select', locale)}</option>
                {filteredTenants.map((tn) => (
                  <option key={tn.id} value={tn.id}>{tn.full_name}</option>
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
              <Select label={t('leases.status', locale)} value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="active">{t('leases.active', locale)}</option>
                <option value="terminated">{t('leases.terminated', locale)}</option>
                <option value="expired">{t('leases.expired', locale)}</option>
              </Select>
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

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? '...' : t('common.save', locale)}
              </Button>
              {isRecurring && form.status === 'active' && (
                <Button type="button" variant="secondary" onClick={handleGeneratePayments}>
                  {t('leases.generate_payments', locale)}
                </Button>
              )}
              <Button type="button" variant="secondary" onClick={() => router.push('/leases')}>
                {t('common.cancel', locale)}
              </Button>
            </div>
          </form>
        </Card>

        {/* Meter Readings */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <span>⚡</span> {t('leases.meters', locale)} — {t('leases.move_in', locale)}
            </h3>
            <div className="space-y-3">
              <Input label={t('leases.electricity_meter', locale)} type="number" value={form.electricity_meter_in} onChange={(e) => set('electricity_meter_in', e.target.value)} placeholder="kWh" />
              <Input label={t('leases.water_meter', locale)} type="number" value={form.water_meter_in} onChange={(e) => set('water_meter_in', e.target.value)} placeholder="m³" />
              <Input label={t('leases.gas_meter', locale)} type="number" value={form.gas_meter_in} onChange={(e) => set('gas_meter_in', e.target.value)} placeholder="m³" />
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <span>📦</span> {t('leases.meters', locale)} — {t('leases.move_out', locale)}
            </h3>
            <div className="space-y-3">
              <Input label={t('leases.electricity_meter', locale)} type="number" value={form.electricity_meter_out} onChange={(e) => set('electricity_meter_out', e.target.value)} placeholder="kWh" />
              <Input label={t('leases.water_meter', locale)} type="number" value={form.water_meter_out} onChange={(e) => set('water_meter_out', e.target.value)} placeholder="m³" />
              <Input label={t('leases.gas_meter', locale)} type="number" value={form.gas_meter_out} onChange={(e) => set('gas_meter_out', e.target.value)} placeholder="m³" />
            </div>
          </Card>
        </div>

        {/* Payments for this Lease */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('leases.payments', locale)}</h2>
          {payments.length === 0 ? (
            <Card className="py-8 text-center">
              <p className="text-sm text-gray-500">{t('common.no_data', locale)}</p>
            </Card>
          ) : (
            <Card padding={false}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('payments.due_date', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('payments.amount_due', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right hidden md:table-cell">{t('payments.amount_paid', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('payments.status', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('payments.method', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('common.actions', locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((p) => (
                    <React.Fragment key={p.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm text-gray-900">{p.due_date}</td>
                      <td className="px-5 py-3 text-sm text-gray-900 font-medium text-right">{fmt(p.amount_due)}</td>
                      <td className="px-5 py-3 text-sm text-gray-500 text-right hidden md:table-cell">{fmt(p.amount_paid)}</td>
                      <td className="px-5 py-3">
                        <Badge color={paymentStatusColor(p.status)}>
                          {t(`payments.${p.status}`, locale)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">
                        {p.method ? t(`payments.${p.method}`, locale) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {p.status !== 'paid' && (
                          <Button variant="primary" size="sm" onClick={() => openMarkPaid(p.id)}>
                            {t('payments.mark_paid', locale)}
                          </Button>
                        )}
                      </td>
                    </tr>
                    {markingId === p.id && (
                      <tr>
                        <td colSpan={6} className="px-5 py-3 bg-gray-50 border-t border-gray-100">
                          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                            <Input
                              label={t('payments.payment_date', locale)}
                              type="date"
                              value={markDate}
                              onChange={(e) => setMarkDate(e.target.value)}
                              className="max-w-[180px]"
                            />
                            <Select
                              label={t('payments.method', locale)}
                              value={markMethod}
                              onChange={(e) => setMarkMethod(e.target.value)}
                              className="max-w-[180px]"
                            >
                              <option value="bank">{t('payments.bank', locale)}</option>
                              <option value="cash">{t('payments.cash', locale)}</option>
                              <option value="revolut">{t('payments.revolut', locale)}</option>
                            </Select>
                            <div className="flex gap-2">
                              <Button variant="primary" onClick={() => handleMarkPaid(p)}>
                                {t('payments.confirm_paid', locale)}
                              </Button>
                              <Button variant="secondary" onClick={() => setMarkingId(null)}>
                                {t('common.cancel', locale)}
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </PageContent>
    </PageShell>
  );
}
