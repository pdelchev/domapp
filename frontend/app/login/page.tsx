'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import { Button, Input, Alert } from '../components/ui';
import Logo from '../components/Logo';

export default function LoginPage() {
  const router = useRouter();
  const { locale, setLocale } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      router.push('/dashboard');
    } catch {
      setError(t('login.error', locale));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-slate-100" />
      {/* Decorative shapes */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />

      {/* Language toggle */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={() => setLocale(locale === 'en' ? 'bg' : 'en')}
          className="h-8 px-3 text-xs font-medium text-gray-600 bg-white/80 backdrop-blur border border-gray-200 hover:bg-white rounded-lg transition-colors shadow-sm"
        >
          {locale === 'en' ? 'BG' : 'EN'}
        </button>
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-sm px-4">
        {/* Logo + Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4 drop-shadow-lg">
            <Logo size={72} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">DomApp</h1>
          <p className="text-sm text-gray-500 mt-1">{t('login.subtitle', locale)}</p>
        </div>

        {/* Login card */}
        <div className="bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-xl shadow-gray-200/50 p-7">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">{t('login.title', locale)}</h2>

          <Alert type="error" message={error} />

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t('login.username', locale)}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <Input
              label={t('login.password', locale)}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? '...' : t('login.submit', locale)}
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            <a href="/register" className="text-indigo-600 hover:text-indigo-700 font-medium">
              {t('login.register', locale)}
            </a>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Property Management System
        </p>
      </div>
    </div>
  );
}
