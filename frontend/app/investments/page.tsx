'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Badge, Button, Spinner, EmptyState } from '../components/ui';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import { getInvestmentDashboard, getPortfolios, getHoldings, getTransactions } from '../lib/api';

const COUNTRY_FLAGS: Record<string, string> = {
  'Bulgaria': '\u{1F1E7}\u{1F1EC}',
  'United Kingdom': '\u{1F1EC}\u{1F1E7}',
  'United States': '\u{1F1FA}\u{1F1F8}',
  'Germany': '\u{1F1E9}\u{1F1EA}',
  'France': '\u{1F1EB}\u{1F1F7}',
  'Spain': '\u{1F1EA}\u{1F1F8}',
  'Italy': '\u{1F1EE}\u{1F1F9}',
  'Switzerland': '\u{1F1E8}\u{1F1ED}',
  'Netherlands': '\u{1F1F3}\u{1F1F1}',
};

const ASSET_TYPE_COLORS: Record<string, string> = {
  stock: 'bg-indigo-500',
  etf: 'bg-blue-500',
  crypto: 'bg-amber-500',
  bond: 'bg-green-500',
  fund: 'bg-purple-500',
};

const TX_BADGE_COLOR: Record<string, 'green' | 'red' | 'blue' | 'gray'> = {
  buy: 'green',
  sell: 'red',
  dividend: 'blue',
  fee: 'gray',
  split: 'gray',
  transfer_in: 'green',
  transfer_out: 'red',
};

function fmtCurrency(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
}

function gainClass(v: number) {
  return v >= 0 ? 'text-green-600' : 'text-red-600';
}

function gainSign(v: number) {
  return v >= 0 ? '+' : '';
}

interface Portfolio {
  id: number;
  name: string;
  country: string;
  currency: string;
  broker: string;
  description: string;
  holdings_count?: number;
  total_value?: number;
  total_invested?: number;
  gain_loss?: number;
  gain_loss_pct?: number;
}

interface Holding {
  id: number;
  ticker: string;
  name: string;
  asset_type: string;
  quantity: number;
  avg_purchase_price: number;
  current_price: number;
  portfolio: number;
}

interface Transaction {
  id: number;
  holding: number;
  holding_ticker?: string;
  holding_name?: string;
  type: string;
  quantity: number;
  price_per_unit: number;
  total_amount: number;
  fees: number;
  date: string;
  notes: string;
}

interface DashboardData {
  total_value: number;
  total_invested: number;
  total_gain_loss: number;
  total_gain_loss_pct: number;
  total_dividends_ytd: number;
  allocation: { asset_type: string; count: number; value: number; pct: number }[];
  top_gainers: { ticker: string; name: string; gain_loss_pct: number; value: number }[];
  top_losers: { ticker: string; name: string; gain_loss_pct: number; value: number }[];
}

export default function InvestmentsDashboard() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);

  useEffect(() => {
    Promise.all([
      getInvestmentDashboard().catch(() => null),
      getPortfolios().catch(() => []),
      getTransactions().catch(() => []),
      getHoldings().catch(() => []),
    ]).then(([dash, ports, txns, holds]) => {
      setDashboard(dash);
      const pArr = Array.isArray(ports) ? ports : (ports?.results || []);
      setPortfolios(pArr);
      const tArr = Array.isArray(txns) ? txns : (txns?.results || []);
      setTransactions(tArr.slice(0, 10));
      const hArr = Array.isArray(holds) ? holds : (holds?.results || []);
      setHoldings(hArr);
      setLoading(false);
    });
  }, []);

  const totalValue = dashboard?.total_value ?? holdings.reduce((s, h) => s + h.quantity * (h.current_price || h.avg_purchase_price), 0);
  const totalInvested = dashboard?.total_invested ?? holdings.reduce((s, h) => s + h.quantity * h.avg_purchase_price, 0);
  const totalGL = dashboard?.total_gain_loss ?? (totalValue - totalInvested);
  const totalGLPct = dashboard?.total_gain_loss_pct ?? (totalInvested > 0 ? (totalGL / totalInvested) * 100 : 0);
  const ytdDiv = dashboard?.total_dividends_ytd ?? 0;

  const allocation = dashboard?.allocation ?? (() => {
    const byType: Record<string, { count: number; value: number }> = {};
    holdings.forEach(h => {
      const tp = h.asset_type || 'stock';
      if (!byType[tp]) byType[tp] = { count: 0, value: 0 };
      byType[tp].count++;
      byType[tp].value += h.quantity * (h.current_price || h.avg_purchase_price);
    });
    const total = Object.values(byType).reduce((s, v) => s + v.value, 0);
    return Object.entries(byType).map(([asset_type, v]) => ({
      asset_type, count: v.count, value: v.value, pct: total > 0 ? (v.value / total) * 100 : 0,
    }));
  })();

  const holdingsWithGL = holdings.map(h => {
    const value = h.quantity * (h.current_price || h.avg_purchase_price);
    const cost = h.quantity * h.avg_purchase_price;
    const gl = value - cost;
    const glPct = cost > 0 ? (gl / cost) * 100 : 0;
    return { ticker: h.ticker, name: h.name, gain_loss_pct: glPct, value };
  });
  const topGainers = dashboard?.top_gainers ?? [...holdingsWithGL].sort((a, b) => b.gain_loss_pct - a.gain_loss_pct).slice(0, 5).filter(h => h.gain_loss_pct > 0);
  const topLosers = dashboard?.top_losers ?? [...holdingsWithGL].sort((a, b) => a.gain_loss_pct - b.gain_loss_pct).slice(0, 5).filter(h => h.gain_loss_pct < 0);

  if (loading) {
    return (
      <PageShell><NavBar /><PageContent size="lg"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>
    );
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('investments.title', locale)}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="secondary" size="sm" onClick={() => router.push('/investments/bulk-upload')}>
                {t('investments.bulk_upload', locale)}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => router.push('/investments/portfolios')}>
                {t('investments.portfolios', locale)}
              </Button>
              <Button size="sm" onClick={() => router.push('/investments/new')}>
                + {t('investments.add_holding', locale)}
              </Button>
            </div>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <div className="p-4">
              <p className="text-[13px] font-medium text-gray-500">{t('investments.total_value', locale)}</p>
              <p className={`text-2xl font-bold mt-1 ${gainClass(totalGL)}`}>{fmtCurrency(totalValue)}</p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-[13px] font-medium text-gray-500">{t('investments.total_invested', locale)}</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{fmtCurrency(totalInvested)}</p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-[13px] font-medium text-gray-500">{t('investments.total_gain_loss', locale)}</p>
              <p className={`text-2xl font-bold mt-1 ${gainClass(totalGL)}`}>
                {gainSign(totalGL)}{fmtCurrency(totalGL)}
              </p>
              <p className={`text-sm ${gainClass(totalGLPct)}`}>{gainSign(totalGLPct)}{totalGLPct.toFixed(2)}%</p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-[13px] font-medium text-gray-500">{t('investments.ytd_dividends', locale)}</p>
              <p className="text-2xl font-bold mt-1 text-green-600">{fmtCurrency(ytdDiv)}</p>
            </div>
          </Card>
        </div>

        {/* Asset Allocation */}
        {allocation.length > 0 && (
          <Card>
            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('investments.asset_allocation', locale)}</h3>
              <div className="h-6 rounded-lg overflow-hidden flex">
                {allocation.map((a) => (
                  <div
                    key={a.asset_type}
                    className={`${ASSET_TYPE_COLORS[a.asset_type] || 'bg-gray-400'} transition-all`}
                    style={{ width: `${Math.max(a.pct, 1)}%` }}
                    title={`${a.asset_type}: ${a.pct.toFixed(1)}%`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-4 mt-3">
                {allocation.map((a) => (
                  <div key={a.asset_type} className="flex items-center gap-2 text-sm">
                    <span className={`w-3 h-3 rounded-sm ${ASSET_TYPE_COLORS[a.asset_type] || 'bg-gray-400'}`} />
                    <span className="text-gray-700">{t(`investments.${a.asset_type}`, locale)}</span>
                    <span className="text-gray-500">{a.count} &middot; {fmtCurrency(a.value)} &middot; {a.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Portfolios Grid */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('investments.portfolios', locale)}</h3>
          {portfolios.length === 0 ? (
            <Card>
              <EmptyState
                icon="\u{1F4BC}"
                message={t('investments.no_portfolios', locale)}
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {portfolios.map((p) => {
                const pGL = p.gain_loss ?? 0;
                const pGLPct = p.gain_loss_pct ?? 0;
                return (
                  <Card key={p.id}>
                    <div className="p-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-xl" onClick={() => router.push(`/investments/portfolios/${p.id}`)}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{COUNTRY_FLAGS[p.country] || ''}</span>
                          <h4 className="font-semibold text-gray-900">{p.name}</h4>
                        </div>
                        <Badge color="gray">{p.currency}</Badge>
                      </div>
                      {p.broker && <p className="text-xs text-gray-500 mb-2">{p.broker}</p>}
                      <div className="flex items-center justify-between mt-3">
                        <div>
                          <p className="text-xs text-gray-500">{t('investments.holdings', locale)}: {p.holdings_count ?? 0}</p>
                          <p className="text-lg font-bold text-gray-900">{fmtCurrency(p.total_value ?? 0, p.currency)}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-medium ${gainClass(pGL)}`}>{gainSign(pGL)}{fmtCurrency(pGL, p.currency)}</p>
                          <p className={`text-xs ${gainClass(pGLPct)}`}>{gainSign(pGLPct)}{pGLPct.toFixed(2)}%</p>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Movers */}
        {(topGainers.length > 0 || topLosers.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <Card>
              <div className="p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('investments.top_gainers', locale)}</h3>
                {topGainers.length === 0 ? <p className="text-sm text-gray-400">--</p> : (
                  <div className="space-y-2">
                    {topGainers.map((h) => (
                      <div key={h.ticker} className="flex items-center justify-between">
                        <div><span className="text-sm font-medium text-gray-900">{h.ticker}</span><span className="text-xs text-gray-500 ml-2">{h.name}</span></div>
                        <span className="text-sm font-medium text-green-600">+{h.gain_loss_pct.toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
            <Card>
              <div className="p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('investments.top_losers', locale)}</h3>
                {topLosers.length === 0 ? <p className="text-sm text-gray-400">--</p> : (
                  <div className="space-y-2">
                    {topLosers.map((h) => (
                      <div key={h.ticker} className="flex items-center justify-between">
                        <div><span className="text-sm font-medium text-gray-900">{h.ticker}</span><span className="text-xs text-gray-500 ml-2">{h.name}</span></div>
                        <span className="text-sm font-medium text-red-600">{h.gain_loss_pct.toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Recent Transactions */}
        {transactions.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('investments.recent_transactions', locale)}</h3>
            <Card padding={false}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.date', locale)}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.transaction_type', locale)}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.ticker', locale)}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.quantity', locale)}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.total_amount', locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-700">{tx.date}</td>
                      <td className="px-4 py-3"><Badge color={TX_BADGE_COLOR[tx.type] || 'gray'}>{t(`investments.${tx.type}`, locale)}</Badge></td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{tx.holding_ticker || '--'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">{tx.quantity}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">{fmtCurrency(tx.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}
