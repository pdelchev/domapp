'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Spinner, EmptyState } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { getDividendSummary, getTransactions } from '../../lib/api';

function fmtCurrency(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
}

interface DividendSummary {
  total_all_time: number;
  total_ytd: number;
  monthly_avg: number;
  by_holding: { holding_ticker: string; holding_name: string; total: number }[];
  monthly: { month: string; total: number }[];
}

interface Transaction {
  id: number;
  holding_ticker?: string;
  holding_name?: string;
  type: string;
  total_amount: number;
  date: string;
  notes: string;
}

export default function DividendsPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DividendSummary | null>(null);
  const [divTxns, setDivTxns] = useState<Transaction[]>([]);

  useEffect(() => {
    Promise.all([
      getDividendSummary().catch(() => null),
      getTransactions(undefined, 'dividend').catch(() => []),
    ]).then(([sum, txns]) => {
      setSummary(sum);
      const tArr = Array.isArray(txns) ? txns : (txns?.results || []);
      setDivTxns(tArr);
      setLoading(false);
    });
  }, []);

  // Compute from transactions if summary API not available
  const totalAllTime = summary?.total_all_time ?? divTxns.reduce((s, tx) => s + tx.total_amount, 0);
  const currentYear = new Date().getFullYear();
  const ytdTxns = divTxns.filter(tx => tx.date && tx.date.startsWith(String(currentYear)));
  const totalYTD = summary?.total_ytd ?? ytdTxns.reduce((s, tx) => s + tx.total_amount, 0);
  const monthsThisYear = new Date().getMonth() + 1;
  const monthlyAvg = summary?.monthly_avg ?? (monthsThisYear > 0 ? totalYTD / monthsThisYear : 0);

  // Group by holding
  const byHolding = summary?.by_holding ?? (() => {
    const map: Record<string, { ticker: string; name: string; total: number }> = {};
    divTxns.forEach(tx => {
      const key = tx.holding_ticker || 'unknown';
      if (!map[key]) map[key] = { ticker: key, name: tx.holding_name || '', total: 0 };
      map[key].total += tx.total_amount;
    });
    return Object.values(map).map(v => ({ holding_ticker: v.ticker, holding_name: v.name, total: v.total }));
  })();

  // Monthly bar chart data (last 12 months)
  const monthly = summary?.monthly ?? (() => {
    const months: Record<string, number> = {};
    divTxns.forEach(tx => {
      if (tx.date) {
        const m = tx.date.substring(0, 7); // YYYY-MM
        months[m] = (months[m] || 0) + tx.total_amount;
      }
    });
    return Object.entries(months).sort().slice(-12).map(([month, total]) => ({ month, total }));
  })();

  const maxMonthly = Math.max(...monthly.map(m => m.total), 1);

  if (loading) {
    return <PageShell><NavBar /><PageContent size="lg"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader title={t('investments.dividends', locale)} onBack={() => router.push('/investments')} />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card><div className="p-4"><p className="text-[13px] font-medium text-gray-500">{t('investments.total_dividends', locale)} ({t('investments.all_types', locale)})</p><p className="text-2xl font-bold mt-1 text-green-600">{fmtCurrency(totalAllTime)}</p></div></Card>
          <Card><div className="p-4"><p className="text-[13px] font-medium text-gray-500">{t('investments.ytd_dividends', locale)}</p><p className="text-2xl font-bold mt-1 text-green-600">{fmtCurrency(totalYTD)}</p></div></Card>
          <Card><div className="p-4"><p className="text-[13px] font-medium text-gray-500">{t('investments.monthly_avg', locale)}</p><p className="text-2xl font-bold mt-1 text-gray-900">{fmtCurrency(monthlyAvg)}</p></div></Card>
        </div>

        {/* Monthly Bar Chart */}
        {monthly.length > 0 && (
          <Card>
            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('investments.dividends', locale)} - Last 12 Months</h3>
              <div className="flex items-end gap-2 h-40">
                {monthly.map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div
                      className="w-full bg-green-500 rounded-t-md min-h-[2px] transition-all"
                      style={{ height: `${(m.total / maxMonthly) * 100}%` }}
                      title={`${m.month}: ${fmtCurrency(m.total)}`}
                    />
                    <span className="text-[10px] text-gray-500 mt-1 truncate w-full text-center">{m.month.substring(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* By Holding */}
        {byHolding.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('investments.dividends', locale)} by {t('investments.holding', locale)}</h3>
            <Card padding={false}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.ticker', locale)}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.name', locale)}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.total_amount', locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {byHolding.map((h) => (
                    <tr key={h.holding_ticker} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">{h.holding_ticker}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{h.holding_name}</td>
                      <td className="px-4 py-3 text-sm font-medium text-green-600 text-right">{fmtCurrency(h.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {divTxns.length === 0 && byHolding.length === 0 && (
          <Card>
            <EmptyState
              icon="💰"
              message={t('investments.no_transactions', locale)}
            />
          </Card>
        )}
      </PageContent>
    </PageShell>
  );
}
