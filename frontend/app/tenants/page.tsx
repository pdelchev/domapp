'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getTenants, deleteTenant } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Input, EmptyState, Spinner } from '../components/ui';

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

        {filtered.length === 0 ? (
          <EmptyState icon="🔑" message={t('common.no_data', locale)} />
        ) : (
          <Card padding={false}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('tenants.full_name', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('tenants.email', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('tenants.phone', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('tenants.property', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('tenants.status', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('common.actions', locale)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((tenant) => (
                  <tr
                    key={tenant.id}
                    onClick={() => router.push(`/tenants/${tenant.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3">
                      <span className="text-sm font-medium text-gray-900">{tenant.full_name}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">{tenant.email || '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">{tenant.phone || '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">
                      {tenant.active_property || <span className="text-gray-400">{t('tenants.no_lease', locale)}</span>}
                    </td>
                    <td className="px-5 py-3">
                      <Badge color={tenant.is_active ? 'green' : 'gray'}>
                        {tenant.is_active ? t('tenants.active', locale) : t('tenants.inactive', locale)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost" size="sm"
                          onClick={(e) => { e.stopPropagation(); router.push(`/tenants/${tenant.id}`); }}
                        >
                          {t('common.edit', locale)}
                        </Button>
                        <Button
                          variant="danger" size="sm"
                          onClick={(e) => { e.stopPropagation(); handleDelete(tenant.id); }}
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
