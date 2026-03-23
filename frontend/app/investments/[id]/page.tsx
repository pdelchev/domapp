'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Badge, Button, Spinner, Input, Select, Textarea, Alert } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { getHolding, updateHolding, deleteHolding, getTransactions, createTransaction, deleteTransaction, getPortfolios } from '../../lib/api';

const ASSET_TYPES = ['stock', 'etf', 'crypto', 'bond', 'fund'];
const TX_TYPES = ['buy', 'sell', 'dividend', 'fee', 'split', 'transfer_in', 'transfer_out'];
const ASSET_BADGE: Record<string, 'indigo' | 'blue' | 'yellow' | 'green' | 'purple'> = {
  stock: 'indigo', etf: 'blue', crypto: 'yellow', bond: 'green', fund: 'purple',
};
const TX_BADGE_COLOR: Record<string, 'green' | 'red' | 'blue' | 'gray'> = {
  buy: 'green', sell: 'red', dividend: 'blue', fee: 'gray', split: 'gray', transfer_in: 'green', transfer_out: 'red',
};

function fmtCurrency(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
}
function gainClass(v: number) { return v >= 0 ? 'text-green-600' : 'text-red-600'; }
function gainSign(v: number) { return v >= 0 ? '+' : ''; }

interface Holding {
  id: number; ticker: string; name: string; asset_type: string; quantity: number;
  avg_purchase_price: number; current_price: number; sector: string; currency: string;
  notes: string; portfolio: number; portfolio_name?: string;
}

interface Transaction {
  id: number; holding: number; type: string; quantity: number; price_per_unit: number;
  total_amount: number; fees: number; date: string; notes: string;
}

interface Portfolio { id: number; name: string; currency: string; }

export default function HoldingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [holding, setHolding] = useState<Holding | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [showTxForm, setShowTxForm] = useState(false);

  const [editForm, setEditForm] = useState({
    portfolio: '', ticker: '', name: '', asset_type: 'stock', quantity: '',
    avg_purchase_price: '', current_price: '', sector: '', currency: '', notes: '',
  });

  const [txForm, setTxForm] = useState({
    type: 'buy', quantity: '', price_per_unit: '', total_amount: '', fees: '',
    date: new Date().toISOString().split('T')[0], notes: '',
  });

  useEffect(() => {
    Promise.all([
      getHolding(Number(id)),
      getTransactions(Number(id)),
      getPortfolios().catch(() => []),
    ]).then(([h, txns, ports]) => {
      setHolding(h);
      setTransactions(Array.isArray(txns) ? txns : (txns?.results || []));
      setPortfolios(Array.isArray(ports) ? ports : (ports?.results || []));
      setEditForm({
        portfolio: String(h.portfolio), ticker: h.ticker, name: h.name, asset_type: h.asset_type,
        quantity: String(h.quantity), avg_purchase_price: String(h.avg_purchase_price),
        current_price: String(h.current_price || ''), sector: h.sector || '', currency: h.currency || '', notes: h.notes || '',
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  const handleSaveEdit = async () => {
    setError('');
    try {
      const updated = await updateHolding(Number(id), {
        portfolio: Number(editForm.portfolio),
        ticker: editForm.ticker,
        name: editForm.name,
        asset_type: editForm.asset_type,
        quantity: parseFloat(editForm.quantity),
        avg_purchase_price: parseFloat(editForm.avg_purchase_price),
        current_price: editForm.current_price ? parseFloat(editForm.current_price) : null,
        sector: editForm.sector || null,
        currency: editForm.currency || null,
        notes: editForm.notes || '',
      });
      setHolding(updated);
      setEditing(false);
    } catch {
      setError(t('common.error', locale));
    }
  };

  const handleDeleteHolding = async () => {
    if (!confirm(t('investments.delete_confirm', locale))) return;
    await deleteHolding(Number(id));
    router.push('/investments');
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const tx = await createTransaction({
        holding: Number(id),
        type: txForm.type,
        quantity: parseFloat(txForm.quantity) || 0,
        price_per_unit: parseFloat(txForm.price_per_unit) || 0,
        total_amount: parseFloat(txForm.total_amount) || 0,
        fees: parseFloat(txForm.fees) || 0,
        date: txForm.date,
        notes: txForm.notes,
      });
      setTransactions((prev) => [tx, ...prev]);
      setShowTxForm(false);
      setTxForm({ type: 'buy', quantity: '', price_per_unit: '', total_amount: '', fees: '', date: new Date().toISOString().split('T')[0], notes: '' });
    } catch {
      setError(t('common.error', locale));
    }
  };

  const handleDeleteTx = async (txId: number) => {
    if (!confirm(t('investments.delete_confirm', locale))) return;
    await deleteTransaction(txId);
    setTransactions((prev) => prev.filter((tx) => tx.id !== txId));
  };

  if (loading) {
    return <PageShell><NavBar /><PageContent size="lg"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>;
  }

  if (!holding) {
    return <PageShell><NavBar /><PageContent size="lg"><p className="text-gray-500">Holding not found.</p></PageContent></PageShell>;
  }

  const value = holding.quantity * (holding.current_price || holding.avg_purchase_price);
  const cost = holding.quantity * holding.avg_purchase_price;
  const gl = value - cost;
  const glPct = cost > 0 ? (gl / cost) * 100 : 0;
  const divTxs = transactions.filter(tx => tx.type === 'dividend');
  const totalDividends = divTxs.reduce((s, tx) => s + tx.total_amount, 0);

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={`${holding.ticker} — ${holding.name}`}
          onBack={() => router.push(`/investments/portfolios/${holding.portfolio}`)}
          action={
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(!editing)}>{t('common.edit', locale)}</Button>
              <Button variant="danger" size="sm" onClick={handleDeleteHolding}>{t('common.delete', locale)}</Button>
            </div>
          }
        />

        <Alert type="error" message={error} />

        {/* Edit form */}
        {editing && (
          <Card>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select label={t('investments.portfolio', locale)} value={editForm.portfolio} onChange={(e) => setEditForm((prev) => ({ ...prev, portfolio: e.target.value }))}>
                  {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <Select label={t('investments.asset_type', locale)} value={editForm.asset_type} onChange={(e) => setEditForm((prev) => ({ ...prev, asset_type: e.target.value }))}>
                  {ASSET_TYPES.map((at) => <option key={at} value={at}>{t(`investments.${at}`, locale)}</option>)}
                </Select>
                <Input label={t('investments.ticker', locale)} value={editForm.ticker} onChange={(e) => setEditForm((prev) => ({ ...prev, ticker: e.target.value.toUpperCase() }))} required />
                <Input label={t('investments.name', locale)} value={editForm.name} onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))} required />
                <Input label={t('investments.quantity', locale)} type="number" value={editForm.quantity} onChange={(e) => setEditForm((prev) => ({ ...prev, quantity: e.target.value }))} required />
                <Input label={t('investments.avg_price', locale)} type="number" value={editForm.avg_purchase_price} onChange={(e) => setEditForm((prev) => ({ ...prev, avg_purchase_price: e.target.value }))} required />
                <Input label={t('investments.current_price', locale)} type="number" value={editForm.current_price} onChange={(e) => setEditForm((prev) => ({ ...prev, current_price: e.target.value }))} />
                <Input label={t('investments.sector', locale)} value={editForm.sector} onChange={(e) => setEditForm((prev) => ({ ...prev, sector: e.target.value }))} />
              </div>
              <Textarea label={t('investments.notes', locale)} value={editForm.notes} onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))} rows={2} />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>{t('common.cancel', locale)}</Button>
                <Button size="sm" onClick={handleSaveEdit}>{t('common.save', locale)}</Button>
              </div>
            </div>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 mt-4">
          <Card><div className="p-4"><p className="text-[13px] font-medium text-gray-500">{t('investments.value', locale)}</p><p className="text-xl font-bold mt-1 text-gray-900">{fmtCurrency(value)}</p></div></Card>
          <Card><div className="p-4"><p className="text-[13px] font-medium text-gray-500">{t('investments.gain_loss', locale)}</p><p className={`text-xl font-bold mt-1 ${gainClass(gl)}`}>{gainSign(gl)}{fmtCurrency(gl)}</p><p className={`text-sm ${gainClass(glPct)}`}>{gainSign(glPct)}{glPct.toFixed(2)}%</p></div></Card>
          <Card><div className="p-4"><p className="text-[13px] font-medium text-gray-500">{t('investments.quantity', locale)}</p><p className="text-xl font-bold mt-1 text-gray-900">{holding.quantity}</p></div></Card>
          <Card><div className="p-4"><p className="text-[13px] font-medium text-gray-500">{t('investments.total_dividends', locale)}</p><p className="text-xl font-bold mt-1 text-green-600">{fmtCurrency(totalDividends)}</p></div></Card>
        </div>

        {/* Transactions */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">{t('investments.transactions', locale)}</h3>
          <Button size="sm" onClick={() => setShowTxForm(!showTxForm)}>+ {t('investments.add_transaction', locale)}</Button>
        </div>

        {showTxForm && (
          <Card>
            <form onSubmit={handleAddTransaction} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select label={t('investments.transaction_type', locale)} value={txForm.type} onChange={(e) => setTxForm((prev) => ({ ...prev, type: e.target.value }))}>
                  {TX_TYPES.map((tt) => <option key={tt} value={tt}>{t(`investments.${tt}`, locale)}</option>)}
                </Select>
                <Input label={t('investments.quantity', locale)} type="number" value={txForm.quantity} onChange={(e) => setTxForm((prev) => ({ ...prev, quantity: e.target.value }))} />
                <Input label={t('investments.price_per_unit', locale)} type="number" value={txForm.price_per_unit} onChange={(e) => setTxForm((prev) => ({ ...prev, price_per_unit: e.target.value }))} />
                <Input label={t('investments.total_amount', locale)} type="number" value={txForm.total_amount} onChange={(e) => setTxForm((prev) => ({ ...prev, total_amount: e.target.value }))} />
                <Input label={t('investments.fees', locale)} type="number" value={txForm.fees} onChange={(e) => setTxForm((prev) => ({ ...prev, fees: e.target.value }))} />
                <Input label={t('investments.date', locale)} type="date" value={txForm.date} onChange={(e) => setTxForm((prev) => ({ ...prev, date: e.target.value }))} />
              </div>
              <Textarea label={t('investments.notes', locale)} value={txForm.notes} onChange={(e) => setTxForm((prev) => ({ ...prev, notes: e.target.value }))} rows={2} />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowTxForm(false)}>{t('common.cancel', locale)}</Button>
                <Button size="sm" type="submit">{t('common.save', locale)}</Button>
              </div>
            </form>
          </Card>
        )}

        {transactions.length === 0 ? (
          <Card><div className="p-6 text-center text-sm text-gray-400">{t('investments.no_transactions', locale)}</div></Card>
        ) : (
          <Card padding={false}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.date', locale)}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.transaction_type', locale)}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.quantity', locale)}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.price_per_unit', locale)}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.total_amount', locale)}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.fees', locale)}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('common.actions', locale)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">{tx.date}</td>
                    <td className="px-4 py-3"><Badge color={TX_BADGE_COLOR[tx.type] || 'gray'}>{t(`investments.${tx.type}`, locale)}</Badge></td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{tx.quantity}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{fmtCurrency(tx.price_per_unit)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{fmtCurrency(tx.total_amount)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right">{tx.fees ? fmtCurrency(tx.fees) : '--'}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="danger" size="sm" onClick={() => handleDeleteTx(tx.id)}>{t('common.delete', locale)}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {/* Dividend section */}
        {divTxs.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('investments.dividends', locale)}</h3>
            <Card padding={false}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.date', locale)}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.total_amount', locale)}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.notes', locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {divTxs.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-700">{tx.date}</td>
                      <td className="px-4 py-3 text-sm font-medium text-green-600 text-right">{fmtCurrency(tx.total_amount)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{tx.notes || '--'}</td>
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
