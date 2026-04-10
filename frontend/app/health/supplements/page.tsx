'use client';

/**
 * §PAGE: Medicines & Supplements Cabinet
 * §ROUTE: /health/supplements
 * §PURPOSE: Unified view of all medicines (from health hub) + supplements/vitamins
 *   with photos, schedules, stock levels, interaction warnings, and tracking.
 * §UX: Card grid with pill photos — optimized for visual identification.
 * §NAV: Linked from Health Hub dashboard. Also shows active medicines from main hub.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { getSupplements, getSupplementInteractions, createSupplement, suggestSupplementTiming, getUnifiedHealthSummary } from '../../lib/api';
import {
  PageShell, PageContent, PageHeader, Card, Button,
  Badge, Spinner, Alert, EmptyState, Input, Select, Textarea,
} from '../../components/ui';
import NavBar from '../../components/NavBar';

interface Supplement {
  id: number;
  name: string;
  name_bg: string;
  category: string;
  form: string;
  color: string;
  shape: string;
  photo: string | null;
  photo_closeup: string | null;
  strength: string;
  strength_unit: string;
  manufacturer: string;
  is_prescription: boolean;
  is_active: boolean;
  current_stock: number;
  days_remaining: number | null;
  active_schedules: number;
  started_at: string | null;
  linked_biomarkers: string[];
  _from_health_summary?: boolean; // Mark medicines from health summary
}

const CATEGORY_COLORS: Record<string, string> = {
  supplement: 'indigo',
  vitamin: 'yellow',
  mineral: 'gray',
  medication: 'red',
  otc: 'blue',
  injection: 'purple',
  herb: 'green',
  probiotic: 'green',
  protein: 'blue',
  other: 'gray',
};

const CATEGORY_ICONS: Record<string, string> = {
  supplement: '🧬',
  vitamin: '☀️',
  mineral: '⚙️',
  medication: '💊',
  otc: '🏪',
  injection: '💉',
  herb: '🌿',
  probiotic: '🦠',
  protein: '💪',
  other: '📦',
};

export default function SupplementsPage() {
  const { locale } = useLanguage();
  const router = useRouter();

  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [showAdd, setShowAdd] = useState(false);
  const [interactions, setInteractions] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [supps, warnings, healthSummary] = await Promise.all([
        getSupplements(filter === 'all' ? undefined : { active: filter === 'active' }),
        getSupplementInteractions(),
        getUnifiedHealthSummary().catch(() => null), // Get active interventions/medicines
      ]);

      // Combine supplements with active medicines/interventions from health summary
      let combined = [...supps];

      if (healthSummary?.active_interventions) {
        // Add medicines from health summary (convert to supplement format)
        const medicines = healthSummary.active_interventions.map((med: any) => ({
          id: med.id,
          name: med.name,
          name_bg: med.name,
          category: 'medication',
          form: med.frequency ? `${med.frequency}` : 'tablet',
          color: '',
          shape: '',
          photo: null,
          photo_closeup: null,
          strength: med.dose || '',
          strength_unit: '',
          manufacturer: '',
          is_prescription: true,
          is_active: true,
          current_stock: 0,
          days_remaining: null,
          active_schedules: 0,
          started_at: med.started_on,
          linked_biomarkers: [],
          _from_health_summary: true, // Mark as from health summary
        }));
        combined = [...medicines, ...combined];
      }

      setSupplements(combined);
      setInteractions(warnings);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={locale === 'bg' ? 'Лекарства и добавки' : 'Medicines & Supplements'}
          onBack={() => router.push('/health')}
          action={
            <Button variant="primary" onClick={() => setShowAdd(true)}>
              {locale === 'bg' ? '+ Добави' : '+ Add'}
            </Button>
          }
        />

        <Alert type="error" message={error} />

        {/* §WARN: Interaction warnings */}
        {interactions.length > 0 && (
          <Card className="mb-4 border-yellow-300 bg-yellow-50">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="font-semibold text-yellow-800">Interaction Warnings</h3>
                {interactions.map((w, i) => (
                  <p key={i} className="text-sm text-yellow-700 mt-1">
                    <strong>{w.supplement_a}</strong> + <strong>{w.supplement_b}</strong>: {w.note}
                  </p>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* §FILTER: Active/Inactive toggle */}
        <div className="flex gap-2 mb-4">
          {(['active', 'inactive', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <Spinner message={locale === 'bg' ? 'Зарежда лекарства...' : 'Loading medicines...'} />
        ) : supplements.length === 0 ? (
          <EmptyState
            icon="💊"
            message={locale === 'bg' ? 'Няма лекарства или добавки. Добавете първото си лекарство или витамин.' : 'No medicines or supplements. Add your first pill or vitamin.'}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {supplements.map(s => (
              <Card key={s.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <div className="flex gap-4">
                  {/* §PHOTO: Pill image or category icon */}
                  <div className="w-20 h-20 rounded-xl bg-gray-100 border border-gray-200 flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {s.photo_closeup ? (
                      <img src={s.photo_closeup} alt={s.name} className="w-full h-full object-cover" />
                    ) : s.photo ? (
                      <img src={s.photo} alt={s.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl">{CATEGORY_ICONS[s.category] || '💊'}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-gray-900 truncate">{s.name}</h3>
                      <Badge color={(CATEGORY_COLORS[s.category] || 'gray') as any}>
                        {s.category}
                      </Badge>
                    </div>

                    {s.strength && (
                      <p className="text-sm text-gray-500 mt-0.5">{s.strength}</p>
                    )}

                    {/* §VISUAL: Pill description for elderly */}
                    {(s.color || s.shape) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {[s.color, s.shape, s.form].filter(Boolean).join(' • ')}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-2">
                      {/* Schedules count */}
                      {s.active_schedules > 0 && (
                        <span className="text-xs text-indigo-600 font-medium">
                          {s.active_schedules} schedule{s.active_schedules > 1 ? 's' : ''}
                        </span>
                      )}

                      {/* §STOCK: Days remaining with color coding */}
                      {s.days_remaining !== null && (
                        <span className={`text-xs font-medium ${
                          s.days_remaining <= 3 ? 'text-red-600' :
                          s.days_remaining <= 7 ? 'text-amber-600' :
                          'text-gray-500'
                        }`}>
                          {s.days_remaining}d left
                        </span>
                      )}

                      {/* Rx indicator */}
                      {s.is_prescription && (
                        <span className="text-xs text-red-500 font-medium">Rx</span>
                      )}
                    </div>

                    {/* §BIOMARKER: Linked biomarkers */}
                    {s.linked_biomarkers.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {s.linked_biomarkers.map(b => (
                          <span key={b} className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* §MODAL: Add supplement form (simplified — full version would be a separate page) */}
        {showAdd && (
          <AddSupplementModal
            onClose={() => setShowAdd(false)}
            onSaved={() => { setShowAdd(false); fetchData(); }}
          />
        )}
      </PageContent>
    </PageShell>
  );
}

/**
 * §MODAL: Add supplement form.
 * Defined outside the page component to avoid focus-loss on re-render.
 */
function AddSupplementModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locale } = useLanguage();
  const [form, setForm] = useState({
    name: '', category: 'supplement', form: 'tablet',
    strength: '', color: '', shape: '',
    pack_size: '', current_stock: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // §CIRCADIAN: live timing suggestion as the user types
  const [suggestion, setSuggestion] = useState<{
    time_slot: string;
    reason: string;
    reason_bg: string;
    confidence: 'high' | 'medium' | 'low';
    take_with_food: boolean;
    take_on_empty_stomach: boolean;
    alternatives: string[];
    avoid_with: string[];
  } | null>(null);

  useEffect(() => {
    if (!form.name || form.name.trim().length < 3) { setSuggestion(null); return; }
    const handle = setTimeout(() => {
      suggestSupplementTiming({ name: form.name, category: form.category, form: form.form })
        .then(setSuggestion)
        .catch(() => setSuggestion(null));
    }, 400);
    return () => clearTimeout(handle);
  }, [form.name, form.category, form.form]);

  const SLOT_LABEL: Record<string, { en: string; bg: string; icon: string }> = {
    morning:   { en: 'Morning',     bg: 'Сутрин',     icon: '🌅' },
    fasted:    { en: 'Fasted',      bg: 'На гладно',  icon: '🥛' },
    breakfast: { en: 'Breakfast',   bg: 'Закуска',    icon: '🍳' },
    midday:    { en: 'Midday',      bg: 'По обяд',    icon: '☀️' },
    lunch:     { en: 'Lunch',       bg: 'Обяд',       icon: '🍽️' },
    afternoon: { en: 'Afternoon',   bg: 'Следобед',   icon: '🌤️' },
    dinner:    { en: 'Dinner',      bg: 'Вечеря',     icon: '🍝' },
    evening:   { en: 'Evening',     bg: 'Вечер',      icon: '🌆' },
    bedtime:   { en: 'Bedtime',     bg: 'Преди сън',  icon: '🌙' },
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createSupplement({
        ...form,
        pack_size: form.pack_size ? parseInt(form.pack_size) : null,
        current_stock: form.current_stock ? parseInt(form.current_stock) : 0,
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Add Supplement</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl">&times;</button>
        </div>

        <Alert type="error" message={error} />

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Name"
            required
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., Vitamin D3 2000IU"
          />

          {/* §CIRCADIAN: timing suggestion hint */}
          {suggestion && (
            <div className={`rounded-xl border p-3 ${
              suggestion.confidence === 'high' ? 'bg-indigo-50 border-indigo-200' :
              suggestion.confidence === 'medium' ? 'bg-blue-50 border-blue-200' :
              'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{SLOT_LABEL[suggestion.time_slot]?.icon || '💡'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-700">
                      {locale === 'bg' ? 'Препоръка за време' : 'Suggested Timing'}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      suggestion.confidence === 'high' ? 'bg-emerald-100 text-emerald-700' :
                      suggestion.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-200 text-gray-600'
                    }`}>
                      {suggestion.confidence}
                    </span>
                  </div>
                  <div className="font-semibold text-sm text-gray-900 mt-0.5">
                    {locale === 'bg' ? SLOT_LABEL[suggestion.time_slot]?.bg : SLOT_LABEL[suggestion.time_slot]?.en}
                    {suggestion.take_on_empty_stomach && (
                      <span className="ml-2 text-[11px] font-normal text-amber-700">
                        · {locale === 'bg' ? 'на гладно' : 'empty stomach'}
                      </span>
                    )}
                    {suggestion.take_with_food && !suggestion.take_on_empty_stomach && (
                      <span className="ml-2 text-[11px] font-normal text-emerald-700">
                        · {locale === 'bg' ? 'с храна' : 'with food'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-1 leading-snug">
                    {locale === 'bg' ? suggestion.reason_bg : suggestion.reason}
                  </p>
                  {suggestion.avoid_with && suggestion.avoid_with.length > 0 && (
                    <p className="text-[11px] text-rose-600 mt-1.5">
                      ⚠️ {locale === 'bg' ? 'Дистанция от' : 'Space away from'}: {suggestion.avoid_with.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Category"
              value={form.category}
              onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
            >
              <option value="supplement">Supplement</option>
              <option value="vitamin">Vitamin</option>
              <option value="mineral">Mineral</option>
              <option value="medication">Prescription</option>
              <option value="otc">OTC Drug</option>
              <option value="injection">Injection</option>
              <option value="herb">Herbal</option>
              <option value="probiotic">Probiotic</option>
              <option value="protein">Protein</option>
            </Select>

            <Select
              label="Form"
              value={form.form}
              onChange={e => setForm(prev => ({ ...prev, form: e.target.value }))}
            >
              <option value="tablet">Tablet</option>
              <option value="capsule">Capsule</option>
              <option value="softgel">Softgel</option>
              <option value="liquid">Liquid</option>
              <option value="powder">Powder</option>
              <option value="drops">Drops</option>
              <option value="gummy">Gummy</option>
            </Select>
          </div>

          <Input
            label="Strength (e.g., 2000IU, 500mg)"
            value={form.strength}
            onChange={e => setForm(prev => ({ ...prev, strength: e.target.value }))}
          />

          {/* §VISUAL: Pill appearance for elderly identification */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Pill Color"
              value={form.color}
              onChange={e => setForm(prev => ({ ...prev, color: e.target.value }))}
              placeholder="e.g., white, yellow"
            />
            <Input
              label="Pill Shape"
              value={form.shape}
              onChange={e => setForm(prev => ({ ...prev, shape: e.target.value }))}
              placeholder="e.g., round, oval"
            />
          </div>

          {/* §STOCK: Pack size + current count */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Pack Size"
              type="number"
              inputMode="numeric"
              value={form.pack_size}
              onChange={e => setForm(prev => ({ ...prev, pack_size: e.target.value }))}
              placeholder="e.g., 60"
            />
            <Input
              label="Current Stock"
              type="number"
              inputMode="numeric"
              value={form.current_stock}
              onChange={e => setForm(prev => ({ ...prev, current_stock: e.target.value }))}
              placeholder="e.g., 45"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving} className="flex-1">
              {saving ? 'Saving...' : 'Add Supplement'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
