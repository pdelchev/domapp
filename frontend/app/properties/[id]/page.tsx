'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { getProperty, getLeases, getDocuments, uploadDocument, deleteDocument, getSmartFolders } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Input, Select, FormSection, Spinner, Alert } from '../../components/ui';

interface PropertyData {
  id: number;
  name: string;
  owner_name: string;
  address: string;
  city: string;
  country: string;
  property_type: string;
  cadastral_number: string | null;
  square_meters: number | null;
  purchase_price: number | null;
  purchase_date: string | null;
  current_value: number | null;
  price_per_sqm: number | null;
  mortgage_provider: string | null;
  mortgage_account_number: string | null;
  mortgage_monthly_payment: number | null;
  electricity_provider: string | null;
  electricity_account_number: string | null;
  water_provider: string | null;
  water_account_number: string | null;
  gas_provider: string | null;
  gas_account_number: string | null;
  heating_provider: string | null;
  heating_account_number: string | null;
  internet_provider: string | null;
  internet_account_number: string | null;
  insurance_provider: string | null;
  insurance_policy_number: string | null;
  annual_insurance_cost: number | null;
  building_management_provider: string | null;
  building_management_account_number: string | null;
  building_management_monthly_fee: number | null;
  security_provider: string | null;
  security_account_number: string | null;
  front_door_code: string | null;
  lock_box_code: string | null;
  notes: string | null;
}

interface Lease {
  id: number;
  tenant_name: string;
  start_date: string;
  end_date: string;
  monthly_rent: string;
  rent_frequency: string;
  status: string;
}

interface DocRecord {
  id: number;
  file: string;
  file_name: string | null;
  document_type: string;
  label: string;
  expiry_date: string | null;
  expiry_status: 'expired' | 'expiring_soon' | 'valid' | null;
  notes: string | null;
  file_size: number;
  uploaded_at: string;
  replaces: number | null;
}

interface SmartFolder {
  type: string;
  label: string;
  count: number;
  expiry_warnings: number;
}

const TYPE_BADGE: Record<string, 'blue' | 'green' | 'yellow' | 'purple'> = {
  apartment: 'blue',
  house: 'green',
  studio: 'yellow',
  commercial: 'purple',
};

// All possible document types — smart folders may override this order
const ALL_DOC_TYPES = [
  'insurance', 'mortgage', 'lease', 'deed', 'tax',
  'utility_electricity', 'utility_water', 'utility_gas', 'utility_heating', 'utility_internet',
  'building_mgmt', 'security', 'notary', 'valuation', 'inspection',
  'maintenance', 'receipt', 'photo', 'other',
] as const;

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <dt className="text-[13px] font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}

function CurrencyField({ label, value }: { label: string; value: number | null | undefined }) {
  if (value == null) return null;
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(value);
  return (
    <div>
      <dt className="text-[13px] font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{formatted}</dd>
    </div>
  );
}

function hasAny(...values: (string | number | null | undefined)[]): boolean {
  return values.some((v) => v != null && v !== '');
}

export default function PropertyViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { locale } = useLanguage();
  const [prop, setProp] = useState<PropertyData | null>(null);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [smartFolders, setSmartFolders] = useState<SmartFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    basic: true, land: true,
  });
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [uploadFolder, setUploadFolder] = useState<string | null>(null);
  const [uploadForm, setUploadForm] = useState<{ expiry_date: string; notes: string; label?: string; replaces?: number }>({ expiry_date: '', notes: '' });
  const [uploading, setUploading] = useState(false);
  const [docError, setDocError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      getProperty(Number(id)),
      getLeases(Number(id)),
      getDocuments(Number(id)),
      getSmartFolders(Number(id)),
    ])
      .then(([propData, leasesData, docsData, foldersData]) => {
        setProp(propData);
        setLeases(leasesData);
        setDocs(docsData);
        setSmartFolders(foldersData);
      })
      .catch(() => router.push('/properties'))
      .finally(() => setLoading(false));
  }, [id, router]);

  const toggle = (section: string) =>
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));

  const toggleFolder = (type: string) =>
    setOpenFolders((prev) => ({ ...prev, [type]: !prev[type] }));

  const fmt = (v: string | number) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { style: 'currency', currency: 'EUR' }).format(Number(v));

  const leaseStatusColor = (s: string) => {
    if (s === 'active') return 'green' as const;
    if (s === 'terminated') return 'red' as const;
    return 'yellow' as const;
  };

  // Group docs by type — use smart folders order, then any remaining types
  const docsByType = ALL_DOC_TYPES.reduce((acc, type) => {
    acc[type] = docs.filter((d) => d.document_type === type);
    return acc;
  }, {} as Record<string, DocRecord[]>);

  // Smart folder types (from property metadata) + types that have docs
  const folderTypes = smartFolders.length > 0
    ? smartFolders.map((f) => f.type)
    : ALL_DOC_TYPES.filter((t) => (docsByType[t]?.length ?? 0) > 0);

  // Expiry status badge colors
  const expiryColor = (status: string | null) => {
    if (status === 'expired') return 'red' as const;
    if (status === 'expiring_soon') return 'yellow' as const;
    if (status === 'valid') return 'green' as const;
    return 'gray' as const;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleUpload = async (type: string) => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setDocError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('property', id);
      formData.append('document_type', type);
      if (uploadForm.expiry_date) formData.append('expiry_date', uploadForm.expiry_date);
      if (uploadForm.notes) formData.append('notes', uploadForm.notes);
      if (uploadForm.label) formData.append('label', uploadForm.label);
      if (uploadForm.replaces) formData.append('replaces', String(uploadForm.replaces));
      const newDoc = await uploadDocument(formData);
      setDocs((prev) => [...prev, newDoc]);
      setUploadFolder(null);
      setUploadForm({ expiry_date: '', notes: '', label: '', replaces: undefined });
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      setDocError(t('common.error', locale));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (docId: number) => {
    if (!confirm(t('docs.delete_confirm', locale))) return;
    try {
      await deleteDocument(docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      setDocError(t('common.error', locale));
    }
  };

  const fileName = (url: string) => {
    const parts = url.split('/');
    return decodeURIComponent(parts[parts.length - 1]);
  };

  if (loading || !prop) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={prop.name}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/properties')}
          action={
            <Button onClick={() => router.push(`/properties/${id}/edit`)}>
              {t('common.edit', locale)}
            </Button>
          }
        />

        {/* Basic Info */}
        <FormSection title={t('properties.section.basic', locale)} icon="🏢" open={!!openSections.basic} onToggle={() => toggle('basic')}>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            <Field label={t('properties.name', locale)} value={prop.name} />
            <Field label={t('properties.owner', locale)} value={prop.owner_name} />
            <Field label={t('properties.address', locale)} value={prop.address} />
            <Field label={t('properties.city', locale)} value={prop.city} />
            <Field label={t('properties.country', locale)} value={prop.country} />
            <div>
              <dt className="text-[13px] font-medium text-gray-500">{t('properties.type', locale)}</dt>
              <dd className="mt-0.5">
                <Badge color={TYPE_BADGE[prop.property_type] || 'gray'}>
                  {t(`type.${prop.property_type}`, locale)}
                </Badge>
              </dd>
            </div>
          </dl>
        </FormSection>

        {/* Land & Acquisition */}
        {hasAny(prop.cadastral_number, prop.square_meters, prop.purchase_price, prop.purchase_date, prop.current_value, prop.price_per_sqm) && (
          <FormSection title={t('properties.section.land', locale)} icon="📐" open={!!openSections.land} onToggle={() => toggle('land')}>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Field label={t('properties.cadastral', locale)} value={prop.cadastral_number} />
              <Field label={t('properties.sqm', locale)} value={prop.square_meters} />
              <CurrencyField label={t('properties.purchase_price', locale)} value={prop.purchase_price} />
              <Field label={t('properties.purchase_date', locale)} value={prop.purchase_date} />
              <CurrencyField label={t('properties.current_value', locale)} value={prop.current_value} />
              <CurrencyField label={t('properties.price_per_sqm', locale)} value={prop.price_per_sqm} />
            </dl>
          </FormSection>
        )}

        {/* Mortgage */}
        {hasAny(prop.mortgage_provider, prop.mortgage_account_number, prop.mortgage_monthly_payment) && (
          <FormSection title={t('properties.section.mortgage', locale)} icon="🏦" open={!!openSections.mortgage} onToggle={() => toggle('mortgage')}>
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Field label={t('properties.mortgage_provider', locale)} value={prop.mortgage_provider} />
              <Field label={t('properties.mortgage_account', locale)} value={prop.mortgage_account_number} />
              <CurrencyField label={t('properties.mortgage_payment', locale)} value={prop.mortgage_monthly_payment} />
            </dl>
          </FormSection>
        )}

        {/* Utilities */}
        {hasAny(prop.electricity_provider, prop.electricity_account_number, prop.water_provider, prop.water_account_number, prop.gas_provider, prop.gas_account_number, prop.heating_provider, prop.heating_account_number, prop.internet_provider, prop.internet_account_number) && (
          <FormSection title={t('properties.section.utilities', locale)} icon="⚡" open={!!openSections.utilities} onToggle={() => toggle('utilities')}>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Field label={t('properties.electricity_provider', locale)} value={prop.electricity_provider} />
              <Field label={t('properties.electricity_account', locale)} value={prop.electricity_account_number} />
              <Field label={t('properties.water_provider', locale)} value={prop.water_provider} />
              <Field label={t('properties.water_account', locale)} value={prop.water_account_number} />
              <Field label={t('properties.gas_provider', locale)} value={prop.gas_provider} />
              <Field label={t('properties.gas_account', locale)} value={prop.gas_account_number} />
              <Field label={t('properties.heating_provider', locale)} value={prop.heating_provider} />
              <Field label={t('properties.heating_account', locale)} value={prop.heating_account_number} />
              <Field label={t('properties.internet_provider', locale)} value={prop.internet_provider} />
              <Field label={t('properties.internet_account', locale)} value={prop.internet_account_number} />
            </dl>
          </FormSection>
        )}

        {/* Insurance */}
        {hasAny(prop.insurance_provider, prop.insurance_policy_number, prop.annual_insurance_cost) && (
          <FormSection title={t('properties.section.insurance', locale)} icon="🛡️" open={!!openSections.insurance} onToggle={() => toggle('insurance')}>
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Field label={t('properties.insurance_provider', locale)} value={prop.insurance_provider} />
              <Field label={t('properties.insurance_policy', locale)} value={prop.insurance_policy_number} />
              <CurrencyField label={t('properties.insurance_cost', locale)} value={prop.annual_insurance_cost} />
            </dl>
          </FormSection>
        )}

        {/* Building Management */}
        {hasAny(prop.building_management_provider, prop.building_management_account_number, prop.building_management_monthly_fee) && (
          <FormSection title={t('properties.section.building', locale)} icon="🏗️" open={!!openSections.building} onToggle={() => toggle('building')}>
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Field label={t('properties.building_provider', locale)} value={prop.building_management_provider} />
              <Field label={t('properties.building_account', locale)} value={prop.building_management_account_number} />
              <CurrencyField label={t('properties.building_fee', locale)} value={prop.building_management_monthly_fee} />
            </dl>
          </FormSection>
        )}

        {/* Security */}
        {hasAny(prop.security_provider, prop.security_account_number) && (
          <FormSection title={t('properties.section.security', locale)} icon="🔒" open={!!openSections.security} onToggle={() => toggle('security')}>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Field label={t('properties.security_provider', locale)} value={prop.security_provider} />
              <Field label={t('properties.security_account', locale)} value={prop.security_account_number} />
            </dl>
          </FormSection>
        )}

        {/* Access Codes */}
        {hasAny(prop.front_door_code, prop.lock_box_code) && (
          <FormSection title={t('properties.section.access', locale)} icon="🔑" open={!!openSections.access} onToggle={() => toggle('access')}>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Field label={t('properties.front_door_code', locale)} value={prop.front_door_code} />
              <Field label={t('properties.lock_box_code', locale)} value={prop.lock_box_code} />
            </dl>
          </FormSection>
        )}

        {/* Notes */}
        {hasAny(prop.notes) && (
          <FormSection title={t('properties.section.notes', locale)} icon="📝" open={!!openSections.notes} onToggle={() => toggle('notes')}>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{prop.notes}</p>
          </FormSection>
        )}

        {/* Leases */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">{t('properties.leases', locale)}</h2>
            <Button variant="secondary" size="sm" onClick={() => router.push('/leases/new')}>
              + {t('leases.add', locale)}
            </Button>
          </div>
          {leases.length === 0 ? (
            <Card className="py-8 text-center">
              <p className="text-sm text-gray-500">{t('common.no_data', locale)}</p>
            </Card>
          ) : (
            <Card padding={false}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('leases.tenant', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('leases.rent_amount', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('leases.rent_frequency', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('leases.end_date', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('leases.status', locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leases.map((lease) => (
                    <tr
                      key={lease.id}
                      onClick={() => router.push(`/leases/${lease.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3 text-sm text-gray-900">{lease.tenant_name}</td>
                      <td className="px-5 py-3 text-sm text-gray-900 font-medium">{fmt(lease.monthly_rent)}</td>
                      <td className="px-5 py-3 hidden md:table-cell">
                        <Badge color="indigo">{t(`freq.${lease.rent_frequency}`, locale)}</Badge>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">{lease.end_date}</td>
                      <td className="px-5 py-3">
                        <Badge color={leaseStatusColor(lease.status)}>
                          {t(`leases.${lease.status}`, locale)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {/* Documents — Smart Folder View */}
        <div className="mt-8 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">{t('docs.title', locale)}</h2>
            {docs.length > 0 && (
              <span className="text-xs text-gray-400">{docs.length} {t('docs.file', locale).toLowerCase()}s</span>
            )}
          </div>
          <Alert type="error" message={docError} />

          {docs.length === 0 && uploadFolder === null ? (
            <Card className="py-8 text-center">
              <p className="text-sm text-gray-500 mb-3">{t('docs.no_docs', locale)}</p>
              <Button variant="secondary" size="sm" onClick={() => setUploadFolder('lease')}>
                + {t('docs.upload', locale)}
              </Button>
            </Card>
          ) : (
            <div className="space-y-2">
              {/* Smart folders from property metadata + existing doc types */}
              {[...folderTypes, ...ALL_DOC_TYPES.filter((t2) => !folderTypes.includes(t2) && (docsByType[t2]?.length > 0 || uploadFolder === t2))].map((type) => {
                const typeDocs = docsByType[type] || [];
                const isOpen = !!openFolders[type];
                const count = typeDocs.length;
                const folder = smartFolders.find((f) => f.type === type);
                const hasWarnings = folder ? folder.expiry_warnings > 0 : typeDocs.some((d) => d.expiry_status === 'expired' || d.expiry_status === 'expiring_soon');

                if (count === 0 && uploadFolder !== type && !folderTypes.includes(type)) return null;

                return (
                  <Card key={type}>
                    <button
                      type="button"
                      onClick={() => toggleFolder(type)}
                      className="w-full flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{isOpen ? '📂' : '📁'}</span>
                        <span className="text-sm font-medium text-gray-900">{t(`docs.${type}`, locale)}</span>
                        {count > 0 && <Badge color="gray">{count}</Badge>}
                        {hasWarnings && <Badge color="red">!</Badge>}
                      </div>
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>

                    {isOpen && (
                      <div className="mt-3 space-y-2">
                        {typeDocs.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <a
                                  href={doc.file}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700 truncate"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {doc.label || fileName(doc.file)}
                                </a>
                                {doc.expiry_status && (
                                  <Badge color={expiryColor(doc.expiry_status)}>
                                    {t(`docs.${doc.expiry_status}`, locale)}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-0.5">
                                {doc.expiry_date && (
                                  <span className={doc.expiry_status === 'expired' ? 'text-red-500' : doc.expiry_status === 'expiring_soon' ? 'text-amber-500' : ''}>
                                    {t('docs.expiry', locale)}: {doc.expiry_date}
                                  </span>
                                )}
                                {doc.file_size > 0 && <span>{formatSize(doc.file_size)}</span>}
                                {doc.notes && <span className="truncate max-w-[200px]">{doc.notes}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              {doc.expiry_date && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setUploadFolder(type);
                                    setUploadForm((prev) => ({ ...prev, replaces: doc.id }));
                                    setOpenFolders((prev) => ({ ...prev, [type]: true }));
                                  }}
                                  title={t('docs.renew', locale)}
                                >
                                  ↻
                                </Button>
                              )}
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeleteDoc(doc.id)}
                              >
                                {t('common.delete', locale)}
                              </Button>
                            </div>
                          </div>
                        ))}

                        {uploadFolder === type ? (
                          <div className="pt-2 border-t border-gray-200 space-y-2">
                            <input ref={fileRef} type="file" className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100" />
                            <div className="flex flex-wrap items-end gap-2">
                              <Input
                                type="date"
                                label={t('docs.expiry', locale)}
                                value={uploadForm.expiry_date}
                                onChange={(e) => setUploadForm((prev) => ({ ...prev, expiry_date: e.target.value }))}
                                className="w-40"
                              />
                              <Input
                                label={t('docs.label', locale)}
                                value={uploadForm.label || ''}
                                onChange={(e) => setUploadForm((prev) => ({ ...prev, label: e.target.value }))}
                                className="w-40"
                                placeholder={t('docs.label', locale)}
                              />
                              <Input
                                label={t('docs.notes', locale)}
                                value={uploadForm.notes}
                                onChange={(e) => setUploadForm((prev) => ({ ...prev, notes: e.target.value }))}
                                className="w-40"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleUpload(type)} disabled={uploading}>
                                {uploading ? '...' : t('docs.upload', locale)}
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => { setUploadFolder(null); setUploadForm({ expiry_date: '', notes: '', label: '', replaces: undefined }); }}>
                                {t('common.cancel', locale)}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setUploadFolder(type); setUploadForm({ expiry_date: '', notes: '', label: '', replaces: undefined }); }}
                          >
                            + {t('docs.upload', locale)}
                          </Button>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}

              {/* Add to new type button */}
              <div className="flex gap-2 pt-1">
                <Select
                  value=""
                  onChange={(e) => {
                    const type = e.target.value;
                    if (type) {
                      setUploadFolder(type);
                      setOpenFolders((prev) => ({ ...prev, [type]: true }));
                    }
                  }}
                  className="w-auto"
                >
                  <option value="">+ {t('docs.upload', locale)}...</option>
                  {ALL_DOC_TYPES.map((type) => (
                    <option key={type} value={type}>{t(`docs.${type}`, locale)}</option>
                  ))}
                </Select>
              </div>
            </div>
          )}
        </div>
      </PageContent>
    </PageShell>
  );
}
