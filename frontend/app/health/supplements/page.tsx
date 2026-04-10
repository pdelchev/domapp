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
import { getSupplements, getSupplementInteractions, createSupplement, suggestSupplementTiming, getUnifiedHealthSummary, getBPMedications, getInterventions, createIntervention, createBPMedication, deleteIntervention, deleteBPMedication, deleteSupplement } from '../../lib/api';
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
  const [addPhotos, setAddPhotos] = useState<{ pill?: File; prescription?: File }>({});
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

  const handleEditMedicine = (s: Supplement) => {
    // For now, just populate the form with the medicine data
    // Could also open an edit modal
    setAddForm({
      name: s.name,
      dose: s.dose || s.strength || '',
      frequency: s.frequency || '',
      category: s.category,
      notes: '',
    });
    setShowAdd(true);
  };

  const handleDeleteMedicine = async (id: number, type: 'intervention' | 'bp-med' | 'supplement') => {
    if (!confirm(locale === 'bg' ? 'Сигурни ли сте? Това действие не може да бъде отменено.' : 'Are you sure? This cannot be undone.')) {
      return;
    }

    try {
      if (type === 'intervention') {
        await deleteIntervention(id);
      } else if (type === 'bp-med') {
        await deleteBPMedication(id);
      } else {
        await deleteSupplement(id);
      }
      await fetchData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleAddMedicine = async () => {
    if (!addForm.name.trim()) {
      setError(locale === 'bg' ? 'Име е задължително' : 'Name is required');
      return;
    }

    setAddLoading(true);
    try {
      if (addType === 'intervention') {
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('name', addForm.name);
        formData.append('dose', addForm.dose);
        formData.append('frequency', addForm.frequency);
        formData.append('category', addForm.category || 'medication');
        formData.append('hypothesis', addForm.notes);
        formData.append('is_active', 'true');
        if (addPhotos.pill) formData.append('photo', addPhotos.pill);
        if (addPhotos.prescription) formData.append('photo_prescription', addPhotos.prescription);
        // HACK: createIntervention doesn't support FormData, so we need to use fetch directly
        const response = await fetch('/api/health/interventions/', {
          method: 'POST',
          body: formData,
          headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}` },
        });
        if (!response.ok) throw new Error('Failed to create intervention');
      } else if (addType === 'bp-med') {
        const formData = new FormData();
        formData.append('name', addForm.name);
        formData.append('dose', addForm.dose);
        formData.append('frequency', addForm.frequency);
        formData.append('is_active', 'true');
        formData.append('notes', addForm.notes);
        formData.append('profile', '1'); // TODO: select profile dynamically
        formData.append('started_at', new Date().toISOString().split('T')[0]);
        if (addPhotos.pill) formData.append('photo', addPhotos.pill);
        if (addPhotos.prescription) formData.append('photo_prescription', addPhotos.prescription);
        const response = await fetch('/api/health/bp/medications/', {
          method: 'POST',
          body: formData,
          headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}` },
        });
        if (!response.ok) throw new Error('Failed to create BP medication');
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
      setAddPhotos({});
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
          <Card padding={false}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">{locale === 'bg' ? 'Име' : 'Name'}</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">{locale === 'bg' ? 'Тип' : 'Type'}</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">{locale === 'bg' ? 'Доза' : 'Dose'}</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">{locale === 'bg' ? 'Честота' : 'Frequency'}</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-900">{locale === 'bg' ? 'Действия' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {supplements.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{CATEGORY_ICONS[s.category] || '💊'}</span>
                        <div>
                          <div className="font-medium text-gray-900">{s.name}</div>
                          {s.is_prescription && <span className="text-xs text-red-500 font-medium">Rx</span>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
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
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{s.strength || '—'}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{s.frequency || '—'}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditMedicine(s)}
                        >
                          {locale === 'bg' ? 'Редактирай' : 'Edit'}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDeleteMedicine(s.id, s._from_intervention ? 'intervention' : s._from_bp ? 'bp-med' : 'supplement')}
                        >
                          {locale === 'bg' ? 'Изтрий' : 'Delete'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {/* §MODAL: Unified add form for interventions, BP meds, or supplements */}
        {showAdd && (
          <AddMedicineModal
            locale={locale}
            type={addType}
            onTypeChange={setAddType}
            form={addForm}
            onFormChange={setAddForm}
            photos={addPhotos}
            onPhotosChange={setAddPhotos}
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
  photos,
  onPhotosChange,
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
  photos: { pill?: File; prescription?: File };
  onPhotosChange: (p: { pill?: File; prescription?: File }) => void;
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
          <Select
            label={locale === 'bg' ? 'Тип' : 'Type'}
            value={type}
            onChange={e => onTypeChange(e.target.value as 'intervention' | 'bp-med' | 'supplement')}
          >
            <option value="intervention">
              {locale === 'bg' ? 'Лечебна терапия' : 'Treatment / Therapy'}
            </option>
            <option value="bp-med">
              {locale === 'bg' ? 'Лекарство за кръвното налягане' : 'Blood Pressure Medicine'}
            </option>
            <option value="supplement">
              {locale === 'bg' ? 'Витамин или добавка' : 'Vitamin or Supplement'}
            </option>
          </Select>

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

          {/* Photo uploads for interventions and BP meds */}
          {(type === 'intervention' || type === 'bp-med') && (
            <>
              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-medium text-gray-900 mb-3">
                  {locale === 'bg' ? 'Снимки (опционално)' : 'Photos (optional)'}
                </p>

                <div className="space-y-3">
                  {/* Pill/Package photo */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {locale === 'bg' ? '📦 Снимка на опаковката' : '📦 Package/Pill Photo'}
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onPhotosChange({ ...photos, pill: file });
                      }}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-3 file:rounded-lg file:border file:border-gray-300 file:bg-white file:text-sm file:font-medium"
                    />
                    {photos.pill && (
                      <p className="text-xs text-gray-500 mt-1">✓ {photos.pill.name}</p>
                    )}
                  </div>

                  {/* Prescription/Doctor document photo */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {locale === 'bg' ? '📄 Снимка на рецепта' : '📄 Prescription/Doctor Note'}
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onPhotosChange({ ...photos, prescription: file });
                      }}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-3 file:rounded-lg file:border file:border-gray-300 file:bg-white file:text-sm file:font-medium"
                    />
                    {photos.prescription && (
                      <p className="text-xs text-gray-500 mt-1">✓ {photos.prescription.name}</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

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
