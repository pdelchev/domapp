'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getMe, logout, getUnreadCount } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import Logo from './Logo';

// ============================================================
// MODULE DEFINITIONS — single source of truth for all navigation
// ============================================================
interface ModuleItem {
  href: string;
  key: string;
  icon: string;   // emoji for mobile
  color: string;   // bg color for More sheet
  svgPath: string; // SVG path for desktop nav (Heroicons outline style)
  sub?: { href: string; key: string }[];
}

const MODULES: ModuleItem[] = [
  {
    href: '/health', key: 'nav.health_hub', icon: '❤️', color: 'bg-rose-500',
    svgPath: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z',
    sub: [
      { href: '/health', key: 'nav.health_hub' },
      { href: '/health/checkin', key: 'nav.daily_checkin' },
      { href: '/health/supplements', key: 'nav.supplements' },
      { href: '/health/reminders', key: 'nav.reminders' },
      { href: '/health/symptoms', key: 'nav.symptoms' },
      { href: '/health/weather', key: 'nav.weather' },
      { href: '/health/emergency', key: 'nav.emergency_card' },
      { href: '/health/caregivers', key: 'nav.caregivers' },
      { href: '/health/timeline', key: 'nav.timeline' },
      { href: '/health/bp', key: 'nav.blood_pressure' },
      { href: '/health/weight', key: 'nav.weight' },
      { href: '/health/lifestyle/meals', key: 'lifestyle.meal_plan' },
      { href: '/health/lifestyle/gym', key: 'lifestyle.gym_routine' },
    ],
  },
  {
    href: '/properties', key: 'nav.properties', icon: '🏠', color: 'bg-blue-500',
    svgPath: 'M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
    sub: [
      { href: '/properties', key: 'nav.properties' },
      { href: '/owners', key: 'nav.owners' },
      { href: '/tenants', key: 'nav.tenants' },
      { href: '/leases', key: 'nav.leases' },
      { href: '/documents', key: 'nav.documents' },
      { href: '/problems', key: 'nav.problems' },
    ],
  },
  {
    href: '/finance', key: 'nav.financials', icon: '💰', color: 'bg-emerald-500',
    svgPath: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    sub: [
      { href: '/finance', key: 'nav.financials' },
      { href: '/finance/payments', key: 'nav.payments' },
      { href: '/finance/expenses', key: 'nav.expenses' },
    ],
  },
  {
    href: '/investments', key: 'nav.investments', icon: '📈', color: 'bg-teal-500',
    svgPath: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
    sub: [
      { href: '/investments', key: 'nav.portfolio' },
      { href: '/investments/analyzer', key: 'nav.deal_analyzer' },
      { href: '/investments/watchlist', key: 'nav.watchlist' },
      { href: '/investments/dividends', key: 'nav.dividends' },
      { href: '/investments/tax-report', key: 'nav.tax_report' },
    ],
  },
  {
    href: '/music', key: 'nav.music', icon: '🎵', color: 'bg-purple-500',
    svgPath: 'M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.34A1.125 1.125 0 0017.368 1.3l-2.81.8A1.125 1.125 0 0013.5 3.227V9M9 9l-4.5 1.286V15.5A2.25 2.25 0 016.132 17.663l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66A2.25 2.25 0 007.764 11.7V9z',
  },
];

// Bottom tab bar items (mobile) — first 4 + More
// Health, Properties, Financials, Investments shown as tabs; rest in More sheet
const BOTTOM_TABS = MODULES.slice(0, 4);

// Items that appear in the "More" sheet
const MORE_ITEMS: ModuleItem[] = [
  MODULES[4], // Music
  { href: '/notes', key: 'nav.notes', icon: '📝', color: 'bg-yellow-500', svgPath: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10' },
  { href: '/documents', key: 'nav.documents', icon: '📄', color: 'bg-cyan-500', svgPath: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
  { href: '/problems', key: 'nav.problems', icon: '⚠️', color: 'bg-orange-500', svgPath: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z' },
  { href: '/owners', key: 'nav.owners', icon: '👤', color: 'bg-sky-500', svgPath: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z' },
  { href: '/tenants', key: 'nav.tenants', icon: '🏘️', color: 'bg-lime-600', svgPath: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z' },
  { href: '/leases', key: 'nav.leases', icon: '📋', color: 'bg-violet-500', svgPath: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z' },
];

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

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { locale, setLocale } = useLanguage();
  const [username, setUsername] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const isPWA = useIsStandalone();

  useEffect(() => {
    getMe()
      .then((user) => setUsername(user.first_name || user.username))
      .catch(() => router.push('/login'));
    getUnreadCount()
      .then((data) => setUnreadCount(data.count))
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    setMoreOpen(false);
    setMobileOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const isActive = useCallback((href: string) => {
    if (pathname === href || pathname.startsWith(href + '/')) return true;
    // Module-level matching
    if (href === '/health' && (pathname.startsWith('/health') || pathname.startsWith('/lifestyle'))) return true;
    if (href === '/properties' && (pathname.startsWith('/properties') || pathname.startsWith('/owners'))) return true;
    if (href === '/finance' && pathname.startsWith('/finance')) return true;
    if (href === '/investments' && pathname.startsWith('/investments')) return true;
    if (href === '/music' && pathname.startsWith('/music')) return true;
    return false;
  }, [pathname]);

  const navigate = useCallback((href: string) => {
    setMoreOpen(false);
    setMobileOpen(false);
    router.push(href);
  }, [router]);

  return (
    <>
      {/* ========== TOP NAV — always visible ========== */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <a href="/dashboard" className="flex items-center gap-1.5">
              <Logo size={28} />
              <span className="text-lg font-semibold text-gray-900 hidden sm:block">DomApp</span>
            </a>

            {/* Desktop Nav — module dropdowns */}
            <div className="hidden md:flex items-center gap-0.5">
              {MODULES.map((mod) =>
                mod.sub ? (
                  <div key={mod.href} className="relative group/nav">
                    <a
                      href={mod.href}
                      className={`px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
                        isActive(mod.href) ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={mod.svgPath} />
                      </svg>
                      {t(mod.key, locale)}
                      <svg className="w-3 h-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </a>
                    <div className="absolute left-0 top-full pt-1 invisible opacity-0 group-hover/nav:visible group-hover/nav:opacity-100 transition-all duration-150 z-50">
                      <div className="bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-[180px]">
                        {mod.sub.map((sub) => (
                          <a
                            key={sub.href}
                            href={sub.href}
                            className={`block px-4 py-2 text-sm transition-colors ${
                              pathname === sub.href || pathname.startsWith(sub.href + '/')
                                ? 'bg-indigo-50 text-indigo-700 font-medium'
                                : 'text-gray-700 hover:bg-gray-50'
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
                    key={mod.href}
                    href={mod.href}
                    className={`px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
                      isActive(mod.href) ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={mod.svgPath} />
                    </svg>
                    {t(mod.key, locale)}
                  </a>
                )
              )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-1">
              {/* Notes — icon only, desktop */}
              <a
                href="/notes"
                className={`p-1.5 rounded-lg transition-colors hidden md:block ${
                  isActive('/notes') ? 'text-indigo-600 bg-indigo-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
                title={t('nav.notes', locale)}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              </a>
              {/* Notification bell — desktop */}
              <a
                href="/notifications"
                className={`relative p-1.5 rounded-lg transition-colors hidden md:block ${
                  isActive('/notifications') ? 'text-indigo-600 bg-indigo-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </a>
              {/* Language toggle */}
              <button
                onClick={() => setLocale(locale === 'en' ? 'bg' : 'en')}
                className="h-8 px-2.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {locale === 'en' ? 'BG' : 'EN'}
              </button>
              {/* Profile dropdown — desktop */}
              <div className="relative hidden sm:block">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="font-medium">{username}</span>
                  <svg className="w-3 h-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-[180px]">
                      <a
                        href="/settings"
                        className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                          pathname === '/settings' || pathname.startsWith('/settings/')
                            ? 'bg-indigo-50 text-indigo-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {t('nav.settings', locale)}
                      </a>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2.5 w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                        </svg>
                        {t('nav.logout', locale)}
                      </button>
                    </div>
                  </>
                )}
              </div>
              {/* Hamburger — mobile non-PWA */}
              {!isPWA && (
                <button
                  className="md:hidden ml-1 p-1.5 text-gray-500 hover:text-gray-700"
                  onClick={() => setMobileOpen(!mobileOpen)}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={mobileOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Hamburger dropdown — mobile non-PWA */}
        {!isPWA && mobileOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white">
            <div className="px-4 py-2 space-y-1">
              {MODULES.map((mod) => (
                <div key={mod.href}>
                  <a
                    href={mod.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium ${
                      isActive(mod.href) ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={mod.svgPath} />
                    </svg>
                    {t(mod.key, locale)}
                  </a>
                  {mod.sub && isActive(mod.href) && (
                    <div className="ml-8 mt-1 space-y-1">
                      {mod.sub.filter((s) => s.href !== mod.href).map((sub) => (
                        <a
                          key={sub.href}
                          href={sub.href}
                          className={`block px-3 py-1.5 rounded-lg text-xs font-medium ${
                            pathname === sub.href ? 'text-indigo-700 bg-indigo-50' : 'text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {t(sub.key, locale)}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="border-t border-gray-200 mt-2 pt-2">
                <a
                  href="/settings"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                    pathname === '/settings' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>⚙️</span> {t('nav.settings', locale)}
                </a>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                  {t('nav.logout', locale)}
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ========== MOBILE BOTTOM TAB BAR — PWA ========== */}
      {isPWA && (
        <>
          {/* More sheet */}
          {moreOpen && (
            <>
              <div className="fixed inset-0 bg-black/40 z-[60]" onClick={() => setMoreOpen(false)} />
              <div className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-2xl shadow-2xl safe-bottom animate-slide-up">
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-2">
                  <div className="w-10 h-1 rounded-full bg-gray-300" />
                </div>
                <div className="px-5 pb-3">
                  <p className="text-sm font-semibold text-gray-900 mb-3">{t('nav.more', locale)}</p>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {MORE_ITEMS.map((item) => (
                      <button
                        key={item.href}
                        onClick={() => navigate(item.href)}
                        className="flex flex-col items-center gap-1.5 py-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors"
                      >
                        <span className={`w-12 h-12 ${item.color} rounded-2xl flex items-center justify-center text-xl shadow-sm`}>
                          {item.icon}
                        </span>
                        <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">{t(item.key, locale)}</span>
                      </button>
                    ))}
                  </div>
                  {/* User section */}
                  <div className="border-t border-gray-100 pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">{username}</span>
                        <button
                          onClick={() => setLocale(locale === 'en' ? 'bg' : 'en')}
                          className="h-7 px-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg"
                        >
                          {locale === 'en' ? 'BG' : 'EN'}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate('/settings')}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100"
                      >
                        <span>⚙️</span> {t('nav.settings', locale)}
                      </button>
                      <button
                        onClick={handleLogout}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                        </svg>
                        {t('nav.logout', locale)}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Bottom tab bar */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-bottom">
            <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
              {BOTTOM_TABS.map((tab) => {
                const active = isActive(tab.href);
                return (
                  <a
                    key={tab.href}
                    href={tab.href}
                    className={`flex flex-col items-center justify-center gap-0.5 w-16 py-1 rounded-xl transition-colors ${
                      active ? 'text-indigo-600' : 'text-gray-400'
                    }`}
                  >
                    <span className={`text-xl transition-transform ${active ? 'scale-110' : ''}`}>{tab.icon}</span>
                    <span className={`text-[10px] font-medium ${active ? 'text-indigo-600' : 'text-gray-500'}`}>
                      {t(tab.key, locale)}
                    </span>
                    {/* Active indicator dot */}
                    {active && <span className="w-1 h-1 rounded-full bg-indigo-600 mt-0.5" />}
                  </a>
                );
              })}
              {/* More button */}
              <button
                onClick={() => setMoreOpen(true)}
                className={`flex flex-col items-center justify-center gap-0.5 w-16 py-1 rounded-xl transition-colors ${
                  moreOpen ? 'text-indigo-600' : 'text-gray-400'
                }`}
              >
                <span className="text-xl">⋯</span>
                <span className="text-[10px] font-medium text-gray-500">{t('nav.more', locale)}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Spacer for bottom tab bar on PWA */}
      {isPWA && <div className="md:hidden h-16" />}
    </>
  );
}
