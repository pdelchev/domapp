'use client';

/**
 * §PAGE: Simple Schedule/Timeline for Medicines & Supplements
 * §ROUTE: /health/supplements
 * §PURPOSE: Schedule view showing what to take when, with inline add capability
 * No cabinet, no cycling, no complex tabs - just simple: TIME | WHAT | DOSE | ACTION
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { getHealthProfiles, getBPMedications, getInterventions, getSupplements, createSupplement, createIntervention, createBPMedication, deleteSupplement, deleteIntervention, deleteBPMedication } from '../../lib/api';
import {
  PageShell, PageContent, PageHeader, Card, Button,
  Badge, Spinner, Alert, Input, Select, Textarea,
} from '../../components/ui';
import NavBar from '../../components/NavBar';

interface Medicine {
  id: number;
  name: string;
  dose?: string;
  frequency?: string;
  time_slot?: string;
  type: 'supplement' | 'intervention' | 'bp-med';
  notes?: string;
  is_active: boolean;
}

const TIME_SLOTS = [
  { value: 'morning', label: '🌅 Morning (6-8am)', icon: '🌅' },
  { value: 'breakfast', label: '🍳 Breakfast (8-10am)', icon: '🍳' },
  { value: 'lunch', label: '🍽️ Lunch (12-1pm)', icon: '🍽️' },
  { value: 'afternoon', label: '☕ Afternoon (3-4pm)', icon: '☕' },
  { value: 'dinner', label: '🍷 Dinner (6-7pm)', icon: '🍷' },
  { value: 'evening', label: '🌙 Evening (8-9pm)', icon: '🌙' },
  { value: 'bedtime', label: '😴 Bedtime (9-10pm)', icon: '😴' },
];

export default function SchedulePage() {
  const { locale } = useLanguage();
  const router = useRouter();

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [primaryProfileId, setPrimaryProfileId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    dose: '',
    type: 'supplement' as 'supplement' | 'intervention' | 'bp-med',
    time_slot: '',
    frequency: 'daily',
    notes: '',
  });
  const [addLoading, setAddLoading] = useState(false);

  const fetchMedicines = useCallback(async () => {
    try {
      setLoading(true);
      const [supps, bpMeds, interventions] = await Promise.all([
        getSupplements({ active: true }).catch(() => []),
        getBPMedications().catch(() => []),
        getInterventions({ active: true }).catch(() => []),
      ]);

      const combined: Medicine[] = [
        ...supps.map((s: any) => ({ ...s, type: 'supplement' })),
        ...bpMeds.map((m: any) => ({ ...m, type: 'bp-med' })),
        ...interventions.map((i: any) => ({ ...i, type: 'intervention' })),
      ];

      setMedicines(combined);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profiles = await getHealthProfiles();
        const primary = profiles.find((p: any) => p.is_primary) || profiles[0];
        if (primary) setPrimaryProfileId(primary.id);
      } catch (e) {
        console.error('Failed to load profile:', e);
      }
    };

    loadProfile();
    fetchMedicines();
  }, [fetchMedicines]);

  const handleAddMedicine = async () => {
    if (!addForm.name.trim()) {
      setError(locale === 'bg' ? 'Име е задължително' : 'Name required');
      return;
    }

    setAddLoading(true);
    try {
      if (addForm.type === 'supplement') {
        await createSupplement({
          name: addForm.name,
          category: 'other',
          is_active: true,
        });
      } else if (addForm.type === 'intervention') {
        await createIntervention({
          name: addForm.name,
          dose: addForm.dose,
          frequency: addForm.frequency,
          category: 'medication',
          hypothesis: addForm.notes,
          is_active: true,
        });
      } else if (addForm.type === 'bp-med') {
        if (!primaryProfileId) throw new Error('No health profile');
        await createBPMedication({
          name: addForm.name,
          dose: addForm.dose,
          frequency: addForm.frequency || 'daily',
          profile: primaryProfileId,
          started_at: new Date().toISOString().split('T')[0],
          notes: addForm.notes,
          is_active: true,
        });
      }

      setAddForm({ name: '', dose: '', type: 'supplement', time_slot: '', frequency: 'daily', notes: '' });
      setShowAddForm(false);
      setError('');
      await fetchMedicines();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (id: number, type: string) => {
    if (!confirm(locale === 'bg' ? 'Сигурни ли сте?' : 'Are you sure?')) return;

    // Optimistic update: remove immediately from UI
    const oldMedicines = medicines;
    setMedicines(medicines.filter(m => m.id !== id));

    try {
      if (type === 'supplement') await deleteSupplement(id);
      else if (type === 'intervention') await deleteIntervention(id);
      else await deleteBPMedication(id);
      setError('');
    } catch (e: any) {
      setError(e.message);
      // Revert on error
      setMedicines(oldMedicines);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(locale === 'bg' ? `Изтрийте ${selectedIds.length} елемента?` : `Delete ${selectedIds.length} items?`)) return;

    setIsBulkDeleting(true);
    const toDelete = medicines.filter(m => selectedIds.includes(m.id));

    // Optimistic update
    const oldMedicines = medicines;
    setMedicines(medicines.filter(m => !selectedIds.includes(m.id)));
    setSelectedIds([]);

    try {
      // Delete all in parallel
      await Promise.all(
        toDelete.map(m => {
          if (m.type === 'supplement') return deleteSupplement(m.id);
          else if (m.type === 'intervention') return deleteIntervention(m.id);
          else return deleteBPMedication(m.id);
        })
      );
      setError('');
    } catch (e: any) {
      setError(e.message);
      // Revert on error
      setMedicines(oldMedicines);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Group medicines by time slot
  const medicinesByTime = TIME_SLOTS.map(slot => ({
    ...slot,
    items: medicines.filter(m => m.time_slot === slot.value || !m.time_slot),
  }));

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={locale === 'bg' ? '⏰ График с хранене' : '⏰ Schedule'}
          action={
            <div className="flex gap-2">
              {selectedIds.length > 0 && (
                <Button
                  variant="danger"
                  disabled={isBulkDeleting}
                  onClick={handleBulkDelete}
                >
                  {isBulkDeleting
                    ? (locale === 'bg' ? 'Изтриване...' : 'Deleting...')
                    : (locale === 'bg' ? `🗑️ Изтрий ${selectedIds.length}` : `🗑️ Delete ${selectedIds.length}`)}
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() => setShowAddForm(true)}
              >
                {locale === 'bg' ? '+ Добави' : '+ Add'}
              </Button>
            </div>
          }
          onBack={() => router.push('/health')}
        />

        <Alert type="error" message={error} />

        {loading ? (
          <Spinner />
        ) : (
          <div className="space-y-4">
            {/* Schedule Timeline */}
            {medicinesByTime.map(timeSlot => (
              <Card key={timeSlot.value} className="border-l-4 border-l-indigo-500">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">{timeSlot.icon}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{timeSlot.label}</h3>
                  </div>
                </div>

                {timeSlot.items.length > 0 ? (
                  <div className="space-y-2">
                    {timeSlot.items.map((medicine) => (
                      <div
                        key={medicine.id}
                        className={`flex items-center justify-between p-2 rounded border transition-colors ${
                          selectedIds.includes(medicine.id)
                            ? 'bg-indigo-100 border-indigo-400'
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(medicine.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedIds([...selectedIds, medicine.id]);
                              } else {
                                setSelectedIds(selectedIds.filter(id => id !== medicine.id));
                              }
                            }}
                            className="w-4 h-4 cursor-pointer"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{medicine.name}</div>
                            <div className="text-sm text-gray-600">
                              {medicine.dose && <span>{medicine.dose}</span>}
                              {medicine.frequency && <span> • {medicine.frequency}</span>}
                            </div>
                            {medicine.notes && (
                              <div className="text-xs text-gray-500 italic mt-1">{medicine.notes}</div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-2">
                          <Badge
                            color={
                              medicine.type === 'bp-med'
                                ? 'blue'
                                : medicine.type === 'intervention'
                                ? 'red'
                                : 'green'
                            }
                          >
                            {medicine.type === 'bp-med' && 'BP'}
                            {medicine.type === 'intervention' && 'RX'}
                            {medicine.type === 'supplement' && '💊'}
                          </Badge>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleDelete(medicine.id, medicine.type)}
                          >
                            ✕
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 italic py-2">
                    {locale === 'bg' ? 'Нищо не е планирано' : 'Nothing scheduled'}
                  </div>
                )}
              </Card>
            ))}

            {medicines.length === 0 && (
              <Card className="text-center py-8">
                <div className="text-gray-500">
                  {locale === 'bg'
                    ? 'Добавете лекарства и добавки, за да видите тяхната програма тук'
                    : 'Add medicines and supplements to see your schedule here'}
                </div>
              </Card>
            )}
          </div>
        )}
      </PageContent>

      {/* Add Medicine Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {locale === 'bg' ? '+ Добави хапче / лекарство' : '+ Add Medicine'}
            </h2>

            <div className="space-y-4">
              <Select
                label={locale === 'bg' ? 'Тип' : 'Type'}
                value={addForm.type}
                onChange={(e) => setAddForm({ ...addForm, type: e.target.value as any })}
              >
                <option value="supplement">{locale === 'bg' ? 'Добавка' : 'Supplement'}</option>
                <option value="intervention">{locale === 'bg' ? 'Терапия' : 'Therapy'}</option>
                <option value="bp-med">{locale === 'bg' ? 'КН лекарство' : 'BP Medicine'}</option>
              </Select>

              <Input
                label={locale === 'bg' ? 'Име *' : 'Name *'}
                required
                placeholder={locale === 'bg' ? 'например: Витамин D3' : 'e.g., Vitamin D3'}
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              />

              <Input
                label={locale === 'bg' ? 'Доза' : 'Dose'}
                placeholder={locale === 'bg' ? 'например: 1000mg' : 'e.g., 1000mg'}
                value={addForm.dose}
                onChange={(e) => setAddForm({ ...addForm, dose: e.target.value })}
              />

              <Select
                label={locale === 'bg' ? 'Време на ден' : 'Time of Day'}
                value={addForm.time_slot}
                onChange={(e) => setAddForm({ ...addForm, time_slot: e.target.value })}
              >
                <option value="">—</option>
                {TIME_SLOTS.map(slot => (
                  <option key={slot.value} value={slot.value}>{slot.label}</option>
                ))}
              </Select>

              <Select
                label={locale === 'bg' ? 'Честота' : 'Frequency'}
                value={addForm.frequency}
                onChange={(e) => setAddForm({ ...addForm, frequency: e.target.value })}
              >
                <option value="daily">{locale === 'bg' ? 'Дневно' : 'Daily'}</option>
                <option value="twice_daily">{locale === 'bg' ? 'Два пъти дневно' : 'Twice daily'}</option>
                <option value="as_needed">{locale === 'bg' ? 'По необходимост' : 'As needed'}</option>
              </Select>

              <Textarea
                label={locale === 'bg' ? 'Бележки' : 'Notes'}
                placeholder={locale === 'bg' ? 'например: Приемете с храна' : 'e.g., Take with food'}
                value={addForm.notes}
                onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              />

              {error && <Alert type="error" message={error} />}

              <div className="flex gap-3 pt-4">
                <Button
                  variant="secondary"
                  onClick={() => setShowAddForm(false)}
                  disabled={addLoading}
                  className="flex-1"
                >
                  {locale === 'bg' ? 'Отмени' : 'Cancel'}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleAddMedicine}
                  disabled={addLoading}
                  className="flex-1"
                >
                  {addLoading ? (locale === 'bg' ? 'Запазване...' : 'Saving...') : (locale === 'bg' ? 'Добави' : 'Add')}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
