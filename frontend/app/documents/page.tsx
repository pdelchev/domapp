'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getComplianceSummary, getDocuments, getProperties, uploadDocument, deleteDocument } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, Badge, Button, Spinner, Alert } from '../components/ui';

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

function getFileExtension(doc: DocRecord): string {
  const name = doc.file_name || doc.file || '';
  const ext = name.split('.').pop()?.toLowerCase().split('?')[0] || '';
  return ext;
}

function isImage(ext: string): boolean {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
}

const DOC_TYPE_ICONS: Record<string, string> = {
  insurance: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  mortgage: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  lease: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  deed: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2',
  tax: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
  photo: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  receipt: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
};

function getDocIcon(type: string): string {
  return DOC_TYPE_ICONS[type] || 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z';
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
  const [selectedDoc, setSelectedDoc] = useState<DocRecord | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  // Bulk import state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<BulkFile[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkSuccess, setBulkSuccess] = useState('');
  const [bulkProperty, setBulkProperty] = useState('');
  const [bulkType, setBulkType] = useState('');
  const [bulkExpiry, setBulkExpiry] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const expiryLabel = (status: string | null) => {
    if (status === 'expired') return t('docs.expired', locale);
    if (status === 'expiring_soon') return t('docs.expiring_soon', locale);
    if (status === 'valid') return t('docs.valid', locale);
    return t('docs.no_expiry', locale);
  };

  const handleDelete = async (doc: DocRecord) => {
    if (!confirm(t('docs.delete_confirm', locale))) return;
    try {
      await deleteDocument(doc.id);
      setAllDocs((prev) => prev.filter((d) => d.id !== doc.id));
      if (selectedDoc?.id === doc.id) setSelectedDoc(null);
      loadData();
    } catch { /* ignore */ }
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
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
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

  const applyToAll = useCallback(() => {
    setBulkFiles((prev) => prev.map((f) => f.status === 'pending' ? {
      ...f,
      property: bulkProperty || f.property,
      document_type: bulkType || f.document_type,
      expiry_date: bulkExpiry || f.expiry_date,
    } : f));
  }, [bulkProperty, bulkType, bulkExpiry]);

  // Auto-apply bulk values to pending files when dropdowns change
  useEffect(() => {
    if (bulkFiles.length > 0 && (bulkProperty || bulkType || bulkExpiry)) {
      applyToAll();
    }
  }, [bulkProperty, bulkType, bulkExpiry]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBulkUpload = useCallback(async () => {
    // Apply bulk values one final time before upload
    const applied = bulkFiles.map((f) => f.status === 'pending' ? {
      ...f,
      property: bulkProperty || f.property,
      document_type: bulkType || f.document_type,
      expiry_date: bulkExpiry || f.expiry_date,
    } : f);
    setBulkFiles(applied);
    const pending = applied.filter((f) => f.status === 'pending');
    const invalid = pending.find((f) => !f.property || !f.document_type);
    if (invalid) { setBulkError(t('common.required', locale)); return; }
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
      loadData();
    }
  }, [bulkFiles, bulkProperty, bulkType, bulkExpiry, locale, loadData]);

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
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header bar */}
        <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-3">
          <div className="max-w-[1400px] mx-auto flex flex-wrap items-center gap-3">
            <h1 className="text-lg font-semibold text-gray-900 mr-2">{t('docs.vault', locale)}</h1>

            {/* Compact compliance pills */}
            {summary && (
              <div className="flex items-center gap-1.5 mr-auto">
                <button
                  onClick={() => { setFilterExpiry(''); setShowSummary((v) => !v); }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  title={t('docs.tip_total', locale)}
                >
                  {summary.total}
                  <span className="hidden sm:inline">{t('docs.title', locale).toLowerCase()}</span>
                </button>
                {summary.expired > 0 && (
                  <button
                    onClick={() => setFilterExpiry(filterExpiry === 'expired' ? '' : 'expired')}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full transition-colors ${
                      filterExpiry === 'expired' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'
                    }`}
                    title={t('docs.tip_expired', locale)}
                  >
                    {summary.expired} {t('docs.expired', locale).toLowerCase()}
                  </button>
                )}
                {summary.expiring_soon > 0 && (
                  <button
                    onClick={() => setFilterExpiry(filterExpiry === 'expiring_soon' ? '' : 'expiring_soon')}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full transition-colors ${
                      filterExpiry === 'expiring_soon' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                    title={t('docs.tip_expiring', locale)}
                  >
                    {summary.expiring_soon} {t('docs.expiring_soon', locale).toLowerCase()}
                  </button>
                )}
                <button
                  onClick={() => setFilterExpiry(filterExpiry === 'valid' ? '' : 'valid')}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full transition-colors ${
                    filterExpiry === 'valid' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'
                  }`}
                  title={t('docs.tip_valid', locale)}
                >
                  {summary.valid} {t('docs.valid', locale).toLowerCase()}
                </button>
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder={t('docs.search', locale)}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
              />
            </div>

            {/* Property filter */}
            <select
              value={filterProperty}
              onChange={(e) => setFilterProperty(e.target.value)}
              className="h-8 px-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">{t('docs.all_properties', locale)}</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <Button size="sm" onClick={() => setBulkOpen(true)}>
              + {t('docs.upload', locale)}
            </Button>
          </div>
        </div>

        {/* Expandable summary panel */}
        {showSummary && summary && (
          <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4">
            <div className="max-w-[1400px] mx-auto">
              {/* Upcoming Expirations */}
              {summary.upcoming_expirations.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t('docs.upcoming_expirations', locale)}</h3>
                  <div className="flex flex-wrap gap-2">
                    {summary.upcoming_expirations.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg text-sm cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => {
                          const doc = allDocs.find((d) => d.id === item.id);
                          if (doc) { setSelectedDoc(doc); setShowSummary(false); }
                        }}
                      >
                        <Badge color={item.days_remaining <= 7 ? 'red' : 'yellow'}>
                          {item.days_remaining}d
                        </Badge>
                        <span className="text-gray-700 truncate max-w-[200px]">{item.label}</span>
                        <span className="text-gray-400 text-xs">{item.property_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Per-property breakdown */}
              <div className="flex flex-wrap gap-3">
                {summary.by_property.filter((p) => p.total > 0).map((prop) => (
                  <button
                    key={prop.id}
                    onClick={() => { setFilterProperty(String(prop.id)); setShowSummary(false); }}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
                  >
                    <span className="text-sm font-medium text-gray-900">{prop.name}</span>
                    <span className="text-xs text-gray-400">{prop.total}</span>
                    {prop.expired > 0 && <Badge color="red">{prop.expired}</Badge>}
                    {prop.expiring_soon > 0 && <Badge color="yellow">{prop.expiring_soon}</Badge>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Split screen: list + preview */}
        <div className="flex-1 flex min-h-0 max-w-[1400px] mx-auto w-full">
          {/* Left: Document list */}
          <div className={`${selectedDoc ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-[420px] lg:min-w-[380px] border-r border-gray-200 bg-white overflow-hidden`}>
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm">{t('docs.no_docs', locale)}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filtered.map((doc) => {
                    const ext = getFileExtension(doc);
                    const active = selectedDoc?.id === doc.id;
                    return (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDoc(doc)}
                        className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                          active ? 'bg-indigo-50 border-l-2 border-indigo-600' : 'hover:bg-gray-50 border-l-2 border-transparent'
                        }`}
                      >
                        {/* Icon */}
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          active ? 'bg-indigo-100' : 'bg-gray-100'
                        }`}>
                          <svg className={`w-4.5 h-4.5 ${active ? 'text-indigo-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={getDocIcon(doc.document_type)} />
                          </svg>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={`text-sm font-medium truncate ${active ? 'text-indigo-900' : 'text-gray-900'}`}>
                              {doc.label || doc.file_name || 'Document'}
                            </span>
                            {ext && (
                              <span className="text-[10px] font-medium text-gray-400 uppercase shrink-0">.{ext}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-400">
                            <span className="truncate">{doc.property_name}</span>
                            <span>&middot;</span>
                            <span>{t(`docs.${doc.document_type}`, locale)}</span>
                          </div>
                          {doc.expiry_status && (
                            <div className="mt-1">
                              <Badge color={expiryBadgeColor(doc.expiry_status)}>
                                {expiryLabel(doc.expiry_status)}
                                {doc.expiry_date && ` - ${doc.expiry_date}`}
                              </Badge>
                            </div>
                          )}
                        </div>

                        {/* Size */}
                        <span className="text-[11px] text-gray-300 shrink-0 mt-1">{formatFileSize(doc.file_size)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {/* List footer */}
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50">
              <p className="text-xs text-gray-400">
                {filtered.length} {t('docs.title', locale).toLowerCase()}
                {filterProperty || filterExpiry || searchQuery ? ` (${locale === 'bg' ? 'филтрирани' : 'filtered'})` : ''}
              </p>
            </div>
          </div>

          {/* Right: Preview panel */}
          <div className={`${selectedDoc ? 'flex' : 'hidden lg:flex'} flex-col flex-1 bg-gray-100 min-h-0 overflow-hidden`}>
            {selectedDoc ? (
              <>
                {/* Preview toolbar */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
                  {/* Back button (mobile) */}
                  <button
                    onClick={() => setSelectedDoc(null)}
                    className="lg:hidden p-1.5 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {selectedDoc.label || selectedDoc.file_name || 'Document'}
                    </h3>
                    <p className="text-xs text-gray-400">
                      {selectedDoc.property_name} &middot; {t(`docs.${selectedDoc.document_type}`, locale)} &middot; {formatFileSize(selectedDoc.file_size)}
                    </p>
                  </div>

                  {selectedDoc.expiry_status && (
                    <Badge color={expiryBadgeColor(selectedDoc.expiry_status)}>
                      {expiryLabel(selectedDoc.expiry_status)}
                    </Badge>
                  )}

                  <a
                    href={selectedDoc.file}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-gray-500 hover:text-indigo-600 rounded-lg hover:bg-gray-100 shrink-0"
                    title={t('docs.open_tab', locale)}
                  >
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>

                  <a
                    href={selectedDoc.file}
                    download
                    className="p-1.5 text-gray-500 hover:text-indigo-600 rounded-lg hover:bg-gray-100 shrink-0"
                    title={t('docs.download', locale)}
                  >
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>

                  <button
                    onClick={() => handleDelete(selectedDoc)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 shrink-0"
                  >
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* A4 Preview area */}
                <div className="flex-1 overflow-auto p-4 lg:p-6 flex justify-center">
                  {(() => {
                    const ext = getFileExtension(selectedDoc);
                    if (ext === 'pdf') {
                      return (
                        <div className="w-full max-w-[794px] bg-white shadow-lg rounded-lg overflow-hidden" style={{ aspectRatio: '1/1.414' }}>
                          <iframe
                            src={`${selectedDoc.file}#toolbar=1&navpanes=0`}
                            className="w-full h-full border-0"
                            title={selectedDoc.label || 'Document preview'}
                          />
                        </div>
                      );
                    }
                    if (isImage(ext)) {
                      return (
                        <div className="w-full max-w-[794px] bg-white shadow-lg rounded-lg overflow-hidden p-4 flex items-center justify-center" style={{ minHeight: '60vh' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={selectedDoc.file}
                            alt={selectedDoc.label || 'Document'}
                            className="max-w-full max-h-[80vh] object-contain"
                          />
                        </div>
                      );
                    }
                    // Non-previewable
                    return (
                      <div className="w-full max-w-[794px] bg-white shadow-lg rounded-lg overflow-hidden flex flex-col items-center justify-center py-20" style={{ minHeight: '60vh' }}>
                        <svg className="w-20 h-20 text-gray-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={getDocIcon(selectedDoc.document_type)} />
                        </svg>
                        <p className="text-sm text-gray-500 mb-1">{selectedDoc.file_name || selectedDoc.label}</p>
                        <p className="text-xs text-gray-400 mb-6">{t('docs.no_preview', locale)}</p>
                        <div className="flex gap-2">
                          <a
                            href={selectedDoc.file}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            {t('docs.open_tab', locale)}
                          </a>
                          <a
                            href={selectedDoc.file}
                            download
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            {t('docs.download', locale)}
                          </a>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </>
            ) : (
              /* Empty state — no doc selected */
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <svg className="w-16 h-16 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">{t('docs.select_doc', locale)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

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

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <Alert type="error" message={bulkError} />
              <Alert type="success" message={bulkSuccess} />

              {/* Apply to all */}
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
    </PageShell>
  );
}
