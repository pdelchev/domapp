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
import { getSupplements, getSupplementInteractions, createSupplement, suggestSupplementTiming, getUnifiedHealthSummary, getBPMedications, getInterventions, createIntervention, createBPMedication } from '../../lib/api';
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
  _from_bp?: boolean; // Mark BP medications
  _from_intervention?: boolean; // Mark interventions (medicines)
  dose?: string; // For BP meds & interventions
  frequency?: string; // For BP meds & interventions
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
  const [addType, setAddType] = useState<'intervention' | 'bp-med' | 'supplement'>('intervention');
  const [addForm, setAddForm] = useState({ name: '', dose: '', frequency: '', category: '', notes: '' });
  const [addLoading, setAddLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [supps, bpMeds, interventions, warnings, healthSummary] = await Promise.all([
        getSupplements(filter === 'all' ? undefined : { active: filter === 'active' }).catch(() => []),
        getBPMedications().catch(() => []), // Get BP medications
        getInterventions(filter === 'all' ? undefined : { active: filter === 'active' }).catch(() => []), // Get interventions (medicines)
        getSupplementInteractions().catch(() => []),
        getUnifiedHealthSummary().catch(() => null), // Get active interventions/medicines
      ]);

      // Combine supplements + BP medications + interventions
      let combined: Supplement[] = [...supps];

      // Add Interventions (medicines) — convert to supplement format
      if (interventions && Array.isArray(interventions)) {
        const interventionMeds = interventions
          .filter((iv: any) => filter === 'all' || (filter === 'active' ? iv.is_active : !iv.is_active))
          .map((iv: any) => ({
            id: iv.id,
            name: iv.name,
            name_bg: iv.name,
            category: 'medication',
            form: iv.form || 'tablet',
            color: '',
            shape: '',
            photo: null,
            photo_closeup: null,
            strength: iv.dose || '',
            strength_unit: '',
            manufacturer: '',
            is_prescription: true,
            is_active: iv.is_active,
            current_stock: 0,
            days_remaining: null,
            active_schedules: 0,
            started_at: iv.started_on,
            linked_biomarkers: iv.target_metrics || [],
            _from_intervention: true, // Mark as intervention
            dose: iv.dose,
            frequency: iv.frequency,
          }));
        combined = [...interventionMeds, ...combined];
      }

      // Add BP medications (convert to supplement format)
      if (bpMeds && Array.isArray(bpMeds)) {
        const bpMedicines = bpMeds
          .filter((med: any) => filter === 'all' || (filter === 'active' ? med.is_active : !med.is_active))
          .map((med: any) => ({
            id: med.id,
            name: med.name,
            name_bg: med.name,
            category: 'medication',
            form: 'tablet',
            color: '',
            shape: '',
            photo: null,
            photo_closeup: null,
            strength: med.dose || '',
            strength_unit: '',
            manufacturer: '',
            is_prescription: true,
            is_active: med.is_active,
            current_stock: 0,
            days_remaining: null,
            active_schedules: 0,
            started_at: med.started_at,
            linked_biomarkers: [],
            _from_bp: true, // Mark as BP medication
            dose: med.dose,
            frequency: med.frequency,
          }));
        combined = [...bpMedicines, ...combined];
      }

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

  const handleAddMedicine = async () => {
    if (!addForm.name.trim()) {
      setError(locale === 'bg' ? 'Име е задължително' : 'Name is required');
      return;
    }

    setAddLoading(true);
    try {
      if (addType === 'intervention') {
        await createIntervention({
          name: addForm.name,
          dose: addForm.dose,
          frequency: addForm.frequency,
          category: addForm.category || 'medication',
          hypothesis: addForm.notes,
          is_active: true,
        });
      } else if (addType === 'bp-med') {
        await createBPMedication({
          name: addForm.name,
          dose: addForm.dose,
          frequency: addForm.frequency,
          is_active: true,
          notes: addForm.notes,
        });
      } else {
        await createSupplement({
          name: addForm.name,
          strength: addForm.dose,
          category: addForm.category || 'supplement',
          is_active: true,
        });
      }

      // Reset form and refresh data
      setAddForm({ name: '', dose: '', frequency: '', category: '', notes: '' });
      setShowAdd(false);
      await fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAddLoading(false);
    }
  };

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
                      <div className="flex gap-1 flex-shrink-0">
                        {s._from_intervention && (
                          <Badge color="red">
                            {locale === 'bg' ? 'Терапия' : 'Treatment'}
                          </Badge>
                        )}
                        {s._from_bp && (
                          <Badge color="blue">
                            {locale === 'bg' ? 'КН' : 'BP'}
                          </Badge>
                        )}
                        <Badge color={(CATEGORY_COLORS[s.category] || 'gray') as any}>
                          {s.category}
                        </Badge>
                      </div>
                    </div>

                    {s.strength && (
                      <p className="text-sm text-gray-500 mt-0.5">
                        {s.strength}
                        {(s._from_bp || s._from_intervention) && s.frequency && ` • ${s.frequency}`}
                      </p>
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

        {/* §MODAL: Unified add form for interventions, BP meds, or supplements */}
        {showAdd && (
          <AddMedicineModal
            locale={locale}
            type={addType}
            onTypeChange={setAddType}
            form={addForm}
            onFormChange={setAddForm}
            onClose={() => setShowAdd(false)}
            onSave={handleAddMedicine}
            loading={addLoading}
            error={error}
          />
        )}
      </PageContent>
    </PageShell>
  );
}

/**
 * §MODAL: Unified add form for medicines, BP meds, or supplements.
 * Defined outside the page component to avoid focus-loss on re-render.
 */
function AddMedicineModal({
  locale,
  type,
  onTypeChange,
  form,
  onFormChange,
  onClose,
  onSave,
  loading,
  error,
}: {
  locale: string;
  type: 'intervention' | 'bp-med' | 'supplement';
  onTypeChange: (t: 'intervention' | 'bp-med' | 'supplement') => void;
  form: { name: string; dose: string; frequency: string; category: string; notes: string };
  onFormChange: (f: typeof form) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
  loading: boolean;
  error: string;
}) {
  // Old code - to be replaced with simple unified form
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{locale === 'bg' ? 'Добави' : 'Add'}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl">&times;</button>
        </div>

        <Alert type="error" message={error} />

        <div className="space-y-4">
          {/* Type selector */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <button
              onClick={() => onTypeChange('intervention')}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                type === 'intervention' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {locale === 'bg' ? 'Терапия' : 'Treatment'}
            </button>
            <button
              onClick={() => onTypeChange('bp-med')}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                type === 'bp-med' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {locale === 'bg' ? 'КН' : 'BP'}
            </button>
            <button
              onClick={() => onTypeChange('supplement')}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                type === 'supplement' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {locale === 'bg' ? 'Добавка' : 'Supplement'}
            </button>
          </div>

          {/* Common fields */}
          <Input
            label={locale === 'bg' ? 'Име' : 'Name'}
            required
            value={form.name}
            onChange={e => onFormChange({ ...form, name: e.target.value })}
            placeholder={locale === 'bg' ? 'Febuxostat' : 'e.g., Febuxostat'}
          />

          <Input
            label={locale === 'bg' ? 'Доза' : 'Dose'}
            value={form.dose}
            onChange={e => onFormChange({ ...form, dose: e.target.value })}
            placeholder={locale === 'bg' ? '120mg' : 'e.g., 120mg'}
          />

          <Input
            label={locale === 'bg' ? 'Честота' : 'Frequency'}
            value={form.frequency}
            onChange={e => onFormChange({ ...form, frequency: e.target.value })}
            placeholder={locale === 'bg' ? 'Дневно' : 'e.g., Daily'}
          />

          <Textarea
            label={locale === 'bg' ? 'Бележки' : 'Notes'}
            value={form.notes}
            onChange={e => onFormChange({ ...form, notes: e.target.value })}
            placeholder={locale === 'bg' ? 'За какво е' : 'Why prescribed'}
          />

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={onClose} className="flex-1">
              {locale === 'bg' ? 'Отмени' : 'Cancel'}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={loading}
              onClick={onSave}
              className="flex-1"
            >
              {loading ? (locale === 'bg' ? 'Запазване...' : 'Saving...') : (locale === 'bg' ? 'Добави' : 'Add')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
