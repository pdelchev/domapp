'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getOwners, deleteOwner } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Button, Badge, Input, Spinner, DataTable, DataColumn } from '../components/ui';

interface Owner {
  id: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  properties_count: number;
}

export default function OwnersPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOwners()
      .then(setOwners)
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const handleDelete = async (id: number) => {
    if (!confirm(t('owners.delete_confirm', locale))) return;
    await deleteOwner(id);
    setOwners((prev) => prev.filter((o) => o.id !== id));
  };

  const filtered = owners.filter((o) =>
    o.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (o.email && o.email.toLowerCase().includes(search.toLowerCase())) ||
    (o.phone && o.phone.includes(search))
  );

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent>
        <PageHeader
          title={t('owners.title', locale)}
          action={
            <Button onClick={() => router.push('/owners/new')}>
              + {t('owners.add', locale)}
            </Button>
          }
        />

        {/* Search */}
        <div className="mb-5">
          <Input
            placeholder={t('common.search', locale)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {/* Table */}
        <DataTable<Owner>
          columns={[
            { key: 'full_name', header: t('owners.full_name', locale), primary: true, render: (row) => row.full_name },
            { key: 'email', header: t('owners.email', locale), hideOnMobile: true, render: (row) => row.email || '—' },
            { key: 'phone', header: t('owners.phone', locale), hideOnMobile: true, render: (row) => row.phone || '—' },
            { key: 'properties_count', header: t('owners.properties_count', locale), className: 'text-center', render: (row) => <Badge color="indigo">{row.properties_count}</Badge> },
          ]}
          data={filtered}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => router.push(`/owners/${row.id}`)}
          rowActions={(row) => (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/owners/${row.id}`)}
              >
                {t('common.edit', locale)}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(row.id)}
              >
                {t('common.delete', locale)}
              </Button>
            </>
          )}
          emptyIcon="👤"
          emptyMessage={t('common.no_data', locale)}
        />
      </PageContent>
    </PageShell>
  );
}
