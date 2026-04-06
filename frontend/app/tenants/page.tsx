'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getTenants, deleteTenant } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Button, Badge, Input, Spinner, DataTable, DataColumn } from '../components/ui';

interface Tenant {
  id: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  active_property: string | null;
  active_lease_id: number | null;
}

export default function TenantsPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTenants()
      .then(setTenants)
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const handleDelete = async (id: number) => {
    if (!confirm(t('tenants.delete_confirm', locale))) return;
    await deleteTenant(id);
    setTenants((prev) => prev.filter((t) => t.id !== id));
  };

  const filtered = tenants.filter((tenant) =>
    tenant.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (tenant.email && tenant.email.toLowerCase().includes(search.toLowerCase())) ||
    (tenant.phone && tenant.phone.includes(search)) ||
    (tenant.active_property && tenant.active_property.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent>
        <PageHeader
          title={t('tenants.title', locale)}
          action={
            <Button onClick={() => router.push('/tenants/new')}>
              + {t('tenants.add', locale)}
            </Button>
          }
        />

        <div className="mb-5">
          <Input
            placeholder={t('common.search', locale)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        <DataTable<Tenant>
          columns={[
            { key: 'full_name', header: t('tenants.full_name', locale), primary: true, render: (row) => row.full_name },
            { key: 'email', header: t('tenants.email', locale), secondary: true, hideOnMobile: true, render: (row) => row.email || '—' },
            { key: 'phone', header: t('tenants.phone', locale), hideOnMobile: true, render: (row) => row.phone || '—' },
            { key: 'property', header: t('tenants.property', locale), render: (row) => row.active_property || <span className="text-gray-400">{t('tenants.no_lease', locale)}</span> },
            { key: 'status', header: t('tenants.status', locale), render: (row) => (
              <Badge color={row.is_active ? 'green' : 'gray'}>
                {row.is_active ? t('tenants.active', locale) : t('tenants.inactive', locale)}
              </Badge>
            )},
          ]}
          data={filtered}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => router.push(`/tenants/${row.id}`)}
          rowActions={(row) => (
            <>
              <Button
                variant="ghost" size="sm"
                onClick={() => router.push(`/tenants/${row.id}`)}
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
          emptyIcon="🔑"
          emptyMessage={t('common.no_data', locale)}
        />
      </PageContent>
    </PageShell>
  );
}
