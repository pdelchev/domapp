'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getProperties, deleteProperty, getOwners } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Button, Badge, Input, Select, Spinner, DataTable, DataColumn } from '../components/ui';

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

        {/* Property list — responsive cards on mobile, table on desktop */}
        <DataTable<Property>
          columns={[
            { key: 'name', header: t('properties.name', locale), primary: true, render: (p) => (
              <>{p.name}{p.parent_property_name && <span className="ml-1.5 text-xs text-gray-400">→ {p.parent_property_name}</span>}</>
            )},
            { key: 'city', header: t('properties.city', locale), secondary: true, render: (p) => p.city },
            { key: 'owner', header: t('properties.owner', locale), hideOnMobile: true, render: (p) => p.owner_name },
            { key: 'type', header: t('properties.type', locale), render: (p) => (
              <Badge color={TYPE_BADGE[p.property_type] || 'gray'}>{t(`type.${p.property_type}`, locale)}</Badge>
            )},
            { key: 'value', header: t('properties.current_value', locale), hideOnMobile: true, className: 'text-right', render: (p) => (
              <span className="font-medium">{p.current_value ? fmt(p.current_value) : '—'}</span>
            )},
          ]}
          data={filtered}
          keyExtractor={(p) => p.id}
          onRowClick={(p) => router.push(`/properties/${p.id}`)}
          rowActions={(p) => (
            <>
              <Button variant="ghost" size="sm" onClick={() => router.push(`/properties/${p.id}/edit`)}>
                {t('common.edit', locale)}
              </Button>
              <Button variant="danger" size="sm" onClick={() => handleDelete(p.id)}>
                {t('common.delete', locale)}
              </Button>
            </>
          )}
          emptyIcon="🏠"
          emptyMessage={t('common.no_data', locale)}
        />
      </PageContent>
    </PageShell>
  );
}
