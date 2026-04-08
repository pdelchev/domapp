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
  sub?: { href: string; key: string }[];
}

const MODULES: ModuleItem[] = [
  {
    href: '/lifestyle', key: 'nav.health_hub', icon: '❤️', color: 'bg-rose-500',
    sub: [
      { href: '/lifestyle', key: 'nav.daily_hub' },
      { href: '/health', key: 'nav.blood_results' },
      { href: '/lifestyle/meals', key: 'lifestyle.meal_plan' },
      { href: '/lifestyle/gym', key: 'lifestyle.gym_routine' },
    ],
  },
  {
    href: '/properties', key: 'nav.properties', icon: '🏠', color: 'bg-blue-500',
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
    href: '/finance', key: 'nav.finance', icon: '💰', color: 'bg-emerald-500',
    sub: [
      { href: '/finance', key: 'nav.finance' },
      { href: '/finance/payments', key: 'nav.payments' },
      { href: '/finance/expenses', key: 'nav.expenses' },
      { href: '/investments', key: 'nav.investments' },
      { href: '/investments/analyzer', key: 'nav.deal_analyzer' },
    ],
  },
  { href: '/music', key: 'nav.music', icon: '🎵', color: 'bg-purple-500' },
];

// Bottom tab bar items (mobile) — first 4 + More
const BOTTOM_TABS = MODULES.slice(0, 4);

// Items that appear in the "More" sheet
const MORE_ITEMS: ModuleItem[] = [
  { href: '/documents', key: 'nav.documents', icon: '📄', color: 'bg-cyan-500' },
  { href: '/problems', key: 'nav.problems', icon: '⚠️', color: 'bg-orange-500' },
  { href: '/investments', key: 'nav.investments', icon: '📈', color: 'bg-teal-500' },
  { href: '/owners', key: 'nav.owners', icon: '👤', color: 'bg-sky-500' },
  { href: '/tenants', key: 'nav.tenants', icon: '🏘️', color: 'bg-lime-600' },
  { href: '/leases', key: 'nav.leases', icon: '📋', color: 'bg-violet-500' },
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
    if (href === '/lifestyle' && (pathname.startsWith('/lifestyle'))) return true;
    if (href === '/properties' && (pathname.startsWith('/properties') || pathname.startsWith('/owners'))) return true;
    if (href === '/finance' && (pathname.startsWith('/finance') || pathname.startsWith('/investments'))) return true;
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
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
                        isActive(mod.href) ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      <span className="text-base">{mod.icon}</span>
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
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
                      isActive(mod.href) ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-base">{mod.icon}</span>
                    {t(mod.key, locale)}
                  </a>
                )
              )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
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
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                      isActive(mod.href) ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span>{mod.icon}</span> {t(mod.key, locale)}
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
