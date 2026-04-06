'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getRentPayments, updateRentPayment } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Button, Badge, Select, Input, Spinner, DataTable, BottomSheet } from '../../components/ui';

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

        <DataTable<Payment>
          columns={[
            { key: 'tenant', header: t('payments.tenant', locale), primary: true, render: (p) => p.tenant_name },
            { key: 'property', header: t('payments.property', locale), secondary: true, hideOnMobile: true, render: (p) => p.property_name },
            { key: 'due_date', header: t('payments.due_date', locale), hideOnMobile: true, render: (p) => (
              <>{p.due_date}{p.payment_date && p.status === 'paid' && <span className="block text-xs text-gray-400">{p.payment_date}</span>}</>
            )},
            { key: 'amount', header: t('payments.amount_due', locale), className: 'text-right', render: (p) => (
              <span className="font-semibold">{fmt(p.amount_due)}</span>
            )},
            { key: 'status', header: t('payments.status', locale), render: (p) => (
              <Badge color={statusColor(p.status)}>{t(`payments.${p.status}`, locale)}</Badge>
            )},
            { key: 'method', header: t('payments.method', locale), hideOnMobile: true, render: (p) => p.method ? t(`payments.${p.method}`, locale) : '—' },
          ]}
          data={filtered}
          keyExtractor={(p) => p.id}
          rowActions={(p) => p.status !== 'paid' ? (
            <Button variant="ghost" size="sm" onClick={() => openMarkPaid(p.id)}>
              {t('payments.mark_paid', locale)}
            </Button>
          ) : null}
          emptyIcon="💳"
          emptyMessage={t('common.no_data', locale)}
        />

        {/* Mark paid bottom sheet (mobile + desktop) */}
        <BottomSheet
          open={markingId !== null}
          onClose={() => setMarkingId(null)}
          title={t('payments.mark_paid', locale)}
        >
          {markingId && (() => {
            const payment = payments.find(p => p.id === markingId);
            if (!payment) return null;
            return (
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-sm font-medium text-gray-900">{payment.tenant_name}</p>
                  <p className="text-xs text-gray-500">{payment.property_name}</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">{fmt(payment.amount_due)}</p>
                </div>
                <Input
                  label={t('payments.payment_date', locale)}
                  type="date"
                  value={markDate}
                  onChange={(e) => setMarkDate(e.target.value)}
                />
                <Select
                  label={t('payments.method', locale)}
                  value={markMethod}
                  onChange={(e) => setMarkMethod(e.target.value)}
                >
                  <option value="bank">{t('payments.bank', locale)}</option>
                  <option value="cash">{t('payments.cash', locale)}</option>
                  <option value="revolut">{t('payments.revolut', locale)}</option>
                </Select>
                <div className="flex gap-3 pt-2">
                  <Button className="flex-1" onClick={() => handleMarkPaid(payment)}>
                    {t('payments.mark_paid', locale)}
                  </Button>
                  <Button variant="secondary" className="flex-1" onClick={() => setMarkingId(null)}>
                    {t('common.cancel', locale)}
                  </Button>
                </div>
              </div>
            );
          })()}
        </BottomSheet>
      </PageContent>
    </PageShell>
  );
}
