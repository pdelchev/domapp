'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Input, Select, Textarea, Button, Alert } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { createHolding, getPortfolios } from '../../lib/api';

const ASSET_TYPES = ['stock', 'etf', 'crypto', 'bond', 'fund'];

interface Portfolio { id: number; name: string; currency: string; }

export default function NewHoldingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLanguage();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [form, setForm] = useState({
    portfolio: searchParams.get('portfolio') || '',
    ticker: '',
    name: '',
    asset_type: 'stock',
    quantity: '',
    avg_purchase_price: '',
    current_price: '',
    sector: '',
    currency: '',
    notes: '',
  });

  useEffect(() => {
    getPortfolios()
      .then((data) => setPortfolios(Array.isArray(data) ? data : (data?.results || [])))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.portfolio || !form.ticker || !form.name || !form.quantity || !form.avg_purchase_price) {
      setError(t('common.required', locale));
      return;
    }
    setSaving(true);
    try {
      await createHolding({
        portfolio: Number(form.portfolio),
        ticker: form.ticker,
        name: form.name,
        asset_type: form.asset_type,
        quantity: parseFloat(form.quantity),
        avg_purchase_price: parseFloat(form.avg_purchase_price),
        current_price: form.current_price ? parseFloat(form.current_price) : null,
        sector: form.sector || null,
        currency: form.currency || null,
        notes: form.notes || '',
      });
      if (form.portfolio) {
        router.push(`/investments/portfolios/${form.portfolio}`);
      } else {
        router.push('/investments');
      }
    } catch {
      setError(t('common.error', locale));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader title={t('investments.add_holding', locale)} onBack={() => router.push('/investments')} />
        <Alert type="error" message={error} />
        <Card>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label={t('investments.portfolio', locale)}
                value={form.portfolio}
                onChange={(e) => setForm((prev) => ({ ...prev, portfolio: e.target.value }))}
                required
              >
                <option value="">{t('common.select', locale)}</option>
                {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.currency})</option>)}
              </Select>
              <Select
                label={t('investments.asset_type', locale)}
                value={form.asset_type}
                onChange={(e) => setForm((prev) => ({ ...prev, asset_type: e.target.value }))}
                required
              >
                {ASSET_TYPES.map((at) => <option key={at} value={at}>{t(`investments.${at}`, locale)}</option>)}
              </Select>
              <Input
                label={t('investments.ticker', locale)}
                value={form.ticker}
                onChange={(e) => setForm((prev) => ({ ...prev, ticker: e.target.value.toUpperCase() }))}
                required
                placeholder="e.g. AAPL"
              />
              <Input
                label={t('investments.name', locale)}
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
                placeholder="e.g. Apple Inc."
              />
              <Input
                label={t('investments.quantity', locale)}
                type="number"
                value={form.quantity}
                onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
                required
              />
              <Input
                label={t('investments.avg_price', locale)}
                type="number"
                value={form.avg_purchase_price}
                onChange={(e) => setForm((prev) => ({ ...prev, avg_purchase_price: e.target.value }))}
                required
              />
              <Input
                label={t('investments.current_price', locale)}
                type="number"
                value={form.current_price}
                onChange={(e) => setForm((prev) => ({ ...prev, current_price: e.target.value }))}
              />
              <Input
                label={t('investments.sector', locale)}
                value={form.sector}
                onChange={(e) => setForm((prev) => ({ ...prev, sector: e.target.value }))}
                placeholder="e.g. Technology"
              />
              <Input
                label={`${t('investments.currency', locale)} (override)`}
                value={form.currency}
                onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))}
                placeholder="Leave blank to use portfolio currency"
              />
            </div>
            <Textarea
              label={t('investments.notes', locale)}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              rows={2}
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => router.push('/investments')}>{t('common.cancel', locale)}</Button>
              <Button type="submit" disabled={saving}>{saving ? t('common.loading', locale) : t('common.save', locale)}</Button>
            </div>
          </form>
        </Card>
      </PageContent>
    </PageShell>
  );
}
