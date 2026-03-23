'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Spinner, EmptyState, Alert } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { getWatchlist, createWatchlistItem, deleteWatchlistItem } from '../../lib/api';

function fmtCurrency(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
}

interface WatchlistItem {
  id: number;
  ticker: string;
  name: string;
  asset_type: string;
  target_price: number;
  current_price: number;
  notes: string;
}

export default function WatchlistPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ ticker: '', name: '', asset_type: 'stock', target_price: '', current_price: '', notes: '' });

  useEffect(() => {
    getWatchlist()
      .then((data) => setItems(Array.isArray(data) ? data : (data?.results || [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.ticker || !form.name) { setError(t('common.required', locale)); return; }
    try {
      const item = await createWatchlistItem({
        ticker: form.ticker.toUpperCase(),
        name: form.name,
        asset_type: form.asset_type,
        target_price: form.target_price ? parseFloat(form.target_price) : null,
        current_price: form.current_price ? parseFloat(form.current_price) : null,
        notes: form.notes,
      });
      setItems((prev) => [item, ...prev]);
      setShowForm(false);
      setForm({ ticker: '', name: '', asset_type: 'stock', target_price: '', current_price: '', notes: '' });
    } catch {
      setError(t('common.error', locale));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('investments.delete_confirm', locale))) return;
    await deleteWatchlistItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (loading) {
    return <PageShell><NavBar /><PageContent size="lg"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('investments.watchlist', locale)}
          onBack={() => router.push('/investments')}
          action={<Button onClick={() => setShowForm(!showForm)}>+ {t('investments.add_to_watchlist', locale)}</Button>}
        />

        <Alert type="error" message={error} />

        {showForm && (
          <Card>
            <form onSubmit={handleAdd} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label={t('investments.ticker', locale)} value={form.ticker} onChange={(e) => setForm((prev) => ({ ...prev, ticker: e.target.value.toUpperCase() }))} required placeholder="e.g. TSLA" />
                <Input label={t('investments.name', locale)} value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required placeholder="e.g. Tesla Inc." />
                <Input label={t('investments.target_price', locale)} type="number" value={form.target_price} onChange={(e) => setForm((prev) => ({ ...prev, target_price: e.target.value }))} />
                <Input label={t('investments.current_price', locale)} type="number" value={form.current_price} onChange={(e) => setForm((prev) => ({ ...prev, current_price: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>{t('common.cancel', locale)}</Button>
                <Button size="sm" type="submit">{t('common.save', locale)}</Button>
              </div>
            </form>
          </Card>
        )}

        {items.length === 0 ? (
          <Card>
            <EmptyState
              icon="👀"
              message={t('investments.no_watchlist', locale)}
            />
          </Card>
        ) : (
          <Card padding={false}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.ticker', locale)}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.name', locale)}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.target_price', locale)}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.current_price', locale)}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.difference', locale)}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('common.actions', locale)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.map((item) => {
                  const diff = (item.current_price && item.target_price) ? item.current_price - item.target_price : 0;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">{item.ticker}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{item.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">{item.target_price ? fmtCurrency(item.target_price) : '--'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">{item.current_price ? fmtCurrency(item.current_price) : '--'}</td>
                      <td className="px-4 py-3 text-right">
                        {diff !== 0 ? (
                          <span className={`text-sm font-medium ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{diff >= 0 ? '+' : ''}{fmtCurrency(diff)}</span>
                        ) : <span className="text-sm text-gray-400">--</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="danger" size="sm" onClick={() => handleDelete(item.id)}>{t('common.delete', locale)}</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </PageContent>
    </PageShell>
  );
}
