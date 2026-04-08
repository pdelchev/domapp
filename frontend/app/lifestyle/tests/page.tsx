'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getTestPanel } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Badge, Spinner, EmptyState } from '../../components/ui';

interface PanelTest {
  name: string;
  name_bg: string;
  abbreviation?: string;
  biomarkers: string[];
  reason: string;
  reason_bg: string;
  priority?: string;
  trigger?: string;
}

interface PanelData {
  last_test_date: string | null;
  next_test_date: string;
  days_until_next: number;
  is_overdue: boolean;
  base_panel: PanelTest[];
  additional_tests: PanelTest[];
  total_tests: number;
  summary: {
    base_count: number;
    additional_count: number;
    triggers: Record<string, number>;
  };
}

const TRIGGER_ICONS: Record<string, string> = {
  blood: '🩸',
  bp: '💓',
  whoop: '⌚',
  weight: '⚖️',
};

const TRIGGER_COLORS: Record<string, string> = {
  blood: 'red',
  bp: 'purple',
  whoop: 'green',
  weight: 'yellow',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'red',
  medium: 'yellow',
  low: 'blue',
};

export default function TestPanelPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [panel, setPanel] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getTestPanel()
      .then(setPanel)
      .catch(() => setError('Failed to load test panel'))
      .finally(() => setLoading(false));
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  };

  if (loading) return (
    <PageShell>
      <NavBar />
      <PageContent size="md"><Spinner message={t('common.loading', locale)} /></PageContent>
    </PageShell>
  );

  if (error || !panel) return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <EmptyState icon="🧪" message={error || t('panel.no_previous', locale)} />
      </PageContent>
    </PageShell>
  );

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={t('panel.title', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/lifestyle')}
          action={
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 print:hidden"
            >
              🖨️ {t('panel.print', locale)}
            </button>
          }
        />

        <div ref={printRef} className="space-y-4">
          {/* Status Card */}
          <Card>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm text-gray-500">{t('panel.next_test', locale)}</p>
                <p className={`text-lg font-bold ${panel.is_overdue ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatDate(panel.next_test_date)}
                  {panel.is_overdue && (
                    <Badge color="red" className="ml-2">{t('panel.overdue', locale)}</Badge>
                  )}
                </p>
                {panel.last_test_date && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t('panel.last_test', locale)}: {formatDate(panel.last_test_date)}
                  </p>
                )}
              </div>
              <div className="text-right">
                {!panel.is_overdue && panel.days_until_next > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-bold text-indigo-600">{panel.days_until_next}</span>
                    <span className="text-sm text-gray-500">{t('panel.days_left', locale)}</span>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {t('panel.total_tests', locale)}: {panel.total_tests}
                  <span className="text-gray-300 mx-1">|</span>
                  {panel.summary.base_count} {t('panel.constant', locale).toLowerCase()}
                  {panel.summary.additional_count > 0 && (
                    <> + {panel.summary.additional_count} {t('panel.dynamic', locale).toLowerCase()}</>
                  )}
                </p>
              </div>
            </div>

            {/* Trigger summary badges */}
            {panel.summary.additional_count > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                {Object.entries(panel.summary.triggers)
                  .filter(([, count]) => count > 0)
                  .map(([trigger, count]) => (
                    <span key={trigger} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-lg text-xs text-gray-600">
                      {TRIGGER_ICONS[trigger] || '📊'} {count} {locale === 'bg'
                        ? t(`panel.trigger_${trigger}`, locale)
                        : t(`panel.trigger_${trigger}`, locale)}
                    </span>
                  ))}
              </div>
            )}
          </Card>

          {/* Base Panel */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              {t('panel.base', locale)}
            </h2>
            <Card padding={false}>
              <div className="divide-y divide-gray-100">
                {panel.base_panel.map((test, i) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-3">
                    <span className="text-lg mt-0.5">🧪</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">
                          {locale === 'bg' ? test.name_bg : test.name}
                        </p>
                        <Badge color="indigo">{t('panel.constant', locale)}</Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {locale === 'bg' ? test.reason_bg : test.reason}
                      </p>
                      {test.biomarkers.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {test.biomarkers.map((bm) => (
                            <span key={bm} className="px-1.5 py-0.5 text-[10px] font-mono font-medium text-indigo-700 bg-indigo-50 rounded">
                              {bm}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Additional Tests */}
          {panel.additional_tests.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {t('panel.additional', locale)}
              </h2>
              <p className="text-xs text-gray-500 mb-2">{t('panel.additional_desc', locale)}</p>
              <Card padding={false}>
                <div className="divide-y divide-gray-100">
                  {panel.additional_tests.map((test, i) => (
                    <div key={i} className="px-4 py-3 flex items-start gap-3">
                      <span className="text-lg mt-0.5">{TRIGGER_ICONS[test.trigger || ''] || '➕'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-gray-900">
                            {locale === 'bg' ? test.name_bg : test.name}
                          </p>
                          {test.priority && (
                            <Badge color={PRIORITY_COLORS[test.priority] as 'red' | 'yellow' | 'blue' || 'gray'}>
                              {test.priority === 'high'
                                ? (locale === 'bg' ? 'Задължителен' : 'Must do')
                                : test.priority === 'medium'
                                ? (locale === 'bg' ? 'Препоръчан' : 'Recommended')
                                : (locale === 'bg' ? 'По желание' : 'Optional')}
                            </Badge>
                          )}
                          {test.trigger && (
                            <Badge color={TRIGGER_COLORS[test.trigger] as 'red' | 'purple' | 'green' | 'yellow' || 'gray'}>
                              {TRIGGER_ICONS[test.trigger]} {t(`panel.trigger_${test.trigger}`, locale)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {locale === 'bg' ? test.reason_bg : test.reason}
                        </p>
                        {test.biomarkers.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {test.biomarkers.map((bm) => (
                              <span key={bm} className="px-1.5 py-0.5 text-[10px] font-mono font-medium text-amber-700 bg-amber-50 rounded">
                                {bm}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* No additional tests message */}
          {panel.additional_tests.length === 0 && panel.last_test_date && (
            <Card>
              <div className="text-center py-4">
                <span className="text-3xl mb-2 block">✅</span>
                <p className="text-sm font-medium text-gray-900">
                  {locale === 'bg' ? 'Няма допълнителни тестове' : 'No additional tests needed'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {locale === 'bg'
                    ? 'Предишните ви резултати, кръвно налягане и показатели са в норма'
                    : 'Your previous results, BP, and vitals are within normal ranges'}
                </p>
              </div>
            </Card>
          )}

          {/* Print footer */}
          <div className="hidden print:block text-center text-xs text-gray-400 mt-8 pt-4 border-t">
            <p>DomApp Health — {locale === 'bg' ? 'Генерирано на' : 'Generated on'} {new Date().toLocaleDateString()}</p>
            <p>{locale === 'bg' ? 'Покажете този панел на вашия лекар' : 'Show this panel to your doctor'}</p>
          </div>
        </div>
      </PageContent>
    </PageShell>
  );
}
