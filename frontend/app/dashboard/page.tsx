'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getDashboardSummary, getProperties } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, Card, Button, Badge, Spinner } from '../components/ui';

interface DashboardData {
  total_properties: number;
  total_portfolio_value: number;
  active_leases: number;
  occupancy_rate: number;
  monthly_rent_collected: number;
  monthly_expenses: number;
  net_cash_flow: number;
  upcoming_rent_due: number;
  overdue_rent: number;
  expiring_documents: number;
}

interface Property {
  id: number;
  name: string;
  city: string;
  property_type: string;
  owner_name: string;
  current_value: number;
}

const TYPE_BADGE: Record<string, 'blue' | 'green' | 'yellow' | 'purple'> = {
  apartment: 'blue',
  house: 'green',
  studio: 'yellow',
  commercial: 'purple',
};

export default function DashboardPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDashboardSummary(), getProperties()])
      .then(([dash, props]) => { setDashboard(dash); setProperties(props); })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const fmt = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(value);

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent>
        {/* Metric Cards */}
        {dashboard && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
            <MetricCard label={t('dash.portfolio_value', locale)} value={fmt(dashboard.total_portfolio_value)} />
            <MetricCard label={t('dash.monthly_income', locale)} value={fmt(dashboard.monthly_rent_collected)} accent="text-green-600" />
            <MetricCard label={t('dash.monthly_expenses', locale)} value={fmt(dashboard.monthly_expenses)} accent="text-red-600" />
            <MetricCard label={t('dash.net_cash_flow', locale)} value={fmt(dashboard.net_cash_flow)} accent={dashboard.net_cash_flow >= 0 ? 'text-green-600' : 'text-red-600'} />
            <MetricCard label={t('dash.properties', locale)} value={String(dashboard.total_properties)} />
            <MetricCard label={t('dash.active_leases', locale)} value={String(dashboard.active_leases)} />
            <MetricCard label={t('dash.occupancy', locale)} value={`${dashboard.occupancy_rate}%`} />
            <MetricCard label={t('dash.upcoming_rent', locale)} value={String(dashboard.upcoming_rent_due)} />
            <MetricCard label={t('dash.overdue', locale)} value={String(dashboard.overdue_rent)} accent={dashboard.overdue_rent > 0 ? 'text-red-600' : undefined} />
            <MetricCard label={t('dash.expiring_docs', locale)} value={String(dashboard.expiring_documents)} />
          </div>
        )}

        {/* Properties Table */}
        <Card padding={false}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">{t('nav.properties', locale)}</h2>
            <Button size="sm" onClick={() => router.push('/properties/new')}>
              + {t('common.add', locale)}
            </Button>
          </div>

          {properties.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-gray-400">{t('common.no_data', locale)}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {properties.map((prop) => (
                <div
                  key={prop.id}
                  onClick={() => router.push(`/properties/${prop.id}`)}
                  className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{prop.name}</p>
                    <p className="text-xs text-gray-500">{prop.city} &middot; {prop.owner_name}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <Badge color={TYPE_BADGE[prop.property_type] || 'gray'}>
                      {t(`type.${prop.property_type}`, locale)}
                    </Badge>
                    {prop.current_value > 0 && (
                      <span className="text-sm font-medium text-gray-700">{fmt(prop.current_value)}</span>
                    )}
                    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </PageContent>
    </PageShell>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card className="py-4 px-4">
      <p className={`text-lg font-semibold ${accent || 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </Card>
  );
}
