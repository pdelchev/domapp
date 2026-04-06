'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getLeases, deleteLease } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Button, Badge, Input, Select, Spinner, DataTable } from '../components/ui';

interface Lease {
  id: number;
  tenant_name: string;
  property_name: string;
  unit_name: string | null;
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

        <DataTable<Lease>
          columns={[
            {
              key: 'tenant',
              header: t('leases.tenant', locale),
              primary: true,
              render: (row) => row.tenant_name,
            },
            {
              key: 'property',
              header: t('leases.property', locale),
              secondary: true,
              hideOnMobile: true,
              render: (row) => (
                <>
                  {row.property_name}
                  {row.unit_name ? <span className="text-gray-400"> — {row.unit_name}</span> : ''}
                </>
              ),
            },
            {
              key: 'rent',
              header: t('leases.rent_amount', locale),
              render: (row) => (
                <>
                  <span className="font-medium text-gray-900">{fmt(row.monthly_rent)}</span>
                  {row.overdue_count > 0 && (
                    <> <Badge color="red">{row.overdue_count} overdue</Badge></>
                  )}
                </>
              ),
            },
            {
              key: 'frequency',
              header: t('leases.rent_frequency', locale),
              hideOnMobile: true,
              render: (row) => <Badge color="indigo">{freqLabel(row.rent_frequency)}</Badge>,
            },
            {
              key: 'end_date',
              header: t('leases.end_date', locale),
              hideOnMobile: true,
              render: (row) => row.end_date,
            },
            {
              key: 'status',
              header: t('leases.status', locale),
              render: (row) => (
                <Badge color={statusColor(row.status)}>
                  {t(`leases.${row.status}`, locale)}
                </Badge>
              ),
            },
          ]}
          data={filtered}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => router.push(`/leases/${row.id}`)}
          rowActions={(row) => (
            <>
              <Button
                variant="ghost" size="sm"
                onClick={() => router.push(`/leases/${row.id}`)}
              >
                {t('common.edit', locale)}
              </Button>
              <Button
                variant="danger" size="sm"
                onClick={() => handleDelete(row.id)}
              >
                {t('common.delete', locale)}
              </Button>
            </>
          )}
          emptyIcon="📄"
          emptyMessage={t('common.no_data', locale)}
        />
      </PageContent>
    </PageShell>
  );
}
