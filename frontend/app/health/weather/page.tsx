'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/app/context/LanguageContext';
import {
  PageShell, PageContent, PageHeader, Card, Input, Select,
  Button, Spinner, Alert, Badge, FormSection,
} from '@/app/components/ui';
import NavBar from '@/app/components/NavBar';
import {
  getHealthProfiles, getWeatherTimeline, createWeather,
  getSymptomCorrelations,
} from '@/app/lib/api';

interface Profile {
  id: number;
  full_name: string;
}

interface WeatherSnapshot {
  id: number;
  date: string;
  location: string;
  temperature_celsius?: number;
  temp_min?: number;
  temp_max?: number;
  humidity_percent?: number;
  pressure_hpa?: number;
  precipitation_mm?: number;
  air_quality_index?: number;
  condition: string;
  condition_detail: string;
}

interface Correlation {
  trigger_type: string;
  trigger_label: string;
  trigger_key: string;
  days_with_symptom_when_present: number;
  days_when_present: number;
  present_rate: number;
  lift: number;
}

interface SymptomCategory {
  occurrences: number;
  days_with_symptom: number;
  window_days: number;
  top_triggers: Correlation[];
}

interface CorrelationData {
  window_days: number;
  total_symptoms: number;
  by_category: Record<string, SymptomCategory>;
}

const CONDITION_ICONS: Record<string, string> = {
  clear: '☀️',
  cloudy: '☁️',
  rainy: '🌧️',
  snowy: '❄️',
  stormy: '⛈️',
  fog: '🌫️',
  unknown: '❓',
};

export default function WeatherPage() {
  const { locale } = useLanguage();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot[]>([]);
  const [correlations, setCorrelations] = useState<CorrelationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state for manual weather entry
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formLocation, setFormLocation] = useState('');
  const [formTemp, setFormTemp] = useState('');
  const [formHumidity, setFormHumidity] = useState('');
  const [formPressure, setFormPressure] = useState('');
  const [formCondition, setFormCondition] = useState('unknown');
  const [formConditionDetail, setFormConditionDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load profiles on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await getHealthProfiles();
        setProfiles(data);
        if (data.length > 0) {
          setSelectedProfile(data[0].id);
        }
      } catch (e) {
        setError('Failed to load profiles');
      }
    })();
  }, []);

  // Load weather timeline when profile changes
  useEffect(() => {
    if (selectedProfile) {
      loadWeatherTimeline();
    }
  }, [selectedProfile]);

  const loadWeatherTimeline = useCallback(async () => {
    if (!selectedProfile) return;
    setLoading(true);
    try {
      const data = await getWeatherTimeline(selectedProfile, 90);
      setWeather(data.snapshots || []);

      // Also load correlations
      const corrData = await getSymptomCorrelations({ profile: selectedProfile, days: 90 });
      setCorrelations(corrData);
    } catch (e) {
      setError('Failed to load weather data');
    } finally {
      setLoading(false);
    }
  }, [selectedProfile]);

  const handleSubmitWeather = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile) return;

    setSubmitting(true);
    try {
      await createWeather({
        profile: selectedProfile,
        date: formDate,
        location: formLocation,
        temperature_celsius: formTemp ? parseFloat(formTemp) : null,
        humidity_percent: formHumidity ? parseInt(formHumidity, 10) : null,
        pressure_hpa: formPressure ? parseFloat(formPressure) : null,
        condition: formCondition,
        condition_detail: formConditionDetail,
      });

      // Reset form
      setFormLocation('');
      setFormTemp('');
      setFormHumidity('');
      setFormPressure('');
      setFormCondition('unknown');
      setFormConditionDetail('');

      // Reload timeline
      await loadWeatherTimeline();
    } catch (e) {
      setError('Failed to save weather data');
    } finally {
      setSubmitting(false);
    }
  };

  const profile = profiles.find(p => p.id === selectedProfile);

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader title="Weather Tracker" />

        {/* Profile selector */}
        <Card className="mb-6">
          <Select
            label="Health Profile"
            value={selectedProfile?.toString() || ''}
            onChange={(e) => setSelectedProfile(parseInt(e.target.value, 10))}
          >
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </Select>
        </Card>

        <Alert type="error" message={error} />

        {/* Weather entry form */}
        {selectedProfile && (
          <Card className="mb-6">
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-900">Log Weather</h3>
              <p className="text-xs text-gray-500 mt-1">
                Manually log weather data for correlation analysis with symptoms.
              </p>
            </div>

            <form onSubmit={handleSubmitWeather} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />

                <Input
                  label="Location"
                  placeholder="e.g., Sofia, Bulgaria"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                />

                <Input
                  label="Temperature (°C)"
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g., 22"
                  step="0.1"
                  value={formTemp}
                  onChange={(e) => setFormTemp(e.target.value)}
                />

                <Input
                  label="Humidity (%)"
                  type="number"
                  inputMode="numeric"
                  placeholder="0-100"
                  min="0"
                  max="100"
                  value={formHumidity}
                  onChange={(e) => setFormHumidity(e.target.value)}
                />

                <Input
                  label="Pressure (hPa)"
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g., 1013"
                  step="0.1"
                  value={formPressure}
                  onChange={(e) => setFormPressure(e.target.value)}
                />

                <Select
                  label="Condition"
                  value={formCondition}
                  onChange={(e) => setFormCondition(e.target.value)}
                >
                  <option value="unknown">Unknown</option>
                  <option value="clear">Clear</option>
                  <option value="cloudy">Cloudy</option>
                  <option value="rainy">Rainy</option>
                  <option value="snowy">Snowy</option>
                  <option value="stormy">Stormy</option>
                  <option value="fog">Fog</option>
                </Select>
              </div>

              <Input
                label="Details (optional)"
                placeholder="e.g., light rain, scattered clouds"
                value={formConditionDetail}
                onChange={(e) => setFormConditionDetail(e.target.value)}
              />

              <div className="flex gap-2 justify-end">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFormTemp('');
                    setFormHumidity('');
                    setFormPressure('');
                    setFormCondition('unknown');
                    setFormConditionDetail('');
                  }}
                >
                  Clear
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Weather'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Correlations insights */}
        {correlations && Object.keys(correlations.by_category).length > 0 && (
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                <span>🔍 Weather-Symptom Patterns</span>
              </h3>
              <p className="text-xs text-blue-700 mt-1">
                Correlations are hypothesis-generating, not causal. Consider confounders.
              </p>
            </div>

            <div className="space-y-4">
              {Object.entries(correlations.by_category).map(([category, data]) => {
                if (data.top_triggers.length === 0) return null;

                return (
                  <div key={category} className="bg-white rounded-lg p-3 border border-blue-100">
                    <div className="font-medium text-sm text-gray-900 capitalize mb-2">
                      {category} ({data.days_with_symptom} days)
                    </div>

                    <div className="space-y-2">
                      {data.top_triggers.map((trigger, idx) => (
                        <div key={idx} className="text-xs bg-blue-50 rounded p-2">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">
                                {trigger.trigger_label}
                              </div>
                              <div className="text-gray-600 mt-0.5">
                                Symptom in {trigger.days_with_symptom_when_present}/{trigger.days_when_present} days when present
                                <br />
                                Lift: +{(trigger.lift * 100).toFixed(0)}% higher risk
                              </div>
                            </div>
                            <Badge color="blue">{(trigger.present_rate * 100).toFixed(0)}%</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Weather timeline */}
        {loading ? (
          <Spinner message="Loading weather data..." />
        ) : weather.length > 0 ? (
          <Card padding={false}>
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">
                Weather Timeline ({weather.length} days)
              </h3>
            </div>

            <div className="divide-y divide-gray-200">
              {weather.map((w) => (
                <div key={w.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">
                          {CONDITION_ICONS[w.condition as keyof typeof CONDITION_ICONS] || '❓'}
                        </span>
                        <div>
                          <div className="font-medium text-sm text-gray-900">
                            {new Date(w.date + 'T00:00:00').toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-US', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            } as Intl.DateTimeFormatOptions)}
                          </div>
                          <div className="text-xs text-gray-600">
                            {w.location}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-right text-xs">
                      {w.temperature_celsius !== null && (
                        <div>
                          <div className="text-gray-500">Temp</div>
                          <div className="font-medium text-gray-900">
                            {w.temperature_celsius}°C
                          </div>
                        </div>
                      )}
                      {w.humidity_percent !== null && (
                        <div>
                          <div className="text-gray-500">Humidity</div>
                          <div className="font-medium text-gray-900">
                            {w.humidity_percent}%
                          </div>
                        </div>
                      )}
                      {w.pressure_hpa !== null && w.pressure_hpa !== undefined && (
                        <div>
                          <div className="text-gray-500">Pressure</div>
                          <div className="font-medium text-gray-900">
                            {w.pressure_hpa!.toFixed(0)} hPa
                          </div>
                        </div>
                      )}
                      {w.precipitation_mm !== null && (
                        <div>
                          <div className="text-gray-500">Rain</div>
                          <div className="font-medium text-gray-900">
                            {w.precipitation_mm} mm
                          </div>
                        </div>
                      )}
                      {w.air_quality_index !== null && w.air_quality_index !== undefined && (
                        <div>
                          <div className="text-gray-500">AQI</div>
                          <div className={`font-medium ${
                            w.air_quality_index! > 150 ? 'text-red-600' :
                            w.air_quality_index! > 100 ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>
                            {w.air_quality_index}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {w.condition_detail && (
                    <div className="text-xs text-gray-600 mt-2">
                      {w.condition_detail}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card className="text-center py-12">
            <div className="text-4xl mb-2">🌦️</div>
            <p className="text-sm text-gray-600">
              No weather data yet. Start by logging weather manually above.
            </p>
          </Card>
        )}
      </PageContent>
    </PageShell>
  );
}
