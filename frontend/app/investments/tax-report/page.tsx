'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Select, Spinner, EmptyState } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { getTaxReport, getPortfolios } from '../../lib/api';

function fmtCurrency(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
}

interface Portfolio { id: number; name: string; currency: string; }

interface TaxReportData {
  year: number;
  total_realized_gains: number;
  total_dividends: number;
  total_tax_liability: number;
  sell_transactions: {
    id: number; date: string; holding_ticker: string; holding_name: string;
    quantity: number; cost_basis: number; proceeds: number; gain_loss: number;
  }[];
  dividend_transactions: {
    id: number; date: string; holding_ticker: string; holding_name: string; total_amount: number;
  }[];
}

export default function TaxReportPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [portfolioFilter, setPortfolioFilter] = useState('');
  const [report, setReport] = useState<TaxReportData | null>(null);

  useEffect(() => {
    getPortfolios()
      .then((data) => setPortfolios(Array.isArray(data) ? data : (data?.results || [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    getTaxReport(year, portfolioFilter ? Number(portfolioFilter) : undefined)
      .then((data) => setReport(data))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [year, portfolioFilter]);

  const years = [];
  for (let y = new Date().getFullYear(); y >= 2015; y--) years.push(y);

  function gainClass(v: number) { return v >= 0 ? 'text-green-600' : 'text-red-600'; }
  function gainSign(v: number) { return v >= 0 ? '+' : ''; }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader title={t('investments.tax_report', locale)} onBack={() => router.push('/investments')} />

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="w-32">
            <Select label={t('investments.year', locale)} value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
          <div className="w-64">
            <Select label={t('investments.portfolio', locale)} value={portfolioFilter} onChange={(e) => setPortfolioFilter(e.target.value)}>
              <option value="">{t('investments.all_types', locale)}</option>
              {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
        </div>

        {loading ? (
          <Spinner message={t('common.loading', locale)} />
        ) : report ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card>
                <div className="p-4">
                  <p className="text-[13px] font-medium text-gray-500">{t('investments.realized_gains', locale)}</p>
                  <p className={`text-2xl font-bold mt-1 ${gainClass(report.total_realized_gains)}`}>
                    {gainSign(report.total_realized_gains)}{fmtCurrency(report.total_realized_gains)}
                  </p>
                </div>
              </Card>
              <Card>
                <div className="p-4">
                  <p className="text-[13px] font-medium text-gray-500">{t('investments.total_dividends', locale)}</p>
                  <p className="text-2xl font-bold mt-1 text-green-600">{fmtCurrency(report.total_dividends)}</p>
                </div>
              </Card>
              <Card>
                <div className="p-4">
                  <p className="text-[13px] font-medium text-gray-500">Tax Liability (est.)</p>
                  <p className="text-2xl font-bold mt-1 text-gray-900">{fmtCurrency(report.total_tax_liability)}</p>
                </div>
              </Card>
            </div>

            {/* Sell Transactions */}
            {report.sell_transactions && report.sell_transactions.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('investments.sell', locale)} {t('investments.transactions', locale)}</h3>
                <Card padding={false}>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.date', locale)}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.ticker', locale)}</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.quantity', locale)}</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.cost_basis', locale)}</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.proceeds', locale)}</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.gain_loss', locale)}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {report.sell_transactions.map((tx) => (
                          <tr key={tx.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-700">{tx.date}</td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{tx.holding_ticker}</td>
                            <td className="px-4 py-3 text-sm text-gray-700 text-right">{tx.quantity}</td>
                            <td className="px-4 py-3 text-sm text-gray-700 text-right">{fmtCurrency(tx.cost_basis)}</td>
                            <td className="px-4 py-3 text-sm text-gray-700 text-right">{fmtCurrency(tx.proceeds)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`text-sm font-medium ${gainClass(tx.gain_loss)}`}>{gainSign(tx.gain_loss)}{fmtCurrency(tx.gain_loss)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {/* Dividend Transactions */}
            {report.dividend_transactions && report.dividend_transactions.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('investments.dividend', locale)} {t('investments.transactions', locale)}</h3>
                <Card padding={false}>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.date', locale)}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.ticker', locale)}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('investments.name', locale)}</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('investments.total_amount', locale)}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {report.dividend_transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-700">{tx.date}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{tx.holding_ticker}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{tx.holding_name}</td>
                          <td className="px-4 py-3 text-sm font-medium text-green-600 text-right">{fmtCurrency(tx.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            )}

            {(!report.sell_transactions || report.sell_transactions.length === 0) && (!report.dividend_transactions || report.dividend_transactions.length === 0) && (
              <Card>
                <EmptyState
                  icon="📄"
                  message={t('investments.no_transactions', locale)}
                />
              </Card>
            )}
          </>
        ) : (
          <Card>
            <EmptyState
              icon="📄"
              message={t('investments.no_transactions', locale)}
            />
          </Card>
        )}
      </PageContent>
    </PageShell>
  );
}
