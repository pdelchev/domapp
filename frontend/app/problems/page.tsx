'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getProblems, getProperties, deleteProblem, updateProblem } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Badge, Button, Select, Spinner, EmptyState } from '../components/ui';

interface Problem {
  id: number;
  property: number;
  property_name: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  reported_by: string;
  assigned_to: string;
  estimated_cost: number | null;
  actual_cost: number | null;
  resolution_notes: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PropertyItem {
  id: number;
  name: string;
}

const PRIORITY_COLORS: Record<string, 'red' | 'yellow' | 'blue' | 'gray'> = {
  emergency: 'red',
  high: 'yellow',
  medium: 'blue',
  low: 'gray',
};

const STATUS_COLORS: Record<string, 'red' | 'yellow' | 'indigo' | 'green' | 'gray'> = {
  open: 'red',
  in_progress: 'yellow',
  resolved: 'green',
  closed: 'gray',
};

const CATEGORY_ICONS: Record<string, string> = {
  plumbing: 'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z',
  electrical: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
  appliance: 'M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z',
  structural: 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z',
  pest: 'M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0112 12.75zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 01-1.152-6.135 3.001 3.001 0 10-2.055-.18 23.834 23.834 0 01-5 4.824 23.834 23.834 0 01-5-4.824 3.001 3.001 0 10-2.055.18A23.91 23.91 0 016.793 14.19 24.467 24.467 0 0112 12.75z',
  hvac: 'M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.047 8.287 8.287 0 009 9.601a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z',
  security: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  cleaning: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z',
  noise: 'M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z',
  damage: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  tenant: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  other: 'M11.42 15.17l-5.648-3.014a.75.75 0 01-.362-.987l3.014-5.648a.75.75 0 01.987-.362l5.648 3.014a.75.75 0 01.362.987l-3.014 5.648a.75.75 0 01-.987.362z',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

export default function ProblemsPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await getProblems(
        propertyFilter ? Number(propertyFilter) : undefined,
        statusFilter || undefined,
        priorityFilter || undefined,
        categoryFilter || undefined,
      );
      setProblems(data);
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, propertyFilter, categoryFilter, router]);

  useEffect(() => {
    getProperties().then(setProperties).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    if (!confirm(t('problems.delete_confirm', locale))) return;
    await deleteProblem(id);
    setProblems((prev) => prev.filter((p) => p.id !== id));
  };

  const handleStatusChange = async (problem: Problem, newStatus: string) => {
    await updateProblem(problem.id, { ...problem, status: newStatus });
    setProblems((prev) =>
      prev.map((p) => p.id === problem.id ? { ...p, status: newStatus } : p)
    );
  };

  // Summary counts
  const openCount = problems.filter((p) => p.status === 'open').length;
  const inProgressCount = problems.filter((p) => p.status === 'in_progress').length;
  const emergencyCount = problems.filter((p) => p.priority === 'emergency' && p.status !== 'resolved' && p.status !== 'closed').length;

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('problems.title', locale)}
          action={
            <Button onClick={() => router.push('/problems/new')}>
              + {t('problems.add', locale)}
            </Button>
          }
        />

        {/* Summary badges */}
        <div className="flex gap-3 mb-4">
          {emergencyCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-semibold text-red-700">{emergencyCount} {t('problems.emergency', locale)}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
            <span className="text-xs font-medium text-amber-700">{openCount} {t('problems.open', locale)}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-xs font-medium text-blue-700">{inProgressCount} {t('problems.in_progress', locale)}</span>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Select
            value={propertyFilter}
            onChange={(e) => { setPropertyFilter(e.target.value); setLoading(true); }}
          >
            <option value="">{t('finance.all_properties', locale)}</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setLoading(true); }}
          >
            <option value="">{t('problems.all_statuses', locale)}</option>
            <option value="open">{t('problems.open', locale)}</option>
            <option value="in_progress">{t('problems.in_progress', locale)}</option>
            <option value="resolved">{t('problems.resolved', locale)}</option>
            <option value="closed">{t('problems.closed', locale)}</option>
          </Select>
          <Select
            value={priorityFilter}
            onChange={(e) => { setPriorityFilter(e.target.value); setLoading(true); }}
          >
            <option value="">{t('problems.all_priorities', locale)}</option>
            <option value="emergency">{t('problems.emergency', locale)}</option>
            <option value="high">{t('problems.high', locale)}</option>
            <option value="medium">{t('problems.medium', locale)}</option>
            <option value="low">{t('problems.low', locale)}</option>
          </Select>
          <Select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setLoading(true); }}
          >
            <option value="">{t('problems.all_categories', locale)}</option>
            {['plumbing','electrical','appliance','structural','pest','hvac','security','cleaning','noise','damage','tenant','other'].map((c) => (
              <option key={c} value={c}>{t(`problems.${c === 'security' ? 'security_cat' : c === 'tenant' ? 'tenant_issue' : c}`, locale)}</option>
            ))}
          </Select>
        </div>

        {/* Problem list */}
        {problems.length === 0 ? (
          <EmptyState icon="🔧" message={t('problems.no_problems', locale)} />
        ) : (
          <div className="space-y-2">
            {problems.map((problem) => {
              const priorityColor = PRIORITY_COLORS[problem.priority] || 'gray';
              const statusColor = STATUS_COLORS[problem.status] || 'gray';
              const iconPath = CATEGORY_ICONS[problem.category] || CATEGORY_ICONS.other;
              const borderColor = problem.priority === 'emergency' ? 'border-l-red-500' :
                problem.priority === 'high' ? 'border-l-amber-400' :
                problem.priority === 'medium' ? 'border-l-blue-400' : 'border-l-gray-300';

              return (
                <Card
                  key={problem.id}
                  className={`!p-0 border-l-[3px] ${borderColor}`}
                >
                  <div
                    className="flex gap-3 px-3 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => router.push(`/problems/${problem.id}`)}
                  >
                    {/* Category icon */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      problem.priority === 'emergency' ? 'bg-red-100 text-red-600' :
                      problem.priority === 'high' ? 'bg-amber-100 text-amber-600' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
                      </svg>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {problem.title}
                            </span>
                            {problem.priority === 'emergency' && (
                              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                            )}
                          </div>
                          {problem.description && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{problem.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <Badge color={priorityColor}>{t(`problems.${problem.priority}`, locale)}</Badge>
                            <Badge color={statusColor}>{t(`problems.${problem.status}`, locale)}</Badge>
                            <span className="text-[11px] text-gray-400 truncate">{problem.property_name}</span>
                            {problem.assigned_to && (
                              <span className="text-[11px] text-gray-400 truncate">&rarr; {problem.assigned_to}</span>
                            )}
                            <span className="text-[11px] text-gray-400">{timeAgo(problem.created_at)}</span>
                          </div>
                        </div>

                        {/* Quick actions */}
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {problem.status === 'open' && (
                            <button
                              onClick={() => handleStatusChange(problem, 'in_progress')}
                              className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
                              title={t('problems.in_progress', locale)}
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
                              </svg>
                            </button>
                          )}
                          {(problem.status === 'open' || problem.status === 'in_progress') && (
                            <button
                              onClick={() => handleStatusChange(problem, 'resolved')}
                              className="p-1.5 rounded-lg text-green-500 hover:bg-green-50 transition-colors"
                              title={t('problems.resolved', locale)}
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(problem.id)}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}
