'use client';

/**
 * §PAGE: Supplement Protocol & Daily Schedule
 * §ROUTE: /health/protocol
 * §PURPOSE: Master schedule for all supplements + Saxenda with cycling info
 * §DATA: Complete protocol with timing, dosing, cycling, and warnings
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

interface TimeSlot {
  time: string;
  icon: string;
  title: string;
  items: Array<{
    name: string;
    dose: string;
    notes: string[];
    warnings?: string[];
    cycling?: string;
  }>;
  fasting: boolean;
}

const PROTOCOL_DATA = {
  cycle_start: new Date('2026-04-10'),
  time_slots: [
    {
      time: '09:00',
      icon: '🌅',
      title: 'MORNING - FASTED',
      fasting: true,
      items: [
        {
          name: 'Saxenda Injection',
          dose: 'As prescribed',
          notes: ['Water allowed', 'No food', 'Subcutaneous injection'],
        },
        {
          name: 'NMN (Nicotinamide Mononucleotide)',
          dose: '500 mg (1 scoop)',
          notes: ['With 250-300 ml water', 'Stays fasted', 'Mitochondrial support', 'Works with Saxenda'],
          warnings: ['Do NOT exceed 500mg daily'],
        },
        {
          name: 'Panax Ginseng (Green Naturals)',
          dose: '1 capsule (standard)',
          notes: ['After NMN', 'Libido + energy', 'Can take 2 caps on training/sex days'],
          warnings: ['Cycle: 6 weeks ON / 2 weeks OFF', 'Max 3 caps (only 1-2x/week)', 'May raise BP'],
          cycling: 'ginseng_6_2',
        },
      ],
    },
    {
      time: '13:00',
      icon: '🍽️',
      title: 'FIRST MEAL - WITH FAT',
      fasting: false,
      items: [
        {
          name: 'Meal (with fats)',
          dose: 'Normal portion',
          notes: ['Olive oil, eggs, fish, meat', 'ALL fat-soluble supplements below taken WITH this meal'],
        },
        {
          name: 'Vitamin D3 + K2',
          dose: '1 tablet (5000 IU D3 + 200 µg K2)',
          notes: ['MUST take with fat', 'Improves absorption', 'Gout-safe dose'],
          warnings: ['❌ Do NOT take 20,000 IU daily (gout & BP risk)', '⚠️ Monitor BP first 7-10 days'],
        },
        {
          name: 'Zinc Bisglycinate',
          dose: '25 mg (1 tablet)',
          notes: ['Testosterone support', 'Libido enhancement', 'Prevents nausea if taken with food'],
        },
        {
          name: 'Boron (3 mg - Gout Safe)',
          dose: '1 tablet (3 mg)',
          notes: ['Free testosterone optimization', 'Hormone receptor sensitivity'],
          warnings: ['Cycle: 8 weeks ON / 2 weeks OFF', '❌ Never use 10mg version (gout risk)'],
          cycling: 'boron_8_2',
        },
        {
          name: 'CoQ10 (Coenzyme Q10)',
          dose: '200 mg (1 capsule)',
          notes: ['Endothelial function', 'Erection quality', 'Mitochondrial protection', 'BP support'],
          warnings: ['❌ Do NOT take fasted (absorption ↓60%)', 'May slightly lower BP (monitor first week)'],
        },
        {
          name: 'Omega-3 (Igennus Wild Fish Oil + Astaxanthin)',
          dose: '2 capsules (≥1000mg EPA+DHA)',
          notes: ['Blood flow improvement', 'Anti-inflammatory (gout-friendly)', 'Lipid profile support', 'Vascular health'],
          warnings: ['Must be taken WITH food', 'Risk of reflux if fasted'],
        },
      ],
    },
    {
      time: '18:00',
      icon: '🍽️',
      title: 'LAST MEAL',
      fasting: false,
      items: [
        {
          name: 'Meal (any type)',
          dose: 'Normal portion',
          notes: ['Your last eating window for the day'],
        },
        {
          name: 'Magnesium Taurate (Natugena)',
          dose: '1 capsule',
          notes: ['With or just after meal', 'BP support', 'Sleep prep begins'],
        },
      ],
    },
    {
      time: '21:30 - 22:30',
      icon: '🌙',
      title: 'BEFORE SLEEP',
      fasting: false,
      items: [
        {
          name: 'Magnesium Taurate (Natugena)',
          dose: '1 capsule',
          notes: ['With water', 'Improves sleep quality', 'BP regulation', 'Parasympathetic activation (erection quality)'],
        },
      ],
    },
    {
      time: '45-60 min BEFORE gym OR sex',
      icon: '⚡',
      title: 'OPTIONAL - TRAINING OR SEX DAYS ONLY',
      fasting: false,
      items: [
        {
          name: 'L-Citrulline',
          dose: '6 g (powder)',
          notes: ['Mix with 300-400 ml water', 'Empty stomach preferred', 'Nitric oxide boost', 'Vascular dilation'],
          warnings: ['❌ Do NOT use daily', 'Use only when needed for performance'],
        },
      ],
    },
  ] as TimeSlot[],
};

function getCycleDayInfo(cycleType: string, startDate: Date): { status: string; week: number; daysLeft: number } {
  const today = new Date();
  const daysSinceStart = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  if (cycleType === 'ginseng_6_2') {
    const cycleLength = 56; // 6 weeks + 2 weeks
    const dayInCycle = daysSinceStart % cycleLength;
    const isOn = dayInCycle < 42; // 6 weeks
    const week = Math.floor(dayInCycle / 7) + 1;
    const daysLeft = isOn ? 42 - dayInCycle : 56 - dayInCycle;
    return {
      status: isOn ? `ON - Week ${Math.floor(dayInCycle / 7) + 1}/6` : `OFF - Week ${Math.floor((dayInCycle - 42) / 7) + 1}/2`,
      week,
      daysLeft,
    };
  }

  if (cycleType === 'boron_8_2') {
    const cycleLength = 70; // 8 weeks + 2 weeks
    const dayInCycle = daysSinceStart % cycleLength;
    const isOn = dayInCycle < 56; // 8 weeks
    const week = Math.floor(dayInCycle / 7) + 1;
    const daysLeft = isOn ? 56 - dayInCycle : 70 - dayInCycle;
    return {
      status: isOn ? `ON - Week ${Math.floor(dayInCycle / 7) + 1}/8` : `OFF - Week ${Math.floor((dayInCycle - 56) / 7) + 1}/2`,
      week,
      daysLeft,
    };
  }

  return { status: 'N/A', week: 0, daysLeft: 0 };
}

export default function ProtocolPage() {
  const { locale } = useLanguage();
  const router = useRouter();
  const [ginsengCycle, setGinsengCycle] = useState(getCycleDayInfo('ginseng_6_2', PROTOCOL_DATA.cycle_start));
  const [boronCycle, setBoronCycle] = useState(getCycleDayInfo('boron_8_2', PROTOCOL_DATA.cycle_start));

  useEffect(() => {
    setGinsengCycle(getCycleDayInfo('ginseng_6_2', PROTOCOL_DATA.cycle_start));
    setBoronCycle(getCycleDayInfo('boron_8_2', PROTOCOL_DATA.cycle_start));
  }, []);

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={locale === 'bg' ? 'Протокол за добавки' : 'Supplement Protocol'}
          onBack={() => router.push('/health')}
          action={
            <Link href="/health/cycles">
              <Button variant="secondary">🔄 {locale === 'bg' ? 'Цикли' : 'Cycles'}</Button>
            </Link>
          }
        />

        {/* Cycle Status */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Card>
            <div className="text-sm font-medium text-gray-700 mb-1">🌿 Panax Ginseng</div>
            <div className="text-2xl font-bold text-green-600 mb-1">{ginsengCycle.status}</div>
            <div className="text-xs text-gray-500">{ginsengCycle.daysLeft} days remaining</div>
          </Card>
          <Card>
            <div className="text-sm font-medium text-gray-700 mb-1">🧬 Boron</div>
            <div className="text-2xl font-bold text-blue-600 mb-1">{boronCycle.status}</div>
            <div className="text-xs text-gray-500">{boronCycle.daysLeft} days remaining</div>
          </Card>
        </div>

        {/* Daily Schedule */}
        <div className="space-y-4">
          {PROTOCOL_DATA.time_slots.map((slot, i) => (
            <Card key={i}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{slot.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-gray-700">{slot.time}</div>
                    <div className="text-lg font-semibold text-gray-900">{slot.title}</div>
                  </div>
                </div>
                {slot.fasting && (
                  <Badge color="purple">{locale === 'bg' ? 'ГЛАДЕН' : 'FASTED'}</Badge>
                )}
              </div>

              <div className="space-y-4">
                {slot.items.map((item, j) => (
                  <div key={j} className="pb-4 border-b border-gray-200 last:border-0">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-gray-900">{item.name}</h4>
                      <Badge color="indigo">{item.dose}</Badge>
                    </div>

                    {/* Cycling Info */}
                    {item.cycling && (
                      <div className="mb-2 p-2 bg-amber-50 rounded border border-amber-200">
                        <div className="text-xs font-medium text-amber-900">
                          {item.cycling === 'ginseng_6_2' ? `🔄 ${ginsengCycle.status}` : `🔄 ${boronCycle.status}`}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {item.notes.length > 0 && (
                      <ul className="text-sm text-gray-600 space-y-1 mb-2">
                        {item.notes.map((note, k) => (
                          <li key={k} className="flex gap-2">
                            <span className="text-indigo-500 flex-shrink-0">•</span>
                            <span>{note}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Warnings */}
                    {item.warnings && item.warnings.length > 0 && (
                      <div className="space-y-1">
                        {item.warnings.map((warning, k) => (
                          <div key={k} className="text-xs text-red-700 bg-red-50 p-2 rounded border border-red-200">
                            {warning}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* Summary Card */}
        <Card className="bg-indigo-50 border-indigo-200 mt-4">
          <h3 className="font-semibold text-gray-900 mb-3">{locale === 'bg' ? 'Дневна сводка' : 'Daily Summary'}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-700">Total pills/day (normal):</span>
              <span className="font-semibold text-gray-900">8-9</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Fasting time:</span>
              <span className="font-semibold text-gray-900">~18 hours</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Saxenda compatible:</span>
              <span className="font-semibold text-green-600">✓ Yes</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Gout-safe:</span>
              <span className="font-semibold text-green-600">✓ Yes</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">BP-safe:</span>
              <span className="font-semibold text-green-600">✓ Yes (monitor first week)</span>
            </div>
          </div>
        </Card>

        {/* Navigation */}
        <div className="flex gap-2 mt-6">
          <Link href="/health/routine" className="flex-1">
            <Button className="w-full">💊 {locale === 'bg' ? 'Дневен режим' : 'Daily Routine'}</Button>
          </Link>
          <Link href="/health/cycles" className="flex-1">
            <Button variant="secondary" className="w-full">🔄 {locale === 'bg' ? 'Цикли' : 'Cycles'}</Button>
          </Link>
        </div>
      </PageContent>
    </PageShell>
  );
}
