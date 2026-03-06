'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getLeases, deleteLease } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Input, Select, EmptyState, Spinner } from '../components/ui';

interface Lease {
  id: number;
  tenant_name: string;
  property_name: string;
  start_date: string;
  end_date: string;
  monthly_rent: string;
  rent_frequency: string;
  status: string;
  total_paid: number;
  total_due: number;
  overdue_count: number;
}

export default function LeasesPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [leases, setLeases] = useState<Lease[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [freqFilter, setFreqFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLeases()
      .then(setLeases)
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const handleDelete = async (id: number) => {
    if (!confirm(t('leases.delete_confirm', locale))) return;
    await deleteLease(id);
    setLeases((prev) => prev.filter((l) => l.id !== id));
  };

  const fmt = (v: string | number) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { style: 'currency', currency: 'EUR' }).format(Number(v));

  const statusColor = (s: string) => {
    if (s === 'active') return 'green' as const;
    if (s === 'terminated') return 'red' as const;
    return 'yellow' as const;
  };

  const freqLabel = (f: string) => t(`freq.${f}`, locale);

  const filtered = leases.filter((l) => {
    const matchesSearch =
      l.tenant_name.toLowerCase().includes(search.toLowerCase()) ||
      l.property_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || l.status === statusFilter;
    const matchesFreq = !freqFilter || l.rent_frequency === freqFilter;
    return matchesSearch && matchesStatus && matchesFreq;
  });

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent>
        <PageHeader
          title={t('leases.title', locale)}
          action={
            <Button onClick={() => router.push('/leases/new')}>
              + {t('leases.add', locale)}
            </Button>
          }
        />

        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <Input
            placeholder={t('common.search', locale)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-[160px]">
            <option value="">{t('leases.status', locale)}</option>
            <option value="active">{t('leases.active', locale)}</option>
            <option value="terminated">{t('leases.terminated', locale)}</option>
            <option value="expired">{t('leases.expired', locale)}</option>
          </Select>
          <Select value={freqFilter} onChange={(e) => setFreqFilter(e.target.value)} className="max-w-[180px]">
            <option value="">{t('leases.rent_frequency', locale)}</option>
            <option value="monthly">{t('freq.monthly', locale)}</option>
            <option value="weekly">{t('freq.weekly', locale)}</option>
            <option value="biweekly">{t('freq.biweekly', locale)}</option>
            <option value="one_time">{t('freq.one_time', locale)}</option>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="📄" message={t('common.no_data', locale)} />
        ) : (
          <Card padding={false}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('leases.tenant', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('leases.property', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('leases.rent_amount', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">{t('leases.rent_frequency', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">{t('leases.end_date', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('leases.status', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('common.actions', locale)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((lease) => (
                  <tr
                    key={lease.id}
                    onClick={() => router.push(`/leases/${lease.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3">
                      <span className="text-sm font-medium text-gray-900">{lease.tenant_name}</span>
                      <p className="text-xs text-gray-500 md:hidden">{lease.property_name}</p>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">{lease.property_name}</td>
                    <td className="px-5 py-3">
                      <span className="text-sm font-medium text-gray-900">{fmt(lease.monthly_rent)}</span>
                      {lease.overdue_count > 0 && (
                        <Badge color="red">{lease.overdue_count} overdue</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 hidden lg:table-cell">
                      <Badge color="indigo">{freqLabel(lease.rent_frequency)}</Badge>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 hidden lg:table-cell">{lease.end_date}</td>
                    <td className="px-5 py-3">
                      <Badge color={statusColor(lease.status)}>
                        {t(`leases.${lease.status}`, locale)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost" size="sm"
                          onClick={(e) => { e.stopPropagation(); router.push(`/leases/${lease.id}`); }}
                        >
                          {t('common.edit', locale)}
                        </Button>
                        <Button
                          variant="danger" size="sm"
                          onClick={(e) => { e.stopPropagation(); handleDelete(lease.id); }}
                        >
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
