'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getFinanceSummary, getCollectionHeatmap, getExpenseForecast } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Spinner, Tooltip, Select } from '../components/ui';

interface PropertyBreakdown {
  id: number;
  name: string;
  income: number;
  expenses: number;
  net: number;
}

interface FinanceSummary {
  total_income: number;
  total_expenses: number;
  net_income: number;
  month_income: number;
  month_expenses: number;
  month_net: number;
  pending_amount: number;
  overdue_amount: number;
  by_property: PropertyBreakdown[];
}

interface HeatmapDay { date: string; level: 'on_time' | 'late' | 'missed' | 'pending'; count: number; amount: number; }
interface PropertyMonth { total: number; paid: number; on_time: number; late: number; missed: number; pending: number; }
interface HeatmapProperty { id: number; name: string; months: Record<string, PropertyMonth>; }
interface HeatmapData { days: HeatmapDay[]; by_property: HeatmapProperty[]; }

interface ForecastMonth { month: string; total: number; items: { category: string; description: string; amount: number; source: string }[]; }
interface ForecastProperty { property_id: number; property_name: string; months: ForecastMonth[]; total_projected: number; }
interface ForecastData { forecast_months: number; properties: ForecastProperty[]; grand_total: number; }

export default function FinancePage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [forecastMonths, setForecastMonths] = useState(6);

  useEffect(() => {
    Promise.all([
      getFinanceSummary(),
      getCollectionHeatmap(),
      getExpenseForecast(forecastMonths),
    ])
      .then(([summary, hm, fc]) => {
        setData(summary);
        setHeatmap(hm);
        setForecast(fc);
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router, forecastMonths]);

  const fmt = (v: number) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { style: 'currency', currency: 'EUR' }).format(v);

  if (loading || !data) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  const cards = [
    { label: t('finance.total_income', locale), value: fmt(data.total_income), color: 'text-green-600', bg: 'bg-green-50', tip: t('finance.tip_total_income', locale) },
    { label: t('finance.total_expenses', locale), value: fmt(data.total_expenses), color: 'text-red-600', bg: 'bg-red-50', tip: t('finance.tip_total_expenses', locale) },
    { label: t('finance.net_income', locale), value: fmt(data.net_income), color: data.net_income >= 0 ? 'text-green-600' : 'text-red-600', bg: data.net_income >= 0 ? 'bg-green-50' : 'bg-red-50', tip: t('finance.tip_net_income', locale) },
  ];

  const monthCards = [
    { label: t('finance.income', locale), value: fmt(data.month_income), color: 'text-green-600', tip: t('finance.tip_month_income', locale) },
    { label: t('finance.expenses', locale), value: fmt(data.month_expenses), color: 'text-red-600', tip: t('finance.tip_month_expenses', locale) },
    { label: t('finance.net', locale), value: fmt(data.month_net), color: data.month_net >= 0 ? 'text-green-600' : 'text-red-600', tip: t('finance.tip_month_net', locale) },
    { label: t('finance.pending', locale), value: fmt(data.pending_amount), color: 'text-yellow-600', tip: t('finance.tip_pending', locale) },
    { label: t('finance.overdue', locale), value: fmt(data.overdue_amount), color: 'text-red-600', tip: t('finance.tip_overdue', locale) },
  ];

  return (
    <PageShell>
      <NavBar />
      <PageContent>
        <PageHeader
          title={t('finance.title', locale)}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => router.push('/finance/payments')}>
                {t('finance.view_payments', locale)}
              </Button>
              <Button variant="secondary" onClick={() => router.push('/finance/expenses')}>
                {t('finance.view_expenses', locale)}
              </Button>
            </div>
          }
        />

        {/* All-time totals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {cards.map((c) => (
            <Card key={c.label}>
              <div className={`rounded-lg p-1 inline-block mb-2`}>
                <Tooltip text={c.tip}>
                  <p className="text-[13px] font-medium text-gray-500">{c.label}</p>
                </Tooltip>
              </div>
              <p className={`text-2xl font-semibold ${c.color}`}>{c.value}</p>
            </Card>
          ))}
        </div>

        {/* This month */}
        <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('finance.this_month', locale)}</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {monthCards.map((c) => (
            <Card key={c.label}>
              <Tooltip text={c.tip}>
                <p className="text-[13px] font-medium text-gray-500 mb-1">{c.label}</p>
              </Tooltip>
              <p className={`text-lg font-semibold ${c.color}`}>{c.value}</p>
            </Card>
          ))}
        </div>

        {/* Per property */}
        {data.by_property.length > 0 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('finance.by_property', locale)}</h2>
            <Card padding={false}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('tenants.property', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('finance.income', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('finance.expenses', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('finance.net', locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.by_property.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{p.name}</td>
                      <td className="px-5 py-3 text-sm text-green-600 text-right">{fmt(p.income)}</td>
                      <td className="px-5 py-3 text-sm text-red-600 text-right">{fmt(p.expenses)}</td>
                      <td className="px-5 py-3 text-right">
                        <Badge color={p.net >= 0 ? 'green' : 'red'}>{fmt(p.net)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}

        {/* ═══ Collection Heatmap ═══ */}
        {heatmap && heatmap.by_property.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              {locale === 'bg' ? 'Събиране на наеми (12 месеца)' : 'Rent Collection (12 months)'}
            </h2>
            <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500" /> {locale === 'bg' ? 'Навреме' : 'On time'}</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-400" /> {locale === 'bg' ? 'Късно' : 'Late'}</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500" /> {locale === 'bg' ? 'Пропуснат' : 'Missed'}</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-200" /> {locale === 'bg' ? 'Очаква се' : 'Pending'}</span>
            </div>
            {heatmap.by_property.map((prop) => {
              // Generate last 12 months
              const months: string[] = [];
              const now = new Date();
              for (let i = 11; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                months.push(d.toISOString().slice(0, 7));
              }

              return (
                <Card key={prop.id} className="mb-3">
                  <p className="text-sm font-semibold text-gray-900 mb-2">{prop.name}</p>
                  <div className="grid grid-cols-12 gap-1.5">
                    {months.map((month) => {
                      const m = prop.months[month];
                      if (!m || m.total === 0) {
                        return (
                          <div key={month} className="flex flex-col items-center gap-1">
                            <div className="w-full aspect-square rounded-md bg-gray-100" title={month} />
                            <span className="text-[9px] text-gray-400 leading-none">{month.slice(5)}</span>
                          </div>
                        );
                      }
                      // Determine color based on dominant status
                      let bg = 'bg-gray-200';
                      if (m.missed > 0) bg = 'bg-red-500';
                      else if (m.late > 0) bg = 'bg-amber-400';
                      else if (m.on_time > 0) bg = 'bg-emerald-500';
                      else if (m.pending > 0) bg = 'bg-gray-300';

                      const tooltip = `${month}: ${m.on_time} ${locale === 'bg' ? 'навреме' : 'on time'}, ${m.late} ${locale === 'bg' ? 'късно' : 'late'}, ${m.missed} ${locale === 'bg' ? 'пропуснати' : 'missed'}`;

                      return (
                        <div key={month} className="flex flex-col items-center gap-1">
                          <div
                            className={`w-full aspect-square rounded-md ${bg} transition-transform hover:scale-110 cursor-help`}
                            title={tooltip}
                          >
                            {/* Mini count */}
                            <div className="flex items-center justify-center h-full text-[10px] font-bold text-white/80">
                              {m.paid}/{m.total}
                            </div>
                          </div>
                          <span className="text-[9px] text-gray-400 leading-none">{month.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* ═══ Expense Forecast ═══ */}
        {forecast && forecast.properties.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">
                {locale === 'bg' ? 'Прогноза за разходи' : 'Expense Forecast'}
              </h2>
              <div className="flex items-center gap-2">
                <Select
                  value={String(forecastMonths)}
                  onChange={(e) => setForecastMonths(Number(e.target.value))}
                  className="!h-8 !text-xs !w-auto"
                >
                  <option value="3">3 {locale === 'bg' ? 'мес.' : 'mo.'}</option>
                  <option value="6">6 {locale === 'bg' ? 'мес.' : 'mo.'}</option>
                  <option value="12">12 {locale === 'bg' ? 'мес.' : 'mo.'}</option>
                </Select>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              {locale === 'bg'
                ? 'Базирано на текущите повтарящи се разходи + средно за 6 месеца'
                : 'Based on recurring expenses + 6-month historical average'}
            </p>

            {forecast.properties.map((prop) => (
              <Card key={prop.property_id} className="mb-3">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-900">{prop.property_name}</p>
                  <Badge color="red">{locale === 'bg' ? 'Общо' : 'Total'}: {fmt(prop.total_projected)}</Badge>
                </div>
                <div className="overflow-x-auto">
                  <div className="flex gap-2 min-w-0">
                    {prop.months.map((m) => {
                      const monthLabel = new Date(m.month + '-01').toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-US', { month: 'short', year: '2-digit' });
                      return (
                        <div key={m.month} className="flex-1 min-w-[80px]">
                          <div className="bg-gray-50 rounded-lg p-2 text-center border border-gray-100">
                            <p className="text-[10px] text-gray-400 uppercase">{monthLabel}</p>
                            <p className="text-sm font-bold text-red-600 mt-0.5">{fmt(m.total)}</p>
                            <div className="mt-1.5 space-y-0.5">
                              {m.items.slice(0, 3).map((item, i) => (
                                <p key={i} className="text-[9px] text-gray-500 truncate" title={`${item.description}: ${fmt(item.amount)}`}>
                                  {item.description.slice(0, 15)}
                                </p>
                              ))}
                              {m.items.length > 3 && (
                                <p className="text-[9px] text-gray-400">+{m.items.length - 3} {locale === 'bg' ? 'още' : 'more'}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            ))}

            {/* Grand total bar */}
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-5 py-3 mt-2">
              <span className="text-sm font-semibold text-red-800">
                {locale === 'bg' ? `Общо прогнозирани (${forecastMonths} мес.)` : `Total projected (${forecastMonths} mo.)`}
              </span>
              <span className="text-lg font-bold text-red-700">{fmt(forecast.grand_total)}</span>
            </div>
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}
