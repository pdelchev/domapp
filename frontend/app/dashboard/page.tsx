'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getDashboardSummary, getProperties, getMe, logout } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';

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
  purchase_price: number;
}

const TYPE_COLORS: Record<string, string> = {
  apartment: 'bg-blue-100 text-blue-700',
  house: 'bg-green-100 text-green-700',
  studio: 'bg-yellow-100 text-yellow-700',
  commercial: 'bg-purple-100 text-purple-700',
};

export default function DashboardPage() {
  const router = useRouter();
  const { locale, setLocale } = useLanguage();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [dash, props, user] = await Promise.all([
          getDashboardSummary(),
          getProperties(),
          getMe(),
        ]);
        setDashboard(dash);
        setProperties(props);
        setUsername(user.first_name || user.username);
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const fmt = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(value);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-lg text-gray-500">{t('common.loading', locale)}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Nav */}
      <nav className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left — Brand */}
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏠</span>
              <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                DomApp
              </span>
            </div>

            {/* Center — Nav Links */}
            <div className="hidden md:flex items-center gap-1">
              <NavLink href="/dashboard" active label={t('nav.dashboard', locale)} icon="📊" />
              <NavLink href="/owners" label={t('nav.owners', locale)} icon="👤" />
              <NavLink href="/properties" label={t('nav.properties', locale)} icon="🏢" />
              <NavLink href="/tenants" label={t('nav.tenants', locale)} icon="🔑" />
              <NavLink href="/notifications" label={t('nav.notifications', locale)} icon="🔔" />
            </div>

            {/* Right — Language + User */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setLocale(locale === 'en' ? 'bg' : 'en')}
                className="px-3 py-1.5 text-sm font-medium rounded-full bg-gray-100 hover:bg-gray-200 transition"
              >
                {locale === 'en' ? '🇧🇬 BG' : '🇬🇧 EN'}
              </button>
              <span className="text-sm text-gray-600 hidden sm:block">👋 {username}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-red-500 hover:text-red-600 font-medium"
              >
                {t('nav.logout', locale)}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard Widgets */}
        {dashboard && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Widget
              label={t('dash.portfolio_value', locale)}
              value={fmt(dashboard.total_portfolio_value)}
              icon="💰"
              gradient="from-indigo-500 to-purple-600"
            />
            <Widget
              label={t('dash.monthly_income', locale)}
              value={fmt(dashboard.monthly_rent_collected)}
              icon="📈"
              gradient="from-emerald-500 to-teal-600"
            />
            <Widget
              label={t('dash.monthly_expenses', locale)}
              value={fmt(dashboard.monthly_expenses)}
              icon="📉"
              gradient="from-orange-500 to-red-500"
            />
            <Widget
              label={t('dash.net_cash_flow', locale)}
              value={fmt(dashboard.net_cash_flow)}
              icon="💵"
              gradient={dashboard.net_cash_flow >= 0 ? 'from-emerald-500 to-green-600' : 'from-red-500 to-pink-600'}
            />
            <SmallWidget
              label={t('dash.properties', locale)}
              value={dashboard.total_properties}
              icon="🏢"
              color="bg-blue-50 text-blue-700"
            />
            <SmallWidget
              label={t('dash.active_leases', locale)}
              value={dashboard.active_leases}
              icon="📋"
              color="bg-green-50 text-green-700"
            />
            <SmallWidget
              label={t('dash.occupancy', locale)}
              value={dashboard.occupancy_rate + '%'}
              icon="📊"
              color="bg-purple-50 text-purple-700"
            />
            <SmallWidget
              label={t('dash.upcoming_rent', locale)}
              value={dashboard.upcoming_rent_due}
              icon="⏰"
              color="bg-yellow-50 text-yellow-700"
            />
            <SmallWidget
              label={t('dash.overdue', locale)}
              value={dashboard.overdue_rent}
              icon="⚠️"
              color="bg-red-50 text-red-700"
            />
            <SmallWidget
              label={t('dash.expiring_docs', locale)}
              value={dashboard.expiring_documents}
              icon="📄"
              color="bg-orange-50 text-orange-700"
            />
          </div>
        )}

        {/* Properties List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-800">
              {t('nav.properties', locale)}
            </h2>
            <button
              onClick={() => router.push('/properties')}
              className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 transition shadow-md shadow-indigo-500/20"
            >
              + {t('common.add', locale)}
            </button>
          </div>

          {properties.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <span className="text-4xl block mb-3">🏠</span>
              <p>{t('common.no_data', locale)}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {properties.map((prop) => (
                <div
                  key={prop.id}
                  onClick={() => router.push('/properties/' + prop.id)}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer transition"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-xl">
                      {prop.property_type === 'house' ? '🏡' : prop.property_type === 'commercial' ? '🏪' : '🏢'}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{prop.name}</p>
                      <p className="text-sm text-gray-500">{prop.city} • {prop.owner_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={TYPE_COLORS[prop.property_type] ? 'px-2.5 py-1 rounded-full text-xs font-medium ' + TYPE_COLORS[prop.property_type] : 'px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600'}>
                      {prop.property_type}
                    </span>
                    {prop.current_value && (
                      <span className="text-sm font-medium text-gray-600">{fmt(prop.current_value)}</span>
                    )}
                    <span className="text-gray-300">→</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// --- Widget Components ---

function Widget({ label, value, icon, gradient }: { label: string; value: string; icon: string; gradient: string }) {
  return (
    <div className={'bg-gradient-to-br rounded-2xl p-5 text-white shadow-lg ' + gradient}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-white/80 mt-1">{label}</p>
    </div>
  );
}

function SmallWidget({ label, value, icon, color }: { label: string; value: number | string; icon: string; color: string }) {
  return (
    <div className={color + ' rounded-2xl p-4 flex items-center gap-3'}>
      <span className="text-xl">{icon}</span>
      <div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs opacity-70">{label}</p>
      </div>
    </div>
  );
}

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: string; active?: boolean }) {
  const classes = active
    ? 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition bg-indigo-50 text-indigo-700'
    : 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition text-gray-600 hover:bg-gray-50';

  return (
    <a href={href} className={classes}>
      <span>{icon}</span>
      {label}
    </a>
  );
}