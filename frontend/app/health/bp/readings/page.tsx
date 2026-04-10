'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../context/LanguageContext';
import { t } from '../../../lib/i18n';
import { getHealthProfiles } from '../../../lib/api';
import NavBar from '../../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Alert, Spinner, Input, EmptyState } from '../../../components/ui';

// ── Types ──────────────────────────────────────────────────────────

interface Profile {
  id: number; full_name: string; is_primary: boolean;
}

interface BpReading {
  id: string;
  profile_id: number;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  arm: 'left' | 'right';
  posture: 'sitting' | 'standing' | 'lying';
  context: string[];
  notes: string;
  measured_at: string;
  session_id: string | null;
}

type BpStage = 'normal' | 'elevated' | 'stage1' | 'stage2' | 'crisis';
type SortKey = 'date' | 'systolic' | 'diastolic' | 'pulse';

// ── Helpers ────────────────────────────────────────────────────────

const BP_READINGS_KEY = 'domapp_bp_readings';

function loadReadings(): BpReading[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(BP_READINGS_KEY) || '[]'); } catch { return []; }
}

function saveReadings(readings: BpReading[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BP_READINGS_KEY, JSON.stringify(readings));
}

function classifyBp(sys: number, dia: number): BpStage {
  if (sys >= 180 || dia >= 120) return 'crisis';
  if (sys >= 140 || dia >= 90) return 'stage2';
  if (sys >= 130 || dia >= 80) return 'stage1';
  if (sys >= 120 && dia < 80) return 'elevated';
  return 'normal';
}

const STAGE_META: Record<BpStage, { label_en: string; label_bg: string; badgeColor: 'green' | 'yellow' | 'red' | 'purple' }> = {
  normal:   { label_en: 'Normal',              label_bg: 'Нормално',          badgeColor: 'green' },
  elevated: { label_en: 'Elevated',            label_bg: 'Повишено',          badgeColor: 'yellow' },
  stage1:   { label_en: 'Stage 1 HTN',         label_bg: 'Хипертония ст. 1', badgeColor: 'yellow' },
  stage2:   { label_en: 'Stage 2 HTN',         label_bg: 'Хипертония ст. 2', badgeColor: 'red' },
  crisis:   { label_en: 'Hypertensive Crisis',  label_bg: 'Хипертонична криза', badgeColor: 'purple' },
};

const STAGE_LABELS_EN: BpStage[] = ['normal', 'elevated', 'stage1', 'stage2', 'crisis'];

const CONTEXT_ICONS: Record<string, string> = {
  caffeine: '\u2615', exercise: '\ud83c\udfc3', medication: '\ud83d\udc8a',
  stressed: '\ud83d\ude30', clinic: '\ud83c\udfe5', fasting: '\ud83c\udf74',
};

function formatDateTime(dateStr: string, locale: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function postureLabel(p: string, locale: string): string {
  if (p === 'sitting') return locale === 'bg' ? 'Седнал' : 'Sitting';
  if (p === 'standing') return locale === 'bg' ? 'Правостоящ' : 'Standing';
  return locale === 'bg' ? 'Легнал' : 'Lying';
}

function armLabel(a: string, locale: string): string {
  return a === 'left' ? (locale === 'bg' ? 'Лява' : 'Left') : (locale === 'bg' ? 'Дясна' : 'Right');
}

function downloadCsv(readings: BpReading[], locale: string) {
  const headers = ['Date', 'Systolic', 'Diastolic', 'Pulse', 'Stage', 'Arm', 'Posture', 'Context', 'Notes'];
  const rows = readings.map(r => [
    new Date(r.measured_at).toISOString(),
    r.systolic, r.diastolic, r.pulse || '',
    classifyBp(r.systolic, r.diastolic),
    r.arm, r.posture,
    r.context.join('; '),
    r.notes.replace(/"/g, '""'),
  ]);
  const csv = [headers.join(','), ...rows.map(row => row.map(v => `"${v}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bp-readings-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page Size ─────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ── Main Page ─────────────────────────────────────────────────────

export default function BpReadingsPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);
  const [allReadings, setAllReadings] = useState<BpReading[]>([]);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stageFilter, setStageFilter] = useState<BpStage | ''>('');
  const [contextFilter, setContextFilter] = useState('');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const profs = await getHealthProfiles();
      setProfiles(profs);
      const primary = profs.find((p: Profile) => p.is_primary) || profs[0];
      if (primary) {
        setSelectedProfile(primary.id);
        const readings = loadReadings().filter((r: BpReading) => r.profile_id === primary.id);
        setAllReadings(readings);
      }
      setError('');
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleProfileChange = (id: string) => {
    const numId = Number(id);
    setSelectedProfile(numId);
    setAllReadings(loadReadings().filter(r => r.profile_id === numId));
    setPage(1);
  };

  const handleDelete = (id: string) => {
    const all = loadReadings().filter(r => r.id !== id);
    saveReadings(all);
    setAllReadings(all.filter(r => r.profile_id === selectedProfile));
    setDeleteId(null);
  };

  // Apply filters
  let filtered = [...allReadings];
  if (dateFrom) filtered = filtered.filter(r => r.measured_at >= new Date(dateFrom).toISOString());
  if (dateTo) filtered = filtered.filter(r => r.measured_at <= new Date(dateTo + 'T23:59:59').toISOString());
  if (stageFilter) filtered = filtered.filter(r => classifyBp(r.systolic, r.diastolic) === stageFilter);
  if (contextFilter) filtered = filtered.filter(r => r.context.includes(contextFilter));

  // Apply sort
  filtered.sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'date': cmp = a.measured_at.localeCompare(b.measured_at); break;
      case 'systolic': cmp = a.systolic - b.systolic; break;
      case 'diastolic': cmp = a.diastolic - b.diastolic; break;
      case 'pulse': cmp = (a.pulse || 0) - (b.pulse || 0); break;
    }
    return sortAsc ? cmp : -cmp;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortAsc ? ' \u2191' : ' \u2193';
  };

  if (loading) return (
    <PageShell><NavBar /><PageContent size="lg"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>
  );

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={locale === 'bg' ? 'Всички измервания' : 'All Readings'}
          onBack={() => router.push('/health/bp')}
          backLabel={locale === 'bg' ? 'Назад' : 'Back'}
          action={
            <div className="flex items-center gap-3">
              {profiles.length > 1 && (
                <select
                  value={selectedProfile || ''}
                  onChange={e => handleProfileChange(e.target.value)}
                  className="h-10 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}{p.is_primary ? ' (me)' : ''}</option>
                  ))}
                </select>
              )}
              <Button variant="secondary" size="sm" onClick={() => downloadCsv(filtered, locale)}>
                {locale === 'bg' ? 'Експорт CSV' : 'Export CSV'}
              </Button>
            </div>
          }
        />

        <Alert type="error" message={error} />

        {/* Filters */}
        <Card className="mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              label={locale === 'bg' ? 'От дата' : 'From Date'}
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            />
            <Input
              label={locale === 'bg' ? 'До дата' : 'To Date'}
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }}
            />
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                {locale === 'bg' ? 'Стадий' : 'Stage'}
              </label>
              <select
                value={stageFilter}
                onChange={e => { setStageFilter(e.target.value as BpStage | ''); setPage(1); }}
                className="w-full h-10 px-3 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{locale === 'bg' ? 'Всички' : 'All'}</option>
                {STAGE_LABELS_EN.map(s => (
                  <option key={s} value={s}>{locale === 'bg' ? STAGE_META[s].label_bg : STAGE_META[s].label_en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                {locale === 'bg' ? 'Контекст' : 'Context'}
              </label>
              <select
                value={contextFilter}
                onChange={e => { setContextFilter(e.target.value); setPage(1); }}
                className="w-full h-10 px-3 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{locale === 'bg' ? 'Всички' : 'All'}</option>
                {Object.keys(CONTEXT_ICONS).map(k => (
                  <option key={k} value={k}>{CONTEXT_ICONS[k]} {k}</option>
                ))}
              </select>
            </div>
          </div>
          {(dateFrom || dateTo || stageFilter || contextFilter) && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-gray-500">{filtered.length} {locale === 'bg' ? 'резултата' : 'results'}</span>
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setStageFilter(''); setContextFilter(''); setPage(1); }}>
                {locale === 'bg' ? 'Изчисти филтри' : 'Clear Filters'}
              </Button>
            </div>
          )}
        </Card>

        {/* Results */}
        {filtered.length === 0 ? (
          <EmptyState icon="\ud83d\udcca" message={locale === 'bg' ? 'Няма измервания за избраните филтри.' : 'No readings match the selected filters.'} />
        ) : (
          <>
            <Card padding={false} className="mb-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase cursor-pointer hover:text-gray-600" onClick={() => handleSort('date')}>
                        {locale === 'bg' ? 'Дата/Час' : 'Date/Time'}{sortIcon('date')}
                      </th>
                      <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase cursor-pointer hover:text-gray-600" onClick={() => handleSort('systolic')}>
                        SYS/DIA{sortIcon('systolic')}
                      </th>
                      <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase cursor-pointer hover:text-gray-600" onClick={() => handleSort('pulse')}>
                        {locale === 'bg' ? 'Пулс' : 'Pulse'}{sortIcon('pulse')}
                      </th>
                      <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase">{locale === 'bg' ? 'Стадий' : 'Stage'}</th>
                      <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase">{locale === 'bg' ? 'Контекст' : 'Context'}</th>
                      <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase">{locale === 'bg' ? 'Ръка' : 'Arm'}</th>
                      <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase">{locale === 'bg' ? 'Поза' : 'Posture'}</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase">{locale === 'bg' ? 'Бележки' : 'Notes'}</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(r => {
                      const stage = classifyBp(r.systolic, r.diastolic);
                      return (
                        <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50 ${r.context.includes('medication') ? 'bg-pink-50' : ''}`}>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {formatDateTime(r.measured_at, locale)}
                            {r.session_id && <span className="ml-1 text-indigo-400" title={locale === 'bg' ? 'Сесия' : 'Session'}>S</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-lg font-bold ${STAGE_META[stage].badgeColor === 'green' ? 'text-emerald-600' : STAGE_META[stage].badgeColor === 'yellow' ? 'text-amber-600' : STAGE_META[stage].badgeColor === 'red' ? 'text-red-600' : 'text-red-800'}`}>
                              {r.systolic}/{r.diastolic}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">{r.pulse || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge color={STAGE_META[stage].badgeColor}>
                              {locale === 'bg' ? STAGE_META[stage].label_bg : STAGE_META[stage].label_en}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-base">{r.context.map(c => CONTEXT_ICONS[c] || '').join(' ')}</span>
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-gray-500">{armLabel(r.arm, locale)}</td>
                          <td className="px-4 py-3 text-center text-xs text-gray-500">{postureLabel(r.posture, locale)}</td>
                          <td className="px-4 py-3 text-xs text-gray-500 max-w-[150px] truncate">{r.notes || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            {deleteId === r.id ? (
                              <div className="flex items-center gap-1">
                                <Button variant="danger" size="sm" onClick={() => handleDelete(r.id)}>
                                  {locale === 'bg' ? 'Да' : 'Yes'}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteId(null)}>
                                  {locale === 'bg' ? 'Не' : 'No'}
                                </Button>
                              </div>
                            ) : (
                              <Button variant="danger" size="sm" onClick={() => setDeleteId(r.id)}>
                                {locale === 'bg' ? 'Изтрий' : 'Delete'}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {locale === 'bg' ? 'Страница' : 'Page'} {page} {locale === 'bg' ? 'от' : 'of'} {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    &laquo; {locale === 'bg' ? 'Назад' : 'Prev'}
                  </Button>
                  <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    {locale === 'bg' ? 'Напред' : 'Next'} &raquo;
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </PageContent>
    </PageShell>
  );
}
