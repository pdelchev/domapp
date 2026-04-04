'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../context/LanguageContext';
import { t } from '../../../lib/i18n';
import { getHealthProfiles } from '../../../lib/api';
import NavBar from '../../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Alert, Spinner, EmptyState } from '../../../components/ui';

// ── Types ──────────────────────────────────────────────────────────

interface Profile {
  id: number; full_name: string; is_primary: boolean;
}

interface BpReading {
  id: string;
  profile_id: number;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  arm: 'left' | 'right';
  posture: 'sitting' | 'standing' | 'lying';
  context: string[];
  notes: string;
  measured_at: string;
  session_id: string | null;
}

type BpStage = 'normal' | 'elevated' | 'stage1' | 'stage2' | 'crisis';

// ── Helpers ────────────────────────────────────────────────────────

const BP_READINGS_KEY = 'domapp_bp_readings';

function loadReadings(): BpReading[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(BP_READINGS_KEY) || '[]'); } catch { return []; }
}

function classifyBp(sys: number, dia: number): BpStage {
  if (sys >= 180 || dia >= 120) return 'crisis';
  if (sys >= 140 || dia >= 90) return 'stage2';
  if (sys >= 130 || dia >= 80) return 'stage1';
  if (sys >= 120 && dia < 80) return 'elevated';
  return 'normal';
}

const STAGE_META: Record<BpStage, { label_en: string; label_bg: string; badgeColor: 'green' | 'yellow' | 'red' | 'purple' }> = {
  normal:   { label_en: 'Normal',              label_bg: 'Нормално',          badgeColor: 'green' },
  elevated: { label_en: 'Elevated',            label_bg: 'Повишено',          badgeColor: 'yellow' },
  stage1:   { label_en: 'Stage 1 HTN',         label_bg: 'Хипертония ст. 1', badgeColor: 'yellow' },
  stage2:   { label_en: 'Stage 2 HTN',         label_bg: 'Хипертония ст. 2', badgeColor: 'red' },
  crisis:   { label_en: 'Hypertensive Crisis',  label_bg: 'Хипертонична криза', badgeColor: 'purple' },
};

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function stddev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (nums.length - 1);
  return Math.round(Math.sqrt(variance) * 10) / 10;
}

function linearRegression(nums: number[]): { slope: number; intercept: number } {
  if (nums.length < 2) return { slope: 0, intercept: nums[0] || 0 };
  const n = nums.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += nums[i]; sumXY += i * nums[i]; sumXX += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// ── Mini Line Chart ───────────────────────────────────────────────

function MiniChart({ data, color, height = 60 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return null;
  const W = 200;
  const min = Math.min(...data) - 5;
  const max = Math.max(...data) + 5;
  const range = max - min || 1;
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * W},${height - ((v - min) / range) * (height - 10) - 5}`
  ).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────

function StatCard({ title, value, subtitle, trend, locale, children }: {
  title: string; value: string | number; subtitle?: string;
  trend?: 'up' | 'down' | 'stable'; locale: string; children?: React.ReactNode;
}) {
  return (
    <Card>
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-gray-900">{value}</span>
        {trend && (
          <span className={`text-sm font-medium ${
            trend === 'down' ? 'text-emerald-600' : trend === 'up' ? 'text-red-600' : 'text-gray-400'
          }`}>
            {trend === 'down' ? '\u2193' : trend === 'up' ? '\u2191' : '\u2192'}
          </span>
        )}
      </div>
      {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
      {children}
    </Card>
  );
}

// ── Context Correlation ───────────────────────────────────────────

function ContextCorrelation({ readings, locale }: { readings: BpReading[]; locale: string }) {
  const contextKeys = ['caffeine', 'exercise', 'medication', 'stressed', 'clinic', 'fasting'];
  const contextLabels: Record<string, { en: string; bg: string; icon: string }> = {
    caffeine:   { en: 'Caffeine',   bg: 'Кафе',       icon: '\u2615' },
    exercise:   { en: 'Exercise',   bg: 'Упражнение', icon: '\ud83c\udfc3' },
    medication: { en: 'Medication', bg: 'Лекарство',  icon: '\ud83d\udc8a' },
    stressed:   { en: 'Stress',     bg: 'Стрес',      icon: '\ud83d\ude30' },
    clinic:     { en: 'Clinic',     bg: 'Клиника',    icon: '\ud83c\udfe5' },
    fasting:    { en: 'Fasting',    bg: 'Гладно',     icon: '\ud83c\udf74' },
  };

  const baselineReadings = readings.filter(r => r.context.length === 0);
  const baselineSys = avg(baselineReadings.map(r => r.systolic));

  const correlations = contextKeys.map(key => {
    const withContext = readings.filter(r => r.context.includes(key));
    if (withContext.length < 2) return { key, count: withContext.length, diff: 0 };
    const contextAvg = avg(withContext.map(r => r.systolic));
    return { key, count: withContext.length, diff: baselineSys > 0 ? contextAvg - baselineSys : 0 };
  }).filter(c => c.count >= 2).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  if (correlations.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        {locale === 'bg'
          ? 'Отбелязвайте контекста на измерванията за корелационен анализ.'
          : 'Tag your readings with context for correlation analysis.'}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {correlations.map(c => {
        const info = contextLabels[c.key];
        const isPositive = c.diff > 3;
        const isNegative = c.diff < -3;
        const barWidth = Math.min(100, Math.abs(c.diff) * 3);
        return (
          <div key={c.key} className="flex items-center gap-3">
            <span className="text-lg w-6 text-center">{info.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-700">{locale === 'bg' ? info.bg : info.en}</span>
                <span className={`text-sm font-bold tabular-nums ${isPositive ? 'text-red-600' : isNegative ? 'text-emerald-600' : 'text-gray-500'}`}>
                  {c.diff > 0 ? '+' : ''}{c.diff} mmHg
                </span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isPositive ? 'bg-red-400' : isNegative ? 'bg-emerald-400' : 'bg-gray-300'}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">{c.count} {locale === 'bg' ? 'измервания' : 'readings'}</div>
            </div>
          </div>
        );
      })}
      {baselineReadings.length > 0 && (
        <div className="text-[10px] text-gray-400 pt-2 border-t border-gray-100">
          {locale === 'bg' ? 'Базова линия (без контекст):' : 'Baseline (no context):'} {baselineSys} mmHg SYS ({baselineReadings.length} {locale === 'bg' ? 'изм.' : 'readings'})
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function BpStatisticsPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);
  const [readings, setReadings] = useState<BpReading[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const profs = await getHealthProfiles();
      setProfiles(profs);
      const primary = profs.find((p: Profile) => p.is_primary) || profs[0];
      if (primary) {
        setSelectedProfile(primary.id);
        const all = loadReadings().filter((r: BpReading) => r.profile_id === primary.id);
        setReadings(all.sort((a: BpReading, b: BpReading) => a.measured_at.localeCompare(b.measured_at)));
      }
      setError('');
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleProfileChange = (id: string) => {
    const numId = Number(id);
    setSelectedProfile(numId);
    const all = loadReadings().filter(r => r.profile_id === numId);
    setReadings(all.sort((a, b) => a.measured_at.localeCompare(b.measured_at)));
  };

  if (loading) return (
    <PageShell><NavBar /><PageContent size="lg"><Spinner message={t('common.loading', locale)} /></PageContent></PageShell>
  );

  if (readings.length === 0) return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={locale === 'bg' ? 'Статистики' : 'Statistics'}
          onBack={() => router.push('/health/bp')}
          backLabel={locale === 'bg' ? 'Назад' : 'Back'}
        />
        <EmptyState icon="\ud83d\udcca" message={locale === 'bg' ? 'Необходими са измервания за статистика.' : 'Need readings for statistics.'} />
      </PageContent>
    </PageShell>
  );

  // Compute all statistics
  const sysValues = readings.map(r => r.systolic);
  const diaValues = readings.map(r => r.diastolic);
  const pulseValues = readings.filter(r => r.pulse !== null).map(r => r.pulse!);
  const ppValues = readings.map(r => r.systolic - r.diastolic);
  const mapValues = readings.map(r => Math.round(r.diastolic + (r.systolic - r.diastolic) / 3));

  const sysAvg = avg(sysValues);
  const diaAvg = avg(diaValues);
  const sysStd = stddev(sysValues);
  const diaStd = stddev(diaValues);
  const pulseAvg = avg(pulseValues);
  const ppAvg = avg(ppValues);
  const mapAvg = avg(mapValues);

  // Variability index (coefficient of variation)
  const sysCv = sysAvg > 0 ? Math.round((sysStd / sysAvg) * 1000) / 10 : 0;
  const variabilityLevel = sysCv < 8 ? 'low' : sysCv < 12 ? 'moderate' : 'high';

  // Trend projection
  const sysRegression = linearRegression(sysValues);
  const diaRegression = linearRegression(diaValues);
  const sysTrend = sysRegression.slope > 0.3 ? 'up' : sysRegression.slope < -0.3 ? 'down' : 'stable' as 'up' | 'down' | 'stable';
  const projected30Sys = Math.round(sysRegression.intercept + sysRegression.slope * (sysValues.length + 30));
  const projected30Dia = Math.round(diaRegression.intercept + diaRegression.slope * (diaValues.length + 30));

  // Morning vs Evening
  const morning = readings.filter(r => { const h = new Date(r.measured_at).getHours(); return h >= 5 && h < 12; });
  const evening = readings.filter(r => { const h = new Date(r.measured_at).getHours(); return h >= 17 && h < 23; });
  const morningSys = avg(morning.map(r => r.systolic));
  const morningDia = avg(morning.map(r => r.diastolic));
  const eveningSys = avg(evening.map(r => r.systolic));
  const eveningDia = avg(evening.map(r => r.diastolic));

  // White-coat / Masked detection
  const clinicReadings = readings.filter(r => r.context.includes('clinic'));
  const homeReadings = readings.filter(r => !r.context.includes('clinic'));
  const clinicSys = avg(clinicReadings.map(r => r.systolic));
  const homeSys = avg(homeReadings.map(r => r.systolic));
  const whiteCoatDiff = clinicSys - homeSys;
  const hasWhiteCoat = clinicReadings.length >= 3 && homeReadings.length >= 5 && whiteCoatDiff > 15;
  const hasMasked = clinicReadings.length >= 3 && homeReadings.length >= 5 && whiteCoatDiff < -10;

  // Stage distribution
  const stageCount: Record<BpStage, number> = { normal: 0, elevated: 0, stage1: 0, stage2: 0, crisis: 0 };
  readings.forEach(r => { stageCount[classifyBp(r.systolic, r.diastolic)]++; });

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={locale === 'bg' ? 'Статистики за кръвно налягане' : 'Blood Pressure Statistics'}
          onBack={() => router.push('/health/bp')}
          backLabel={locale === 'bg' ? 'Назад' : 'Back'}
          action={
            profiles.length > 1 ? (
              <select
                value={selectedProfile || ''}
                onChange={e => handleProfileChange(e.target.value)}
                className="h-10 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}{p.is_primary ? ' (me)' : ''}</option>
                ))}
              </select>
            ) : undefined
          }
        />

        <Alert type="error" message={error} />

        {/* Summary bar */}
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-800 mb-6">
          {readings.length} {locale === 'bg' ? 'измервания за' : 'readings over'}{' '}
          {Math.ceil((new Date(readings[readings.length - 1].measured_at).getTime() - new Date(readings[0].measured_at).getTime()) / 86400000)}{' '}
          {locale === 'bg' ? 'дни' : 'days'}
        </div>

        {/* Variability Index */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <StatCard
            title={locale === 'bg' ? 'Индекс на вариабилност' : 'Variability Index'}
            value={`${sysCv}%`}
            subtitle={locale === 'bg'
              ? `Систолична SD: ${sysStd} mmHg`
              : `Systolic SD: ${sysStd} mmHg`}
            locale={locale}
          >
            <div className="mt-2">
              <Badge color={variabilityLevel === 'low' ? 'green' : variabilityLevel === 'moderate' ? 'yellow' : 'red'}>
                {variabilityLevel === 'low' ? (locale === 'bg' ? 'Ниска' : 'Low') :
                 variabilityLevel === 'moderate' ? (locale === 'bg' ? 'Умерена' : 'Moderate') :
                 (locale === 'bg' ? 'Висока' : 'High')}
              </Badge>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              {locale === 'bg'
                ? 'CV <8% е добре, 8-12% умерено, >12% високо. Висока вариабилност е рисков фактор.'
                : 'CV <8% is good, 8-12% moderate, >12% high. High variability is a risk factor.'}
            </p>
          </StatCard>

          {/* Pulse Pressure */}
          <StatCard
            title={locale === 'bg' ? 'Пулсово налягане' : 'Pulse Pressure'}
            value={`${ppAvg}`}
            subtitle="mmHg"
            locale={locale}
          >
            <MiniChart data={ppValues.slice(-30)} color={ppAvg > 60 ? '#ef4444' : '#6366f1'} />
            <p className="text-[10px] text-gray-400 mt-2">
              {ppAvg <= 40 ? (locale === 'bg' ? 'Нормално (30-40 mmHg)' : 'Normal (30-40 mmHg)') :
               ppAvg <= 60 ? (locale === 'bg' ? 'Леко повишено (40-60 mmHg)' : 'Slightly elevated (40-60 mmHg)') :
               (locale === 'bg' ? 'Повишено (>60 mmHg). Рисков фактор за сърдечни заболявания.' : 'Elevated (>60 mmHg). Risk factor for cardiovascular disease.')}
            </p>
          </StatCard>

          {/* Mean Arterial Pressure */}
          <StatCard
            title={locale === 'bg' ? 'Средно артериално налягане' : 'Mean Arterial Pressure'}
            value={`${mapAvg}`}
            subtitle="mmHg"
            locale={locale}
          >
            <MiniChart data={mapValues.slice(-30)} color={mapAvg > 100 ? '#ef4444' : '#10b981'} />
            <p className="text-[10px] text-gray-400 mt-2">
              {mapAvg < 70 ? (locale === 'bg' ? 'Ниско (<70). Може да причини органна хипоперфузия.' : 'Low (<70). May cause organ hypoperfusion.') :
               mapAvg <= 100 ? (locale === 'bg' ? 'Нормално (70-100 mmHg)' : 'Normal (70-100 mmHg)') :
               (locale === 'bg' ? 'Повишено (>100 mmHg)' : 'Elevated (>100 mmHg)')}
            </p>
          </StatCard>
        </div>

        {/* Trend Projection */}
        <Card className="mb-6">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
            {locale === 'bg' ? 'Прогноза за тенденцията' : 'Trend Projection'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <div className="text-xs text-gray-500 mb-1">{locale === 'bg' ? 'Текущо средно' : 'Current Average'}</div>
              <div className="text-2xl font-bold text-gray-900">{sysAvg}/{diaAvg}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">{locale === 'bg' ? 'Тенденция' : 'Direction'}</div>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-bold ${sysTrend === 'down' ? 'text-emerald-600' : sysTrend === 'up' ? 'text-red-600' : 'text-gray-500'}`}>
                  {sysTrend === 'down' ? '\u2198' : sysTrend === 'up' ? '\u2197' : '\u2192'}
                </span>
                <span className="text-sm text-gray-600">
                  {sysTrend === 'down' ? (locale === 'bg' ? 'Намаляващо' : 'Decreasing') :
                   sysTrend === 'up' ? (locale === 'bg' ? 'Нарастващо' : 'Increasing') :
                   (locale === 'bg' ? 'Стабилно' : 'Stable')}
                </span>
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {locale === 'bg' ? 'Наклон:' : 'Slope:'} {sysRegression.slope > 0 ? '+' : ''}{Math.round(sysRegression.slope * 100) / 100} mmHg/{locale === 'bg' ? 'изм.' : 'reading'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">{locale === 'bg' ? 'Проекция +30 изм.' : 'Projection +30 readings'}</div>
              <div className={`text-2xl font-bold ${classifyBp(projected30Sys, projected30Dia) === 'normal' ? 'text-emerald-600' : classifyBp(projected30Sys, projected30Dia) === 'elevated' ? 'text-amber-600' : 'text-red-600'}`}>
                {projected30Sys}/{projected30Dia}
              </div>
              <Badge color={STAGE_META[classifyBp(projected30Sys, projected30Dia)].badgeColor}>
                {locale === 'bg' ? STAGE_META[classifyBp(projected30Sys, projected30Dia)].label_bg : STAGE_META[classifyBp(projected30Sys, projected30Dia)].label_en}
              </Badge>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-4 pt-3 border-t border-gray-100">
            {locale === 'bg'
              ? 'Прогнозата е базирана на линейна регресия. За медицински решения се консултирайте с лекар.'
              : 'Projection is based on linear regression. Consult your doctor for medical decisions.'}
          </p>
        </Card>

        {/* Morning vs Evening */}
        <Card className="mb-6">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
            {locale === 'bg' ? 'Сутрин срещу вечер' : 'Morning vs Evening'}
          </div>
          {morning.length >= 2 && evening.length >= 2 ? (
            <div className="space-y-4">
              {/* Bar comparison */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🌅</span>
                    <span className="text-sm font-medium text-gray-700">
                      {locale === 'bg' ? 'Сутрин' : 'Morning'} ({morning.length})
                    </span>
                  </div>
                  <div className="text-3xl font-bold text-gray-900">{morningSys}/{morningDia}</div>
                  <Badge color={STAGE_META[classifyBp(morningSys, morningDia)].badgeColor}>
                    {locale === 'bg' ? STAGE_META[classifyBp(morningSys, morningDia)].label_bg : STAGE_META[classifyBp(morningSys, morningDia)].label_en}
                  </Badge>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🌙</span>
                    <span className="text-sm font-medium text-gray-700">
                      {locale === 'bg' ? 'Вечер' : 'Evening'} ({evening.length})
                    </span>
                  </div>
                  <div className="text-3xl font-bold text-gray-900">{eveningSys}/{eveningDia}</div>
                  <Badge color={STAGE_META[classifyBp(eveningSys, eveningDia)].badgeColor}>
                    {locale === 'bg' ? STAGE_META[classifyBp(eveningSys, eveningDia)].label_bg : STAGE_META[classifyBp(eveningSys, eveningDia)].label_en}
                  </Badge>
                </div>
              </div>
              {/* Difference */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500">
                  {locale === 'bg' ? 'Разлика (сутрин - вечер):' : 'Difference (morning - evening):'}
                </div>
                <div className="flex items-center gap-4 mt-1">
                  <span className={`text-sm font-bold ${morningSys - eveningSys > 15 ? 'text-amber-600' : 'text-gray-700'}`}>
                    SYS: {morningSys - eveningSys > 0 ? '+' : ''}{morningSys - eveningSys} mmHg
                  </span>
                  <span className={`text-sm font-bold ${morningDia - eveningDia > 10 ? 'text-amber-600' : 'text-gray-700'}`}>
                    DIA: {morningDia - eveningDia > 0 ? '+' : ''}{morningDia - eveningDia} mmHg
                  </span>
                </div>
                {morningSys - eveningSys > 20 && (
                  <p className="text-xs text-amber-600 mt-2">
                    {locale === 'bg'
                      ? 'Значителен сутрешен скок. Свързва се с повишен сърдечно-съдов риск.'
                      : 'Significant morning surge. Associated with increased cardiovascular risk.'}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              {locale === 'bg'
                ? 'Необходими са поне 2 сутрешни и 2 вечерни измервания.'
                : 'Need at least 2 morning and 2 evening readings.'}
            </p>
          )}
        </Card>

        {/* White-coat / Masked Detection */}
        <Card className="mb-6">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
            {locale === 'bg' ? 'Клинично vs Домашно' : 'White-Coat / Masked Detection'}
          </div>
          {clinicReadings.length >= 3 && homeReadings.length >= 5 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-xs text-gray-500 mb-1">
                    {locale === 'bg' ? 'В клиника' : 'Clinic'} ({clinicReadings.length})
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {clinicSys}/{avg(clinicReadings.map(r => r.diastolic))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">
                    {locale === 'bg' ? 'Вкъщи' : 'Home'} ({homeReadings.length})
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {homeSys}/{avg(homeReadings.map(r => r.diastolic))}
                  </div>
                </div>
              </div>
              {hasWhiteCoat && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge color="yellow">{locale === 'bg' ? 'Бял халат' : 'White-Coat'}</Badge>
                    <span className="text-sm text-amber-800">
                      +{whiteCoatDiff} mmHg {locale === 'bg' ? 'в клиника' : 'in clinic'}
                    </span>
                  </div>
                  <p className="text-xs text-amber-700 mt-2">
                    {locale === 'bg'
                      ? 'Налягането ви е значително по-високо в клинични условия. Домашните измервания са по-точни за вас.'
                      : 'Your BP is significantly higher in clinical settings. Home readings are more representative for you.'}
                  </p>
                </div>
              )}
              {hasMasked && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge color="red">{locale === 'bg' ? 'Маскирана хипертония' : 'Masked HTN'}</Badge>
                    <span className="text-sm text-red-800">
                      {Math.abs(whiteCoatDiff)} mmHg {locale === 'bg' ? 'по-високо вкъщи' : 'higher at home'}
                    </span>
                  </div>
                  <p className="text-xs text-red-700 mt-2">
                    {locale === 'bg'
                      ? 'Налягането ви е по-високо вкъщи отколкото в клиника. Това изисква внимание!'
                      : 'Your BP is higher at home than in clinic. This requires attention!'}
                  </p>
                </div>
              )}
              {!hasWhiteCoat && !hasMasked && (
                <p className="text-sm text-gray-500">
                  {locale === 'bg'
                    ? 'Няма значителна разлика между клинични и домашни измервания.'
                    : 'No significant difference between clinic and home readings.'}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              {locale === 'bg'
                ? 'Нужни са поне 3 клинични и 5 домашни измервания. Маркирайте клиничните с контекст "Клинично".'
                : 'Need at least 3 clinic and 5 home readings. Tag clinic readings with "Clinic reading" context.'}
            </p>
          )}
        </Card>

        {/* Context Correlations */}
        <Card className="mb-6">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
            {locale === 'bg' ? 'Корелации с контекст' : 'Context Correlations'}
          </div>
          <ContextCorrelation readings={readings} locale={locale} />
        </Card>

        {/* Pulse Pressure Trend */}
        <Card className="mb-6">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {locale === 'bg' ? 'Тенденция на пулсово налягане' : 'Pulse Pressure Trend'}
          </div>
          {ppValues.length >= 2 ? (
            <>
              <MiniChart data={ppValues.slice(-60)} color="#6366f1" height={80} />
              <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                <span>{locale === 'bg' ? 'Средно:' : 'Avg:'} {ppAvg} mmHg</span>
                <span>{locale === 'bg' ? 'Мин:' : 'Min:'} {Math.min(...ppValues)} &middot; {locale === 'bg' ? 'Макс:' : 'Max:'} {Math.max(...ppValues)}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">{locale === 'bg' ? 'Необходими са поне 2 измервания.' : 'Need at least 2 readings.'}</p>
          )}
        </Card>

        {/* MAP Trend */}
        <Card className="mb-6">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {locale === 'bg' ? 'Тенденция на средно артериално налягане' : 'Mean Arterial Pressure Trend'}
          </div>
          {mapValues.length >= 2 ? (
            <>
              <MiniChart data={mapValues.slice(-60)} color="#10b981" height={80} />
              <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                <span>{locale === 'bg' ? 'Средно:' : 'Avg:'} {mapAvg} mmHg</span>
                <span>{locale === 'bg' ? 'Мин:' : 'Min:'} {Math.min(...mapValues)} &middot; {locale === 'bg' ? 'Макс:' : 'Max:'} {Math.max(...mapValues)}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">{locale === 'bg' ? 'Необходими са поне 2 измервания.' : 'Need at least 2 readings.'}</p>
          )}
        </Card>

        {/* Stage Distribution */}
        <Card className="mb-6">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
            {locale === 'bg' ? 'Разпределение по стадий' : 'Stage Distribution'}
          </div>
          <div className="space-y-2">
            {(Object.keys(stageCount) as BpStage[]).map(stage => {
              const count = stageCount[stage];
              const pct = readings.length > 0 ? Math.round((count / readings.length) * 100) : 0;
              const barColor = stage === 'normal' ? 'bg-emerald-400' : stage === 'elevated' ? 'bg-yellow-400' : stage === 'stage1' ? 'bg-orange-400' : stage === 'stage2' ? 'bg-red-400' : 'bg-red-700';
              return (
                <div key={stage} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-gray-600">
                    {locale === 'bg' ? STAGE_META[stage].label_bg : STAGE_META[stage].label_en}
                  </div>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-16 text-right text-xs text-gray-500 tabular-nums">
                    {count} ({pct}%)
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Resting Pulse Stats */}
        {pulseValues.length > 0 && (
          <Card className="mb-6">
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {locale === 'bg' ? 'Статистика на пулса' : 'Pulse Statistics'}
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-900">{pulseAvg}</div>
                <div className="text-xs text-gray-500">{locale === 'bg' ? 'Средно' : 'Average'} bpm</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{Math.min(...pulseValues)}</div>
                <div className="text-xs text-gray-500">{locale === 'bg' ? 'Мин' : 'Min'} bpm</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{Math.max(...pulseValues)}</div>
                <div className="text-xs text-gray-500">{locale === 'bg' ? 'Макс' : 'Max'} bpm</div>
              </div>
            </div>
            {pulseValues.length >= 2 && (
              <div className="mt-3">
                <MiniChart data={pulseValues.slice(-30)} color="#f59e0b" height={50} />
              </div>
            )}
          </Card>
        )}

        {/* Back */}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => router.push('/health/bp')}>
            {locale === 'bg' ? 'Обратно към таблото' : 'Back to Dashboard'}
          </Button>
          <Button variant="secondary" onClick={() => router.push('/health/bp/readings')}>
            {locale === 'bg' ? 'Всички измервания' : 'All Readings'}
          </Button>
        </div>
      </PageContent>
    </PageShell>
  );
}
