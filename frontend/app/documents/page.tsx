'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getComplianceSummary, getDocuments, getProperties } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Badge, Button, Spinner, Select } from '../components/ui';

interface ComplianceSummary {
  total: number;
  expired: number;
  expiring_soon: number;
  valid: number;
  no_expiry: number;
  by_property: { id: number; name: string; total: number; expired: number; expiring_soon: number }[];
  upcoming_expirations: {
    id: number;
    document_type: string;
    label: string;
    property_id: number;
    property_name: string;
    expiry_date: string;
    days_remaining: number;
  }[];
}

interface DocRecord {
  id: number;
  file: string;
  file_name: string | null;
  document_type: string;
  label: string;
  property: number;
  property_name: string;
  expiry_date: string | null;
  expiry_status: 'expired' | 'expiring_soon' | 'valid' | null;
  notes: string | null;
  file_size: number;
  uploaded_at: string;
}

interface PropertyItem { id: number; name: string }

export default function DocumentVaultPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [allDocs, setAllDocs] = useState<DocRecord[]>([]);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProperty, setFilterProperty] = useState('');
  const [filterExpiry, setFilterExpiry] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    Promise.all([
      getComplianceSummary(),
      getDocuments(),
      getProperties(),
    ])
      .then(([summaryData, docsData, propsData]) => {
        setSummary(summaryData);
        setAllDocs(docsData);
        setProperties(propsData);
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const fmt = (v: number) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { style: 'currency', currency: 'EUR' }).format(v);

  // Client-side filtering
  const filtered = allDocs.filter((doc) => {
    if (filterProperty && doc.property !== Number(filterProperty)) return false;
    if (filterExpiry === 'expired' && doc.expiry_status !== 'expired') return false;
    if (filterExpiry === 'expiring_soon' && doc.expiry_status !== 'expiring_soon') return false;
    if (filterExpiry === 'valid' && doc.expiry_status !== 'valid') return false;
    if (filterExpiry === 'no_expiry' && doc.expiry_date !== null) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match = (doc.label || '').toLowerCase().includes(q)
        || (doc.notes || '').toLowerCase().includes(q)
        || (doc.property_name || '').toLowerCase().includes(q)
        || doc.document_type.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const expiryBadgeColor = (status: string | null) => {
    if (status === 'expired') return 'red' as const;
    if (status === 'expiring_soon') return 'yellow' as const;
    if (status === 'valid') return 'green' as const;
    return 'gray' as const;
  };

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader title={t('docs.vault', locale)} />

        {/* Compliance Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Card className="!p-4">
              <p className="text-xs text-gray-500 mb-1">{t('docs.title', locale)}</p>
              <p className="text-xl font-bold text-gray-900">{summary.total}</p>
            </Card>
            <Card className="!p-4">
              <p className="text-xs text-gray-500 mb-1">{t('docs.expired', locale)}</p>
              <p className={`text-xl font-bold ${summary.expired > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {summary.expired}
              </p>
            </Card>
            <Card className="!p-4">
              <p className="text-xs text-gray-500 mb-1">{t('docs.expiring_soon', locale)}</p>
              <p className={`text-xl font-bold ${summary.expiring_soon > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                {summary.expiring_soon}
              </p>
            </Card>
            <Card className="!p-4">
              <p className="text-xs text-gray-500 mb-1">{t('docs.valid', locale)}</p>
              <p className="text-xl font-bold text-green-600">{summary.valid}</p>
            </Card>
          </div>
        )}

        {/* Upcoming Expirations */}
        {summary && summary.upcoming_expirations.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('docs.upcoming_expirations', locale)}</h3>
            <Card padding={false}>
              <div className="divide-y divide-gray-100">
                {summary.upcoming_expirations.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/properties/${item.property_id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{item.label || t(`docs.${item.document_type}`, locale)}</span>
                        <Badge color={item.days_remaining <= 7 ? 'red' : 'yellow'}>
                          {item.days_remaining} {t('docs.days_left', locale)}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{item.property_name} &middot; {item.expiry_date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Per-Property Compliance */}
        {summary && summary.by_property.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('docs.compliance', locale)}</h3>
            <Card padding={false}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('nav.properties', locale)}</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">{t('docs.title', locale)}</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">{t('docs.expired', locale)}</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">{t('docs.expiring_soon', locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {summary.by_property.map((prop) => (
                    <tr
                      key={prop.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/properties/${prop.id}`)}
                    >
                      <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{prop.name}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-500 text-center">{prop.total}</td>
                      <td className="px-4 py-2.5 text-center">
                        {prop.expired > 0 ? (
                          <Badge color="red">{prop.expired}</Badge>
                        ) : (
                          <span className="text-sm text-gray-300">0</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {prop.expiring_soon > 0 ? (
                          <Badge color="yellow">{prop.expiring_soon}</Badge>
                        ) : (
                          <span className="text-sm text-gray-300">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {/* All Documents — Searchable List */}
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-gray-900">{t('docs.title', locale)}</h3>
            <div className="flex-1" />
            <input
              type="text"
              placeholder={t('docs.search', locale)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
            />
            <Select
              value={filterProperty}
              onChange={(e) => setFilterProperty(e.target.value)}
              className="w-auto"
            >
              <option value="">{t('docs.all_properties', locale)}</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Select
              value={filterExpiry}
              onChange={(e) => setFilterExpiry(e.target.value)}
              className="w-auto"
            >
              <option value="">{t('notif.all', locale)}</option>
              <option value="expired">{t('docs.expired', locale)}</option>
              <option value="expiring_soon">{t('docs.expiring_soon', locale)}</option>
              <option value="valid">{t('docs.valid', locale)}</option>
              <option value="no_expiry">{t('docs.no_expiry', locale)}</option>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <Card className="py-8 text-center">
              <p className="text-sm text-gray-400">{t('docs.no_docs', locale)}</p>
            </Card>
          ) : (
            <Card padding={false}>
              <div className="divide-y divide-gray-100">
                {filtered.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                    {/* Type icon */}
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <span className="text-xs">📄</span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <a
                          href={doc.file}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-indigo-600 hover:text-indigo-700 truncate"
                        >
                          {doc.label || doc.file_name || 'Document'}
                        </a>
                        {doc.expiry_status && (
                          <Badge color={expiryBadgeColor(doc.expiry_status)}>
                            {t(`docs.${doc.expiry_status}`, locale)}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                        <span>{doc.property_name}</span>
                        <span>&middot;</span>
                        <span>{t(`docs.${doc.document_type}`, locale)}</span>
                        {doc.expiry_date && (
                          <>
                            <span>&middot;</span>
                            <span className={doc.expiry_status === 'expired' ? 'text-red-500' : ''}>
                              {doc.expiry_date}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </PageContent>
    </PageShell>
  );
}
