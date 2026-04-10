'use client';

import React, { useEffect, useState } from 'react';
import { Card, Spinner, Badge } from './ui';

// ─── Simple Chart Components (no external charting library) ───

interface ChartBarProps {
  label: string;
  value: number;
  maxValue: number;
  color?: string;
}

function ChartBar({ label, value, maxValue, color = 'bg-indigo-600' }: ChartBarProps) {
  const percentage = (value / maxValue) * 100;
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-32 text-sm font-medium text-gray-700">{label}</div>
      <div className="flex-1">
        <div className="h-6 bg-gray-100 rounded overflow-hidden">
          <div
            className={`h-full ${color} transition-all`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
      <div className="w-20 text-right text-sm font-semibold text-gray-900">
        €{Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </div>
    </div>
  );
}

// ─── Rent Collection Summary ───

interface RentCollectionChartProps {
  propertyId?: number;
  year?: number;
}

export function RentCollectionChart({ propertyId, year }: RentCollectionChartProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!propertyId) return;

    const fetchData = async () => {
      try {
        const { getPropertyReport } = await import('@/app/lib/api');
        const report = await getPropertyReport(propertyId, year);

        setData({
          due: report.income.due_total,
          collected: report.income.collected_total,
          pending: report.income.pending_total,
          rate: report.income.collection_rate,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [propertyId, year]);

  if (loading) return <Spinner />;
  if (error) return <div className="text-red-600 text-sm">{error}</div>;
  if (!data) return null;

  const maxValue = Math.max(data.due, data.collected) || 1;

  return (
    <Card>
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Rent Collection</h3>
      <div className="space-y-4">
        <div>
          <ChartBar label="Rent Due" value={data.due} maxValue={maxValue} color="bg-blue-600" />
          <ChartBar label="Collected" value={data.collected} maxValue={maxValue} color="bg-green-600" />
          <ChartBar label="Pending" value={data.pending} maxValue={maxValue} color="bg-amber-600" />
        </div>
        <div className="pt-4 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Collection Rate</span>
            <Badge color="indigo">{data.rate}%</Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Expense Breakdown ───

interface ExpenseBreakdownProps {
  propertyId?: number;
  year?: number;
}

export function ExpenseBreakdown({ propertyId, year }: ExpenseBreakdownProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Record<string, number>>({});

  const colors = [
    'bg-blue-600', 'bg-green-600', 'bg-amber-600', 'bg-red-600',
    'bg-purple-600', 'bg-pink-600', 'bg-cyan-600', 'bg-orange-600',
  ];

  useEffect(() => {
    if (!propertyId) return;

    const fetchData = async () => {
      try {
        const { getPropertyReport } = await import('@/app/lib/api');
        const report = await getPropertyReport(propertyId, year);
        setExpenses(report.expenses.by_category);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [propertyId, year]);

  if (loading) return <Spinner />;
  if (error) return <div className="text-red-600 text-sm">{error}</div>;

  const entries = Object.entries(expenses);
  const total = entries.reduce((sum, [, val]) => sum + val, 0);

  return (
    <Card>
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Expense Breakdown</h3>
      <div className="space-y-3">
        {entries.map(([category, value], idx) => (
          <div key={category}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-gray-700">{category}</span>
              <span className="text-sm font-semibold text-gray-900">
                €{Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="h-4 bg-gray-100 rounded overflow-hidden">
              <div
                className={`h-full ${colors[idx % colors.length]}`}
                style={{ width: `${(value / total) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Property Comparison ───

interface PropertyComparisonProps {
  year?: number;
}

export function PropertyComparison({ year }: PropertyComparisonProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [properties, setProperties] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { getFinancialTaxReport } = await import('@/app/lib/api');
        const report = await getFinancialTaxReport(year);
        setProperties(report.properties);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [year]);

  if (loading) return <Spinner />;
  if (error) return <div className="text-red-600 text-sm">{error}</div>;

  const maxValue = Math.max(...properties.map(p => p.gross_rent)) || 1;

  return (
    <Card>
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Property Comparison</h3>
      <div className="space-y-6">
        {properties.map((prop) => (
          <div key={prop.property.id} className="border-b border-gray-100 pb-4 last:border-0">
            <h4 className="font-medium text-gray-900 mb-3">{prop.property.name}</h4>
            <div className="space-y-2">
              <ChartBar label="Income" value={prop.gross_rent} maxValue={maxValue} color="bg-blue-600" />
              <ChartBar label="Expenses" value={prop.total_deductible} maxValue={maxValue} color="bg-red-600" />
              <ChartBar label="Taxable" value={prop.taxable_income} maxValue={maxValue} color="bg-green-600" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Monthly Summary ───

interface MonthlyTrendProps {
  propertyId?: number;
  year?: number;
}

export function MonthlyTrend({ propertyId, year }: MonthlyTrendProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    if (!propertyId) return;

    const fetchData = async () => {
      try {
        const { getPropertyReport } = await import('@/app/lib/api');
        const report = await getPropertyReport(propertyId, year);
        setSummary(report.summary);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [propertyId, year]);

  if (loading) return <Spinner />;
  if (error) return <div className="text-red-600 text-sm">{error}</div>;
  if (!summary) return null;

  return (
    <Card>
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Financial Summary</h3>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-4 bg-blue-50 rounded-lg">
          <div className="text-sm font-medium text-gray-600">Total Income</div>
          <div className="text-2xl font-bold text-blue-600 mt-2">
            €{Number(summary.total_income).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="text-center p-4 bg-red-50 rounded-lg">
          <div className="text-sm font-medium text-gray-600">Total Expenses</div>
          <div className="text-2xl font-bold text-red-600 mt-2">
            €{Number(summary.total_expenses).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="text-center p-4 bg-green-50 rounded-lg">
          <div className="text-sm font-medium text-gray-600">Net Income</div>
          <div className="text-2xl font-bold text-green-600 mt-2">
            €{Number(summary.net_income).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between">
          <span className="text-sm text-gray-600">Expense Ratio</span>
          <span className="text-sm font-semibold text-gray-900">
            {Number(summary.expense_ratio).toFixed(1)}%
          </span>
        </div>
      </div>
    </Card>
  );
}

// ─── Year-over-Year Comparison ───

interface YoYComparisonProps {
  year?: number;
}

export function YoYComparison({ year }: YoYComparisonProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { getAnnualReport } = await import('@/app/lib/api');
        const data = await getAnnualReport(year);
        setReport(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [year]);

  if (loading) return <Spinner />;
  if (error) return <div className="text-red-600 text-sm">{error}</div>;
  if (!report) return null;

  const yoY = report.yoy_change;
  const metrics = [
    { label: 'Gross Rent', key: 'gross_rent', color: 'bg-blue-600' },
    { label: 'Expenses', key: 'expenses', color: 'bg-red-600' },
    { label: 'Taxable Income', key: 'taxable_income', color: 'bg-green-600' },
  ];

  const maxValue = Math.max(
    report.current.total_gross_rent,
    report.previous.total_gross_rent
  ) || 1;

  return (
    <Card>
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Year-over-Year</h3>
      <div className="space-y-6">
        {metrics.map(({ label, key, color }) => (
          <div key={key}>
            <h4 className="font-medium text-gray-900 mb-3">{label}</h4>
            <div className="space-y-2">
              <ChartBar
                label={String(report.previous_year)}
                value={yoY[key] ? report.previous[`total_${key}`] : 0}
                maxValue={maxValue}
                color="bg-gray-400"
              />
              <ChartBar
                label={String(report.current_year)}
                value={yoY[key] ? report.current[`total_${key}`] : 0}
                maxValue={maxValue}
                color={color}
              />
            </div>
            {yoY[key] && (
              <div className="mt-2 text-sm text-gray-600">
                Change: {yoY[key].percentage > 0 ? '+' : ''}{yoY[key].percentage.toFixed(1)}%
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
