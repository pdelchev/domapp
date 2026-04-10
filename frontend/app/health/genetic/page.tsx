'use client';

/**
 * §PAGE: Genetic Profile & NGDiet Results
 * §ROUTE: /health/genetic
 * §PURPOSE: Display personalized genetic test results and recommendations
 * §DATA: NGDiet genetic analysis with diet, exercise, and supplement guidance
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import {
  PageShell, PageContent, PageHeader, Card, Button,
  Badge, Alert,
} from '../../components/ui';
import NavBar from '../../components/NavBar';

const GENETIC_DATA = {
  test_date: '28 Mar 2022',
  test_id: 'TST-DL-30962',
  name: 'Petko Zlatkov Delchev',
  age: 34, // born 18 Jul 1989

  // Genetic findings
  genes: [
    { category: 'Fat Metabolism', genes: 'FABP2, ADIPOQ, ADRB2, APOA5', influence: 'strong' },
    { category: 'Energy Homeostasis', genes: 'UCP1, UCP2, UCP3', influence: 'weak' },
    { category: 'Carb Response', genes: 'TAS1R2, DRD2, SLC2A2', influence: 'moderate' },
    { category: 'Exercise Response', genes: 'ADRB3', influence: 'moderate' },
    { category: 'Circadian Rhythm', genes: 'CLOCK', influence: 'weak' },
    { category: 'Fat Storage', genes: 'PLIN', influence: 'moderate' },
  ],

  // Diet profile
  diet: 'Mediterranean',
  key_foods: {
    lean_proteins: ['fish (especially fatty fish)', 'lean meat', 'eggs', 'poultry'],
    vegetables: ['leafy greens', 'herbs', 'sweet potato', 'nuts', 'seeds'],
    avoid: ['wheat products', 'high-sugar items', 'processed foods'],
    include: ['olive oil', 'omega-3', 'B vitamins', 'magnesium'],
  },

  // Exercise
  mets_per_week: 20,
  intensity: 'Moderate-High',
  duration: '20 min daily or distributed',
  activities: [
    { name: 'Cycling (22-26 km/h, energetically)', met: 10 },
    { name: 'Running (9.6 km/h)', met: 10 },
    { name: 'Treadmill (12.8 km/h)', met: 13.5 },
    { name: 'Swimming (competitive pace)', met: 12 },
  ],

  // Supplements
  supplements: [
    { name: 'Omega-3 Fish Oil', reason: 'APOA5 gene - fat metabolism support', dose: '1000-2000mg' },
    { name: 'Vitamin D3', reason: 'Energy & immune function', dose: '2000-4000 IU' },
    { name: 'B-Complex Vitamins', reason: 'Energy metabolism (carb response)', dose: 'Daily' },
    { name: 'Magnesium', reason: 'Muscle recovery & sleep quality', dose: '300-400mg' },
    { name: 'Zinc', reason: 'Immune support & protein synthesis', dose: '10-15mg' },
  ],

  // Risks
  risks: [
    { category: 'Weight Regulation', level: 'Moderate', note: 'Monitor portions, manage satiety' },
    { category: 'Carb Sensitivity', level: 'Moderate', note: 'Limit refined carbs, focus on whole grains' },
    { category: 'Fat Storage', level: 'Moderate', note: 'Consistent exercise critical' },
    { category: 'Satiety Signals', level: 'Moderate', note: 'Eat slowly, track fullness' },
  ],
};

export default function GeneticPage() {
  const { locale } = useLanguage();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'diet' | 'exercise' | 'supplements'>('overview');

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={locale === 'bg' ? 'Генетичен профил' : 'Genetic Profile'}
          onBack={() => router.push('/health')}
        />

        {/* Test Info */}
        <Card className="bg-indigo-50 border-indigo-200 mb-4">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-[13px] font-medium text-gray-700">{locale === 'bg' ? 'Тест' : 'Test'}</div>
              <div className="font-semibold text-gray-900">NGDiet</div>
            </div>
            <div>
              <div className="text-[13px] font-medium text-gray-700">{locale === 'bg' ? 'Дата' : 'Date'}</div>
              <div className="font-semibold text-gray-900">{GENETIC_DATA.test_date}</div>
            </div>
            <div>
              <div className="text-[13px] font-medium text-gray-700">{locale === 'bg' ? 'ID' : 'ID'}</div>
              <div className="font-semibold text-gray-900">{GENETIC_DATA.test_id}</div>
            </div>
          </div>
        </Card>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {(['overview', 'diet', 'exercise', 'supplements'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab === 'overview' && (locale === 'bg' ? 'Преглед' : 'Overview')}
              {tab === 'diet' && (locale === 'bg' ? 'Диета' : 'Diet')}
              {tab === 'exercise' && (locale === 'bg' ? 'Упражнения' : 'Exercise')}
              {tab === 'supplements' && (locale === 'bg' ? 'Добавки' : 'Supplements')}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <Card>
              <h3 className="font-semibold text-gray-900 mb-3">{locale === 'bg' ? 'Генетични находки' : 'Genetic Findings'}</h3>
              <div className="space-y-3">
                {GENETIC_DATA.genes.map((g, i) => (
                  <div key={i} className="pb-3 border-b border-gray-200 last:border-0">
                    <div className="flex items-start justify-between mb-1">
                      <span className="font-medium text-gray-900">{g.category}</span>
                      <Badge color={
                        g.influence === 'strong' ? 'red' :
                        g.influence === 'moderate' ? 'yellow' : 'gray'
                      }>
                        {g.influence}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600">{g.genes}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold text-gray-900 mb-3">{locale === 'bg' ? 'Рискови области' : 'Risk Areas'}</h3>
              <div className="space-y-2">
                {GENETIC_DATA.risks.map((r, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900">{r.category}</span>
                      <Badge color={r.level === 'High' ? 'red' : r.level === 'Moderate' ? 'yellow' : 'green'}>
                        {r.level}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600">{r.note}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Diet Tab */}
        {activeTab === 'diet' && (
          <div className="space-y-4">
            <Card>
              <h3 className="font-semibold text-gray-900 mb-3">🍽️ {locale === 'bg' ? 'Препоръчана диета' : 'Recommended Diet'}</h3>
              <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="text-2xl font-bold text-green-700">{GENETIC_DATA.diet}</div>
                <div className="text-sm text-green-600 mt-1">{locale === 'bg' ? 'Оптимална за вашите гени' : 'Optimal for your genes'}</div>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">{locale === 'bg' ? '✓ Препоръчани храни' : '✓ Recommended Foods'}</h4>
                  <div className="space-y-2">
                    <div>
                      <div className="text-sm font-medium text-gray-700">{locale === 'bg' ? 'Протеини' : 'Proteins'}</div>
                      <div className="text-sm text-gray-600">{GENETIC_DATA.diet === 'Mediterranean' && GENETIC_DATA.key_foods.lean_proteins.join(', ')}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-700">{locale === 'bg' ? 'Зеленчуци & Храни' : 'Vegetables & Foods'}</div>
                      <div className="text-sm text-gray-600">{GENETIC_DATA.key_foods.vegetables.join(', ')}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-700">{locale === 'bg' ? 'Ключови хранители' : 'Key Nutrients'}</div>
                      <div className="text-sm text-gray-600">{GENETIC_DATA.key_foods.include.join(', ')}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">{locale === 'bg' ? '✗ Избегнете' : '✗ Avoid'}</h4>
                  <div className="text-sm text-gray-600">{GENETIC_DATA.key_foods.avoid.join(', ')}</div>
                </div>
              </div>
            </Card>

            <div className="flex gap-2">
              <Link href="/health/lifestyle/meals" className="flex-1">
                <Button className="w-full">
                  {locale === 'bg' ? 'Виж план на храни' : 'View Meal Plan'}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Exercise Tab */}
        {activeTab === 'exercise' && (
          <div className="space-y-4">
            <Card>
              <h3 className="font-semibold text-gray-900 mb-3">💪 {locale === 'bg' ? 'Упражнения' : 'Exercise Plan'}</h3>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-3xl font-bold text-blue-700">{GENETIC_DATA.mets_per_week}</div>
                  <div className="text-sm text-blue-600">{locale === 'bg' ? 'MET часа/седмица' : 'MET hours/week'}</div>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="text-3xl font-bold text-purple-700">20min</div>
                  <div className="text-sm text-purple-600">{locale === 'bg' ? 'Дневно (или разпределено)' : 'Daily (distributed)'}</div>
                </div>
              </div>

              <div className="mb-4">
                <div className="text-sm font-medium text-gray-700 mb-2">{locale === 'bg' ? 'Интензивност' : 'Intensity'}</div>
                <Badge color="yellow">{GENETIC_DATA.intensity}</Badge>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 mb-3">{locale === 'bg' ? 'Примерни активности' : 'Example Activities'}</h4>
                <div className="space-y-2">
                  {GENETIC_DATA.activities.map((a, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-900">{a.name}</span>
                      <Badge color="indigo">{a.met} MET</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Supplements Tab */}
        {activeTab === 'supplements' && (
          <div className="space-y-4">
            <Card>
              <h3 className="font-semibold text-gray-900 mb-3">💊 {locale === 'bg' ? 'Препоръчани добавки' : 'Recommended Supplements'}</h3>
              <div className="space-y-3">
                {GENETIC_DATA.supplements.map((s, i) => (
                  <div key={i} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-gray-900">{s.name}</h4>
                      <Badge color="green">{s.dose}</Badge>
                    </div>
                    <div className="text-sm text-gray-600">{s.reason}</div>
                  </div>
                ))}
              </div>
            </Card>

            <div className="flex gap-2">
              <Link href="/health/supplements" className="flex-1">
                <Button className="w-full">
                  {locale === 'bg' ? 'Виж моите добавки' : 'View My Supplements'}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}
