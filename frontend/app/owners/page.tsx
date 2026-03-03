'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getOwners, deleteOwner } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Input, EmptyState, Spinner } from '../components/ui';

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
        {filtered.length === 0 ? (
          <EmptyState icon="👤" message={t('common.no_data', locale)} />
        ) : (
          <Card padding={false}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('owners.full_name', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('owners.email', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('owners.phone', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">{t('owners.properties_count', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('common.actions', locale)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((owner) => (
                  <tr
                    key={owner.id}
                    onClick={() => router.push(`/owners/${owner.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3">
                      <span className="text-sm font-medium text-gray-900">{owner.full_name}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">{owner.email || '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">{owner.phone || '—'}</td>
                    <td className="px-5 py-3 text-center">
                      <Badge color="indigo">{owner.properties_count}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); router.push(`/owners/${owner.id}`); }}
                        >
                          {t('common.edit', locale)}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleDelete(owner.id); }}
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
