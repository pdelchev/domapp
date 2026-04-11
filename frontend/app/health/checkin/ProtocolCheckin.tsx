'use client';

/**
 * PROTOCOL CHECK-IN COMPONENT
 * ============================
 * スマートデイリーログUI
 *
 * 機能:
 * - アクティブなプロトコルを表示
 * - プロトコルに基づいて必要なフィールドのみ表示
 * - リアルタイムでadherence%を計算
 * - ワンクリックで保存
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/app/context/LanguageContext';
import {
  PageShell, PageContent, PageHeader, Card, Button, Input, Select,
  Badge, Alert, Spinner, FormSection, EmptyState
} from '@/app/components/ui';
import NavBar from '@/app/components/NavBar';
import { apiFetch } from '@/app/lib/api';

interface Protocol {
  id: number;
  name: string;
  status: string;
  adherence_percentage: number;
  confidence_score: number;
  daily_log_fields: string[];
}

interface LogData {
  date: string;
  protocol_id: number | null;
  mood: number | null;
  energy_level: number | null;
  stress_level: number | null;
  weight_kg: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  sleep_hours: number | null;
  sleep_quality: number | null;
  supplements_taken: Record<string, any>;
  diet_notes: string;
  water_intake_ml: number | null;
  exercise_type: string;
  exercise_duration_min: number | null;
  exercise_intensity: string | null;
  protocol_adherence_pct: number;
  protocol_notes: string;
  symptoms: string[];
}

export default function ProtocolCheckin() {
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
  const [todaysFields, setTodaysFields] = useState<string[]>([]);

  const [formData, setFormData] = useState<LogData>({
    date: new Date().toISOString().split('T')[0],
    protocol_id: null,
    mood: null,
    energy_level: null,
    stress_level: null,
    weight_kg: null,
    systolic_bp: null,
    diastolic_bp: null,
    sleep_hours: null,
    sleep_quality: null,
    supplements_taken: {},
    diet_notes: '',
    water_intake_ml: null,
    exercise_type: '',
    exercise_duration_min: null,
    exercise_intensity: null,
    protocol_adherence_pct: 0,
    protocol_notes: '',
    symptoms: [],
  });

  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [aiInsights, setAiInsights] = useState<any[]>([]);

  // Form section states
  const [openSections, setOpenSections] = useState({
    mood: true,
    biometrics: false,
    supplements: true,
    diet: false,
    sleep: false,
    exercise: false,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Load protocols
  useEffect(() => {
    const loadProtocols = async () => {
      try {
        setLoading(true);
        const response = await apiFetch('/api/health/protocol/protocols/?status=active');

        if (response.ok) {
          const data = await response.json();
          setProtocols(data.results || []);

          if (data.results && data.results.length > 0) {
            setSelectedProtocol(data.results[0]);
            setFormData(prev => ({
              ...prev,
              protocol_id: data.results[0].id
            }));
          }
        }
      } catch (err) {
        setError('Failed to load protocols');
      } finally {
        setLoading(false);
      }
    };

    loadProtocols();
  }, []);

  // Load fields for selected protocol
  useEffect(() => {
    const loadFields = async () => {
      if (!selectedProtocol) return;

      try {
        const response = await apiFetch('/api/health/protocol/daily-log-fields/');

        if (response.ok) {
          const data = await response.json();
          setTodaysFields(data.fields || selectedProtocol.daily_log_fields);

          // Initialize supplements
          if (selectedProtocol.daily_log_fields.includes('supplements_taken')) {
            const suppsMap: Record<string, any> = {};
            ['Red Yeast Rice', 'Magnesium', 'Omega-3', 'Vitamin D'].forEach(supp => {
              suppsMap[supp] = { taken: false, time: '', notes: '' };
            });
            setFormData(prev => ({
              ...prev,
              supplements_taken: suppsMap
            }));
          }
        }
      } catch (err) {
        console.error('Failed to load fields:', err);
      }
    };

    loadFields();
  }, [selectedProtocol]);

  // Calculate adherence
  useEffect(() => {
    if (todaysFields.length === 0) return;

    const completedFields = todaysFields.filter(field => {
      const value = formData[field as keyof LogData];
      return value !== null && value !== undefined && value !== '';
    });

    const adherence = (completedFields.length / todaysFields.length) * 100;
    setFormData(prev => ({
      ...prev,
      protocol_adherence_pct: Math.round(adherence)
    }));
  }, [formData, todaysFields]);

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSupplementChange = (supplementName: string, property: 'taken' | 'time' | 'notes', value: any) => {
    setFormData(prev => ({
      ...prev,
      supplements_taken: {
        ...prev.supplements_taken,
        [supplementName]: {
          ...prev.supplements_taken[supplementName],
          [property]: value
        }
      }
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setAiInsights([]);

      const response = await apiFetch('/api/health/protocol/daily-log/', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          protocol: formData.protocol_id
        })
      });

      if (response.ok) {
        const savedLog = await response.json();

        // Show success
        setSuccess('✅ Daily log saved! Generating AI insights...');

        // Fetch insights (they're generated async, so check after 2 seconds)
        setTimeout(async () => {
          try {
            const insightsResponse = await apiFetch(
              `/api/health/protocol/daily-log/${savedLog.id}/`
            );
            if (insightsResponse.ok) {
              const logData = await insightsResponse.json();
              if (logData.ai_insights && logData.ai_insights.insights) {
                setAiInsights(logData.ai_insights.insights);
                setSuccess('✅ Log saved! Insights generated below.');
                setTimeout(() => setSuccess(''), 5000);
              }
            }
          } catch (err) {
            console.error('Failed to fetch insights:', err);
          }
        }, 2000);

        // Reset form
        setFormData(prev => ({
          ...prev,
          date: new Date().toISOString().split('T')[0],
          mood: null,
          energy_level: null,
          stress_level: null,
        }));
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to save log');
      }
    } catch (err) {
      setError('Error saving log');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <NavBar />
        <PageContent>
          <Spinner message="Loading your health protocol..." />
        </PageContent>
      </PageShell>
    );
  }

  if (protocols.length === 0) {
    return (
      <PageShell>
        <NavBar />
        <PageContent>
          <PageHeader title="Daily Health Check-In" />
          <div className="text-center py-12">
            <EmptyState
              icon="🚀"
              message="No active protocols yet."
              subtext="Go to Health Hub to create personalized protocols."
            />
            <Link href="/health">
              <Button variant="primary" className="mt-6">
                Go to Health Hub
              </Button>
            </Link>
          </div>
        </PageContent>
      </PageShell>
    );
  }

  const Slider = ({ label, value, onChange, min = 1, max = 10 }: any) => (
    <div className="mb-4">
      <label className="text-xs font-semibold text-gray-700 block mb-2">{label}</label>
      <div className="flex items-center gap-4">
        <input
          type="range"
          min={min}
          max={max}
          value={value || 5}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="flex-1 h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer"
        />
        <span className="text-lg font-bold text-indigo-600 w-8 text-center">{value || '–'}</span>
      </div>
    </div>
  );

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader title="🏥 Daily Health Check-In" />
        <div className="text-xs text-gray-500 mb-4">
          {formData.date} · {selectedProtocol?.name || 'Select protocol'}
        </div>

        {success && <Alert type="success" message={success} />}
        {error && <Alert type="error" message={error} />}

        {/* Protocol selector */}
        <Card className="mb-6 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Active Protocols</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {protocols.map(protocol => (
              <button
                key={protocol.id}
                onClick={() => {
                  setSelectedProtocol(protocol);
                  setFormData(prev => ({ ...prev, protocol_id: protocol.id }));
                }}
                className={`p-3 rounded-lg text-left transition-all ${
                  selectedProtocol?.id === protocol.id
                    ? 'bg-indigo-100 border-2 border-indigo-600'
                    : 'bg-gray-50 border-2 border-gray-200'
                }`}
              >
                <div className="font-semibold text-sm">{protocol.name}</div>
                <div className="text-xs text-gray-600 mt-1">{protocol.adherence_percentage}% adherence</div>
                <div className="mt-2">
                  <Badge color={protocol.confidence_score > 0.8 ? 'green' : 'yellow'}>
                    {Math.round(protocol.confidence_score * 100)}% confident
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Form sections */}
        <Card>
          <div className="space-y-4">

            {/* Mood & Energy */}
            {todaysFields.includes('mood') && (
              <FormSection title="How are you feeling?" icon="😊" open={openSections.mood} onToggle={() => toggleSection('mood')}>
                {todaysFields.includes('mood') && (
                  <Slider
                    label="Mood (1 = terrible, 10 = excellent)"
                    value={formData.mood}
                    onChange={(val: number) => handleFieldChange('mood', val)}
                  />
                )}
                {todaysFields.includes('energy_level') && (
                  <Slider
                    label="Energy Level"
                    value={formData.energy_level}
                    onChange={(val: number) => handleFieldChange('energy_level', val)}
                  />
                )}
                {todaysFields.includes('stress_level') && (
                  <Slider
                    label="Stress Level"
                    value={formData.stress_level}
                    onChange={(val: number) => handleFieldChange('stress_level', val)}
                  />
                )}
              </FormSection>
            )}

            {/* Biometrics */}
            {todaysFields.some(f => ['weight_kg', 'systolic_bp', 'diastolic_bp'].includes(f)) && (
              <FormSection title="Biometrics" icon="⚡" open={openSections.biometrics} onToggle={() => toggleSection('biometrics')}>
                <div className="grid grid-cols-2 gap-3">
                  {todaysFields.includes('weight_kg') && (
                    <Input
                      label="Weight (kg)"
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      value={formData.weight_kg || ''}
                      onChange={(e) => handleFieldChange('weight_kg', e.target.value ? parseFloat(e.target.value) : null)}
                    />
                  )}
                  {todaysFields.includes('systolic_bp') && (
                    <Input
                      label="Systolic BP"
                      type="number"
                      inputMode="numeric"
                      value={formData.systolic_bp || ''}
                      onChange={(e) => handleFieldChange('systolic_bp', e.target.value ? parseInt(e.target.value) : null)}
                    />
                  )}
                  {todaysFields.includes('diastolic_bp') && (
                    <Input
                      label="Diastolic BP"
                      type="number"
                      inputMode="numeric"
                      value={formData.diastolic_bp || ''}
                      onChange={(e) => handleFieldChange('diastolic_bp', e.target.value ? parseInt(e.target.value) : null)}
                    />
                  )}
                </div>
              </FormSection>
            )}

            {/* Supplements */}
            {todaysFields.includes('supplements_taken') && Object.keys(formData.supplements_taken).length > 0 && (
              <FormSection title="Supplements" icon="💊" open={openSections.supplements} onToggle={() => toggleSection('supplements')}>
                <div className="space-y-3">
                  {Object.entries(formData.supplements_taken).map(([suppName, suppData]) => (
                    <div key={suppName} className="flex items-start gap-3 pb-3 border-b">
                      <input
                        type="checkbox"
                        checked={suppData.taken || false}
                        onChange={(e) => handleSupplementChange(suppName, 'taken', e.target.checked)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <label className="text-sm font-medium text-gray-900">{suppName}</label>
                        {suppData.taken && (
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <Input
                              label="Time"
                              type="time"
                              value={suppData.time || ''}
                              onChange={(e) => handleSupplementChange(suppName, 'time', e.target.value)}
                            />
                            <Input
                              label="Notes"
                              placeholder="with food?"
                              value={suppData.notes || ''}
                              onChange={(e) => handleSupplementChange(suppName, 'notes', e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </FormSection>
            )}

            {/* Diet */}
            {todaysFields.includes('diet_notes') && (
              <FormSection title="Diet" icon="🥗" open={openSections.diet} onToggle={() => toggleSection('diet')}>
                <Select
                  label="How well did you follow the protocol diet?"
                  value={formData.diet_notes}
                  onChange={(e) => handleFieldChange('diet_notes', e.target.value)}
                  options={[
                    { value: '', label: '-- Select --' },
                    { value: 'perfect', label: '✅ Perfect' },
                    { value: 'mostly', label: '🟢 Mostly' },
                    { value: 'some', label: '🟡 Some deviations' },
                    { value: 'poor', label: '🔴 Poor' },
                  ]}
                />
              </FormSection>
            )}

            {/* Sleep */}
            {todaysFields.some(f => ['sleep_hours', 'sleep_quality'].includes(f)) && (
              <FormSection title="Sleep" icon="😴" open={openSections.sleep} onToggle={() => toggleSection('sleep')}>
                {todaysFields.includes('sleep_hours') && (
                  <Input
                    label="Hours of sleep last night"
                    type="number"
                    step="0.5"
                    inputMode="decimal"
                    value={formData.sleep_hours || ''}
                    onChange={(e) => handleFieldChange('sleep_hours', e.target.value ? parseFloat(e.target.value) : null)}
                  />
                )}
                {todaysFields.includes('sleep_quality') && (
                  <Slider
                    label="Sleep quality (1-10)"
                    value={formData.sleep_quality}
                    onChange={(val: number) => handleFieldChange('sleep_quality', val)}
                  />
                )}
              </FormSection>
            )}

            {/* Exercise */}
            {todaysFields.includes('exercise_type') && (
              <FormSection title="Exercise" icon="🏃" open={openSections.exercise} onToggle={() => toggleSection('exercise')}>
                <Input
                  label="Exercise type"
                  placeholder="e.g., cardio, yoga, strength"
                  value={formData.exercise_type}
                  onChange={(e) => handleFieldChange('exercise_type', e.target.value)}
                />
                {todaysFields.includes('exercise_duration_min') && (
                  <Input
                    label="Duration (minutes)"
                    type="number"
                    inputMode="numeric"
                    className="mt-3"
                    value={formData.exercise_duration_min || ''}
                    onChange={(e) => handleFieldChange('exercise_duration_min', e.target.value ? parseInt(e.target.value) : null)}
                  />
                )}
              </FormSection>
            )}
          </div>
        </Card>

        {/* Adherence bar */}
        <Card className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Today's Progress</h3>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-indigo-600">Completion</span>
            <span className="text-xs font-semibold text-indigo-600">{formData.protocol_adherence_pct}%</span>
          </div>
          <div className="overflow-hidden h-2 bg-gray-200 rounded-full">
            <div
              style={{ width: `${formData.protocol_adherence_pct}%` }}
              className="h-full bg-indigo-600 transition-all duration-300"
            ></div>
          </div>
          {formData.protocol_adherence_pct === 100 && (
            <div className="mt-3 p-2 bg-green-50 text-green-800 text-xs rounded">
              🎉 Perfect completion! Excellent adherence today!
            </div>
          )}
        </Card>

        {/* AI Insights Section (shows after save) */}
        {aiInsights && aiInsights.length > 0 && (
          <Card className="mt-6 bg-gradient-to-br from-purple-50 to-blue-50 border-l-4 border-purple-500">
            <h3 className="text-sm font-semibold text-purple-900 mb-4">
              🤖 AI Insights for You
            </h3>
            <div className="space-y-3">
              {aiInsights.map((insight: any, idx: number) => (
                <div
                  key={idx}
                  className="bg-white rounded-lg p-3 border-l-2 border-purple-400"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg mt-0.5">
                      {insight.priority === 'critical' ? '⚠️' :
                       insight.priority === 'high' ? '🔴' :
                       insight.priority === 'medium' ? '🟡' : '🟢'}
                    </span>
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm text-gray-900">
                        {insight.title}
                      </h4>
                      <p className="text-xs text-gray-600 mt-1">
                        {insight.description}
                      </p>
                      {insight.actionable_steps && insight.actionable_steps.length > 0 && (
                        <div className="mt-2 text-xs text-gray-700">
                          <strong>Next steps:</strong>
                          <ul className="list-disc list-inside mt-1">
                            {insight.actionable_steps.slice(0, 2).map((step: any, sIdx: number) => (
                              <li key={sIdx}>
                                {typeof step === 'string' ? step : step.step}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="mt-2">
                        <Badge
                          color={
                            insight.priority === 'critical' ? 'red' :
                            insight.priority === 'high' ? 'red' :
                            insight.priority === 'medium' ? 'yellow' : 'green'
                          }
                        >
                          {insight.priority.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-purple-600 mt-4 italic">
              💡 These insights are based on your actual data. Check your recommendations dashboard for more.
            </p>
          </Card>
        )}

        {/* Action buttons */}
        <div className="mt-6 flex gap-3">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving || formData.protocol_adherence_pct < 30}
            className="flex-1"
          >
            {saving ? 'Saving...' : '✅ Save Log'}
          </Button>
          <Button
            variant="secondary"
            href="/health"
            className="flex-1"
          >
            Back
          </Button>
        </div>
      </PageContent>
    </PageShell>
  );
}
