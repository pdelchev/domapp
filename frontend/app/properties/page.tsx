'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getProperties, deleteProperty, getOwners } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Input, Select, EmptyState, Spinner } from '../components/ui';

interface Property {
  id: number;
  name: string;
  city: string;
  address: string;
  property_type: string;
  owner: number;
  owner_name: string;
  current_value: number | null;
  square_meters: number | null;
  parent_property: number | null;
  parent_property_name: string | null;
}

interface Owner {
  id: number;
  full_name: string;
}

const TYPE_BADGE: Record<string, 'blue' | 'green' | 'yellow' | 'purple' | 'gray' | 'indigo'> = {
  apartment: 'blue',
  house: 'green',
  studio: 'yellow',
  commercial: 'purple',
  parking: 'gray',
  garage: 'gray',
  storage: 'indigo',
};

export default function PropertiesPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [properties, setProperties] = useState<Property[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [search, setSearch] = useState('');
  const [filterOwner, setFilterOwner] = useState('');
  const [filterType, setFilterType] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getProperties(), getOwners()])
      .then(([props, ownersList]) => { setProperties(props); setOwners(ownersList); })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const handleDelete = async (id: number) => {
    if (!confirm(t('properties.delete_confirm', locale))) return;
    await deleteProperty(id);
    setProperties((prev) => prev.filter((p) => p.id !== id));
  };

  const fmt = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(value);

  const filtered = properties.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.city.toLowerCase().includes(search.toLowerCase()) ||
      p.address.toLowerCase().includes(search.toLowerCase());
    const matchesOwner = !filterOwner || p.owner === Number(filterOwner);
    const matchesType = !filterType || p.property_type === filterType;
    return matchesSearch && matchesOwner && matchesType;
  });

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent>
        <PageHeader
          title={t('properties.title', locale)}
          action={
            <Button onClick={() => router.push('/properties/new')}>
              + {t('properties.add', locale)}
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <Input
            placeholder={t('common.search', locale)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)} className="w-auto min-w-[140px]">
            <option value="">{t('properties.owner', locale)}</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.full_name}</option>
            ))}
          </Select>
          <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-auto min-w-[140px]">
            <option value="">{t('properties.type', locale)}</option>
            <option value="apartment">{t('type.apartment', locale)}</option>
            <option value="house">{t('type.house', locale)}</option>
            <option value="studio">{t('type.studio', locale)}</option>
            <option value="commercial">{t('type.commercial', locale)}</option>
            <option value="parking">{t('type.parking', locale)}</option>
            <option value="garage">{t('type.garage', locale)}</option>
            <option value="storage">{t('type.storage', locale)}</option>
          </Select>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <EmptyState icon="🏠" message={t('common.no_data', locale)} />
        ) : (
          <Card padding={false}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('properties.name', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('properties.city', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">{t('properties.owner', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('properties.type', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right hidden md:table-cell">{t('properties.current_value', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('common.actions', locale)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((prop) => (
                  <tr
                    key={prop.id}
                    onClick={() => router.push(`/properties/${prop.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div>
                        <span className="text-sm font-medium text-gray-900">{prop.name}</span>
                        {prop.parent_property_name && (
                          <span className="ml-1.5 text-xs text-gray-400">
                            → {prop.parent_property_name}
                          </span>
                        )}
                        <p className="text-xs text-gray-500 md:hidden">{prop.city}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">{prop.city}</td>
                    <td className="px-5 py-3 text-sm text-gray-500 hidden lg:table-cell">{prop.owner_name}</td>
                    <td className="px-5 py-3">
                      <Badge color={TYPE_BADGE[prop.property_type] || 'gray'}>
                        {t(`type.${prop.property_type}`, locale)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-700 text-right font-medium hidden md:table-cell">
                      {prop.current_value ? fmt(prop.current_value) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); router.push(`/properties/${prop.id}/edit`); }}
                        >
                          {t('common.edit', locale)}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleDelete(prop.id); }}
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
