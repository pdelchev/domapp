'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import { getVehicles, getVehicleSummary, deleteVehicle } from '../lib/api';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, EmptyState, Spinner, Alert } from '../components/ui';

// Obligation type keys for the compliance grid columns
const OB_TYPES = ['mtpl', 'kasko', 'vignette', 'mot', 'vehicle_tax', 'green_card', 'assistance'] as const;

// Status → Badge color mapping
const STATUS_COLORS: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  active: 'green',
  expiring_soon: 'yellow',
  expired: 'red',
  no_expiry: 'gray',
};

// Status → short label for grid cell
function statusDot(status: string) {
  const colors: Record<string, string> = {
    active: 'bg-green-500',
    expiring_soon: 'bg-amber-400',
    expired: 'bg-red-500',
    no_expiry: 'bg-gray-300',
  };
  return colors[status] || 'bg-gray-200';
}

interface VehicleItem {
  id: number;
  plate_number: string;
  make: string;
  model: string;
  year: number | null;
  color: string;
  fuel_type: string;
  is_active: boolean;
  obligations_count: number;
  expired_count: number;
  expiring_count: number;
  property_name: string | null;
  current_obligations?: Array<{
    id: number;
    obligation_type: string;
    display_name: string;
    start_date: string;
    end_date: string | null;
    status: string;
    cost: string | null;
  }>;
}

interface Summary {
  total_vehicles: number;
  total_obligations: number;
  active: number;
  expiring_soon: number;
  expired: number;
  upcoming: Array<{
    id: number;
    obligation_type: string;
    display_name: string;
    vehicle_plate: string;
    vehicle_make_model: string;
    end_date: string;
    days_left: number;
  }>;
}

export default function VehiclesPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [vehicles, setVehicles] = useState<VehicleItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      getVehicles('active=true'),
      getVehicleSummary(),
    ])
      .then(([v, s]) => {
        setVehicles(v);
        setSummary(s);
      })
      .catch(() => setError('Failed to load vehicles'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <PageShell><NavBar /><PageContent size="lg"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>
  );

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('vehicles.title', locale)}
          action={<Button onClick={() => router.push('/vehicles/new')}>+ {t('vehicles.add', locale)}</Button>}
        />

        <Alert type="error" message={error} />

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard label={t('vehicles.total', locale)} value={summary.total_vehicles} color="indigo" />
            <SummaryCard label={t('vehicles.all_valid', locale)} value={summary.active} color="green" />
            <SummaryCard label={t('vehicles.expiring_soon', locale)} value={summary.expiring_soon} color="amber" />
            <SummaryCard label={t('vehicles.expired', locale)} value={summary.expired} color="red" />
          </div>
        )}

        {vehicles.length === 0 ? (
          <EmptyState icon="🚗" message={t('vehicles.no_vehicles', locale)} />
        ) : (
          <>
            {/* Compliance Grid */}
            <Card padding={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-700">{t('vehicles.plate', locale)}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-700 hidden md:table-cell">{t('vehicles.make', locale)}</th>
                      {OB_TYPES.map((type) => (
                        <th key={type} className="text-center px-2 py-3 font-medium text-gray-700 text-xs">
                          {t(`obligation.${type}`, locale)}
                        </th>
                      ))}
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((v) => {
                      // Build obligation status map
                      const obMap: Record<string, string> = {};
                      (v.current_obligations || []).forEach((ob) => {
                        obMap[ob.obligation_type] = ob.status;
                      });

                      return (
                        <tr
                          key={v.id}
                          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => router.push(`/vehicles/${v.id}`)}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{v.plate_number}</div>
                            <div className="text-xs text-gray-500 md:hidden">{v.make} {v.model}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                            {v.make} {v.model} {v.year ? `(${v.year})` : ''}
                          </td>
                          {OB_TYPES.map((type) => {
                            const status = obMap[type];
                            return (
                              <td key={type} className="text-center px-2 py-3">
                                {status ? (
                                  <span className={`inline-block w-3 h-3 rounded-full ${statusDot(status)}`} title={status} />
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-right">
                            {v.expired_count > 0 && <Badge color="red">{v.expired_count}</Badge>}
                            {v.expiring_count > 0 && <Badge color="yellow">{v.expiring_count}</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Upcoming Expirations */}
            {summary && summary.upcoming.length > 0 && (
              <div className="mt-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('vehicles.upcoming', locale)}</h2>
                <div className="space-y-2">
                  {summary.upcoming.map((item) => (
                    <Card key={item.id}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-gray-900">{item.display_name}</span>
                          <span className="text-gray-500 mx-2">—</span>
                          <span className="text-gray-600">{item.vehicle_plate}</span>
                          <span className="text-gray-400 ml-2 text-sm">{item.vehicle_make_model}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge color={item.days_left <= 7 ? 'red' : item.days_left <= 30 ? 'yellow' : 'green'}>
                            {item.days_left} {t('vehicles.days_left', locale)}
                          </Badge>
                          <span className="text-sm text-gray-500">{item.end_date}</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </PageContent>
    </PageShell>
  );
}

// Summary metric card
function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm mt-1 opacity-80">{label}</div>
    </div>
  );
}
