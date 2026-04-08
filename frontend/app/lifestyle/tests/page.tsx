'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getTestPanel } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Badge, Spinner, EmptyState, Button } from '../../components/ui';

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

const TRIGGER_ICONS: Record<string, string> = { blood: '🩸', bp: '💓', whoop: '⌚', weight: '⚖️' };
const TRIGGER_COLORS: Record<string, string> = { blood: 'red', bp: 'purple', whoop: 'green', weight: 'yellow' };
const PRIORITY_COLORS: Record<string, string> = { high: 'red', medium: 'yellow', low: 'blue' };

export default function TestPanelPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [panel, setPanel] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getTestPanel()
      .then(setPanel)
      .catch(() => setError('Failed to load test panel'))
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  };

  // Build lab-readable text
  const buildLabText = () => {
    if (!panel) return '';
    const lines: string[] = [];
    lines.push(locale === 'bg' ? '=== КРЪВНИ ИЗСЛЕДВАНИЯ ===' : '=== BLOOD TEST PANEL ===');
    lines.push('');
    lines.push(locale === 'bg' ? '--- Основен панел ---' : '--- Base Panel ---');
    panel.base_panel.forEach((test, i) => {
      lines.push(`${i + 1}. ${locale === 'bg' ? test.name_bg : test.name}`);
    });
    if (panel.additional_tests.length > 0) {
      lines.push('');
      lines.push(locale === 'bg' ? '--- Допълнителни ---' : '--- Additional ---');
      panel.additional_tests.forEach((test, i) => {
        lines.push(`${panel.base_panel.length + i + 1}. ${locale === 'bg' ? test.name_bg : test.name}`);
      });
    }
    lines.push('');
    lines.push(`${locale === 'bg' ? 'Общо' : 'Total'}: ${panel.total_tests} ${locale === 'bg' ? 'изследвания' : 'tests'}`);
    return lines.join('\n');
  };

  const handleCopy = async () => {
    const text = buildLabText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) return (
    <PageShell><NavBar /><PageContent size="md"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>
  );

  if (error || !panel) return (
    <PageShell><NavBar /><PageContent size="md">
      <EmptyState icon="🧪" message={error || t('panel.no_previous', locale)} />
    </PageContent></PageShell>
  );

  const labText = buildLabText();

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={t('panel.title', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/lifestyle')}
        />

        <div className="space-y-4">
          {/* Status Card */}
          <Card>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm text-gray-500">{t('panel.next_test', locale)}</p>
                <p className={`text-lg font-bold ${panel.is_overdue ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatDate(panel.next_test_date)}
                  {panel.is_overdue && (
                    <span className="ml-2"><Badge color="red">{t('panel.overdue', locale)}</Badge></span>
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

            {panel.summary.additional_count > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                {Object.entries(panel.summary.triggers)
                  .filter(([, count]) => count > 0)
                  .map(([trigger, count]) => (
                    <span key={trigger} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-lg text-xs text-gray-600">
                      {TRIGGER_ICONS[trigger] || '📊'} {count} {t(`panel.trigger_${trigger}`, locale)}
                    </span>
                  ))}
              </div>
            )}
          </Card>

          {/* Lab Text — for reading to lab personnel */}
          <Card className="!bg-blue-50 !border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-blue-800">
                📋 {locale === 'bg' ? 'За лабораторията' : 'For the Lab'}
              </h3>
              <Button size="sm" variant="secondary" onClick={handleCopy}>
                {copied
                  ? (locale === 'bg' ? '✓ Копирано' : '✓ Copied')
                  : (locale === 'bg' ? '📄 Копирай' : '📄 Copy')}
              </Button>
            </div>
            <p className="text-xs text-blue-600 mb-2">
              {locale === 'bg'
                ? 'Прочетете този списък на лаборанта или копирайте и изпратете:'
                : 'Read this list to the lab technician or copy and send:'}
            </p>
            <pre className="text-sm text-blue-900 bg-white border border-blue-200 rounded-lg p-3 whitespace-pre-wrap font-sans leading-relaxed select-all">
              {labText}
            </pre>
          </Card>

          {/* Base Panel — simple list */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              {t('panel.base', locale)}
            </h2>
            <Card padding={false}>
              <div className="divide-y divide-gray-100">
                {panel.base_panel.map((test, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                    <span className="text-sm text-gray-400 font-mono w-5">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {locale === 'bg' ? test.name_bg : test.name}
                      </p>
                      <p className="text-xs text-gray-400">{locale === 'bg' ? test.reason_bg : test.reason}</p>
                    </div>
                    <Badge color="indigo">{t('panel.constant', locale)}</Badge>
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
                    <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-sm text-gray-400 font-mono w-5">{panel.base_panel.length + i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-gray-900">
                            {locale === 'bg' ? test.name_bg : test.name}
                          </p>
                          {test.priority && (
                            <Badge color={PRIORITY_COLORS[test.priority] as 'red' | 'yellow' | 'blue'}>
                              {test.priority === 'high'
                                ? (locale === 'bg' ? 'Задължителен' : 'Must do')
                                : test.priority === 'medium'
                                ? (locale === 'bg' ? 'Препоръчан' : 'Recommended')
                                : (locale === 'bg' ? 'По желание' : 'Optional')}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {TRIGGER_ICONS[test.trigger || ''] || ''} {locale === 'bg' ? test.reason_bg : test.reason}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* No additional tests */}
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
        </div>
      </PageContent>
    </PageShell>
  );
}
