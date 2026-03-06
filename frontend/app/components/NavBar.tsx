'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getMe, logout, getUnreadCount } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import { Button } from './ui';

const NAV_ITEMS = [
  { href: '/dashboard', key: 'nav.dashboard', icon: '📊' },
  { href: '/owners', key: 'nav.owners', icon: '👤' },
  { href: '/properties', key: 'nav.properties', icon: '🏢' },
  { href: '/tenants', key: 'nav.tenants', icon: '🔑' },
  { href: '/leases', key: 'nav.leases', icon: '📄' },
  { href: '/finance', key: 'nav.finance', icon: '💰' },
  { href: '/documents', key: 'nav.documents', icon: '📄' },
  { href: '/problems', key: 'nav.problems', icon: '🔧' },
  { href: '/notifications', key: 'nav.notifications', icon: '🔔' },
];

// Bottom tab bar tabs — 5 primary destinations (PWA only)
const BOTTOM_TABS = [
  { href: '/dashboard', key: 'nav.dashboard', iconId: 'dashboard' },
  { href: '/properties', key: 'nav.properties', iconId: 'properties' },
  { href: '/leases', key: 'nav.leases', iconId: 'leases' },
  { href: '/finance', key: 'nav.finance', iconId: 'finance' },
  { key: 'nav.more', iconId: 'more' },
];

// "More" sheet items — secondary navigation (PWA only)
const MORE_ITEMS = [
  { href: '/owners', key: 'nav.owners' },
  { href: '/tenants', key: 'nav.tenants' },
  { href: '/problems', key: 'nav.problems' },
  { href: '/notifications', key: 'nav.notifications' },
];

function useIsStandalone() {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    // Check iOS standalone
    const iosStandalone = 'standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone;
    // Check display-mode: standalone (Android / desktop PWA)
    const mediaStandalone = window.matchMedia('(display-mode: standalone)').matches;
    setStandalone(iosStandalone || mediaStandalone);

    const mql = window.matchMedia('(display-mode: standalone)');
    const onChange = (e: MediaQueryListEvent) => setStandalone(e.matches || iosStandalone);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return standalone;
}

function TabIcon({ id, active }: { id: string; active: boolean }) {
  const cls = `w-6 h-6 ${active ? 'text-indigo-600' : 'text-gray-400'}`;
  switch (id) {
    case 'dashboard':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      );
    case 'properties':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
        </svg>
      );
    case 'leases':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    case 'finance':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
        </svg>
      );
    case 'more':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { locale, setLocale } = useLanguage();
  const [username, setUsername] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const isPWA = useIsStandalone();

  useEffect(() => {
    getMe()
      .then((user) => setUsername(user.first_name || user.username))
      .catch(() => router.push('/login'));
    getUnreadCount()
      .then((data) => setUnreadCount(data.count))
      .catch(() => {});
  }, [router]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      {/* Top Nav — sticky */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <a href="/dashboard" className="flex items-center gap-2">
              <span className="text-lg font-semibold text-gray-900">DomApp</span>
            </a>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {t(item.key, locale)}
                  {item.href === '/notifications' && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </a>
              ))}
            </div>

            {/* Right */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLocale(locale === 'en' ? 'bg' : 'en')}
                className="h-8 px-2.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {locale === 'en' ? 'BG' : 'EN'}
              </button>
              <span className="text-sm text-gray-500 hidden sm:block">{username}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="hidden md:inline-flex">
                {t('nav.logout', locale)}
              </Button>

              {/* Hamburger — browser mobile only (not PWA) */}
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

        {/* Hamburger dropdown — browser mobile only */}
        {!isPWA && mobileOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white">
            <div className="px-4 py-2 space-y-1">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive(item.href) ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t(item.key, locale)}
                  {item.href === '/notifications' && unreadCount > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </a>
              ))}
              <button
                onClick={handleLogout}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50"
              >
                {t('nav.logout', locale)}
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* PWA-only: Mobile Bottom Tab Bar */}
      {isPWA && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-bottom">
          <div className="flex items-center justify-around h-16">
            {BOTTOM_TABS.map((tab) => {
              if (tab.iconId === 'more') {
                return (
                  <button
                    key="more"
                    onClick={() => setMoreOpen(true)}
                    className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1"
                  >
                    <TabIcon id="more" active={moreOpen} />
                    <span className={`text-[10px] font-medium ${moreOpen ? 'text-indigo-600' : 'text-gray-500'}`}>
                      {t('nav.more', locale)}
                    </span>
                  </button>
                );
              }
              const active = isActive(tab.href!);
              return (
                <a
                  key={tab.href}
                  href={tab.href}
                  className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1"
                >
                  <TabIcon id={tab.iconId} active={active} />
                  <span className={`text-[10px] font-medium ${active ? 'text-indigo-600' : 'text-gray-500'}`}>
                    {t(tab.key, locale)}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* PWA-only: More Sheet Overlay */}
      {isPWA && moreOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMoreOpen(false)}
          />
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl safe-bottom">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="px-4 py-2 space-y-1">
              {MORE_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={() => setMoreOpen(false)}
                >
                  {t(item.key, locale)}
                  {item.href === '/notifications' && unreadCount > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </a>
              ))}
              <button
                onClick={() => { setMoreOpen(false); handleLogout(); }}
                className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                {t('nav.logout', locale)}
              </button>
            </div>
            <div className="h-4" />
          </div>
        </div>
      )}
    </>
  );
}
