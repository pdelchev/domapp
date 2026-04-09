'use client';

/**
 * §PAGE: Unified Health Timeline — "Everything Since Day One"
 * §ROUTE: /health/timeline
 * §PURPOSE: Single page showing ALL metrics going back to first measurement.
 * §UX: Multi-line chart with toggleable metrics + date range selector.
 * §PERF: Reads from denormalized MetricTimeline table — one API call.
 * §NAV: Accessible from Health Hub dashboard "Full Timeline" button.
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { getTimeline } from '../../lib/api';
import {
  PageShell, PageContent, PageHeader, Card, Button,
  Badge, Spinner, Select,
} from '../../components/ui';
import NavBar from '../../components/NavBar';

interface MetricPoint {
  date: string;
  metric_type: string;
  value: number;
  unit: string;
  context: Record<string, any>;
}

const METRIC_CONFIG: Record<string, {
  label: string;
  color: string;
  unit: string;
  group: string;
}> = {
  weight: { label: 'Weight', color: '#6366f1', unit: 'kg', group: 'Body' },
  body_fat: { label: 'Body Fat', color: '#8b5cf6', unit: '%', group: 'Body' },
  bp_systolic: { label: 'Systolic', color: '#ef4444', unit: 'mmHg', group: 'Blood Pressure' },
  bp_diastolic: { label: 'Diastolic', color: '#f97316', unit: 'mmHg', group: 'Blood Pressure' },
  bp_pulse: { label: 'Pulse', color: '#ec4899', unit: 'bpm', group: 'Blood Pressure' },
  mood: { label: 'Mood', color: '#eab308', unit: '1-5', group: 'Wellbeing' },
  energy: { label: 'Energy', color: '#22c55e', unit: '1-5', group: 'Wellbeing' },
  sleep_hours: { label: 'Sleep', color: '#3b82f6', unit: 'hrs', group: 'Wellbeing' },
  sleep_quality: { label: 'Sleep Quality', color: '#6366f1', unit: '1-5', group: 'Wellbeing' },
  water_ml: { label: 'Water', color: '#06b6d4', unit: 'ml', group: 'Wellbeing' },
  pain: { label: 'Pain', color: '#dc2626', unit: '0-10', group: 'Wellbeing' },
  stress: { label: 'Stress', color: '#f59e0b', unit: '1-5', group: 'Wellbeing' },
  dose_adherence: { label: 'Adherence', color: '#10b981', unit: '%', group: 'Supplements' },
  hrv: { label: 'HRV', color: '#14b8a6', unit: 'ms', group: 'Recovery' },
  rhr: { label: 'Resting HR', color: '#f43f5e', unit: 'bpm', group: 'Recovery' },
  recovery_score: { label: 'Recovery', color: '#22c55e', unit: '%', group: 'Recovery' },
  health_score: { label: 'Health Score', color: '#8b5cf6', unit: '/100', group: 'Blood Work' },
  uric_acid: { label: 'Uric Acid', color: '#d946ef', unit: 'µmol/L', group: 'Blood Work' },
  waist_cm: { label: 'Waist', color: '#64748b', unit: 'cm', group: 'Body' },
};

const DATE_RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
  { label: 'All', days: 0 },
];

export default function TimelinePage() {
  const { locale } = useLanguage();
  const router = useRouter();

  const [data, setData] = useState<MetricPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(90);
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(
    new Set(['weight', 'bp_systolic', 'bp_diastolic', 'mood'])
  );

  // §FETCH: Load timeline data
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params: { date_from?: string; metrics?: string } = {};
        if (rangeDays > 0) {
          const from = new Date();
          from.setDate(from.getDate() - rangeDays);
          params.date_from = from.toISOString().split('T')[0];
        }
        if (selectedMetrics.size > 0) {
          params.metrics = [...selectedMetrics].join(',');
        }
        const result = await getTimeline(params);
        setData(result.results || result);
      } catch (e) {
        console.error('Timeline fetch failed:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [rangeDays, selectedMetrics]);

  // §GROUP: Group data by metric type for display
  const groupedByMetric = useMemo(() => {
    const groups: Record<string, MetricPoint[]> = {};
    for (const point of data) {
      if (!groups[point.metric_type]) groups[point.metric_type] = [];
      groups[point.metric_type].push(point);
    }
    return groups;
  }, [data]);

  // §TOGGLE: Add/remove metric from selection
  const toggleMetric = (metric: string) => {
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      if (next.has(metric)) next.delete(metric);
      else next.add(metric);
      return next;
    });
  };

  // §GROUPS: Organize metrics by group for filter panel
  const metricGroups = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const [key, config] of Object.entries(METRIC_CONFIG)) {
      if (!groups[config.group]) groups[config.group] = [];
      groups[config.group].push(key);
    }
    return groups;
  }, []);

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title="Health Timeline"
          onBack={() => router.push('/health')}
        />

        {/* §RANGE: Date range selector */}
        <div className="flex gap-2 mb-4">
          {DATE_RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => setRangeDays(r.days)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                rangeDays === r.days
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* §FILTER: Metric toggle chips grouped by category */}
        <Card className="mb-4">
          <div className="space-y-3">
            {Object.entries(metricGroups).map(([group, metrics]) => (
              <div key={group}>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {group}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {metrics.map(m => {
                    const config = METRIC_CONFIG[m];
                    const isActive = selectedMetrics.has(m);
                    return (
                      <button
                        key={m}
                        onClick={() => toggleMetric(m)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                          isActive
                            ? 'text-white shadow-sm'
                            : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                        style={isActive ? { backgroundColor: config.color } : undefined}
                      >
                        <span>{config.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* §DATA: Metric cards with mini-charts */}
        {loading ? (
          <Spinner message="Loading timeline..." />
        ) : (
          <div className="space-y-4">
            {[...selectedMetrics].map(metric => {
              const config = METRIC_CONFIG[metric];
              const points = groupedByMetric[metric] || [];
              if (!config) return null;

              const latest = points[points.length - 1];
              const first = points[0];
              const delta = latest && first
                ? (latest.value - first.value).toFixed(1)
                : null;

              return (
                <Card key={metric}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: config.color }}
                      />
                      <h3 className="font-semibold text-gray-900">{config.label}</h3>
                    </div>
                    {latest && (
                      <div className="text-right">
                        <span className="text-xl font-bold text-gray-900">
                          {latest.value}
                        </span>
                        <span className="text-sm text-gray-500 ml-1">{config.unit}</span>
                        {delta && parseFloat(delta) !== 0 && (
                          <span className={`text-sm ml-2 font-medium ${
                            parseFloat(delta) < 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {parseFloat(delta) > 0 ? '+' : ''}{delta}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* §CHART: Simple SVG sparkline */}
                  {points.length > 1 ? (
                    <Sparkline points={points} color={config.color} />
                  ) : points.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">
                      No data for this period
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 py-4 text-center">
                      Only 1 data point — need more for a chart
                    </p>
                  )}

                  {/* §DATES: First and last measurement */}
                  {first && latest && first !== latest && (
                    <div className="flex justify-between text-xs text-gray-400 mt-2">
                      <span>{first.date}</span>
                      <span>{points.length} readings</span>
                      <span>{latest.date}</span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}

/**
 * §COMPONENT: Simple SVG sparkline chart.
 * Renders data points as a smooth line with filled area.
 * No external charting library needed.
 */
function Sparkline({
  points,
  color,
}: {
  points: MetricPoint[];
  color: string;
}) {
  const width = 600;
  const height = 80;
  const padding = 4;

  const values = points.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const pathPoints = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const linePath = `M ${pathPoints.join(' L ')}`;
  const areaPath = `${linePath} L ${width - padding},${height} L ${padding},${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20">
      {/* Area fill */}
      <path d={areaPath} fill={color} opacity={0.1} />
      {/* Line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} />
      {/* Latest point dot */}
      {pathPoints.length > 0 && (
        <circle
          cx={pathPoints[pathPoints.length - 1].split(',')[0]}
          cy={pathPoints[pathPoints.length - 1].split(',')[1]}
          r={4}
          fill={color}
        />
      )}
    </svg>
  );
}
