'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import {
  getHealthProfiles, createBloodReport, bulkUploadReports,
  getBiomarkers, saveManualResults, createHealthProfile,
} from '../../lib/api';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Alert, Spinner, Input, Select } from '../../components/ui';

// ── Types ───────────────────────────────────────────────────────────

interface Profile { id: number; full_name: string; sex: string; is_primary: boolean; }
interface BiomarkerRef { id: number; name: string; name_bg: string; abbreviation: string; unit: string; category_name: string; }

interface UploadFile {
  id: string; file: File; status: 'pending' | 'uploading' | 'done' | 'error';
  reportId?: number; resultCount?: number; score?: number | null; warnings?: string[];
}

type Mode = 'upload' | 'manual';

// ── Helper ──────────────────────────────────────────────────────────

function genId() { return Math.random().toString(36).slice(2, 10); }

export default function HealthUploadPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [biomarkers, setBiomarkers] = useState<BiomarkerRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [mode, setMode] = useState<Mode>('upload');
  const [selectedProfile, setSelectedProfile] = useState('');
  const [testDate, setTestDate] = useState(new Date().toISOString().split('T')[0]);
  const [labName, setLabName] = useState('');
  const [labType, setLabType] = useState('other');

  // Upload state
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);

  // Manual entry state
  const [manualResults, setManualResults] = useState<Array<{ biomarker: string; value: string }>>([{ biomarker: '', value: '' }]);
  const [saving, setSaving] = useState(false);

  // Profile creation inline
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileSex, setNewProfileSex] = useState('male');

  useEffect(() => {
    Promise.all([getHealthProfiles(), getBiomarkers()])
      .then(([p, b]) => {
        setProfiles(p);
        setBiomarkers(b);
        if (p.length > 0) {
          const primary = p.find((pr: Profile) => pr.is_primary);
          setSelectedProfile(String((primary || p[0]).id));
        }
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  // ── File handling ───────────────────────────────────────────────

  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const newFiles: UploadFile[] = Array.from(selectedFiles)
      .filter((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'))
      .map((f) => ({ id: genId(), file: f, status: 'pending' as const }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Drag & drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  // ── Upload ────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!selectedProfile) { setError(t('health.select_profile', locale)); return; }
    const pending = files.filter((f) => f.status === 'pending');
    if (pending.length === 0) { setError('No files to upload'); return; }

    setError('');
    setUploading(true);

    // Use bulk upload endpoint
    const formData = new FormData();
    pending.forEach((f) => formData.append('files', f.file));
    formData.append('profile', selectedProfile);
    formData.append('lab_type', labType);
    formData.append('test_date', testDate);

    try {
      const result = await bulkUploadReports(formData);
      const reports = result.reports || [];

      // Update file statuses
      setFiles((prev) => {
        const pendingIds = prev.filter((f) => f.status === 'pending').map((f) => f.id);
        return prev.map((f, i) => {
          if (f.status !== 'pending') return f;
          const reportData = reports[pendingIds.indexOf(f.id)] || reports[i] || {};
          return {
            ...f,
            status: reportData.status === 'parsed' ? 'done' : 'error',
            reportId: reportData.id,
            resultCount: reportData.result_count,
            score: reportData.overall_score,
            warnings: reportData.parse_warnings,
          } as UploadFile;
        });
      });

      const successCount = reports.filter((r: { status: string }) => r.status === 'parsed').length;
      if (successCount > 0) {
        setSuccess(`${successCount} report(s) uploaded and parsed successfully!`);
        // Navigate to first parsed report
        const firstParsed = reports.find((r: { status: string }) => r.status === 'parsed');
        if (firstParsed) {
          setTimeout(() => router.push(`/health/report/${firstParsed.id}`), 1500);
        }
      }
    } catch {
      setError('Upload failed');
      setFiles((prev) => prev.map((f) => f.status === 'pending' ? { ...f, status: 'error' } : f));
    } finally {
      setUploading(false);
    }
  };

  // ── Manual entry ──────────────────────────────────────────────

  const addManualRow = () => {
    setManualResults((prev) => [...prev, { biomarker: '', value: '' }]);
  };

  const updateManualRow = (idx: number, field: 'biomarker' | 'value', val: string) => {
    setManualResults((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };

  const removeManualRow = (idx: number) => {
    setManualResults((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleManualSave = async () => {
    if (!selectedProfile) { setError(t('health.select_profile', locale)); return; }
    const valid = manualResults.filter((r) => r.biomarker && r.value);
    if (valid.length === 0) { setError('Add at least one result'); return; }

    setError('');
    setSaving(true);

    try {
      // First create the report
      const formData = new FormData();
      formData.append('profile', selectedProfile);
      formData.append('test_date', testDate);
      formData.append('lab_name', labName);
      formData.append('lab_type', 'manual');

      const report = await createBloodReport(formData);

      // Then save results
      const results = valid.map((r) => ({
        biomarker: Number(r.biomarker),
        value: parseFloat(r.value),
      }));
      await saveManualResults(report.id, results);

      setSuccess('Results saved successfully!');
      setTimeout(() => router.push(`/health/report/${report.id}`), 1000);
    } catch {
      setError('Failed to save results');
    } finally {
      setSaving(false);
    }
  };

  // ── Quick add profile ─────────────────────────────────────────

  const handleQuickAddProfile = async () => {
    if (!newProfileName.trim()) return;
    try {
      const p = await createHealthProfile({ full_name: newProfileName, sex: newProfileSex });
      setProfiles((prev) => [...prev, p]);
      setSelectedProfile(String(p.id));
      setShowNewProfile(false);
      setNewProfileName('');
    } catch { setError('Failed to create profile'); }
  };

  if (loading) return (
    <PageShell><NavBar /><PageContent size="md"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>
  );

  // Group biomarkers by category for select
  const biomarkersByCategory: Record<string, BiomarkerRef[]> = {};
  biomarkers.forEach((bm) => { (biomarkersByCategory[bm.category_name] ??= []).push(bm); });

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={t('health.upload_reports', locale)}
          onBack={() => router.push('/health')}
        />

        <Alert type="error" message={error} />
        <Alert type="success" message={success} />

        {/* Profile + Date row */}
        <Card className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1.5">{t('health.select_profile', locale)}</label>
              <div className="flex gap-2">
                <select
                  value={selectedProfile}
                  onChange={(e) => setSelectedProfile(e.target.value)}
                  className="flex-1 h-10 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">—</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}{p.is_primary ? ' (me)' : ''}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewProfile((v) => !v)}
                  className="h-10 w-10 shrink-0 flex items-center justify-center border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50"
                  title={t('health.add_profile', locale)}
                >+</button>
              </div>
            </div>
            <Input label={t('health.test_date', locale)} type="date" value={testDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTestDate(e.target.value)} />
            <Input label={t('health.lab_name', locale)} value={labName} placeholder="e.g., Ramus"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLabName(e.target.value)} />
            <Select label="Lab" value={labType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLabType(e.target.value)}>
              <option value="ramus">Ramus</option>
              <option value="lina">LINA</option>
              <option value="acibadem">Acibadem</option>
              <option value="cibalab">Cibalab</option>
              <option value="other">Other</option>
              <option value="manual">Manual</option>
            </Select>
          </div>

          {/* Quick new profile */}
          {showNewProfile && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg flex gap-2 items-end">
              <Input label={t('health.full_name', locale)} value={newProfileName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewProfileName(e.target.value)} />
              <Select label={t('health.sex', locale)} value={newProfileSex}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewProfileSex(e.target.value)}>
                <option value="male">{t('health.male', locale)}</option>
                <option value="female">{t('health.female', locale)}</option>
              </Select>
              <Button size="sm" onClick={handleQuickAddProfile}>{t('common.save', locale)}</Button>
            </div>
          )}
        </Card>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          <button
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              mode === 'upload' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            onClick={() => setMode('upload')}
          >
            📄 {t('health.bulk_upload', locale)}
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              mode === 'manual' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            onClick={() => setMode('manual')}
          >
            ✏️ {t('health.manual_entry', locale)}
          </button>
        </div>

        {/* PDF Upload Mode */}
        {mode === 'upload' && (
          <Card>
            {/* Drop zone */}
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-indigo-400 transition-colors cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg className="mx-auto w-12 h-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
              <p className="text-sm text-gray-600 font-medium">{t('health.drag_drop', locale)}</p>
              <p className="text-xs text-gray-400 mt-1">{t('health.select_file', locale)}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="text-lg">
                      {f.status === 'done' ? '✅' : f.status === 'error' ? '❌' : f.status === 'uploading' ? '⏳' : '📄'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{f.file.name}</div>
                      <div className="text-xs text-gray-500">
                        {(f.file.size / 1024).toFixed(0)} KB
                        {f.resultCount !== undefined && ` · ${f.resultCount} results`}
                        {f.score !== null && f.score !== undefined && ` · Score: ${f.score}`}
                      </div>
                      {f.warnings && f.warnings.length > 0 && (
                        <div className="text-xs text-amber-600 mt-1">{f.warnings.join(', ')}</div>
                      )}
                    </div>
                    {f.status === 'done' && f.reportId && (
                      <Button size="sm" variant="ghost" onClick={() => router.push(`/health/report/${f.reportId}`)}>
                        View
                      </Button>
                    )}
                    {f.status === 'pending' && (
                      <Button size="sm" variant="ghost" onClick={() => removeFile(f.id)}>
                        ✕
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Upload button */}
            {files.some((f) => f.status === 'pending') && (
              <div className="mt-4 flex justify-end">
                <Button onClick={handleUpload} disabled={uploading}>
                  {uploading ? t('health.parsing', locale) : `Upload ${files.filter((f) => f.status === 'pending').length} file(s)`}
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* Manual Entry Mode */}
        {mode === 'manual' && (
          <Card>
            <div className="space-y-3">
              {manualResults.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-[13px] font-medium text-gray-700 mb-1">Biomarker</label>
                    <select
                      value={row.biomarker}
                      onChange={(e) => updateManualRow(idx, 'biomarker', e.target.value)}
                      className="w-full h-10 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select biomarker...</option>
                      {Object.entries(biomarkersByCategory).map(([cat, bms]) => (
                        <optgroup key={cat} label={cat}>
                          {bms.map((bm) => (
                            <option key={bm.id} value={bm.id}>
                              {bm.abbreviation} — {locale === 'bg' && bm.name_bg ? bm.name_bg : bm.name} ({bm.unit})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="w-32">
                    <Input label="Value" type="number" step="any" value={row.value}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateManualRow(idx, 'value', e.target.value)} />
                  </div>
                  <button
                    onClick={() => removeManualRow(idx)}
                    className="h-10 w-10 shrink-0 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove"
                  >✕</button>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <Button variant="secondary" size="sm" onClick={addManualRow}>+ Add Row</Button>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => router.push('/health')}>{t('common.cancel', locale)}</Button>
              <Button onClick={handleManualSave} disabled={saving}>
                {saving ? t('common.loading', locale) : t('common.save', locale)}
              </Button>
            </div>
          </Card>
        )}
      </PageContent>
    </PageShell>
  );
}
