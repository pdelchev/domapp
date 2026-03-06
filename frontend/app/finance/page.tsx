'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getFinanceSummary } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Spinner } from '../components/ui';

interface PropertyBreakdown {
  id: number;
  name: string;
  income: number;
  expenses: number;
  net: number;
}

interface FinanceSummary {
  total_income: number;
  total_expenses: number;
  net_income: number;
  month_income: number;
  month_expenses: number;
  month_net: number;
  pending_amount: number;
  overdue_amount: number;
  by_property: PropertyBreakdown[];
}

export default function FinancePage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFinanceSummary()
      .then(setData)
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const fmt = (v: number) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { style: 'currency', currency: 'EUR' }).format(v);

  if (loading || !data) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  const cards = [
    { label: t('finance.total_income', locale), value: fmt(data.total_income), color: 'text-green-600', bg: 'bg-green-50' },
    { label: t('finance.total_expenses', locale), value: fmt(data.total_expenses), color: 'text-red-600', bg: 'bg-red-50' },
    { label: t('finance.net_income', locale), value: fmt(data.net_income), color: data.net_income >= 0 ? 'text-green-600' : 'text-red-600', bg: data.net_income >= 0 ? 'bg-green-50' : 'bg-red-50' },
  ];

  const monthCards = [
    { label: t('finance.income', locale), value: fmt(data.month_income), color: 'text-green-600' },
    { label: t('finance.expenses', locale), value: fmt(data.month_expenses), color: 'text-red-600' },
    { label: t('finance.net', locale), value: fmt(data.month_net), color: data.month_net >= 0 ? 'text-green-600' : 'text-red-600' },
    { label: t('finance.pending', locale), value: fmt(data.pending_amount), color: 'text-yellow-600' },
    { label: t('finance.overdue', locale), value: fmt(data.overdue_amount), color: 'text-red-600' },
  ];

  return (
    <PageShell>
      <NavBar />
      <PageContent>
        <PageHeader
          title={t('finance.title', locale)}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => router.push('/finance/payments')}>
                {t('finance.view_payments', locale)}
              </Button>
              <Button variant="secondary" onClick={() => router.push('/finance/expenses')}>
                {t('finance.view_expenses', locale)}
              </Button>
            </div>
          }
        />

        {/* All-time totals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {cards.map((c) => (
            <Card key={c.label}>
              <div className={`rounded-lg p-1 inline-block mb-2`}>
                <p className="text-[13px] font-medium text-gray-500">{c.label}</p>
              </div>
              <p className={`text-2xl font-semibold ${c.color}`}>{c.value}</p>
            </Card>
          ))}
        </div>

        {/* This month */}
        <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('finance.this_month', locale)}</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {monthCards.map((c) => (
            <Card key={c.label}>
              <p className="text-[13px] font-medium text-gray-500 mb-1">{c.label}</p>
              <p className={`text-lg font-semibold ${c.color}`}>{c.value}</p>
            </Card>
          ))}
        </div>

        {/* Per property */}
        {data.by_property.length > 0 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('finance.by_property', locale)}</h2>
            <Card padding={false}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('tenants.property', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('finance.income', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('finance.expenses', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('finance.net', locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.by_property.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{p.name}</td>
                      <td className="px-5 py-3 text-sm text-green-600 text-right">{fmt(p.income)}</td>
                      <td className="px-5 py-3 text-sm text-red-600 text-right">{fmt(p.expenses)}</td>
                      <td className="px-5 py-3 text-right">
                        <Badge color={p.net >= 0 ? 'green' : 'red'}>{fmt(p.net)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </PageContent>
    </PageShell>
  );
}
