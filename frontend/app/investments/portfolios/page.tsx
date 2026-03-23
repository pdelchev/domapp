'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Badge, Button, Spinner, EmptyState } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { getPortfolios, deletePortfolio } from '../../lib/api';

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

function fmtCurrency(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
}

function gainClass(v: number) { return v >= 0 ? 'text-green-600' : 'text-red-600'; }
function gainSign(v: number) { return v >= 0 ? '+' : ''; }

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

export default function PortfoliosPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);

  useEffect(() => {
    getPortfolios()
      .then((data) => setPortfolios(Array.isArray(data) ? data : (data?.results || [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm(t('investments.delete_confirm', locale))) return;
    await deletePortfolio(id);
    setPortfolios((prev) => prev.filter((p) => p.id !== id));
  };

  if (loading) {
    return <PageShell><NavBar /><PageContent size="lg"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('investments.portfolios', locale)}
          onBack={() => router.push('/investments')}
          action={<Button onClick={() => router.push('/investments/portfolios/new')}>+ {t('investments.add_portfolio', locale)}</Button>}
        />

        {portfolios.length === 0 ? (
          <Card>
            <EmptyState
              icon="💼"
              message={t('investments.no_portfolios', locale)}
            />
          </Card>
        ) : (
          <Card padding={false}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.name', locale)}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.country', locale)}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.broker', locale)}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.currency', locale)}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.holdings', locale)}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.total_value', locale)}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.gain_loss', locale)}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('common.actions', locale)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {portfolios.map((p) => {
                  const gl = p.gain_loss ?? 0;
                  const glPct = p.gain_loss_pct ?? 0;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/investments/portfolios/${p.id}`)}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{COUNTRY_FLAGS[p.country] || ''} {p.country}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{p.broker || '--'}</td>
                      <td className="px-4 py-3"><Badge color="gray">{p.currency}</Badge></td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">{p.holdings_count ?? 0}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{fmtCurrency(p.total_value ?? 0, p.currency)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-medium ${gainClass(gl)}`}>{gainSign(gl)}{fmtCurrency(gl, p.currency)}</span>
                        <span className={`text-xs ml-1 ${gainClass(glPct)}`}>({gainSign(glPct)}{glPct.toFixed(1)}%)</span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="danger" size="sm" onClick={() => handleDelete(p.id)}>{t('common.delete', locale)}</Button>
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
