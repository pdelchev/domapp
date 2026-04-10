'use client';

/**
 * §PAGE: Supplement Cycling Dashboard
 * §ROUTE: /health/cycles
 * §PURPOSE: Track Ginseng (6/2) and Boron (8/2) cycling schedules
 * §DATA: Real-time cycle status with calendar preview
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import {
  PageShell, PageContent, PageHeader, Card, Button,
  Badge,
} from '../../components/ui';
import NavBar from '../../components/NavBar';

interface CycleInfo {
  name: string;
  currentStatus: 'ON' | 'OFF';
  currentWeek: number;
  totalWeeks: number;
  onWeeks: number;
  offWeeks: number;
  daysInCurrentWeek: number;
  daysUntilChange: number;
  nextChangeDate: string;
  reason: string;
  color: 'green' | 'red';
}

function calculateCycle(cycleType: 'ginseng' | 'boron', startDate: Date): CycleInfo {
  const today = new Date();
  const daysSinceStart = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  if (cycleType === 'ginseng') {
    const onWeeks = 6;
    const offWeeks = 2;
    const cycleLength = (onWeeks + offWeeks) * 7; // in days
    const daysInCycle = daysSinceStart % cycleLength;
    const isOn = daysInCycle < onWeeks * 7;

    const weekInCycle = Math.floor(daysInCycle / 7);
    const daysInCurrentWeek = daysInCycle % 7;
    const daysUntilChange = isOn ? (onWeeks * 7 - daysInCycle) : (cycleLength - daysInCycle);

    const nextChangeDate = new Date(today.getTime() + daysUntilChange * 24 * 60 * 60 * 1000);

    return {
      name: 'Panax Ginseng',
      currentStatus: isOn ? 'ON' : 'OFF',
      currentWeek: weekInCycle + 1,
      totalWeeks: onWeeks + offWeeks,
      onWeeks,
      offWeeks,
      daysInCurrentWeek,
      daysUntilChange,
      nextChangeDate: nextChangeDate.toLocaleDateString(),
      reason: isOn
        ? 'Libido & energy optimization'
        : 'Cortisol desensitization prevention, preserving effect',
      color: isOn ? 'green' : 'red',
    };
  }

  if (cycleType === 'boron') {
    const onWeeks = 8;
    const offWeeks = 2;
    const cycleLength = (onWeeks + offWeeks) * 7;
    const daysInCycle = daysSinceStart % cycleLength;
    const isOn = daysInCycle < onWeeks * 7;

    const weekInCycle = Math.floor(daysInCycle / 7);
    const daysInCurrentWeek = daysInCycle % 7;
    const daysUntilChange = isOn ? (onWeeks * 7 - daysInCycle) : (cycleLength - daysInCycle);

    const nextChangeDate = new Date(today.getTime() + daysUntilChange * 24 * 60 * 60 * 1000);

    return {
      name: 'Boron',
      currentStatus: isOn ? 'ON' : 'OFF',
      currentWeek: weekInCycle + 1,
      totalWeeks: onWeeks + offWeeks,
      onWeeks,
      offWeeks,
      daysInCurrentWeek,
      daysUntilChange,
      nextChangeDate: nextChangeDate.toLocaleDateString(),
      reason: isOn
        ? 'Free testosterone & SHBG optimization'
        : 'Hormone receptor reset, maintaining sensitivity',
      color: isOn ? 'green' : 'red',
    };
  }

  return {
    name: 'Unknown',
    currentStatus: 'ON',
    currentWeek: 0,
    totalWeeks: 0,
    onWeeks: 0,
    offWeeks: 0,
    daysInCurrentWeek: 0,
    daysUntilChange: 0,
    nextChangeDate: '',
    reason: '',
    color: 'green',
  };
}

function CycleCard({ cycle, emoji }: { cycle: CycleInfo; emoji: string }) {
  const bgColor = cycle.currentStatus === 'ON' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
  const textColor = cycle.currentStatus === 'ON' ? 'text-green-900' : 'text-red-900';
  const badgeColor = cycle.currentStatus === 'ON' ? 'green' : 'red';

  const progressPercent = ((cycle.currentWeek - 1) / cycle.totalWeeks) * 100;

  return (
    <Card className={`${bgColor} border-2`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{emoji}</span>
          <div>
            <h3 className={`text-lg font-bold ${textColor}`}>{cycle.name}</h3>
            <p className="text-sm text-gray-600">{cycle.reason}</p>
          </div>
        </div>
        <Badge color={badgeColor}>
          {cycle.currentStatus}
        </Badge>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs font-medium text-gray-700 mb-2">
          <span>
            Week {cycle.currentWeek}/{cycle.totalWeeks}
          </span>
          <span>{cycle.daysUntilChange} days until change</span>
        </div>
        <div className="w-full bg-gray-300 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full transition-all ${
              cycle.currentStatus === 'ON'
                ? 'bg-green-500'
                : 'bg-red-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-gray-600">{cycle.currentStatus === 'ON' ? 'ON weeks' : 'OFF weeks'}</div>
          <div className="text-lg font-bold text-gray-900">
            {cycle.currentStatus === 'ON' ? cycle.onWeeks : cycle.offWeeks}
          </div>
        </div>
        <div>
          <div className="text-gray-600">Next change</div>
          <div className="text-lg font-bold text-gray-900">{cycle.nextChangeDate}</div>
        </div>
      </div>

      {/* Instructions */}
      <div className={`mt-4 p-3 rounded text-sm ${textColor} ${cycle.currentStatus === 'ON' ? 'bg-green-100' : 'bg-red-100'}`}>
        {cycle.currentStatus === 'ON' ? (
          <>
            ✓ Continue taking daily
            {cycle.name === 'Panax Ginseng' && ' (1 cap standard, 2 caps on training/sex days)'}
            {cycle.name === 'Boron' && ' (3 mg, with food at 13:00)'}
          </>
        ) : (
          <>
            ⏹️ PAUSE for {cycle.offWeeks} weeks
            <br />
            Libido may dip slightly — this is normal and expected. Receptors resetting.
          </>
        )}
      </div>
    </Card>
  );
}

export default function CyclesPage() {
  const { locale } = useLanguage();
  const router = useRouter();
  const [ginsengCycle, setGinsengCycle] = useState<CycleInfo | null>(null);
  const [boronCycle, setBoronCycle] = useState<CycleInfo | null>(null);

  useEffect(() => {
    const startDate = new Date('2026-04-10');
    setGinsengCycle(calculateCycle('ginseng', startDate));
    setBoronCycle(calculateCycle('boron', startDate));
  }, []);

  if (!ginsengCycle || !boronCycle) {
    return <PageShell><NavBar /><PageContent><div>Loading...</div></PageContent></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={locale === 'bg' ? 'Цикли на добавки' : 'Supplement Cycles'}
          onBack={() => router.push('/health/protocol')}
        />

        <div className="space-y-4">
          <CycleCard cycle={ginsengCycle} emoji="🌿" />
          <CycleCard cycle={boronCycle} emoji="🧬" />
        </div>

        {/* Guidance Card */}
        <Card className="bg-blue-50 border-blue-200 mt-6">
          <h3 className="font-semibold text-gray-900 mb-3">{locale === 'bg' ? 'Защо цикилиране?' : 'Why Cycling?'}</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex gap-2">
              <span className="text-blue-600 flex-shrink-0">•</span>
              <span><strong>Prevents desensitization:</strong> Your body adapts to constant signals</span>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-600 flex-shrink-0">•</span>
              <span><strong>Preserves effectiveness:</strong> Keeps libido & erection response sharp</span>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-600 flex-shrink-0">•</span>
              <span><strong>Hormone receptor reset:</strong> OFF weeks allow SHBG & receptor sensitivity to normalize</span>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-600 flex-shrink-0">•</span>
              <span><strong>No tolerance buildup:</strong> Cycling ≠ stopping; it's strategic pausing</span>
            </li>
          </ul>
        </Card>

        {/* Navigation */}
        <div className="flex gap-2 mt-6">
          <Link href="/health/protocol" className="flex-1">
            <Button className="w-full">📋 {locale === 'bg' ? 'Протокол' : 'Protocol'}</Button>
          </Link>
          <Link href="/health/routine" className="flex-1">
            <Button variant="secondary" className="w-full">💊 {locale === 'bg' ? 'Дневен режим' : 'Daily Routine'}</Button>
          </Link>
        </div>
      </PageContent>
    </PageShell>
  );
}
