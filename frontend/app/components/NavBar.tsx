'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getMe, logout } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import { Button } from './ui';

const NAV_ITEMS = [
  { href: '/dashboard', key: 'nav.dashboard', icon: '📊' },
  { href: '/owners', key: 'nav.owners', icon: '👤' },
  { href: '/properties', key: 'nav.properties', icon: '🏢' },
  { href: '/tenants', key: 'nav.tenants', icon: '🔑' },
  { href: '/notifications', key: 'nav.notifications', icon: '🔔' },
];

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { locale, setLocale } = useLanguage();
  const [username, setUsername] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    getMe()
      .then((user) => setUsername(user.first_name || user.username))
      .catch(() => router.push('/login'));
  }, [router]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Brand */}
          <a href="/dashboard" className="flex items-center gap-2">
            <span className="text-lg font-semibold text-gray-900">DomApp</span>
          </a>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {t(item.key, locale)}
                </a>
              );
            })}
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
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              {t('nav.logout', locale)}
            </Button>

            {/* Mobile hamburger */}
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

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white">
          <div className="px-4 py-2 space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                    active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t(item.key, locale)}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
