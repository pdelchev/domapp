'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getRentPayments, updateRentPayment } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Select, Input, EmptyState, Spinner } from '../../components/ui';

interface Payment {
  id: number;
  lease: number;
  tenant_name: string;
  property_name: string;
  due_date: string;
  amount_due: string;
  amount_paid: string;
  payment_date: string | null;
  status: string;
  method: string | null;
}

export default function PaymentsPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<number | null>(null);
  const [markMethod, setMarkMethod] = useState('bank');
  const [markDate, setMarkDate] = useState('');

  useEffect(() => {
    getRentPayments()
      .then(setPayments)
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

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
      // silent fail
    }
  };

  const fmt = (v: string | number) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { style: 'currency', currency: 'EUR' }).format(Number(v));

  const statusColor = (s: string) => {
    if (s === 'paid') return 'green' as const;
    if (s === 'overdue') return 'red' as const;
    return 'yellow' as const;
  };

  const filtered = payments.filter((p) => {
    const matchesStatus = !statusFilter || p.status === statusFilter;
    const matchesSearch =
      !search ||
      p.tenant_name.toLowerCase().includes(search.toLowerCase()) ||
      p.property_name.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent>
        <PageHeader
          title={t('payments.title', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/finance')}
        />

        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <Input
            placeholder={t('common.search', locale)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="max-w-[180px]"
          >
            <option value="">{t('payments.all_statuses', locale)}</option>
            <option value="pending">{t('payments.pending', locale)}</option>
            <option value="paid">{t('payments.paid', locale)}</option>
            <option value="overdue">{t('payments.overdue', locale)}</option>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="💳" message={t('common.no_data', locale)} />
        ) : (
          <Card padding={false}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('payments.tenant', locale)}</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">{t('payments.property', locale)}</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('payments.due_date', locale)}</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('payments.amount_due', locale)}</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('payments.status', locale)}</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">{t('payments.method', locale)}</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => (
                  <tr key={p.id} className={p.status === 'overdue' ? 'bg-red-50/40' : ''}>
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-medium text-gray-900">{p.tenant_name}</span>
                      <p className="text-xs text-gray-400 sm:hidden">{p.property_name}</p>
                      <p className="text-xs text-gray-400 md:hidden">{p.due_date}</p>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-500 hidden sm:table-cell">{p.property_name}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-500 hidden md:table-cell">
                      {p.due_date}
                      {p.payment_date && p.status === 'paid' && (
                        <span className="block text-xs text-gray-400">{p.payment_date}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-gray-900 text-right">{fmt(p.amount_due)}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={statusColor(p.status)}>
                        {t(`payments.${p.status}`, locale)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-500 hidden lg:table-cell">
                      {p.method ? t(`payments.${p.method}`, locale) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {p.status !== 'paid' && markingId !== p.id && (
                        <Button variant="ghost" size="sm" onClick={() => openMarkPaid(p.id)}>
                          {t('payments.mark_paid', locale)}
                        </Button>
                      )}
                      {markingId === p.id && (
                        <div className="flex items-center gap-2 justify-end">
                          <input
                            type="date"
                            value={markDate}
                            onChange={(e) => setMarkDate(e.target.value)}
                            className="h-7 px-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <select
                            value={markMethod}
                            onChange={(e) => setMarkMethod(e.target.value)}
                            className="h-7 px-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="bank">{t('payments.bank', locale)}</option>
                            <option value="cash">{t('payments.cash', locale)}</option>
                            <option value="revolut">{t('payments.revolut', locale)}</option>
                          </select>
                          <Button size="sm" onClick={() => handleMarkPaid(p)}>OK</Button>
                          <Button variant="ghost" size="sm" onClick={() => setMarkingId(null)}>
                            {t('common.cancel', locale)}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </PageContent>
    </PageShell>
  );
}
