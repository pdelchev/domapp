'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getMe, logout, getUnreadCount } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import { Button } from './ui';
import Logo from './Logo';

const NAV_ITEMS = [
  { href: '/dashboard', key: 'nav.dashboard' },
  { href: '/properties', key: 'nav.properties' },
  { href: '/owners', key: 'nav.owners' },
  { href: '/tenants', key: 'nav.tenants' },
  { href: '/leases', key: 'nav.leases' },
  { href: '/finance', key: 'nav.finance' },
  { href: '/documents', key: 'nav.documents' },
  { href: '/problems', key: 'nav.problems' },
];

// Desktop nav — condensed (Owners under Properties, Leases under Tenants)
const DESKTOP_NAV = [
  { href: '/dashboard', key: 'nav.dashboard' },
  { href: '/properties', key: 'nav.properties' },
  { href: '/tenants', key: 'nav.tenants' },
  { href: '/finance', key: 'nav.finance' },
  { href: '/documents', key: 'nav.documents' },
  { href: '/problems', key: 'nav.problems' },
];

const FAB_ACTIONS = [
  { href: '/properties/new', key: 'fab.new_property', color: 'bg-blue-500', icon: 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z' },
  { href: '/tenants/new', key: 'fab.new_tenant', color: 'bg-emerald-500', icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z' },
  { href: '/leases/new', key: 'fab.new_lease', color: 'bg-violet-500', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
  { href: '/problems/new', key: 'fab.new_problem', color: 'bg-amber-500', icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z' },
  { href: '/finance/expenses', key: 'fab.new_expense', color: 'bg-rose-500', icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z' },
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
  const [fabOpen, setFabOpen] = useState(false);
  const isPWA = useIsStandalone();

  useEffect(() => {
    getMe()
      .then((user) => setUsername(user.first_name || user.username))
      .catch(() => router.push('/login'));
    getUnreadCount()
      .then((data) => setUnreadCount(data.count))
      .catch(() => {});
  }, [router]);

  // Close FAB when navigating
  useEffect(() => {
    setFabOpen(false);
    setMobileOpen(false);
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

  const handleFabAction = useCallback((href: string) => {
    setFabOpen(false);
    router.push(href);
  }, [router]);

  return (
    <>
      {/* Top Nav — sticky */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <a href="/dashboard" className="flex items-center gap-1.5">
              <Logo size={28} />
              <span className="text-lg font-semibold text-gray-900 hidden sm:block">DomApp</span>
            </a>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              {DESKTOP_NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {t(item.key, locale)}
                </a>
              ))}
            </div>

            {/* Right */}
            <div className="flex items-center gap-2">
              {/* Notification bell */}
              <a
                href="/notifications"
                className={`relative p-1.5 rounded-lg transition-colors ${
                  isActive('/notifications')
                    ? 'text-indigo-600 bg-indigo-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
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
              <span className="text-sm text-gray-500 hidden sm:block">{username}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="hidden md:inline-flex">
                {t('nav.logout', locale)}
              </Button>

              {/* Hamburger — mobile only */}
              <button
                className="md:hidden ml-1 p-1.5 text-gray-500 hover:text-gray-700"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={mobileOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Hamburger dropdown — mobile */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white">
            <div className="px-4 py-2 space-y-1">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive(item.href) ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t(item.key, locale)}
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

      {/* FAB — PWA mobile only */}
      {isPWA && (
        <div className="md:hidden">
          {/* Backdrop */}
          {fabOpen && (
            <div
              className="fixed inset-0 bg-black/40 z-[60] fab-backdrop-in"
              onClick={() => setFabOpen(false)}
            />
          )}

          {/* Speed-dial actions */}
          {fabOpen && (
            <div className="fixed bottom-24 right-5 z-[70] flex flex-col-reverse items-end gap-3 fab-menu-in">
              {FAB_ACTIONS.map((action, i) => (
                <button
                  key={action.href}
                  onClick={() => handleFabAction(action.href)}
                  className="flex items-center gap-3 fab-action-in"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <span className="bg-white text-gray-800 text-sm font-medium px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
                    {t(action.key, locale)}
                  </span>
                  <span className={`w-11 h-11 ${action.color} rounded-full flex items-center justify-center shadow-lg`}>
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={action.icon} />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Main FAB button */}
          <button
            onClick={() => setFabOpen((prev) => !prev)}
            className={`fixed bottom-6 right-5 z-[70] w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 safe-bottom-fab ${
              fabOpen
                ? 'bg-gray-700 rotate-45'
                : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'
            }`}
          >
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
