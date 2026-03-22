'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createInvestment, getProperties } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Select, Textarea, Alert, Spinner } from '../../components/ui';

interface Property {
  id: number;
  name: string;
}

const TYPES = ['renovation', 'equipment', 'expansion', 'energy', 'land', 'furniture', 'security', 'stock', 'crypto', 'bond', 'mutual_fund', 'other'];
const STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'];

const EMPTY_FORM = {
  title: '',
  description: '',
  investment_type: '',
  status: 'planned',
  property: '',
  amount_invested: '',
  expected_return: '',
  actual_return: '',
  investment_date: '',
  completion_date: '',
  notes: '',
  ticker_symbol: '',
  quantity: '',
  purchase_price: '',
  current_price: '',
};

export default function NewInvestmentPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    getProperties()
      .then((p) => setProperties(p))
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        property: form.property ? Number(form.property) : null,
        amount_invested: Number(form.amount_invested),
        expected_return: form.expected_return ? Number(form.expected_return) : null,
        actual_return: form.actual_return ? Number(form.actual_return) : null,
        completion_date: form.completion_date || null,
        ticker_symbol: form.ticker_symbol || '',
        quantity: form.quantity ? Number(form.quantity) : null,
        purchase_price: form.purchase_price ? Number(form.purchase_price) : null,
        current_price: form.current_price ? Number(form.current_price) : null,
      };
      await createInvestment(payload);
      router.push('/investments');
    } catch {
      setError(t('common.error', locale));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={t('investments.add', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/investments')}
        />
        <Alert type="error" message={error} />
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label={t('investments.investment_title', locale)} value={form.title} onChange={(e) => set('title', e.target.value)} required />
              <Select label={t('investments.type', locale)} value={form.investment_type} onChange={(e) => set('investment_type', e.target.value)} required>
                <option value="">{t('common.select', locale)}</option>
                {TYPES.map((ty) => (
                  <option key={ty} value={ty}>{t(`investments.${ty}`, locale)}</option>
                ))}
              </Select>
              <Select label={t('investments.property', locale)} value={form.property} onChange={(e) => set('property', e.target.value)}>
                <option value="">{t('investments.no_property', locale)}</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
              <Select label={t('investments.status', locale)} value={form.status} onChange={(e) => set('status', e.target.value)} required>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{t(`investments.${s}`, locale)}</option>
                ))}
              </Select>
              <Input label={t('investments.amount_invested', locale)} type="number" step="0.01" value={form.amount_invested} onChange={(e) => set('amount_invested', e.target.value)} required />
              <Input label={t('investments.expected_return', locale)} type="number" step="0.01" value={form.expected_return} onChange={(e) => set('expected_return', e.target.value)} />
              <Input label={t('investments.actual_return', locale)} type="number" step="0.01" value={form.actual_return} onChange={(e) => set('actual_return', e.target.value)} />
              <Input label={t('investments.investment_date', locale)} type="date" value={form.investment_date} onChange={(e) => set('investment_date', e.target.value)} required />
              <Input label={t('investments.completion_date', locale)} type="date" value={form.completion_date} onChange={(e) => set('completion_date', e.target.value)} />
            </div>
            {/* Stock/Crypto fields */}
            {['stock', 'crypto', 'bond', 'mutual_fund'].includes(form.investment_type) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-200">
                <Input label={t('investments.ticker_symbol', locale)} value={form.ticker_symbol} onChange={(e) => set('ticker_symbol', e.target.value)} placeholder="e.g. AAPL, BTC" />
                <Input label={t('investments.quantity', locale)} type="number" step="0.0001" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
                <Input label={t('investments.purchase_price', locale)} type="number" step="0.01" value={form.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} />
                <Input label={t('investments.current_price', locale)} type="number" step="0.01" value={form.current_price} onChange={(e) => set('current_price', e.target.value)} />
              </div>
            )}

            <Textarea label={t('investments.description', locale)} value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} />
            <Textarea label={t('investments.notes', locale)} value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
            <div className="flex gap-3 pt-1">
              <Button type="submit" disabled={saving}>
                {saving ? '...' : t('common.save', locale)}
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.push('/investments')}>
                {t('common.cancel', locale)}
              </Button>
            </div>
          </form>
        </Card>
      </PageContent>
    </PageShell>
  );
}
