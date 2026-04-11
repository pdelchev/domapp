'use client';

import Link from 'next/link';
import { PageShell, PageContent, PageHeader, Card, Button } from '@/app/components/ui';
import NavBar from '@/app/components/NavBar';
import { useLanguage } from '@/app/context/LanguageContext';

export default function CheckinPage() {
  const { locale } = useLanguage();

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader title="🏥 Daily Health Check-In" />
        
        <Card>
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {locale === 'bg' ? 'Всеки ден нов чек-ин' : 'Daily Protocol Check-In'}
            </h2>
            <p className="text-sm text-gray-600">
              {locale === 'bg'
                ? 'Влезте в системата и проверете дневния си протокол с ИИ препоръки.'
                : 'Log your daily activities and receive AI-powered insights based on your personalized health protocol.'}
            </p>
            
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mt-6">
              <h3 className="font-semibold text-indigo-900 mb-2">
                {locale === 'bg' ? '✨ Функции' : '✨ Features'}
              </h3>
              <ul className="text-sm text-indigo-800 space-y-1">
                <li>• {locale === 'bg' ? 'Персонализирани протоколи' : 'Personalized protocols'}</li>
                <li>• {locale === 'bg' ? 'Дневни логове' : 'Daily logs'}</li>
                <li>• {locale === 'bg' ? 'ИИ препоръки' : 'AI recommendations'}</li>
                <li>• {locale === 'bg' ? 'Проследяване на прогреса' : 'Progress tracking'}</li>
              </ul>
            </div>

            <div className="mt-6">
              <p className="text-xs text-gray-500 mb-4">
                {locale === 'bg'
                  ? 'Функцията е в разработка. Вече са създадени протоколи и препоръки на базата на вашите данни.'
                  : 'This feature is in development. Protocols and recommendations are being generated from your data.'}
              </p>
              <Link href="/health">
                <Button variant="primary" className="w-full">
                  {locale === 'bg' ? 'Назад към Health Hub' : 'Back to Health Hub'}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </PageContent>
    </PageShell>
  );
}
