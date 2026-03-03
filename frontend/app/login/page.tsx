'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import { Button, Input, Alert } from '../components/ui';

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative">
      {/* Language */}
      <div className="absolute top-4 right-4">
        <button
          onClick={() => setLocale(locale === 'en' ? 'bg' : 'en')}
          className="h-8 px-3 text-xs font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
        >
          {locale === 'en' ? 'BG' : 'EN'}
        </button>
      </div>

      <div className="w-full max-w-sm px-4">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">DomApp</h1>
          <p className="text-sm text-gray-500 mt-1">{t('login.subtitle', locale)}</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
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
      </div>
    </div>
  );
}
