'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getDashboardSummary, getProperties, getRentPayments, updateRentPayment, batchMarkPaid } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, Card, Button, Badge, Spinner } from '../components/ui';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardData {
  total_properties: number;
  total_portfolio_value: number;
  active_leases: number;
  occupancy_rate: number;
  monthly_rent_collected: number;
  monthly_expenses: number;
  net_cash_flow: number;
  upcoming_rent_due: number;
  overdue_rent: number;
  expiring_documents: number;
  month_payments_total: number;
  month_payments_collected: number;
  month_total_due: number;
  month_total_collected: number;
}

interface Property {
  id: number;
  name: string;
  city: string;
  property_type: string;
  owner_name: string;
  current_value: number;
}

interface Payment {
  id: number;
  lease: number;
  tenant_name: string;
  property_name: string;
  due_date: string;
  amount_due: string;
  amount_paid: string;
  payment_date: string | null;
  status: string;
  method: string | null;
  rent_frequency: string;
}

interface UndoItem {
  payment: Payment;
  timerId: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// Smart method memory — remembers last payment method per tenant in localStorage
// ---------------------------------------------------------------------------

const METHODS_KEY = 'domapp_tenant_methods';

function getTenantMethod(tenantName: string): string {
  try {
    const stored = JSON.parse(localStorage.getItem(METHODS_KEY) || '{}');
    return stored[tenantName] || 'bank';
  } catch {
    return 'bank';
  }
}

function saveTenantMethod(tenantName: string, method: string): void {
  try {
    const stored = JSON.parse(localStorage.getItem(METHODS_KEY) || '{}');
    stored[tenantName] = method;
    localStorage.setItem(METHODS_KEY, JSON.stringify(stored));
  } catch {
    // localStorage unavailable — silent fail
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

// Deterministic avatar color from name
const AVATAR_COLORS = [
  'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
  'bg-cyan-500', 'bg-violet-500', 'bg-orange-500', 'bg-teal-500',
];
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function daysFromToday(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

const TYPE_BADGE: Record<string, 'blue' | 'green' | 'yellow' | 'purple'> = {
  apartment: 'blue',
  house: 'green',
  studio: 'yellow',
  commercial: 'purple',
};

const today = () => new Date().toISOString().split('T')[0];

const MONTH_NAMES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_BG = ['Яну', 'Фев', 'Мар', 'Апр', 'Май', 'Юни', 'Юли', 'Авг', 'Сеп', 'Окт', 'Ное', 'Дек'];

function periodLabel(dueDate: string, frequency: string, locale: string): string {
  const d = new Date(dueDate);
  const months = locale === 'bg' ? MONTH_NAMES_BG : MONTH_NAMES_EN;
  if (frequency === 'monthly') {
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  }
  if (frequency === 'biweekly' || frequency === 'weekly') {
    const end = new Date(d);
    end.setDate(end.getDate() + (frequency === 'weekly' ? 6 : 13));
    return `${d.getDate()} ${months[d.getMonth()]} – ${end.getDate()} ${months[end.getMonth()]}`;
  }
  return dueDate;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter();
  const { locale } = useLanguage();

  // Data
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  // Expanded card (for custom date/method)
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandMethod, setExpandMethod] = useState('bank');
  const [expandDate, setExpandDate] = useState(today());

  // Batch mode
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchMethod, setBatchMethod] = useState('bank');

  // Undo queue
  const [undoItems, setUndoItems] = useState<UndoItem[]>([]);
  const undoRef = useRef<UndoItem[]>([]);
  undoRef.current = undoItems;

  // Paying state (to show spinner on quick-pay button)
  const [payingIds, setPayingIds] = useState<Set<number>>(new Set());

  // ------- Data loading -------
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [dash, props] = await Promise.all([getDashboardSummary(), getProperties()]);
        if (!cancelled) { setDashboard(dash); setProperties(props); }
      } catch {
        if (!cancelled) router.push('/login');
      } finally {
        if (!cancelled) setLoading(false);
      }
      try {
        const pays = await getRentPayments();
        if (!cancelled) setPayments(pays);
      } catch { /* optional */ }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ------- Formatters -------
  const fmt = (value: number | string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(Number(value));

  const fmtShort = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return String(value);
  };

  // ------- Actionable payments (pending + overdue, sorted by urgency) -------
  const actionable = payments
    .filter((p) => p.status === 'pending' || p.status === 'overdue')
    .sort((a, b) => {
      if (a.status === 'overdue' && b.status !== 'overdue') return -1;
      if (a.status !== 'overdue' && b.status === 'overdue') return 1;
      return a.due_date.localeCompare(b.due_date);
    });

  // ------- Quick Pay (one-tap) -------
  const handleQuickPay = useCallback(async (payment: Payment) => {
    const method = getTenantMethod(payment.tenant_name);
    const paymentDate = today();

    // Optimistic update — remove from list immediately
    setPayingIds((prev) => new Set(prev).add(payment.id));
    setPayments((prev) => prev.map((p) =>
      p.id === payment.id ? { ...p, status: 'paid', amount_paid: payment.amount_due, payment_date: paymentDate, method } : p
    ));
    updateDashboardAfterPay(payment);

    try {
      await updateRentPayment(payment.id, {
        status: 'paid',
        amount_paid: payment.amount_due,
        payment_date: paymentDate,
        method,
      });
      saveTenantMethod(payment.tenant_name, method);

      // Add undo toast (5 second window)
      const timerId = setTimeout(() => {
        setUndoItems((prev) => prev.filter((u) => u.payment.id !== payment.id));
      }, 5000);
      setUndoItems((prev) => [...prev, { payment, timerId }]);
    } catch {
      // Revert on failure
      setPayments((prev) => prev.map((p) => p.id === payment.id ? payment : p));
      revertDashboardAfterPay(payment);
    } finally {
      setPayingIds((prev) => { const s = new Set(prev); s.delete(payment.id); return s; });
    }
  }, [dashboard]);

  // ------- Undo -------
  const handleUndo = useCallback(async (payment: Payment) => {
    // Clear the timer
    const item = undoRef.current.find((u) => u.payment.id === payment.id);
    if (item) clearTimeout(item.timerId);
    setUndoItems((prev) => prev.filter((u) => u.payment.id !== payment.id));

    // Revert on backend
    try {
      await updateRentPayment(payment.id, {
        status: payment.status,
        amount_paid: 0,
        payment_date: null,
        method: null,
      });
    } catch { /* silent */ }

    // Revert in UI
    setPayments((prev) => {
      const exists = prev.some((p) => p.id === payment.id);
      if (exists) return prev.map((p) => p.id === payment.id ? payment : p);
      return [...prev, payment];
    });
    revertDashboardAfterPay(payment);
  }, []);

  // ------- Expanded card confirm -------
  const handleExpandConfirm = useCallback(async (payment: Payment) => {
    setPayments((prev) => prev.map((p) =>
      p.id === payment.id ? { ...p, status: 'paid', amount_paid: payment.amount_due, payment_date: expandDate, method: expandMethod } : p
    ));
    updateDashboardAfterPay(payment);
    setExpandedId(null);

    try {
      await updateRentPayment(payment.id, {
        status: 'paid',
        amount_paid: payment.amount_due,
        payment_date: expandDate,
        method: expandMethod,
      });
      saveTenantMethod(payment.tenant_name, expandMethod);

      const timerId = setTimeout(() => {
        setUndoItems((prev) => prev.filter((u) => u.payment.id !== payment.id));
      }, 5000);
      setUndoItems((prev) => [...prev, { payment, timerId }]);
    } catch {
      setPayments((prev) => prev.map((p) => p.id === payment.id ? payment : p));
      revertDashboardAfterPay(payment);
    }
  }, [expandDate, expandMethod, dashboard]);

  // ------- Batch confirm -------
  const handleBatchConfirm = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const affectedPayments = actionable.filter((p) => ids.includes(p.id));

    // Optimistic update
    setPayments((prev) => prev.map((p) =>
      ids.includes(p.id) ? { ...p, status: 'paid', amount_paid: p.amount_due, payment_date: today(), method: batchMethod } : p
    ));
    affectedPayments.forEach((p) => updateDashboardAfterPay(p));
    setBatchMode(false);
    setSelectedIds(new Set());

    try {
      await batchMarkPaid(ids, batchMethod, today());
      affectedPayments.forEach((p) => saveTenantMethod(p.tenant_name, batchMethod));
    } catch {
      // Revert all
      setPayments((prev) => {
        const revertMap = new Map(affectedPayments.map((p) => [p.id, p]));
        return prev.map((p) => revertMap.get(p.id) || p);
      });
      affectedPayments.forEach((p) => revertDashboardAfterPay(p));
    }
  }, [selectedIds, batchMethod, actionable, dashboard]);

  // ------- Dashboard metric updaters -------
  function updateDashboardAfterPay(payment: Payment) {
    setDashboard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        monthly_rent_collected: prev.monthly_rent_collected + Number(payment.amount_due),
        net_cash_flow: prev.net_cash_flow + Number(payment.amount_due),
        overdue_rent: payment.status === 'overdue' ? Math.max(0, prev.overdue_rent - 1) : prev.overdue_rent,
        upcoming_rent_due: payment.status === 'pending' ? Math.max(0, prev.upcoming_rent_due - 1) : prev.upcoming_rent_due,
        month_payments_collected: prev.month_payments_collected + 1,
        month_total_collected: prev.month_total_collected + Number(payment.amount_due),
      };
    });
  }

  function revertDashboardAfterPay(payment: Payment) {
    setDashboard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        monthly_rent_collected: prev.monthly_rent_collected - Number(payment.amount_due),
        net_cash_flow: prev.net_cash_flow - Number(payment.amount_due),
        overdue_rent: payment.status === 'overdue' ? prev.overdue_rent + 1 : prev.overdue_rent,
        upcoming_rent_due: payment.status === 'pending' ? prev.upcoming_rent_due + 1 : prev.upcoming_rent_due,
        month_payments_collected: Math.max(0, prev.month_payments_collected - 1),
        month_total_collected: prev.month_total_collected - Number(payment.amount_due),
      };
    });
  }

  // ------- Batch selection helpers -------
  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllOverdue = () => {
    setSelectedIds(new Set(actionable.filter((p) => p.status === 'overdue').map((p) => p.id)));
  };

  const selectAll = () => {
    setSelectedIds(new Set(actionable.map((p) => p.id)));
  };

  // ------- Expand a card -------
  const openExpanded = (payment: Payment) => {
    if (batchMode) return;
    setExpandedId(payment.id);
    setExpandMethod(getTenantMethod(payment.tenant_name));
    setExpandDate(today());
  };

  // ------- Loading -------
  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  // ------- Collection progress -------
  const collectedCount = dashboard?.month_payments_collected ?? 0;
  const totalCount = dashboard?.month_payments_total ?? 0;
  const collectedAmount = dashboard?.month_total_collected ?? 0;
  const totalAmount = dashboard?.month_total_due ?? 0;
  const remainingAmount = totalAmount - collectedAmount;
  const progressPct = totalCount > 0 ? Math.round((collectedCount / totalCount) * 100) : 0;

  return (
    <PageShell>
      <NavBar />
      <PageContent>
        {/* ====== METRIC CARDS — same 4 cards, same colors ====== */}
        {dashboard && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {/* Net Cash Flow */}
            <Card className="!p-4">
              <p className="text-xs text-gray-500 mb-1">{t('dash.net_cash_flow', locale)}</p>
              <p className={`text-xl font-bold transition-all duration-300 ${dashboard.net_cash_flow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(dashboard.net_cash_flow)}
              </p>
              <div className="flex gap-3 mt-2 text-[11px] text-gray-400">
                <span className="text-green-600">+{fmtShort(dashboard.monthly_rent_collected)}</span>
                <span className="text-red-500">-{fmtShort(dashboard.monthly_expenses)}</span>
              </div>
            </Card>
            {/* Portfolio Value */}
            <Card className="!p-4">
              <p className="text-xs text-gray-500 mb-1">{t('dash.portfolio_value', locale)}</p>
              <p className="text-xl font-bold text-gray-900">{fmt(dashboard.total_portfolio_value)}</p>
              <p className="text-[11px] text-gray-400 mt-2">{dashboard.total_properties} {t('dash.properties', locale).toLowerCase()}</p>
            </Card>
            {/* Occupancy */}
            <Card className="!p-4">
              <p className="text-xs text-gray-500 mb-1">{t('dash.occupancy', locale)}</p>
              <p className="text-xl font-bold text-gray-900">{dashboard.occupancy_rate}%</p>
              <p className="text-[11px] text-gray-400 mt-2">{dashboard.active_leases} {t('dash.active_leases', locale).toLowerCase()}</p>
            </Card>
            {/* Action Required */}
            <Card className="!p-4">
              <p className="text-xs text-gray-500 mb-1">{t('dash.action_required', locale)}</p>
              <div className="flex items-baseline gap-2">
                <p className={`text-xl font-bold ${dashboard.overdue_rent > 0 ? 'text-red-600' : 'text-gray-900'}`}>{dashboard.overdue_rent}</p>
                <span className="text-[11px] text-red-500">{t('dash.overdue', locale).toLowerCase()}</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">{dashboard.upcoming_rent_due} {t('dash.upcoming_rent', locale).toLowerCase()}</p>
            </Card>
          </div>
        )}

        {/* ====== COLLECTION PROGRESS BAR ====== */}
        {dashboard && totalCount > 0 && (
          <Card className="!px-4 !py-3 mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-700">
                {t('dash.collection', locale)}: {collectedCount} {t('dash.of', locale)} {totalCount} {t('dash.collected', locale)}
              </span>
              <span className="text-xs font-semibold text-gray-900">{progressPct}%</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {remainingAmount > 0 && (
              <p className="text-[11px] text-gray-400 mt-1.5">{fmt(remainingAmount)} {t('dash.remaining', locale)}</p>
            )}
          </Card>
        )}

        {/* ====== ACTION ITEMS — PAYMENT CARDS ====== */}
        <div className="mb-6">
          {/* Section header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">{t('dash.action_required', locale)}</h2>
              {actionable.length > 0 && <Badge color="red">{actionable.length}</Badge>}
            </div>
            {actionable.length > 1 && (
              <Button
                variant={batchMode ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()); }}
              >
                {batchMode ? t('dash.done', locale) : t('dash.batch', locale)}
              </Button>
            )}
          </div>

          {/* Batch quick-select buttons */}
          {batchMode && actionable.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={selectAll}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-md hover:bg-indigo-50 transition-colors"
              >
                {t('dash.select_all', locale)}
              </button>
              {actionable.some((p) => p.status === 'overdue') && (
                <button
                  onClick={selectAllOverdue}
                  className="text-xs font-medium text-red-600 hover:text-red-800 px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                >
                  {t('dash.select_overdue', locale)}
                </button>
              )}
            </div>
          )}

          {/* Empty state */}
          {actionable.length === 0 ? (
            <Card className="py-8 text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-gray-400">{t('dash.all_caught_up', locale)}</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {actionable.map((payment) => {
                const isExpanded = expandedId === payment.id;
                const isSelected = selectedIds.has(payment.id);
                const isPaying = payingIds.has(payment.id);
                const days = daysFromToday(payment.due_date);
                const isOverdue = payment.status === 'overdue';
                const isDueToday = days === 0;

                // Left border color: red=overdue, yellow=today, transparent=upcoming
                const borderColor = isOverdue ? 'border-l-red-500' : isDueToday ? 'border-l-amber-400' : 'border-l-transparent';

                return (
                  <Card
                    key={payment.id}
                    className={`!p-0 border-l-[3px] ${borderColor} transition-all duration-200 ${
                      isSelected ? 'ring-2 ring-indigo-500 !border-l-indigo-500' : ''
                    } ${isOverdue && !isSelected ? 'bg-red-50/60' : ''}`}
                  >
                    {/* Main card row */}
                    <div
                      className="flex items-center gap-3 px-3 py-3 cursor-pointer active:bg-gray-50 transition-colors"
                      onClick={() => batchMode ? toggleSelected(payment.id) : openExpanded(payment)}
                    >
                      {/* Batch checkbox OR avatar */}
                      {batchMode ? (
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      ) : (
                        <div className={`w-9 h-9 rounded-full ${getAvatarColor(payment.tenant_name)} flex items-center justify-center shrink-0`}>
                          <span className="text-xs font-bold text-white">{getInitials(payment.tenant_name)}</span>
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 truncate">{payment.tenant_name}</span>
                          <span className="hidden sm:inline-flex">
                            <Badge color={isOverdue ? 'red' : 'yellow'}>
                              {t(`payments.${payment.status}`, locale)}
                            </Badge>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
                          <span className="truncate">{payment.property_name}</span>
                          <span>&middot;</span>
                          <span className="whitespace-nowrap font-medium text-gray-500">{periodLabel(payment.due_date, payment.rent_frequency, locale)}</span>
                          <span>&middot;</span>
                          {isOverdue ? (
                            <span className="text-red-600 font-semibold whitespace-nowrap">{Math.abs(days)} {t('dash.days_overdue', locale)}</span>
                          ) : isDueToday ? (
                            <span className="text-amber-600 font-medium whitespace-nowrap">{t('dash.due_today', locale)}</span>
                          ) : (
                            <span className="whitespace-nowrap">{t('dash.due_in', locale)} {days} {t('dash.days', locale)}</span>
                          )}
                        </div>
                      </div>

                      {/* Amount + Quick Pay */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-gray-900">{fmt(payment.amount_due)}</span>
                        {!batchMode && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleQuickPay(payment); }}
                            disabled={isPaying}
                            className="w-9 h-9 rounded-full bg-green-50 hover:bg-green-100 active:bg-green-200 flex items-center justify-center transition-colors disabled:opacity-50"
                            title={t('payments.mark_paid', locale)}
                          >
                            {isPaying ? (
                              <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <svg className="w-4.5 h-4.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded detail panel (date, method, amount) */}
                    {isExpanded && !batchMode && (
                      <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {/* Date */}
                          <div>
                            <label className="block text-[11px] font-medium text-gray-500 mb-1">{t('payments.payment_date', locale)}</label>
                            <input
                              type="date"
                              value={expandDate}
                              onChange={(e) => setExpandDate(e.target.value)}
                              className="w-full h-9 px-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                            />
                          </div>
                          {/* Method — pill buttons */}
                          <div>
                            <label className="block text-[11px] font-medium text-gray-500 mb-1">{t('payments.method', locale)}</label>
                            <div className="flex gap-1">
                              {(['bank', 'cash', 'revolut'] as const).map((m) => (
                                <button
                                  key={m}
                                  onClick={() => setExpandMethod(m)}
                                  className={`flex-1 h-9 text-xs font-medium rounded-lg border transition-colors ${
                                    expandMethod === m
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                  }`}
                                >
                                  {t(`payments.${m}`, locale)}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Confirm / Cancel */}
                          <div className="flex items-end gap-2">
                            <Button size="sm" onClick={() => handleExpandConfirm(payment)} className="flex-1">
                              {t('payments.confirm_paid', locale)}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setExpandedId(null)}>
                              {t('common.cancel', locale)}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* Batch action bar */}
          {batchMode && selectedIds.size > 0 && (
            <div className="sticky bottom-20 mt-3 z-30">
              <Card className="!p-3 !bg-indigo-600 !border-indigo-700 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1 flex-1">
                    {(['bank', 'cash', 'revolut'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setBatchMethod(m)}
                        className={`px-3 h-8 text-xs font-medium rounded-md transition-colors ${
                          batchMethod === m
                            ? 'bg-white text-indigo-700'
                            : 'bg-indigo-500 text-indigo-100 hover:bg-indigo-400'
                        }`}
                      >
                        {t(`payments.${m}`, locale)}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleBatchConfirm}
                    className="h-9 px-4 bg-white text-indigo-700 font-semibold text-sm rounded-lg hover:bg-indigo-50 active:bg-indigo-100 transition-colors whitespace-nowrap"
                  >
                    {t('dash.mark_selected', locale)} ({selectedIds.size})
                  </button>
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* ====== UNDO TOASTS ====== */}
        {undoItems.length > 0 && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-md">
            {undoItems.map((item) => (
              <div
                key={item.payment.id}
                className="flex items-center justify-between bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl animate-slide-up"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm truncate">
                    {fmt(item.payment.amount_due)} &middot; {item.payment.tenant_name}
                  </span>
                </div>
                <button
                  onClick={() => handleUndo(item.payment)}
                  className="text-indigo-300 hover:text-white text-sm font-semibold ml-3 shrink-0 active:text-indigo-100"
                >
                  {t('dash.undo', locale)}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ====== PROPERTIES — same as before ====== */}
        <Card padding={false}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">{t('nav.properties', locale)}</h2>
            <Button size="sm" onClick={() => router.push('/properties/new')}>
              + {t('common.add', locale)}
            </Button>
          </div>

          {properties.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400">{t('common.no_data', locale)}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {properties.map((prop) => (
                <div
                  key={prop.id}
                  onClick={() => router.push(`/properties/${prop.id}`)}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors active:bg-gray-100"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{prop.name}</p>
                    <p className="text-xs text-gray-400">{prop.city} &middot; {prop.owner_name}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <Badge color={TYPE_BADGE[prop.property_type] || 'gray'}>
                      {t(`type.${prop.property_type}`, locale)}
                    </Badge>
                    {prop.current_value > 0 && (
                      <span className="text-sm font-medium text-gray-700 hidden sm:inline">{fmt(prop.current_value)}</span>
                    )}
                    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </PageContent>
    </PageShell>
  );
}
