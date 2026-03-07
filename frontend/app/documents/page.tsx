'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getComplianceSummary, getDocuments, getProperties, uploadDocument } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Badge, Button, Spinner, Select, Alert } from '../components/ui';

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

interface BulkFile {
  id: string;
  file: File;
  property: string;
  document_type: string;
  expiry_date: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
}

const ALL_DOC_TYPES = [
  'insurance', 'mortgage', 'lease', 'deed', 'tax',
  'utility_electricity', 'utility_water', 'utility_gas', 'utility_heating', 'utility_internet',
  'building_mgmt', 'security', 'notary', 'valuation', 'inspection',
  'maintenance', 'receipt', 'photo', 'other',
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

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

  // Bulk import state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<BulkFile[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkSuccess, setBulkSuccess] = useState('');
  // "Apply to all" defaults
  const [bulkProperty, setBulkProperty] = useState('');
  const [bulkType, setBulkType] = useState('');
  const [bulkExpiry, setBulkExpiry] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, [router]);

  const loadData = useCallback(() => {
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

  // --- Bulk import handlers ---
  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles: BulkFile[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      property: bulkProperty,
      document_type: bulkType,
      expiry_date: bulkExpiry,
      status: 'pending' as const,
    }));
    setBulkFiles((prev) => [...prev, ...newFiles]);
    setBulkError('');
    setBulkSuccess('');
  }, [bulkProperty, bulkType, bulkExpiry]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const removeFile = (id: string) => {
    setBulkFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFile = (id: string, field: keyof BulkFile, value: string) => {
    setBulkFiles((prev) => prev.map((f) => f.id === id ? { ...f, [field]: value } : f));
  };

  // Apply "all" defaults to all pending files
  const applyToAll = useCallback(() => {
    setBulkFiles((prev) => prev.map((f) => f.status === 'pending' ? {
      ...f,
      property: bulkProperty || f.property,
      document_type: bulkType || f.document_type,
      expiry_date: bulkExpiry || f.expiry_date,
    } : f));
  }, [bulkProperty, bulkType, bulkExpiry]);

  const handleBulkUpload = useCallback(async () => {
    const pending = bulkFiles.filter((f) => f.status === 'pending');
    // Validate: every file needs a property and type
    const invalid = pending.find((f) => !f.property || !f.document_type);
    if (invalid) {
      setBulkError(t('common.required', locale));
      return;
    }
    setBulkError('');
    setBulkUploading(true);

    let successCount = 0;
    for (const bf of pending) {
      setBulkFiles((prev) => prev.map((f) => f.id === bf.id ? { ...f, status: 'uploading' } : f));
      try {
        const formData = new FormData();
        formData.append('file', bf.file);
        formData.append('property', bf.property);
        formData.append('document_type', bf.document_type);
        if (bf.expiry_date) formData.append('expiry_date', bf.expiry_date);
        await uploadDocument(formData);
        setBulkFiles((prev) => prev.map((f) => f.id === bf.id ? { ...f, status: 'done' } : f));
        successCount++;
      } catch {
        setBulkFiles((prev) => prev.map((f) => f.id === bf.id ? { ...f, status: 'error' } : f));
      }
    }

    setBulkUploading(false);
    if (successCount > 0) {
      setBulkSuccess(`${successCount} ${t('docs.uploaded_count', locale)}`);
      // Refresh data
      loadData();
    }
  }, [bulkFiles, locale, loadData]);

  const closeBulkImport = () => {
    if (bulkUploading) return;
    setBulkOpen(false);
    setBulkFiles([]);
    setBulkError('');
    setBulkSuccess('');
    setBulkProperty('');
    setBulkType('');
    setBulkExpiry('');
  };

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  const pendingCount = bulkFiles.filter((f) => f.status === 'pending').length;
  const doneCount = bulkFiles.filter((f) => f.status === 'done').length;

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('docs.vault', locale)}
          action={
            <Button onClick={() => setBulkOpen(true)}>
              + {t('docs.bulk_import', locale)}
            </Button>
          }
        />

        {/* ====== BULK IMPORT MODAL ====== */}
        {bulkOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 px-4">
            <div className="fixed inset-0 bg-black/40" onClick={closeBulkImport} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden z-10">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
                <h2 className="text-lg font-semibold text-gray-900">{t('docs.bulk_import', locale)}</h2>
                <button onClick={closeBulkImport} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Body — scrollable */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <Alert type="error" message={bulkError} />
                <Alert type="success" message={bulkSuccess} />

                {/* "Apply to all" row */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">{t('docs.apply_all', locale)}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      value={bulkProperty}
                      onChange={(e) => setBulkProperty(e.target.value)}
                      className="h-9 px-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">{t('docs.select_property', locale)}</option>
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <select
                      value={bulkType}
                      onChange={(e) => setBulkType(e.target.value)}
                      className="h-9 px-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">{t('docs.select_type', locale)}</option>
                      {ALL_DOC_TYPES.map((type) => (
                        <option key={type} value={type}>{t(`docs.${type}`, locale)}</option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={bulkExpiry}
                      onChange={(e) => setBulkExpiry(e.target.value)}
                      placeholder={t('docs.expiry', locale)}
                      className="h-9 px-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  {bulkFiles.length > 0 && (bulkProperty || bulkType || bulkExpiry) && (
                    <button
                      onClick={applyToAll}
                      className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-md hover:bg-indigo-50 transition-colors"
                    >
                      {t('docs.apply_all', locale)} ({pendingCount})
                    </button>
                  )}
                </div>

                {/* Drop zone */}
                <div
                  ref={dropRef}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-xl py-8 flex flex-col items-center gap-2 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
                >
                  <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                  <p className="text-sm text-gray-500">{t('docs.drop_files', locale)}</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                  />
                </div>

                {/* File list */}
                {bulkFiles.length > 0 && (
                  <div className="space-y-2">
                    {bulkFiles.map((bf) => (
                      <div
                        key={bf.id}
                        className={`border rounded-lg p-3 transition-colors ${
                          bf.status === 'done' ? 'bg-green-50 border-green-200' :
                          bf.status === 'error' ? 'bg-red-50 border-red-200' :
                          bf.status === 'uploading' ? 'bg-indigo-50 border-indigo-200' :
                          'bg-white border-gray-200'
                        }`}
                      >
                        {/* File name + status + remove */}
                        <div className="flex items-center gap-2 mb-2">
                          {bf.status === 'uploading' && (
                            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
                          )}
                          {bf.status === 'done' && (
                            <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {bf.status === 'error' && (
                            <button
                              onClick={() => updateFile(bf.id, 'status', 'pending')}
                              title={locale === 'bg' ? 'Опитай отново' : 'Retry'}
                              className="p-0.5 text-red-500 hover:text-indigo-600 shrink-0"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </button>
                          )}
                          <span className="text-sm font-medium text-gray-900 truncate flex-1">{bf.file.name}</span>
                          <span className="text-xs text-gray-400 shrink-0">{formatFileSize(bf.file.size)}</span>
                          {(bf.status === 'pending' || bf.status === 'error') && (
                            <button
                              onClick={() => removeFile(bf.id)}
                              className="p-1 text-gray-400 hover:text-red-500 shrink-0"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>

                        {/* Per-file settings — for pending and error */}
                        {(bf.status === 'pending' || bf.status === 'error') && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <select
                              value={bf.property}
                              onChange={(e) => updateFile(bf.id, 'property', e.target.value)}
                              className={`h-8 px-2 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                !bf.property ? 'border-red-300 text-red-600' : 'border-gray-300'
                              }`}
                            >
                              <option value="">{t('docs.select_property', locale)}</option>
                              {properties.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                            <select
                              value={bf.document_type}
                              onChange={(e) => updateFile(bf.id, 'document_type', e.target.value)}
                              className={`h-8 px-2 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                !bf.document_type ? 'border-red-300 text-red-600' : 'border-gray-300'
                              }`}
                            >
                              <option value="">{t('docs.select_type', locale)}</option>
                              {ALL_DOC_TYPES.map((type) => (
                                <option key={type} value={type}>{t(`docs.${type}`, locale)}</option>
                              ))}
                            </select>
                            <input
                              type="date"
                              value={bf.expiry_date}
                              onChange={(e) => updateFile(bf.id, 'expiry_date', e.target.value)}
                              className="h-8 px-2 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50 shrink-0">
                <span className="text-xs text-gray-500">
                  {bulkFiles.length > 0 && `${bulkFiles.length} ${locale === 'bg' ? 'файла' : 'files'}${doneCount > 0 ? ` (${doneCount} ${t('docs.uploaded_count', locale)})` : ''}`}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={closeBulkImport} disabled={bulkUploading}>
                    {t('common.cancel', locale)}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBulkUpload}
                    disabled={bulkUploading || pendingCount === 0}
                  >
                    {bulkUploading ? t('docs.uploading', locale) : `${t('docs.upload', locale)} (${pendingCount})`}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

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
