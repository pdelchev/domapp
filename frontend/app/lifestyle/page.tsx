'use client';

import { useRouter } from 'next/navigation';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge } from '../components/ui';

// ============================================================
// BLOOD TEST DATA — from latest results
// ============================================================
interface BloodResult {
  id: string;
  category: string;
  name: { en: string; bg: string };
  code: string;
  refMin: number;
  refMax: number;
  unit: string;
  value: number;
  status: 'optimal' | 'borderline' | 'abnormal';
}

const BLOOD_RESULTS: BloodResult[] = [
  // METABOLIC
  { id: 'glu', category: 'metabolic', name: { en: 'Glucose (fasting)', bg: 'Глюкоза (на гладно)' }, code: 'GLU', refMin: 3.9, refMax: 6.1, unit: 'mmol/L', value: 8.64, status: 'abnormal' },
  // LIVER
  { id: 'alt', category: 'liver', name: { en: 'ALT (SGPT)', bg: 'АЛТ (СГПТ)' }, code: 'ALT', refMin: 0, refMax: 41, unit: 'U/L', value: 49.7, status: 'abnormal' },
  { id: 'ast', category: 'liver', name: { en: 'AST (SGOT)', bg: 'АСТ (СГОТ)' }, code: 'AST', refMin: 0, refMax: 40, unit: 'U/L', value: 32.8, status: 'borderline' },
  { id: 'ggt', category: 'liver', name: { en: 'GGT', bg: 'ГГТ' }, code: 'GGT', refMin: 0, refMax: 55, unit: 'U/L', value: 35, status: 'borderline' },
  { id: 'alp', category: 'liver', name: { en: 'Alkaline Phosphatase', bg: 'Алкална фосфатаза (АФ)' }, code: 'ALP', refMin: 40, refMax: 130, unit: 'U/L', value: 73, status: 'optimal' },
  // KIDNEY
  { id: 'crea', category: 'kidney', name: { en: 'Creatinine', bg: 'Креатинин' }, code: 'CREA', refMin: 62, refMax: 106, unit: 'μmol/L', value: 95, status: 'optimal' },
  { id: 'urea', category: 'kidney', name: { en: 'Urea', bg: 'Урея' }, code: 'UREA', refMin: 2.5, refMax: 7.1, unit: 'mmol/L', value: 5.3, status: 'optimal' },
  { id: 'uric', category: 'kidney', name: { en: 'Uric Acid', bg: 'Пикочна киселина' }, code: 'URIC', refMin: 200, refMax: 430, unit: 'μmol/L', value: 481, status: 'abnormal' },
  // ELECTROLYTES
  { id: 'ca', category: 'electrolytes', name: { en: 'Calcium', bg: 'Калций' }, code: 'CA', refMin: 2.15, refMax: 2.55, unit: 'mmol/L', value: 2.43, status: 'optimal' },
  { id: 'p', category: 'electrolytes', name: { en: 'Phosphorus', bg: 'Фосфор' }, code: 'P', refMin: 0.81, refMax: 1.45, unit: 'mmol/L', value: 1.23, status: 'optimal' },
  // PROTEIN
  { id: 'tp', category: 'protein', name: { en: 'Total Protein', bg: 'Общ белтък' }, code: 'TP', refMin: 60, refMax: 83, unit: 'g/L', value: 81.5, status: 'borderline' },
  { id: 'alb', category: 'protein', name: { en: 'Albumin', bg: 'Албумин' }, code: 'ALB', refMin: 35, refMax: 55, unit: 'g/L', value: 44.6, status: 'optimal' },
  // TUMOR MARKERS
  { id: 'psa', category: 'tumor', name: { en: 'Total PSA', bg: 'Общ ПСА' }, code: 'PSA', refMin: 0, refMax: 4, unit: 'ng/mL', value: 0.73, status: 'optimal' },
  { id: 'cea', category: 'tumor', name: { en: 'CEA', bg: 'Карциноембрионален антиген' }, code: 'CEA', refMin: 0, refMax: 3.8, unit: 'ng/mL', value: 0.22, status: 'optimal' },
  { id: 'ca199', category: 'tumor', name: { en: 'CA 19-9', bg: 'CA 19-9' }, code: 'CA199', refMin: 0, refMax: 34, unit: 'U/mL', value: 8.38, status: 'optimal' },
];

// ============================================================
// RECOMMENDATIONS linked to results
// ============================================================
interface Recommendation {
  icon: string;
  priority: 'high' | 'medium' | 'low';
  title: { en: string; bg: string };
  description: { en: string; bg: string };
  linkedResults: string[]; // ids from BLOOD_RESULTS
}

const RECOMMENDATIONS: Recommendation[] = [
  {
    icon: '🏥',
    priority: 'high',
    title: { en: 'Metabolic Syndrome Pattern Detected', bg: 'Открит модел на метаболитен синдром' },
    description: {
      en: 'Elevated glucose combined with liver enzyme changes suggests metabolic syndrome risk. Focus: 1) Cut refined carbs & sugar, 2) Exercise 30+ min daily, 3) Reduce belly fat, 4) Mediterranean diet.',
      bg: 'Комбинацията от повишена глюкоза и промени в чернодробните ензими предполага риск от метаболитен синдром. Фокус: 1) Намалете рафинираните въглехидрати и захарта, 2) Упражнения 30+ мин дневно, 3) Свалете коремните мазнини, 4) Средиземноморска диета.',
    },
    linkedResults: ['glu', 'alt', 'ast'],
  },
  {
    icon: '🫁',
    priority: 'high',
    title: { en: 'Elevated Liver Enzymes', bg: 'Множество повишени чернодробни ензими' },
    description: {
      en: 'Two or more elevated liver enzymes suggest liver stress. Actions: eliminate alcohol for 30 days, reduce sugar, exercise daily, drink coffee (protective).',
      bg: 'Два или повече повишени чернодробни ензима предполагат чернодробно натоварване. Действия: елиминирайте алкохола за 30 дни, намалете захарта, упражнения ежедневно, пийте кафе (защитно).',
    },
    linkedResults: ['alt', 'ast', 'ggt'],
  },
  {
    icon: '⚡',
    priority: 'high',
    title: { en: 'Fasting Glucose Significantly Elevated', bg: 'Значително повишена кръвна захар на гладно' },
    description: {
      en: 'Fasting glucose of 8.64 mmol/L is well above reference (3.9-6.1). This indicates pre-diabetic or diabetic range. Urgent: consult endocrinologist, HbA1c test needed, strict carb management.',
      bg: 'Глюкоза на гладно 8.64 mmol/L е значително над нормата (3.9-6.1). Това показва пре-диабетен или диабетен диапазон. Спешно: консултация с ендокринолог, необходим HbA1c тест, строг контрол на въглехидратите.',
    },
    linkedResults: ['glu'],
  },
  {
    icon: '🫘',
    priority: 'medium',
    title: { en: 'Uric Acid Above Normal', bg: 'Пикочна киселина над нормата' },
    description: {
      en: 'Risk of gout, kidney stones. Linked to metabolic syndrome. Reduce purine-rich foods: organ meats, sardines, beer. Drink plenty of water. Limit fructose & alcohol. Cherry extract may help.',
      bg: 'Риск от подагра, бъбречни камъни. Свързано с метаболитен синдром. Намалете храни богати на пурини: карантии, сардини, бира. Пийте много вода. Ограничете фруктозата и алкохола. Екстракт от череши може да помогне.',
    },
    linkedResults: ['uric', 'glu'],
  },
  {
    icon: '🧬',
    priority: 'low',
    title: { en: 'Total Protein: Upper Borderline', bg: 'Общ белтък: горна граница' },
    description: {
      en: 'Most common cause is dehydration. Ensure adequate hydration (2.5-3L water/day). Distribute protein evenly across meals (1.2-1.6g/kg body weight).',
      bg: 'Най-честа причина е дехидратация. Осигурете адекватна хидратация (2.5-3L вода/ден). Разпределете протеина равномерно в храненията (1.2-1.6г/кг телесно тегло).',
    },
    linkedResults: ['tp'],
  },
];

const CATEGORY_LABELS: Record<string, { en: string; bg: string; icon: string }> = {
  metabolic: { en: 'Metabolic Panel', bg: 'Метаболитен панел', icon: '⚡' },
  liver: { en: 'Liver Function', bg: 'Чернодробна функция', icon: '🫁' },
  kidney: { en: 'Kidney Function', bg: 'Бъбречна функция', icon: '🫘' },
  electrolytes: { en: 'Electrolytes', bg: 'Електролити', icon: '⚡' },
  protein: { en: 'Protein Panel', bg: 'Протеинов панел', icon: '🧬' },
  tumor: { en: 'Tumor Markers', bg: 'Туморни маркери', icon: '🔬' },
};

const STATUS_COLORS: Record<string, 'green' | 'yellow' | 'red'> = {
  optimal: 'green',
  borderline: 'yellow',
  abnormal: 'red',
};

const PRIORITY_COLORS: Record<string, 'red' | 'yellow' | 'blue'> = {
  high: 'red',
  medium: 'yellow',
  low: 'blue',
};

export default function LifestylePage() {
  const router = useRouter();
  const { locale } = useLanguage();

  const statusLabel = (s: string) =>
    t(`lifestyle.${s}`, locale);

  // Group results by category
  const categories = [...new Set(BLOOD_RESULTS.map((r) => r.category))];

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader title={t('lifestyle.title', locale)} />
        <p className="text-sm text-gray-500 -mt-4 mb-6">{t('lifestyle.subtitle', locale)}</p>

        {/* Quick navigation cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div onClick={() => router.push('/lifestyle/tests')} className="cursor-pointer group">
            <Card className="hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🧪</span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{t('lifestyle.follow_up', locale)}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{locale === 'en' ? 'Tests to repeat in 3 months' : 'Тестове за повторение след 3 месеца'}</p>
                </div>
              </div>
            </Card>
          </div>
          <div onClick={() => router.push('/lifestyle/meals')} className="cursor-pointer group">
            <Card className="hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🥗</span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{t('lifestyle.meal_plan', locale)}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{locale === 'en' ? '30-day rotating daily menus' : '30-дневно ротиращо меню'}</p>
                </div>
              </div>
            </Card>
          </div>
          <div onClick={() => router.push('/lifestyle/gym')} className="cursor-pointer group">
            <Card className="hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🏋️</span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{t('lifestyle.gym_routine', locale)}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{locale === 'en' ? 'Gym, sports & recovery plan' : 'Фитнес, спорт и възстановяване'}</p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Blood Test Results Table */}
        <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('lifestyle.blood_results', locale)}</h2>
        {categories.map((cat) => {
          const catLabel = CATEGORY_LABELS[cat];
          const results = BLOOD_RESULTS.filter((r) => r.category === cat);
          return (
            <div key={cat} className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <span>{catLabel?.icon}</span> {catLabel?.[locale] || cat}
              </h3>
              <Card padding={false}>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">{t('lifestyle.test', locale)}</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase text-right hidden sm:table-cell">{t('lifestyle.reference', locale)}</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase text-right">{t('lifestyle.result', locale)}</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase text-center">{t('lifestyle.status', locale)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {results.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <span className="text-sm font-medium text-gray-900">{r.name[locale]}</span>
                          <span className="text-xs text-gray-400 ml-1.5">{r.code}</span>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-500 text-right hidden sm:table-cell">
                          {r.refMin}–{r.refMax} {r.unit}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`text-sm font-semibold ${r.status === 'abnormal' ? 'text-red-600' : r.status === 'borderline' ? 'text-yellow-600' : 'text-gray-900'}`}>
                            {r.value}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">{r.unit}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge color={STATUS_COLORS[r.status]}>{statusLabel(r.status)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          );
        })}

        {/* Recommendations */}
        <h2 className="text-lg font-semibold text-gray-900 mb-3 mt-8">{t('lifestyle.recommendations', locale)}</h2>
        <div className="space-y-4 mb-8">
          {RECOMMENDATIONS.map((rec, i) => {
            const linked = BLOOD_RESULTS.filter((r) => rec.linkedResults.includes(r.id));
            return (
              <Card key={i}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl mt-0.5">{rec.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-900">{rec.title[locale]}</h3>
                      <Badge color={PRIORITY_COLORS[rec.priority]}>
                        {t(`lifestyle.priority_${rec.priority}`, locale)}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{rec.description[locale]}</p>
                    {linked.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-gray-400">{t('lifestyle.linked_results', locale)}:</span>
                        {linked.map((r) => (
                          <Badge key={r.id} color={STATUS_COLORS[r.status]}>
                            {r.code} {r.value}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Bottom nav links */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <Button onClick={() => router.push('/lifestyle/tests')}>{t('lifestyle.view_tests', locale)}</Button>
          <Button variant="secondary" onClick={() => router.push('/lifestyle/meals')}>{t('lifestyle.view_meals', locale)}</Button>
          <Button variant="secondary" onClick={() => router.push('/lifestyle/gym')}>{t('lifestyle.view_gym', locale)}</Button>
        </div>
      </PageContent>
    </PageShell>
  );
}
