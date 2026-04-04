'use client';

// Printable lab order — the document you hand to the lab receptionist.
// @media print styles hide navigation and optimize for one-page paper output.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, Button, Spinner, Alert } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { getLabOrder } from '../../lib/api';

type Test = {
  code: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  fasting_required: boolean;
  name_en: string;
  name_bg: string;
  rationale_en: string;
  rationale_bg: string;
  triggered_by: string[];
};

type AbnormalResult = {
  abbreviation: string;
  name_en: string;
  name_bg: string;
  value: number;
  unit: string;
  flag: string;
  deviation_pct: number | null;
};

type LabOrder = {
  patient: { full_name: string; date_of_birth: string | null; sex: string };
  generated_at: string;
  based_on_report: { id: number; test_date: string | null; lab_name: string; overall_score: number | null } | null;
  abnormal_results?: AbnormalResult[];
  tests: Test[];
  groups: { high: Test[]; medium: Test[]; low: Test[] };
  any_fasting_required: boolean;
  fasting_instructions: { en: string; bg: string };
  receptionist_phrase: { en: string; bg: string };
  note: string | null;
};

const PRIORITY_COLORS = {
  high: 'border-red-500 bg-red-50',
  medium: 'border-amber-500 bg-amber-50',
  low: 'border-green-500 bg-green-50',
} as const;

const PRIORITY_LABELS = {
  high: { en: 'High priority', bg: 'Висок приоритет' },
  medium: { en: 'Medium priority', bg: 'Среден приоритет' },
  low: { en: 'Low priority', bg: 'Нисък приоритет' },
} as const;

function PriorityGroup({ label, tests, lang }: { label: string; tests: Test[]; lang: 'en' | 'bg' }) {
  if (!tests.length) return null;
  return (
    <div className="mb-6">
      <div className="text-sm font-semibold text-gray-800 mb-2 border-b border-gray-300 pb-1">
        {label} <span className="text-gray-500 font-normal">({tests.length})</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
            <th className="py-1 pr-2 font-medium">#</th>
            <th className="py-1 pr-2 font-medium w-1/3">{lang === 'bg' ? 'Изследване' : 'Test'}</th>
            <th className="py-1 pr-2 font-medium">{lang === 'bg' ? 'Защо' : 'Why'}</th>
            <th className="py-1 pr-2 font-medium text-center">{lang === 'bg' ? 'На гладно' : 'Fasting'}</th>
          </tr>
        </thead>
        <tbody>
          {tests.map((test, i) => (
            <tr key={test.code} className="border-b border-gray-100 align-top">
              <td className="py-2 pr-2 text-gray-500">{i + 1}</td>
              <td className="py-2 pr-2">
                <div className="font-medium text-gray-900">{lang === 'bg' ? test.name_bg : test.name_en}</div>
                {test.triggered_by.length > 0 && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    ← {test.triggered_by.join(', ')}
                  </div>
                )}
              </td>
              <td className="py-2 pr-2 text-gray-700">{lang === 'bg' ? test.rationale_bg : test.rationale_en}</td>
              <td className="py-2 pr-2 text-center">{test.fasting_required ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LabOrderPage() {
  const { locale } = useLanguage();
  const [data, setData] = useState<LabOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'en' | 'bg'>(locale === 'bg' ? 'bg' : 'bg'); // BG by default

  useEffect(() => {
    getLabOrder()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { setLang(locale === 'bg' ? 'bg' : 'en'); }, [locale]);

  if (loading) {
    return (
      <PageShell>
        <NavBar />
        <PageContent size="md"><Spinner message={t('common.loading', locale)} /></PageContent>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell>
        <NavBar />
        <PageContent size="md">
          <Alert type="error" message={error || 'No data'} />
        </PageContent>
      </PageShell>
    );
  }

  if (!data.based_on_report) {
    return (
      <PageShell>
        <NavBar />
        <PageContent size="md">
          <div className="text-center py-12 text-gray-500">
            {data.note}
          </div>
        </PageContent>
      </PageShell>
    );
  }

  const isBG = lang === 'bg';

  return (
    <>
      <style jsx global>{`
        @media print {
          nav, .no-print { display: none !important; }
          body { background: white !important; }
          .print-page { padding: 0 !important; max-width: 100% !important; }
        }
      `}</style>
      <PageShell>
        <div className="no-print"><NavBar /></div>
        <PageContent size="md">
          {/* Toolbar */}
          <div className="no-print flex items-center justify-between mb-4">
            <Link href="/life" className="text-sm text-indigo-600 hover:underline">
              ← {t('common.back', locale)}
            </Link>
            <div className="flex gap-2">
              <Button
                variant={lang === 'bg' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setLang('bg')}
              >
                BG
              </Button>
              <Button
                variant={lang === 'en' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setLang('en')}
              >
                EN
              </Button>
              <Button onClick={() => window.print()}>
                {isBG ? 'Принтирай' : 'Print'}
              </Button>
            </div>
          </div>

          {/* The document */}
          <div className="print-page bg-white p-8 rounded-xl border border-gray-200 shadow-sm">
            <div className="border-b-2 border-gray-900 pb-3 mb-4">
              <h1 className="text-2xl font-bold text-gray-900">
                {isBG ? 'Списък изследвания за лабораторията' : 'Follow-up lab order'}
              </h1>
              <div className="text-sm text-gray-600 mt-1">
                {isBG ? 'Контрол след отклонения в предишна кръвна картина' : 'Follow-up after abnormal blood work'}
              </div>
            </div>

            {/* Patient info */}
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <div className="text-xs text-gray-500">{isBG ? 'За' : 'Patient'}</div>
                <div className="font-medium">{data.patient.full_name}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">{isBG ? 'Дата на издаване' : 'Generated'}</div>
                <div className="font-medium">{data.generated_at}</div>
              </div>
              {data.patient.date_of_birth && (
                <div>
                  <div className="text-xs text-gray-500">{isBG ? 'Дата на раждане' : 'Date of birth'}</div>
                  <div className="font-medium">{data.patient.date_of_birth}</div>
                </div>
              )}
              <div>
                <div className="text-xs text-gray-500">{isBG ? 'На база' : 'Based on'}</div>
                <div className="font-medium">
                  {isBG ? 'Изследване от' : 'Report from'} {data.based_on_report.test_date}
                </div>
              </div>
            </div>

            {/* Fasting instructions */}
            <div className={`mb-5 p-3 rounded-lg text-sm ${data.any_fasting_required ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'}`}>
              <div className="font-semibold mb-1">
                {isBG ? '📋 Указания' : '📋 Instructions'}
              </div>
              <div className="text-gray-800">
                {isBG ? data.fasting_instructions.bg : data.fasting_instructions.en}
              </div>
            </div>

            {/* Groups */}
            <PriorityGroup label={PRIORITY_LABELS.high[lang]} tests={data.groups.high} lang={lang} />
            <PriorityGroup label={PRIORITY_LABELS.medium[lang]} tests={data.groups.medium} lang={lang} />
            <PriorityGroup label={PRIORITY_LABELS.low[lang]} tests={data.groups.low} lang={lang} />

            {/* Receptionist phrase */}
            <div className="mt-6 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
              <div className="font-semibold text-indigo-900 mb-1">
                {isBG ? '💬 Какво да кажете на регистратурата' : '💬 What to say at reception'}
              </div>
              <div className="italic text-gray-800">
                „{isBG ? data.receptionist_phrase.bg : data.receptionist_phrase.en}"
              </div>
            </div>

            {/* Source abnormal results */}
            {data.abnormal_results && data.abnormal_results.length > 0 && (
              <details className="mt-6 text-xs text-gray-600">
                <summary className="cursor-pointer font-medium">
                  {isBG ? 'Отклонения, които задействаха тези изследвания' : 'Abnormal results that triggered these'}
                  {' '}({data.abnormal_results.length})
                </summary>
                <table className="w-full mt-2 border border-gray-200">
                  <tbody>
                    {data.abnormal_results.map((r) => (
                      <tr key={r.abbreviation} className="border-b border-gray-100">
                        <td className="px-2 py-1 font-mono">{r.abbreviation}</td>
                        <td className="px-2 py-1">{isBG ? r.name_bg : r.name_en}</td>
                        <td className="px-2 py-1 text-right">{r.value} {r.unit}</td>
                        <td className="px-2 py-1">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-[10px] uppercase">
                            {r.flag}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        </PageContent>
      </PageShell>
    </>
  );
}
