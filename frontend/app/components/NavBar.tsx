'use client';

/**
 * ═══ NAVBAR — ADAPTIVE NAVIGATION ═══
 *
 * MOBILE (< md): Bottom tab bar with 5 tabs
 *   [Home] [Property] [+] [Life] [Apps]
 *   - "Apps" opens full-screen module grid
 *   - "+" opens quick-add speed dial
 *   - Property/Life tabs navigate to section landing pages
 *
 * DESKTOP (≥ md): Top navbar with grouped dropdowns
 *   Brand | Property▾ | Life▾ | Investments▾ | Music | Apps▾ | [bell] [BG] [user] [logout]
 *
 * PWA: Detects standalone mode for safe-area handling
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getMe, logout, getUnreadCount } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import Logo from './Logo';

// ═══ MODULE DEFINITIONS ═══
// Each module has: id, icon (SVG path), color, href, i18n key, section grouping
// This is the single source of truth for all navigation

type Module = {
  id: string;
  icon: string;
  color: string;
  href: string;
  key: string;
  section: 'property' | 'life' | 'invest' | 'other';
};

const MODULES: Module[] = [
  // Property Management
  { id: 'dashboard', icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z', color: 'bg-indigo-500', href: '/dashboard', key: 'nav.dashboard', section: 'property' },
  { id: 'properties', icon: 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z', color: 'bg-blue-500', href: '/properties', key: 'nav.properties', section: 'property' },
  { id: 'owners', icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z', color: 'bg-blue-400', href: '/owners', key: 'nav.owners', section: 'property' },
  { id: 'tenants', icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z', color: 'bg-emerald-500', href: '/tenants', key: 'nav.tenants', section: 'property' },
  { id: 'leases', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z', color: 'bg-violet-500', href: '/leases', key: 'nav.leases', section: 'property' },
  { id: 'finance', icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z', color: 'bg-green-500', href: '/finance', key: 'nav.finance', section: 'property' },
  { id: 'documents', icon: 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z', color: 'bg-amber-500', href: '/documents', key: 'nav.documents', section: 'property' },
  { id: 'problems', icon: 'M11.42 15.17l-5.04-3.36a1.5 1.5 0 010-2.49l5.04-3.36a1.5 1.5 0 012.16 1.24v6.74a1.5 1.5 0 01-2.16 1.24zM20.25 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5h2.25a.75.75 0 01.75.75z', color: 'bg-orange-500', href: '/problems', key: 'nav.problems', section: 'property' },
  // Personal / Life
  { id: 'life', icon: 'M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z', color: 'bg-fuchsia-500', href: '/life', key: 'life.title', section: 'life' },
  { id: 'health', icon: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z', color: 'bg-rose-500', href: '/health', key: 'nav.health', section: 'life' },
  { id: 'recovery', icon: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182', color: 'bg-green-500', href: '/health/recovery', key: 'nav.recovery', section: 'life' },
  { id: 'vehicles', icon: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0H6.375c-.621 0-1.125-.504-1.125-1.125V14.25m16.5 0V6.169a2.25 2.25 0 00-1.244-2.013l-5.25-2.625A2.25 2.25 0 0014.172 1.5H9.828a2.25 2.25 0 00-1.114.294L3.464 4.406A2.25 2.25 0 002.25 6.42V14.25', color: 'bg-cyan-500', href: '/vehicles', key: 'nav.vehicles', section: 'life' },
  // Investments
  { id: 'investments', icon: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941', color: 'bg-emerald-600', href: '/investments', key: 'nav.investments', section: 'invest' },
  // Other
  { id: 'music', icon: 'M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.34A1.125 1.125 0 0017.48 1.29l-3.346.956A1.125 1.125 0 0013.125 3.34V15', color: 'bg-purple-500', href: '/music', key: 'nav.music', section: 'other' },
  { id: 'notifications', icon: 'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0', color: 'bg-red-500', href: '/notifications', key: 'nav.notifications', section: 'other' },
  { id: 'notes', icon: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10', color: 'bg-indigo-400', href: '/notes', key: 'nav.notes', section: 'other' },
];

// Quick-add actions for the + button
const QUICK_ACTIONS = [
  { href: '/properties/new', key: 'fab.new_property', color: 'bg-blue-500', icon: 'M12 4.5v15m7.5-7.5h-15' },
  { href: '/tenants/new', key: 'fab.new_tenant', color: 'bg-emerald-500', icon: 'M12 4.5v15m7.5-7.5h-15' },
  { href: '/leases/new', key: 'fab.new_lease', color: 'bg-violet-500', icon: 'M12 4.5v15m7.5-7.5h-15' },
  { href: '/problems/new', key: 'fab.new_problem', color: 'bg-amber-500', icon: 'M12 4.5v15m7.5-7.5h-15' },
  { href: '/notes?new=1', key: 'fab.new_note', color: 'bg-indigo-500', icon: 'M12 4.5v15m7.5-7.5h-15' },
  { href: '/vehicles/new', key: 'fab.new_vehicle', color: 'bg-cyan-500', icon: 'M12 4.5v15m7.5-7.5h-15' },
  { href: '/health/upload', key: 'fab.new_report', color: 'bg-teal-500', icon: 'M12 4.5v15m7.5-7.5h-15' },
  { href: '/life', key: 'fab.new_vitals', color: 'bg-pink-500', icon: 'M12 4.5v15m7.5-7.5h-15' },
];

// Desktop nav — grouped dropdowns
const DESKTOP_NAV = [
  { key: 'nav.dashboard', href: '/dashboard' },
  { key: 'nav.property_mgmt', href: '/properties', sub: [
    { href: '/properties', key: 'nav.properties' },
    { href: '/owners', key: 'nav.owners' },
    { href: '/tenants', key: 'nav.tenants' },
    { href: '/leases', key: 'nav.leases' },
    { href: '/finance', key: 'nav.finance' },
    { href: '/documents', key: 'nav.documents' },
    { href: '/problems', key: 'nav.problems' },
  ]},
  { key: 'nav.life', href: '/life', sub: [
    { href: '/life', key: 'life.title' },
    { href: '/health', key: 'nav.health' },
    { href: '/health/recovery', key: 'nav.recovery' },
  ]},
  { key: 'nav.vehicles', href: '/vehicles' },
  { key: 'nav.investments', href: '/investments', sub: [
    { href: '/investments', key: 'investments.portfolio_tracker' },
    { href: '/investments/analyzer', key: 'investments.deal_analyzer' },
  ]},
  { key: 'nav.music', href: '/music' },
];

// ═══ HELPERS ═══

function useIsStandalone() {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    const iosStandalone = 'standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone;
    const mediaStandalone = window.matchMedia('(display-mode: standalone)').matches;
    setStandalone(iosStandalone || mediaStandalone);
    const mql = window.matchMedia('(display-mode: standalone)');
    const onChange = (e: MediaQueryListEvent) => setStandalone(e.matches || iosStandalone);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return standalone;
}

// Detect which section the current page belongs to
function getActiveSection(pathname: string): string {
  if (pathname.startsWith('/life')) return 'life';
  if (pathname.startsWith('/health')) return 'life';  // includes /health/bp and /health/lifestyle
  if (pathname.startsWith('/vehicles')) return 'life';
  if (pathname.startsWith('/investments')) return 'invest';
  if (pathname.startsWith('/music')) return 'other';
  if (pathname.startsWith('/notifications')) return 'other';
  return 'property'; // default: property management section
}

// SVG icon helper — renders a heroicon path inside an svg
function Icon({ d, className = 'w-6 h-6' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

// ═══ MAIN COMPONENT ═══

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { locale, setLocale } = useLanguage();
  const [username, setUsername] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [appsOpen, setAppsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const isPWA = useIsStandalone();

  const activeSection = getActiveSection(pathname);

  useEffect(() => {
    getMe()
      .then((user) => setUsername(user.first_name || user.username))
      .catch(() => router.push('/login'));
    getUnreadCount()
      .then((data) => setUnreadCount(data.count))
      .catch(() => {});
  }, [router]);

  // Close overlays on navigation
  useEffect(() => {
    setAppsOpen(false);
    setAddOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const isActive = (href: string) => {
    if (pathname === href || pathname.startsWith(href + '/')) return true;
    if (href === '/properties' && pathname.startsWith('/owners')) return true;
    if (href === '/tenants' && pathname.startsWith('/leases')) return true;
    return false;
  };

  const navigate = useCallback((href: string) => {
    setAppsOpen(false);
    setAddOpen(false);
    router.push(href);
  }, [router]);

  return (
    <>
      {/* ═══ DESKTOP TOP NAV (≥ md) ═══ */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 hidden md:block">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <a href="/dashboard" className="flex items-center gap-1.5">
              <Logo size={28} />
              <span className="text-lg font-semibold text-gray-900">DomApp</span>
            </a>

            <div className="flex items-center gap-1">
              {DESKTOP_NAV.map((item) =>
                item.sub ? (
                  <div key={item.key} className="relative group/nav">
                    <a
                      href={item.href}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1 ${
                        item.sub.some((s) => isActive(s.href))
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      {t(item.key, locale)}
                      <svg className="w-3.5 h-3.5 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </a>
                    <div className="absolute left-0 top-full pt-1 invisible opacity-0 group-hover/nav:visible group-hover/nav:opacity-100 transition-all duration-150 z-50">
                      <div className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]">
                        {item.sub.map((sub) => (
                          <a
                            key={sub.href}
                            href={sub.href}
                            className={`block px-4 py-2 text-sm transition-colors ${
                              isActive(sub.href) ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {t(sub.key, locale)}
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <a
                    key={item.key}
                    href={item.href}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive(item.href) ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {t(item.key, locale)}
                  </a>
                )
              )}
            </div>

            <div className="flex items-center gap-2">
              <a
                href="/notes"
                className={`p-1.5 rounded-lg transition-colors ${
                  isActive('/notes') ? 'text-indigo-600 bg-indigo-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
                title={t('nav.notes', locale)}
              >
                <Icon d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" className="w-5 h-5" />
              </a>
              <a
                href="/notifications"
                className={`relative p-1.5 rounded-lg transition-colors ${
                  isActive('/notifications') ? 'text-indigo-600 bg-indigo-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </a>
              <button
                onClick={() => setLocale(locale === 'en' ? 'bg' : 'en')}
                className="h-8 px-2.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {locale === 'en' ? 'BG' : 'EN'}
              </button>
              <span className="text-sm text-gray-500">{username}</span>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                title={t('nav.logout', locale)}
              >
                <Icon d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ═══ MOBILE TOP BAR (< md) — minimal: logo + bell + lang ═══ */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 md:hidden">
        <div className="flex items-center justify-between h-12 px-4">
          <a href="/dashboard" className="flex items-center gap-1.5">
            <Logo size={24} />
            <span className="text-base font-semibold text-gray-900">DomApp</span>
          </a>
          <div className="flex items-center gap-1">
            <a
              href="/notes"
              className={`p-1.5 rounded-lg transition-colors ${
                isActive('/notes') ? 'text-indigo-600 bg-indigo-50' : 'text-gray-500'
              }`}
            >
              <Icon d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" className="w-5 h-5" />
            </a>
            <a
              href="/notifications"
              className={`relative p-1.5 rounded-lg transition-colors ${
                isActive('/notifications') ? 'text-indigo-600 bg-indigo-50' : 'text-gray-500'
              }`}
            >
              <Icon d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </a>
            <button
              onClick={() => setLocale(locale === 'en' ? 'bg' : 'en')}
              className="h-7 px-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg"
            >
              {locale === 'en' ? 'BG' : 'EN'}
            </button>
          </div>
        </div>
      </nav>

      {/* ═══ MOBILE BOTTOM TAB BAR (< md) ═══ */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-bottom-tabs">
        <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
          {/* Home tab */}
          <TabButton
            icon="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
            label={t('nav.dashboard', locale)}
            active={pathname === '/dashboard'}
            onClick={() => navigate('/dashboard')}
          />

          {/* Property tab */}
          <TabButton
            icon="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
            label={t('nav.properties', locale)}
            active={activeSection === 'property' && pathname !== '/dashboard'}
            onClick={() => navigate('/properties')}
          />

          {/* Center + button */}
          <button
            onClick={() => setAddOpen(!addOpen)}
            className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 -mt-4 ${
              addOpen ? 'bg-gray-700 rotate-45' : 'bg-indigo-600 active:scale-95'
            }`}
          >
            <Icon d="M12 4.5v15m7.5-7.5h-15" className="w-6 h-6 text-white" />
          </button>

          {/* Life tab */}
          <TabButton
            icon="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
            label={t('nav.life', locale)}
            active={activeSection === 'life'}
            onClick={() => navigate('/health')}
          />

          {/* Apps grid tab */}
          <TabButton
            icon="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
            label={t('nav.apps', locale)}
            active={appsOpen}
            onClick={() => setAppsOpen(!appsOpen)}
          />
        </div>
      </div>

      {/* ═══ QUICK ADD OVERLAY (mobile) ═══ */}
      {addOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/40 z-[60]" onClick={() => setAddOpen(false)} />
          <div className="md:hidden fixed bottom-20 left-4 right-4 z-[70] safe-bottom-tabs">
            <div className="bg-white rounded-2xl shadow-2xl p-4 grid grid-cols-3 gap-3">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.href}
                  onClick={() => navigate(action.href)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <span className={`w-10 h-10 ${action.color} rounded-full flex items-center justify-center`}>
                    <Icon d={action.icon} className="w-5 h-5 text-white" />
                  </span>
                  <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">
                    {t(action.key, locale)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ═══ APPS GRID OVERLAY (mobile) ═══ */}
      {appsOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/40 z-[60]" onClick={() => setAppsOpen(false)} />
          <div className="md:hidden fixed inset-x-0 bottom-14 top-12 z-[65] overflow-y-auto safe-bottom-tabs">
            <div className="min-h-full bg-gray-50 p-4">
              {/* Section: Property Management */}
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
                {t('nav.property_mgmt', locale)}
              </h3>
              <div className="grid grid-cols-4 gap-2 mb-6">
                {MODULES.filter((m) => m.section === 'property').map((m) => (
                  <AppGridItem key={m.id} module={m} locale={locale} active={isActive(m.href)} onClick={() => navigate(m.href)} />
                ))}
              </div>

              {/* Section: Life */}
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
                {t('nav.life', locale)}
              </h3>
              <div className="grid grid-cols-4 gap-2 mb-6">
                {MODULES.filter((m) => m.section === 'life').map((m) => (
                  <AppGridItem key={m.id} module={m} locale={locale} active={isActive(m.href)} onClick={() => navigate(m.href)} />
                ))}
              </div>

              {/* Section: Other */}
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
                {t('nav.other', locale)}
              </h3>
              <div className="grid grid-cols-4 gap-2 mb-6">
                {MODULES.filter((m) => m.section === 'invest' || m.section === 'other').map((m) => (
                  <AppGridItem key={m.id} module={m} locale={locale} active={isActive(m.href)} onClick={() => navigate(m.href)} />
                ))}
              </div>

              {/* Settings row */}
              <div className="border-t border-gray-200 pt-4 mt-2">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-indigo-700">{username.charAt(0).toUpperCase()}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-700">{username}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Icon d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" className="w-4 h-4" />
                    {t('nav.logout', locale)}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ═══ SUB-COMPONENTS ═══
// Defined outside NavBar to prevent re-render focus loss

function TabButton({ icon, label, active, onClick }: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 w-16 py-1 transition-colors ${
        active ? 'text-indigo-600' : 'text-gray-400'
      }`}
    >
      <Icon d={icon} className="w-5 h-5" />
      <span className="text-[10px] font-medium leading-tight">{label}</span>
    </button>
  );
}

function AppGridItem({ module, locale, active, onClick }: {
  module: Module;
  locale: 'en' | 'bg';
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-colors ${
        active ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-white active:bg-white'
      }`}
    >
      <span className={`w-11 h-11 ${module.color} rounded-2xl flex items-center justify-center shadow-sm`}>
        <Icon d={module.icon} className="w-5.5 h-5.5 text-white" />
      </span>
      <span className={`text-[11px] font-medium leading-tight text-center ${
        active ? 'text-indigo-700' : 'text-gray-600'
      }`}>
        {t(module.key, locale)}
      </span>
    </button>
  );
}
