'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '../../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Input, Select, Textarea, Button, Alert } from '../../../components/ui';
import { useLanguage } from '../../../context/LanguageContext';
import { t } from '../../../lib/i18n';
import { createPortfolio } from '../../../lib/api';

const COUNTRIES = [
  { value: 'Bulgaria', key: 'country.bulgaria' },
  { value: 'United Kingdom', key: 'country.uk' },
  { value: 'United States', key: 'country.us' },
  { value: 'Germany', key: 'country.germany' },
  { value: 'France', key: 'country.france' },
  { value: 'Spain', key: 'country.spain' },
  { value: 'Italy', key: 'country.italy' },
  { value: 'Switzerland', key: 'country.switzerland' },
  { value: 'Netherlands', key: 'country.netherlands' },
  { value: 'Other', key: 'country.other' },
];

const CURRENCIES = ['GBP', 'EUR', 'BGN', 'USD', 'CHF'];

export default function NewPortfolioPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    country: '',
    currency: 'EUR',
    broker: '',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.country) {
      setError(t('common.required', locale));
      return;
    }
    setSaving(true);
    try {
      await createPortfolio(form);
      router.push('/investments/portfolios');
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
        <PageHeader title={t('investments.add_portfolio', locale)} onBack={() => router.push('/investments/portfolios')} />
        <Alert type="error" message={error} />
        <Card>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t('investments.portfolio_name', locale)}
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
              <Select
                label={t('investments.country', locale)}
                value={form.country}
                onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
                required
              >
                <option value="">{t('common.select', locale)}</option>
                {COUNTRIES.map((c) => (
                  <option key={c.value} value={c.value}>{t(c.key, locale)}</option>
                ))}
              </Select>
              <Select
                label={t('investments.currency', locale)}
                value={form.currency}
                onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
                required
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
              <Input
                label={t('investments.broker', locale)}
                value={form.broker}
                onChange={(e) => setForm((prev) => ({ ...prev, broker: e.target.value }))}
              />
            </div>
            <Textarea
              label={t('investments.description', locale)}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => router.push('/investments/portfolios')}>{t('common.cancel', locale)}</Button>
              <Button type="submit" disabled={saving}>{saving ? t('common.loading', locale) : t('common.save', locale)}</Button>
            </div>
          </form>
        </Card>
      </PageContent>
    </PageShell>
  );
}
