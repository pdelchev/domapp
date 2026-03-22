'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getInvestments, deleteInvestment, getProperties } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Select, EmptyState, Spinner } from '../components/ui';

interface Investment {
  id: number;
  property: number | null;
  property_name: string | null;
  title: string;
  description: string;
  investment_type: string;
  status: string;
  amount_invested: string;
  expected_return: string | null;
  actual_return: string | null;
  investment_date: string;
  completion_date: string | null;
  notes: string;
}

interface Property {
  id: number;
  name: string;
}

const TYPES = ['renovation', 'equipment', 'expansion', 'energy', 'land', 'furniture', 'security', 'stock', 'crypto', 'bond', 'mutual_fund', 'other'];
const STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'];

const STATUS_COLORS: Record<string, 'gray' | 'blue' | 'green' | 'red' | 'yellow' | 'indigo' | 'purple'> = {
  planned: 'blue',
  in_progress: 'yellow',
  completed: 'green',
  cancelled: 'red',
};

const TYPE_COLORS: Record<string, 'gray' | 'blue' | 'green' | 'red' | 'yellow' | 'indigo' | 'purple'> = {
  renovation: 'indigo',
  equipment: 'blue',
  expansion: 'purple',
  energy: 'green',
  land: 'yellow',
  furniture: 'gray',
  security: 'red',
  other: 'gray',
};

export default function InvestmentsPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getInvestments(), getProperties()])
      .then(([inv, props]) => { setInvestments(inv); setProperties(props); })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const handleDelete = async (id: number) => {
    if (!confirm(t('investments.delete_confirm', locale))) return;
    await deleteInvestment(id);
    setInvestments((prev) => prev.filter((i) => i.id !== id));
  };

  const fmt = (v: string | number) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { style: 'currency', currency: 'EUR' }).format(Number(v));

  const filtered = investments.filter((i) => {
    const matchesStatus = !statusFilter || i.status === statusFilter;
    const matchesType = !typeFilter || i.investment_type === typeFilter;
    const matchesProp = !propertyFilter || String(i.property) === propertyFilter;
    return matchesStatus && matchesType && matchesProp;
  });

  // Summary cards
  const totalInvested = investments.reduce((sum, i) => sum + Number(i.amount_invested), 0);
  const totalReturn = investments
    .filter((i) => i.actual_return)
    .reduce((sum, i) => sum + Number(i.actual_return), 0);
  const activeCount = investments.filter((i) => i.status === 'in_progress' || i.status === 'planned').length;
  const completedCount = investments.filter((i) => i.status === 'completed').length;

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('investments.title', locale)}
          action={
            <Button onClick={() => router.push('/investments/new')}>+ {t('investments.add', locale)}</Button>
          }
        />

        {/* Summary Cards */}
        {investments.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <p className="text-[13px] font-medium text-gray-500">{t('investments.total_invested', locale)}</p>
              <p className="text-xl font-semibold text-gray-900 mt-1">{fmt(totalInvested)}</p>
            </Card>
            <Card>
              <p className="text-[13px] font-medium text-gray-500">{t('investments.total_return', locale)}</p>
              <p className="text-xl font-semibold text-green-600 mt-1">{fmt(totalReturn)}</p>
            </Card>
            <Card>
              <p className="text-[13px] font-medium text-gray-500">{t('investments.roi', locale)}</p>
              <p className="text-xl font-semibold text-gray-900 mt-1">
                {totalInvested > 0 ? `${((totalReturn / totalInvested) * 100).toFixed(1)}%` : '—'}
              </p>
            </Card>
            <Card>
              <p className="text-[13px] font-medium text-gray-500">
                {t('investments.planned', locale)} / {t('investments.completed', locale)}
              </p>
              <p className="text-xl font-semibold text-gray-900 mt-1">{activeCount} / {completedCount}</p>
            </Card>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <Select
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            className="max-w-[200px]"
          >
            <option value="">{t('investments.property', locale)}</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="max-w-[200px]"
          >
            <option value="">{t('investments.all_types', locale)}</option>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>{t(`investments.${ty}`, locale)}</option>
            ))}
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="max-w-[200px]"
          >
            <option value="">{t('investments.all_statuses', locale)}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{t(`investments.${s}`, locale)}</option>
            ))}
          </Select>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <EmptyState icon="📈" message={t('investments.no_investments', locale)} />
        ) : (
          <Card padding={false}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('investments.investment_title', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('investments.type', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">{t('investments.property', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('investments.status', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('investments.amount_invested', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right hidden md:table-cell">{t('investments.expected_return', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">{t('investments.investment_date', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('common.actions', locale)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/investments/${inv.id}`)}>
                    <td className="px-5 py-3">
                      <span className="text-sm font-medium text-gray-900">{inv.title}</span>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      <Badge color={TYPE_COLORS[inv.investment_type] || 'gray'}>{t(`investments.${inv.investment_type}`, locale)}</Badge>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 hidden lg:table-cell">
                      {inv.property_name || t('investments.no_property', locale)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge color={STATUS_COLORS[inv.status] || 'gray'}>{t(`investments.${inv.status}`, locale)}</Badge>
                    </td>
                    <td className="px-5 py-3 text-sm font-medium text-gray-900 text-right">{fmt(inv.amount_invested)}</td>
                    <td className="px-5 py-3 text-sm text-gray-500 text-right hidden md:table-cell">
                      {inv.expected_return ? fmt(inv.expected_return) : '—'}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 hidden lg:table-cell">{inv.investment_date}</td>
                    <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/investments/${inv.id}`)}>
                          {t('common.edit', locale)}
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => handleDelete(inv.id)}>
                          {t('common.delete', locale)}
                        </Button>
                      </div>
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
