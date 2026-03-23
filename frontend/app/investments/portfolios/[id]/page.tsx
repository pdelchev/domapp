'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '../../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Badge, Button, Spinner, EmptyState, Input, Select, Textarea, Alert } from '../../../components/ui';
import { useLanguage } from '../../../context/LanguageContext';
import { t } from '../../../lib/i18n';
import { getPortfolio, updatePortfolio, deletePortfolio, getHoldings, deleteHolding } from '../../../lib/api';

const COUNTRY_FLAGS: Record<string, string> = {
  'Bulgaria': '\u{1F1E7}\u{1F1EC}', 'United Kingdom': '\u{1F1EC}\u{1F1E7}', 'United States': '\u{1F1FA}\u{1F1F8}',
  'Germany': '\u{1F1E9}\u{1F1EA}', 'France': '\u{1F1EB}\u{1F1F7}', 'Spain': '\u{1F1EA}\u{1F1F8}',
  'Italy': '\u{1F1EE}\u{1F1F9}', 'Switzerland': '\u{1F1E8}\u{1F1ED}', 'Netherlands': '\u{1F1F3}\u{1F1F1}',
};

const ASSET_BADGE: Record<string, 'indigo' | 'blue' | 'yellow' | 'green' | 'purple'> = {
  stock: 'indigo', etf: 'blue', crypto: 'yellow', bond: 'green', fund: 'purple',
};

function fmtCurrency(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
}
function gainClass(v: number) { return v >= 0 ? 'text-green-600' : 'text-red-600'; }
function gainSign(v: number) { return v >= 0 ? '+' : ''; }

interface Holding {
  id: number; ticker: string; name: string; asset_type: string; quantity: number;
  avg_purchase_price: number; current_price: number; sector: string; currency: string;
}

interface Portfolio {
  id: number; name: string; country: string; currency: string; broker: string; description: string;
  total_value?: number; total_invested?: number; gain_loss?: number; gain_loss_pct?: number; dividend_income?: number;
}

const COUNTRIES = [
  { value: 'Bulgaria', key: 'country.bulgaria' }, { value: 'United Kingdom', key: 'country.uk' },
  { value: 'United States', key: 'country.us' }, { value: 'Germany', key: 'country.germany' },
  { value: 'France', key: 'country.france' }, { value: 'Spain', key: 'country.spain' },
  { value: 'Italy', key: 'country.italy' }, { value: 'Switzerland', key: 'country.switzerland' },
  { value: 'Netherlands', key: 'country.netherlands' }, { value: 'Other', key: 'country.other' },
];
const CURRENCIES = ['GBP', 'EUR', 'BGN', 'USD', 'CHF'];

export default function PortfolioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', country: '', currency: 'EUR', broker: '', description: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      getPortfolio(Number(id)),
      getHoldings(Number(id)),
    ]).then(([p, h]) => {
      setPortfolio(p);
      setHoldings(Array.isArray(h) ? h : (h?.results || []));
      setEditForm({ name: p.name, country: p.country, currency: p.currency, broker: p.broker || '', description: p.description || '' });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  const handleDeletePortfolio = async () => {
    if (!confirm(t('investments.delete_confirm', locale))) return;
    await deletePortfolio(Number(id));
    router.push('/investments/portfolios');
  };

  const handleSaveEdit = async () => {
    setError('');
    try {
      const updated = await updatePortfolio(Number(id), editForm);
      setPortfolio(updated);
      setEditing(false);
    } catch {
      setError(t('common.error', locale));
    }
  };

  const handleDeleteHolding = async (hId: number) => {
    if (!confirm(t('investments.delete_confirm', locale))) return;
    await deleteHolding(hId);
    setHoldings((prev) => prev.filter((h) => h.id !== hId));
  };

  if (loading) {
    return <PageShell><NavBar /><PageContent size="lg"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>;
  }

  if (!portfolio) {
    return <PageShell><NavBar /><PageContent size="lg"><p className="text-gray-500">Portfolio not found.</p></PageContent></PageShell>;
  }

  const cur = portfolio.currency;
  const totalValue = portfolio.total_value ?? holdings.reduce((s, h) => s + h.quantity * (h.current_price || h.avg_purchase_price), 0);
  const totalInvested = portfolio.total_invested ?? holdings.reduce((s, h) => s + h.quantity * h.avg_purchase_price, 0);
  const gl = portfolio.gain_loss ?? (totalValue - totalInvested);
  const glPct = portfolio.gain_loss_pct ?? (totalInvested > 0 ? (gl / totalInvested) * 100 : 0);
  const divIncome = portfolio.dividend_income ?? 0;

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={`${COUNTRY_FLAGS[portfolio.country] || ''} ${portfolio.name} (${cur})`}
          onBack={() => router.push('/investments/portfolios')}
          action={
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(!editing)}>{t('common.edit', locale)}</Button>
              <Button variant="danger" size="sm" onClick={handleDeletePortfolio}>{t('common.delete', locale)}</Button>
              <Button size="sm" onClick={() => router.push(`/investments/new?portfolio=${id}`)}>+ {t('investments.add_holding', locale)}</Button>
            </div>
          }
        />

        {/* Edit form */}
        {editing && (
          <Card>
            <div className="p-5 space-y-4">
              <Alert type="error" message={error} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label={t('investments.portfolio_name', locale)} value={editForm.name} onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))} required />
                <Select label={t('investments.country', locale)} value={editForm.country} onChange={(e) => setEditForm((prev) => ({ ...prev, country: e.target.value }))} required>
                  <option value="">{t('common.select', locale)}</option>
                  {COUNTRIES.map((c) => <option key={c.value} value={c.value}>{t(c.key, locale)}</option>)}
                </Select>
                <Select label={t('investments.currency', locale)} value={editForm.currency} onChange={(e) => setEditForm((prev) => ({ ...prev, currency: e.target.value }))} required>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
                <Input label={t('investments.broker', locale)} value={editForm.broker} onChange={(e) => setEditForm((prev) => ({ ...prev, broker: e.target.value }))} />
              </div>
              <Textarea label={t('investments.description', locale)} value={editForm.description} onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))} rows={2} />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>{t('common.cancel', locale)}</Button>
                <Button size="sm" onClick={handleSaveEdit}>{t('common.save', locale)}</Button>
              </div>
            </div>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 mt-4">
          <Card><div className="p-4"><p className="text-[13px] font-medium text-gray-500">{t('investments.total_value', locale)}</p><p className="text-xl font-bold mt-1 text-gray-900">{fmtCurrency(totalValue, cur)}</p></div></Card>
          <Card><div className="p-4"><p className="text-[13px] font-medium text-gray-500">{t('investments.total_invested', locale)}</p><p className="text-xl font-bold mt-1 text-gray-900">{fmtCurrency(totalInvested, cur)}</p></div></Card>
          <Card><div className="p-4"><p className="text-[13px] font-medium text-gray-500">{t('investments.gain_loss', locale)}</p><p className={`text-xl font-bold mt-1 ${gainClass(gl)}`}>{gainSign(gl)}{fmtCurrency(gl, cur)}</p><p className={`text-sm ${gainClass(glPct)}`}>{gainSign(glPct)}{glPct.toFixed(2)}%</p></div></Card>
          <Card><div className="p-4"><p className="text-[13px] font-medium text-gray-500">{t('investments.dividends', locale)}</p><p className="text-xl font-bold mt-1 text-green-600">{fmtCurrency(divIncome, cur)}</p></div></Card>
        </div>

        {/* Holdings Table */}
        {holdings.length === 0 ? (
          <Card>
            <EmptyState
              icon="📊"
              message={t('investments.no_holdings', locale)}
            />
          </Card>
        ) : (
          <Card padding={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.ticker', locale)}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.name', locale)}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.asset_type', locale)}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.quantity', locale)}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.avg_price', locale)}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.current_price', locale)}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.value', locale)}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.gain_loss', locale)}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('common.actions', locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {holdings.map((h) => {
                    const val = h.quantity * (h.current_price || h.avg_purchase_price);
                    const cost = h.quantity * h.avg_purchase_price;
                    const hgl = val - cost;
                    const hglPct = cost > 0 ? (hgl / cost) * 100 : 0;
                    return (
                      <tr key={h.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/investments/${h.id}`)}>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">{h.ticker}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{h.name}</td>
                        <td className="px-4 py-3"><Badge color={ASSET_BADGE[h.asset_type] || 'gray'}>{t(`investments.${h.asset_type}`, locale)}</Badge></td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{h.quantity}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{fmtCurrency(h.avg_purchase_price, cur)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{fmtCurrency(h.current_price || h.avg_purchase_price, cur)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{fmtCurrency(val, cur)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-medium ${gainClass(hgl)}`}>{gainSign(hgl)}{fmtCurrency(hgl, cur)}</span>
                          <span className={`text-xs ml-1 ${gainClass(hglPct)}`}>({gainSign(hglPct)}{hglPct.toFixed(1)}%)</span>
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/investments/${h.id}`)}>{t('common.edit', locale)}</Button>
                          <Button variant="danger" size="sm" onClick={() => handleDeleteHolding(h.id)}>{t('common.delete', locale)}</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </PageContent>
    </PageShell>
  );
}
