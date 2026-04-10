'use client';

/**
 * §PAGE: Complete Supplement System (Unified)
 * §ROUTE: /health/supplements
 * §PURPOSE: Master page combining:
 *   - Daily Schedule (what/when to take)
 *   - My Cabinet (all supplements with photos)
 *   - Cycling Status (Ginseng 6/2, Boron 8/2)
 *   - Add/Edit forms
 * §TABS: Schedule | Cabinet | Cycles | Add
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { getSupplements, getInterventions, getBPMedications, createSupplement, createIntervention, createBPMedication, deleteIntervention, deleteBPMedication, deleteSupplement } from '../../lib/api';
import {
  PageShell, PageContent, PageHeader, Card, Button,
  Badge, Spinner, Alert, EmptyState, Input, Select, Textarea,
} from '../../components/ui';
import NavBar from '../../components/NavBar';

type TabType = 'schedule' | 'cabinet' | 'cycles' | 'add';

interface Supplement {
  id: number;
  name: string;
  dose?: string;
  frequency?: string;
  category: string;
  is_active: boolean;
  photo?: string;
  _from_intervention?: boolean;
  _from_bp?: boolean;
}

// Master protocol data
const SCHEDULE_DATA = [
  {
    time: '09:00',
    icon: '🌅',
    title: 'MORNING - FASTED',
    items: [
      { name: 'Saxenda Injection', dose: 'As prescribed', notes: ['Water allowed', 'No food'] },
      { name: 'NMN', dose: '500 mg', notes: ['With water', 'Mitochondrial support'] },
      { name: 'Panax Ginseng', dose: '1 capsule', notes: ['Fasted OK', '🔄 Cycle: 6/2'], cycling: 'ginseng' },
    ],
  },
  {
    time: '13:00',
    icon: '🍽️',
    title: 'FIRST MEAL - WITH FAT',
    items: [
      { name: 'Vitamin D3+K2', dose: '1 tablet', notes: ['With fat', 'Gout-safe 5000 IU'] },
      { name: 'Zinc Bisglycinate', dose: '25 mg', notes: ['Testosterone support'] },
      { name: 'Boron', dose: '3 mg', notes: ['Free testosterone', '🔄 Cycle: 8/2'], cycling: 'boron' },
      { name: 'CoQ10', dose: '200 mg', notes: ['Endothelial function'] },
      { name: 'Omega-3', dose: '2 caps', notes: ['Anti-inflammatory'] },
    ],
  },
  {
    time: '18:00',
    icon: '🍽️',
    title: 'LAST MEAL',
    items: [
      { name: 'Magnesium Taurate', dose: '1 capsule', notes: ['BP support'] },
    ],
  },
  {
    time: '21:30',
    icon: '🌙',
    title: 'BEFORE SLEEP',
    items: [
      { name: 'Magnesium Taurate', dose: '1 capsule', notes: ['Sleep quality'] },
    ],
  },
  {
    time: 'PRE-GYM/SEX',
    icon: '⚡',
    title: 'OPTIONAL',
    items: [
      { name: 'L-Citrulline', dose: '6g powder', notes: ['45-60 min before', 'Do NOT use daily'] },
    ],
  },
];

function getCycleStatus(cycleType: 'ginseng' | 'boron') {
  const startDate = new Date('2026-04-10');
  const today = new Date();
  const daysSinceStart = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  if (cycleType === 'ginseng') {
    const cycleLength = 56; // 6 + 2 weeks
    const dayInCycle = daysSinceStart % cycleLength;
    const isOn = dayInCycle < 42;
    const week = Math.floor(dayInCycle / 7) + 1;
    const daysLeft = isOn ? 42 - dayInCycle : 56 - dayInCycle;
    return { status: isOn ? 'ON' : 'OFF', week, totalWeeks: 8, daysLeft, nextChange: new Date(today.getTime() + daysLeft * 24 * 60 * 60 * 1000).toLocaleDateString() };
  }

  if (cycleType === 'boron') {
    const cycleLength = 70; // 8 + 2 weeks
    const dayInCycle = daysSinceStart % cycleLength;
    const isOn = dayInCycle < 56;
    const week = Math.floor(dayInCycle / 7) + 1;
    const daysLeft = isOn ? 56 - dayInCycle : 70 - dayInCycle;
    return { status: isOn ? 'ON' : 'OFF', week, totalWeeks: 10, daysLeft, nextChange: new Date(today.getTime() + daysLeft * 24 * 60 * 60 * 1000).toLocaleDateString() };
  }

  return { status: 'N/A', week: 0, totalWeeks: 0, daysLeft: 0, nextChange: '' };
}

export default function SupplementsPage() {
  const { locale } = useLanguage();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addType, setAddType] = useState<'intervention' | 'bp-med' | 'supplement'>('intervention');
  const [addForm, setAddForm] = useState({ name: '', dose: '', frequency: '', category: '', notes: '' });
  const [addPhotos, setAddPhotos] = useState<{ pill?: File; prescription?: File }>({});
  const [addLoading, setAddLoading] = useState(false);

  const fetchSupplements = useCallback(async () => {
    try {
      setLoading(true);
      const [supps, bpMeds, interventions] = await Promise.all([
        getSupplements({ active: true }).catch(() => []),
        getBPMedications().catch(() => []),
        getInterventions({ active: true }).catch(() => []),
      ]);

      const combined = [
        ...supps,
        ...bpMeds.map((m: any) => ({ ...m, _from_bp: true, category: 'medication' })),
        ...interventions.map((i: any) => ({ ...i, _from_intervention: true, category: 'medication' })),
      ];

      setSupplements(combined);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSupplements();
  }, [fetchSupplements]);

  const handleAddSupplement = async () => {
    if (!addForm.name.trim()) {
      setError(locale === 'bg' ? 'Име е задължително' : 'Name required');
      return;
    }

    setAddLoading(true);
    try {
      if (addType === 'intervention') {
        const formData = new FormData();
        formData.append('name', addForm.name);
        formData.append('dose', addForm.dose);
        formData.append('frequency', addForm.frequency);
        formData.append('category', addForm.category || 'medication');
        formData.append('hypothesis', addForm.notes);
        formData.append('is_active', 'true');
        if (addPhotos.pill) formData.append('photo', addPhotos.pill);
        if (addPhotos.prescription) formData.append('photo_prescription', addPhotos.prescription);

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
        formData.append('profile', '1');
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

      setAddForm({ name: '', dose: '', frequency: '', category: '', notes: '' });
      setAddPhotos({});
      setError('');
      await fetchSupplements();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteSupplement = async (id: number, type: string) => {
    if (!confirm(locale === 'bg' ? 'Сигурни ли сте?' : 'Are you sure?')) return;

    try {
      if (type === 'intervention') await deleteIntervention(id);
      else if (type === 'bp-med') await deleteBPMedication(id);
      else await deleteSupplement(id);
      await fetchSupplements();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const ginsengCycle = getCycleStatus('ginseng');
  const boronCycle = getCycleStatus('boron');

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={locale === 'bg' ? 'Моя система за добавки' : 'My Supplement System'}
          onBack={() => router.push('/health')}
        />

        <Alert type="error" message={error} />

        {/* TAB NAVIGATION */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {(['schedule', 'cabinet', 'cycles', 'add'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab === 'schedule' && '📋 Today'}
              {tab === 'cabinet' && '💊 Cabinet'}
              {tab === 'cycles' && '🔄 Cycles'}
              {tab === 'add' && '➕ Add'}
            </button>
          ))}
        </div>

        {/* TAB 1: TODAY'S SCHEDULE */}
        {activeTab === 'schedule' && (
          <div className="space-y-4">
            <Card className="bg-indigo-50 border-indigo-200 mb-4">
              <div className="text-sm">
                <span className="font-semibold text-gray-900">Saxenda + {supplements.length} active supplements</span>
                <div className="text-xs text-gray-600 mt-1">Total daily pills: 8-9 | Fasting: ~18 hours</div>
              </div>
            </Card>

            {SCHEDULE_DATA.map((slot, i) => (
              <Card key={i}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">{slot.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-gray-700">{slot.time}</div>
                    <div className="font-semibold text-gray-900">{slot.title}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {slot.items.map((item, j) => (
                    <div key={j} className="p-3 bg-gray-50 rounded border border-gray-200">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-gray-900">{item.name}</h4>
                        <Badge color="indigo">{item.dose}</Badge>
                      </div>
                      {item.cycling && (
                        <div className="mb-2 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded w-fit">
                          {item.cycling === 'ginseng' ? `🔄 Week ${ginsengCycle.week}/6 ${ginsengCycle.status}` : `🔄 Week ${boronCycle.week}/8 ${boronCycle.status}`}
                        </div>
                      )}
                      <ul className="text-xs text-gray-600 space-y-0.5">
                        {item.notes.map((note, k) => (
                          <li key={k}>• {note}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* TAB 2: MY CABINET */}
        {activeTab === 'cabinet' && (
          <>
            {loading ? (
              <Spinner />
            ) : supplements.length === 0 ? (
              <EmptyState icon="💊" message={locale === 'bg' ? 'Няма добавки' : 'No supplements'} />
            ) : (
              <div className="space-y-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left py-2 px-2">Name</th>
                      <th className="text-left py-2 px-2">Dose</th>
                      <th className="text-left py-2 px-2">Time</th>
                      <th className="text-left py-2 px-2">Status</th>
                      <th className="text-center py-2 px-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplements.map((s) => (
                      <tr key={s.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-3 px-2">
                          <div className="font-medium text-gray-900">{s.name}</div>
                        </td>
                        <td className="py-3 px-2 text-sm text-gray-600">{s.dose || '—'}</td>
                        <td className="py-3 px-2 text-sm text-gray-600">{s.frequency || '—'}</td>
                        <td className="py-3 px-2">
                          {s._from_intervention && <Badge color="red">Therapy</Badge>}
                          {s._from_bp && <Badge color="blue">BP Med</Badge>}
                          {!s._from_intervention && !s._from_bp && <Badge color="green">Supplement</Badge>}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleDeleteSupplement(s.id, s._from_intervention ? 'intervention' : s._from_bp ? 'bp-med' : 'supplement')}
                          >
                            ✕
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* TAB 3: CYCLING STATUS */}
        {activeTab === 'cycles' && (
          <div className="space-y-4">
            {/* Ginseng */}
            <Card className={ginsengCycle.status === 'ON' ? 'bg-green-50 border-green-200 border-2' : 'bg-red-50 border-red-200 border-2'}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🌿</span>
                  <div>
                    <h3 className="text-lg font-bold">Panax Ginseng</h3>
                    <p className="text-sm text-gray-600">Libido & energy optimization</p>
                  </div>
                </div>
                <Badge color={ginsengCycle.status === 'ON' ? 'green' : 'red'}>
                  {ginsengCycle.status}
                </Badge>
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium mb-2">
                  <span>Week {ginsengCycle.week}/6</span>
                  <span>{ginsengCycle.daysLeft} days left</span>
                </div>
                <div className="w-full bg-gray-300 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${ginsengCycle.status === 'ON' ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: `${(ginsengCycle.week / 6) * 100}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">ON weeks</div>
                  <div className="text-xl font-bold">6</div>
                </div>
                <div>
                  <div className="text-gray-600">Next change</div>
                  <div className="text-lg font-bold">{ginsengCycle.nextChange}</div>
                </div>
              </div>
            </Card>

            {/* Boron */}
            <Card className={boronCycle.status === 'ON' ? 'bg-green-50 border-green-200 border-2' : 'bg-red-50 border-red-200 border-2'}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🧬</span>
                  <div>
                    <h3 className="text-lg font-bold">Boron</h3>
                    <p className="text-sm text-gray-600">Free testosterone optimization</p>
                  </div>
                </div>
                <Badge color={boronCycle.status === 'ON' ? 'green' : 'red'}>
                  {boronCycle.status}
                </Badge>
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium mb-2">
                  <span>Week {boronCycle.week}/8</span>
                  <span>{boronCycle.daysLeft} days left</span>
                </div>
                <div className="w-full bg-gray-300 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${boronCycle.status === 'ON' ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: `${(boronCycle.week / 8) * 100}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">ON weeks</div>
                  <div className="text-xl font-bold">8</div>
                </div>
                <div>
                  <div className="text-gray-600">Next change</div>
                  <div className="text-lg font-bold">{boronCycle.nextChange}</div>
                </div>
              </div>
            </Card>

            <Card className="bg-blue-50 border-blue-200">
              <h4 className="font-semibold mb-2">Why Cycle?</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>✓ Prevents tolerance buildup</li>
                <li>✓ Maintains effectiveness</li>
                <li>✓ Allows hormone receptor reset</li>
                <li>✓ Preserves libido response</li>
              </ul>
            </Card>
          </div>
        )}

        {/* TAB 4: ADD SUPPLEMENT */}
        {activeTab === 'add' && (
          <Card>
            <h3 className="font-semibold text-lg mb-4">{locale === 'bg' ? 'Добави' : 'Add Supplement'}</h3>

            <div className="space-y-4">
              <Select
                label={locale === 'bg' ? 'Тип' : 'Type'}
                value={addType}
                onChange={(e) => setAddType(e.target.value as any)}
              >
                <option value="intervention">{locale === 'bg' ? 'Терапия' : 'Therapy'}</option>
                <option value="bp-med">{locale === 'bg' ? 'КН лекарство' : 'BP Medicine'}</option>
                <option value="supplement">{locale === 'bg' ? 'Добавка' : 'Supplement'}</option>
              </Select>

              <Input
                label={locale === 'bg' ? 'Име' : 'Name'}
                required
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              />

              <Input
                label={locale === 'bg' ? 'Доза' : 'Dose'}
                value={addForm.dose}
                onChange={(e) => setAddForm({ ...addForm, dose: e.target.value })}
              />

              <Input
                label={locale === 'bg' ? 'Честота' : 'Frequency'}
                value={addForm.frequency}
                onChange={(e) => setAddForm({ ...addForm, frequency: e.target.value })}
              />

              <Textarea
                label={locale === 'bg' ? 'Бележки' : 'Notes'}
                value={addForm.notes}
                onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              />

              {(addType === 'intervention' || addType === 'bp-med') && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="block text-sm font-medium mb-2">📦 {locale === 'bg' ? 'Снимка' : 'Pill Photo'}</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setAddPhotos({ ...addPhotos, pill: file });
                      }}
                      className="block w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">📄 {locale === 'bg' ? 'Рецепта' : 'Prescription'}</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setAddPhotos({ ...addPhotos, prescription: file });
                      }}
                      className="block w-full text-sm"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button variant="secondary" onClick={() => setActiveTab('cabinet')} className="flex-1">
                  {locale === 'bg' ? 'Отмени' : 'Cancel'}
                </Button>
                <Button
                  variant="primary"
                  disabled={addLoading}
                  onClick={handleAddSupplement}
                  className="flex-1"
                >
                  {addLoading ? (locale === 'bg' ? 'Запазване...' : 'Saving...') : (locale === 'bg' ? 'Добави' : 'Add')}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </PageContent>
    </PageShell>
  );
}
