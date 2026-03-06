'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { getTenant, updateTenant, getLeases, getRentPayments } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Alert, Spinner, Badge } from '../../components/ui';

interface Lease {
  id: number;
  tenant: number;
  property_name: string;
  start_date: string;
  end_date: string;
  monthly_rent: string;
  rent_frequency: string;
  status: string;
}

interface Payment {
  id: number;
  due_date: string;
  amount_due: string;
  amount_paid: string;
  status: string;
  payment_date: string | null;
  method: string | null;
}

export default function EditTenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { locale } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tenantLeases, setTenantLeases] = useState<Lease[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    id_number: '',
  });

  useEffect(() => {
    Promise.all([
      getTenant(Number(id)),
      getLeases(),
    ])
      .then(([data, allLeases]) => {
        setForm({
          full_name: data.full_name || '',
          phone: data.phone || '',
          email: data.email || '',
          id_number: data.id_number || '',
        });
        const tLeases = allLeases.filter((l: Lease & { tenant: number }) => l.tenant === Number(id));
        setTenantLeases(tLeases);

        if (tLeases.length > 0) {
          Promise.all(tLeases.map((l: Lease) => getRentPayments(l.id)))
            .then((results) => setPayments(results.flat()))
            .catch(() => {});
        }
      })
      .catch(() => router.push('/tenants'))
      .finally(() => setLoading(false));
  }, [id, router]);

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateTenant(Number(id), form);
      setSuccess(t('common.saved', locale));
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError(t('common.error', locale));
    } finally {
      setSaving(false);
    }
  };

  const fmt = (v: string | number) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { style: 'currency', currency: 'EUR' }).format(Number(v));

  const leaseStatusColor = (s: string) => {
    if (s === 'active') return 'green' as const;
    if (s === 'terminated') return 'red' as const;
    return 'yellow' as const;
  };

  const paymentStatusColor = (s: string) => {
    if (s === 'paid') return 'green' as const;
    if (s === 'overdue') return 'red' as const;
    return 'yellow' as const;
  };

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={t('tenants.edit', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/tenants')}
        />

        <Alert type="error" message={error} />
        <Alert type="success" message={success} />

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label={t('tenants.full_name', locale)} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required />
              <Input label={t('tenants.phone', locale)} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              <Input label={t('tenants.email', locale)} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              <Input label={t('tenants.id_number', locale)} value={form.id_number} onChange={(e) => set('id_number', e.target.value)} />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? '...' : t('common.save', locale)}
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.push('/tenants')}>
                {t('common.cancel', locale)}
              </Button>
            </div>
          </form>
        </Card>

        {/* Linked Leases */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">{t('tenants.leases', locale)}</h2>
            <Button variant="secondary" size="sm" onClick={() => router.push('/leases/new')}>
              + {t('leases.add', locale)}
            </Button>
          </div>
          {tenantLeases.length === 0 ? (
            <Card className="py-8 text-center">
              <p className="text-sm text-gray-500">{t('common.no_data', locale)}</p>
            </Card>
          ) : (
            <Card padding={false}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('leases.property', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('leases.rent_amount', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('leases.rent_frequency', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('leases.end_date', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('leases.status', locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tenantLeases.map((lease) => (
                    <tr
                      key={lease.id}
                      onClick={() => router.push(`/leases/${lease.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3 text-sm text-gray-900">{lease.property_name}</td>
                      <td className="px-5 py-3 text-sm text-gray-900 font-medium">{fmt(lease.monthly_rent)}</td>
                      <td className="px-5 py-3 hidden md:table-cell">
                        <Badge color="indigo">{t(`freq.${lease.rent_frequency}`, locale)}</Badge>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">{lease.end_date}</td>
                      <td className="px-5 py-3">
                        <Badge color={leaseStatusColor(lease.status)}>
                          {t(`leases.${lease.status}`, locale)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('tenants.payments', locale)}</h2>
            <Card padding={false}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('payments.due_date', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('payments.amount_due', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('payments.amount_paid', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('payments.status', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('payments.method', locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm text-gray-900">{p.due_date}</td>
                      <td className="px-5 py-3 text-sm text-gray-900">{fmt(p.amount_due)}</td>
                      <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">{fmt(p.amount_paid)}</td>
                      <td className="px-5 py-3">
                        <Badge color={paymentStatusColor(p.status)}>
                          {t(`payments.${p.status}`, locale)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">
                        {p.method ? t(`payments.${p.method}`, locale) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}
