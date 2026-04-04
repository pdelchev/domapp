'use client';

import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../context/LanguageContext';
import { t } from '../../../lib/i18n';
import NavBar from '../../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Badge } from '../../../components/ui';

interface FollowUpTest {
  name: { en: string; bg: string };
  code: string;
  reason: { en: string; bg: string };
  linkedCodes: string[];
  priority: 'high' | 'medium' | 'low';
  category: string;
}

const FOLLOW_UP_TESTS: FollowUpTest[] = [
  // HIGH PRIORITY — directly from abnormal results
  {
    name: { en: 'HbA1c (Glycated Hemoglobin)', bg: 'HbA1c (Гликиран хемоглобин)' },
    code: 'HBA1C',
    reason: {
      en: 'Your fasting glucose is 8.64 mmol/L (well above 6.1 max). HbA1c gives a 3-month average blood sugar picture — critical for diabetes diagnosis and management.',
      bg: 'Глюкозата на гладно е 8.64 mmol/L (значително над 6.1 макс). HbA1c дава средна картина на кръвната захар за 3 месеца — критичен за диагностика и управление на диабет.',
    },
    linkedCodes: ['GLU'],
    priority: 'high',
    category: 'metabolic',
  },
  {
    name: { en: 'Fasting Glucose (repeat)', bg: 'Глюкоза на гладно (повторен)' },
    code: 'GLU',
    reason: {
      en: 'Confirm whether lifestyle changes have lowered fasting glucose from 8.64. Target: below 6.1 mmol/L.',
      bg: 'Потвърдете дали промените в начина на живот са намалили глюкозата от 8.64. Цел: под 6.1 mmol/L.',
    },
    linkedCodes: ['GLU'],
    priority: 'high',
    category: 'metabolic',
  },
  {
    name: { en: 'Fasting Insulin', bg: 'Инсулин на гладно' },
    code: 'INS',
    reason: {
      en: 'With glucose this elevated, checking insulin resistance (HOMA-IR) is essential. High insulin + high glucose = insulin resistance. Low insulin + high glucose = possible Type 1 or late-onset diabetes.',
      bg: 'При толкова повишена глюкоза, проверката за инсулинова резистентност (HOMA-IR) е задължителна. Висок инсулин + висока глюкоза = инсулинова резистентност.',
    },
    linkedCodes: ['GLU'],
    priority: 'high',
    category: 'metabolic',
  },
  {
    name: { en: 'ALT (repeat)', bg: 'АЛТ (повторен)' },
    code: 'ALT',
    reason: {
      en: 'Your ALT was 49.7 U/L (above 41 max). After 3 months of no alcohol + dietary changes, verify liver recovery.',
      bg: 'АЛТ беше 49.7 U/L (над 41 макс). След 3 месеца без алкохол + диетични промени, проверете възстановяването на черния дроб.',
    },
    linkedCodes: ['ALT'],
    priority: 'high',
    category: 'liver',
  },
  {
    name: { en: 'Full Liver Panel (ALT, AST, GGT, ALP, Bilirubin)', bg: 'Пълен чернодробен панел (АЛТ, АСТ, ГГТ, АФ, Билирубин)' },
    code: 'LIVER',
    reason: {
      en: 'Multiple elevated liver enzymes. Adding bilirubin gives complete picture of liver health and rules out obstruction.',
      bg: 'Множество повишени чернодробни ензими. Добавянето на билирубин дава пълна картина на чернодробното здраве.',
    },
    linkedCodes: ['ALT', 'AST', 'GGT'],
    priority: 'high',
    category: 'liver',
  },
  // MEDIUM PRIORITY
  {
    name: { en: 'Uric Acid (repeat)', bg: 'Пикочна киселина (повторен)' },
    code: 'URIC',
    reason: {
      en: 'Was 481 μmol/L (above 430 max). Track response to dietary changes — reduced purines, more water, less fructose.',
      bg: 'Беше 481 μmol/L (над 430 макс). Проследете отговора на диетичните промени — намалени пурини, повече вода, по-малко фруктоза.',
    },
    linkedCodes: ['URIC'],
    priority: 'medium',
    category: 'kidney',
  },
  {
    name: { en: 'Lipid Panel (Total, LDL, HDL, Triglycerides)', bg: 'Липиден панел (Общ, LDL, HDL, Триглицериди)' },
    code: 'LIPID',
    reason: {
      en: 'Metabolic syndrome pattern (high glucose) usually comes with dyslipidemia. Full lipid panel is essential for cardiovascular risk assessment.',
      bg: 'Моделът на метаболитен синдром (висока глюкоза) обикновено идва с дислипидемия. Пълен липиден панел е задължителен за оценка на сърдечно-съдовия риск.',
    },
    linkedCodes: ['GLU'],
    priority: 'medium',
    category: 'metabolic',
  },
  {
    name: { en: 'Liver Ultrasound', bg: 'Ехография на черен дроб' },
    code: 'US-LIVER',
    reason: {
      en: 'With elevated ALT and metabolic syndrome risk, fatty liver disease (NAFLD) should be ruled out. Ultrasound is the first-line screening tool.',
      bg: 'При повишен АЛТ и риск от метаболитен синдром, мастен черен дроб (NAFLD) трябва да се изключи. Ехографията е първата линия за скрининг.',
    },
    linkedCodes: ['ALT', 'GLU'],
    priority: 'medium',
    category: 'liver',
  },
  {
    name: { en: 'CRP (C-Reactive Protein)', bg: 'CRP (С-реактивен протеин)' },
    code: 'CRP',
    reason: {
      en: 'Inflammation marker. With elevated glucose and liver enzymes, checking systemic inflammation helps assess overall metabolic and cardiovascular risk.',
      bg: 'Маркер за възпаление. При повишена глюкоза и чернодробни ензими, проверката на системно възпаление помага за оценка на метаболитния и сърдечно-съдовия риск.',
    },
    linkedCodes: ['GLU', 'ALT'],
    priority: 'medium',
    category: 'metabolic',
  },
  // LOW PRIORITY — good to have for complete picture
  {
    name: { en: 'Vitamin D', bg: 'Витамин D' },
    code: 'VITD',
    reason: {
      en: 'Deficiency is extremely common and affects insulin sensitivity, liver health, and immune function — all relevant to your results.',
      bg: 'Дефицитът е изключително разпространен и влияе на инсулиновата чувствителност, чернодробното здраве и имунната функция — всички свързани с вашите резултати.',
    },
    linkedCodes: ['GLU', 'ALT'],
    priority: 'low',
    category: 'vitamins',
  },
  {
    name: { en: 'Iron Panel (Fe, Ferritin, TIBC)', bg: 'Железен панел (Fe, Феритин, TIBC)' },
    code: 'IRON',
    reason: {
      en: 'Previous results showed low MCV (small red blood cells) suggesting possible iron deficiency. Iron panel confirms or rules out.',
      bg: 'Предишни резултати показват нисък MCV (малки червени кръвни клетки), което предполага възможен дефицит на желязо. Железният панел потвърждава или изключва.',
    },
    linkedCodes: [],
    priority: 'low',
    category: 'blood',
  },
  {
    name: { en: 'TSH (Thyroid)', bg: 'ТСХ (Щитовидна жлеза)' },
    code: 'TSH',
    reason: {
      en: 'Thyroid dysfunction can affect metabolism, liver enzymes, and cholesterol. Important baseline given metabolic pattern.',
      bg: 'Тиреоидната дисфункция може да засегне метаболизма, чернодробните ензими и холестерола. Важна базова линия при метаболитен модел.',
    },
    linkedCodes: ['GLU', 'ALT'],
    priority: 'low',
    category: 'hormones',
  },
];

const PRIORITY_COLORS: Record<string, 'red' | 'yellow' | 'blue'> = {
  high: 'red',
  medium: 'yellow',
  low: 'blue',
};

const CATEGORY_ICONS: Record<string, string> = {
  metabolic: '⚡',
  liver: '🫁',
  kidney: '🫘',
  vitamins: '💊',
  blood: '🩸',
  hormones: '🧬',
};

export default function FollowUpTestsPage() {
  const router = useRouter();
  const { locale } = useLanguage();

  const grouped = {
    high: FOLLOW_UP_TESTS.filter((t) => t.priority === 'high'),
    medium: FOLLOW_UP_TESTS.filter((t) => t.priority === 'medium'),
    low: FOLLOW_UP_TESTS.filter((t) => t.priority === 'low'),
  };

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('lifestyle.follow_up', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/health/lifestyle')}
        />
        <p className="text-sm text-gray-500 -mt-4 mb-6">
          {locale === 'en'
            ? 'Based on your abnormal results, these are the tests to repeat or add after 3 months of lifestyle changes.'
            : 'Базирано на абнормалните ви резултати, това са тестовете за повторение или добавяне след 3 месеца промени в начина на живот.'}
        </p>

        {(['high', 'medium', 'low'] as const).map((priority) => (
          <div key={priority} className="mb-8">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Badge color={PRIORITY_COLORS[priority]}>
                {t(`lifestyle.priority_${priority}`, locale)}
              </Badge>
              <span className="text-gray-400">({grouped[priority].length})</span>
            </h2>
            <div className="space-y-3">
              {grouped[priority].map((test, i) => (
                <Card key={i}>
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">{CATEGORY_ICONS[test.category] || '🧪'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-sm font-semibold text-gray-900">{test.name[locale]}</h3>
                        <span className="text-xs text-gray-400 font-mono">{test.code}</span>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">{test.reason[locale]}</p>
                      {test.linkedCodes.length > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-gray-400">{t('lifestyle.linked_results', locale)}:</span>
                          {test.linkedCodes.map((code) => (
                            <Badge key={code} color="gray">{code}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </PageContent>
    </PageShell>
  );
}
