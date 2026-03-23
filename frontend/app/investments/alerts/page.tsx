'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Badge, Button, Input, Select, Spinner, EmptyState, Alert } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { getPriceAlerts, createPriceAlert, deletePriceAlert } from '../../lib/api';

function fmtCurrency(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
}

interface PriceAlert {
  id: number;
  ticker: string;
  condition: string; // 'above' | 'below'
  target_price: number;
  current_price: number;
  status: string; // 'active' | 'triggered'
  notes: string;
}

export default function AlertsPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ ticker: '', condition: 'above', target_price: '', notes: '' });

  useEffect(() => {
    getPriceAlerts()
      .then((data) => setAlerts(Array.isArray(data) ? data : (data?.results || [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.ticker || !form.target_price) { setError(t('common.required', locale)); return; }
    try {
      const alert = await createPriceAlert({
        ticker: form.ticker.toUpperCase(),
        condition: form.condition,
        target_price: parseFloat(form.target_price),
        notes: form.notes,
      });
      setAlerts((prev) => [alert, ...prev]);
      setShowForm(false);
      setForm({ ticker: '', condition: 'above', target_price: '', notes: '' });
    } catch {
      setError(t('common.error', locale));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('investments.delete_confirm', locale))) return;
    await deletePriceAlert(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  if (loading) {
    return <PageShell><NavBar /><PageContent size="lg"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('investments.price_alerts', locale)}
          onBack={() => router.push('/investments')}
          action={<Button onClick={() => setShowForm(!showForm)}>+ {t('investments.add_alert', locale)}</Button>}
        />

        <Alert type="error" message={error} />

        {showForm && (
          <Card>
            <form onSubmit={handleAdd} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Input label={t('investments.ticker', locale)} value={form.ticker} onChange={(e) => setForm((prev) => ({ ...prev, ticker: e.target.value.toUpperCase() }))} required placeholder="e.g. AAPL" />
                <Select label={t('investments.condition', locale)} value={form.condition} onChange={(e) => setForm((prev) => ({ ...prev, condition: e.target.value }))}>
                  <option value="above">{t('investments.above', locale)}</option>
                  <option value="below">{t('investments.below', locale)}</option>
                </Select>
                <Input label={t('investments.target_price', locale)} type="number" value={form.target_price} onChange={(e) => setForm((prev) => ({ ...prev, target_price: e.target.value }))} required />
                <Input label={t('investments.notes', locale)} value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>{t('common.cancel', locale)}</Button>
                <Button size="sm" type="submit">{t('common.save', locale)}</Button>
              </div>
            </form>
          </Card>
        )}

        {alerts.length === 0 ? (
          <Card>
            <EmptyState
              icon="🔔"
              message={t('investments.no_alerts', locale)}
            />
          </Card>
        ) : (
          <Card padding={false}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.ticker', locale)}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.condition', locale)}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.target_price', locale)}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.current_price', locale)}</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('common.actions', locale)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {alerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">{alert.ticker}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {alert.condition === 'above' ? t('investments.above', locale) : t('investments.below', locale)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{fmtCurrency(alert.target_price)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{alert.current_price ? fmtCurrency(alert.current_price) : '--'}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge color={alert.status === 'triggered' ? 'red' : 'green'}>
                        {alert.status === 'triggered' ? t('investments.triggered', locale) : t('investments.active', locale)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="danger" size="sm" onClick={() => handleDelete(alert.id)}>{t('common.delete', locale)}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </PageContent>
    </PageShell>
  );
}
