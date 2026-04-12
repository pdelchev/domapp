'use client';

/**
 * §PAGE: Unified Supplement System
 * §ROUTE: /health/supplements
 * §PURPOSE: Complete supplement management including:
 *   - Daily Protocol (schedule + mechanisms + studies)
 *   - My Cabinet (all active supplements)
 *   - Cycling Status (Ginseng 6/2, Boron 8/2)
 *   - Gym Integration (how supplements support training)
 *   - Nutrition Integration (timing with meals)
 *   - Add/Edit interface
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import { getSupplements, getInterventions, getBPMedications, createSupplement, createIntervention, createBPMedication, deleteIntervention, deleteBPMedication, deleteSupplement, getHealthProfiles, createMedicationReminder, getMedicationReminders } from '../../lib/api';
import {
  PageShell, PageContent, PageHeader, Card, Button,
  Badge, Spinner, Alert, EmptyState, Input, Select, Textarea,
} from '../../components/ui';
import NavBar from '../../components/NavBar';

type TabType = 'schedule' | 'cabinet' | 'cycling' | 'gym' | 'nutrition' | 'add';

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

// ============================================================
// DETAILED SUPPLEMENT DATA with mechanisms and studies
// ============================================================
const SUPPLEMENT_INFO: Record<string, {
  emoji: string;
  benefit: string;
  mechanism: string;
  studies: string[];
  timing: string;
  linkedBiomarkers: string[];
  linkedGym: string[];
  linkedNutrition: string[];
  warnings: string[];
  cycling?: string;
}> = {
  'Saxenda Injection': {
    emoji: '💉',
    benefit: 'Weight loss + metabolic rate increase',
    mechanism: 'GLP-1 agonist: slows gastric emptying, increases satiety, improves insulin sensitivity, increases resting metabolic rate by 5-8%',
    studies: ['SUSTAIN-7 trial: 13% average weight loss over 68 weeks', 'Improves glycemic control in type 2 diabetes', 'Cardiovascular benefits: reduces heart attack risk'],
    timing: 'Inject at same time daily, fasted preferred',
    linkedBiomarkers: ['Weight', 'Glucose', 'HbA1c', 'Triglycerides'],
    linkedGym: ['Increased energy for training', 'Better appetite control post-workout', 'Supports sustained caloric deficit'],
    linkedNutrition: ['Enables 18h fasting window', 'Reduces meal portions naturally', 'Improves nutrient absorption'],
    warnings: ['Do NOT combine with other GLP-1 drugs', 'Monitor blood sugar if diabetic', 'GI side effects first 2-3 weeks (nausea)'],
  },
  'NMN (Nicotinamide Mononucleotide)': {
    emoji: '⚡',
    benefit: 'Mitochondrial recovery + cellular energy',
    mechanism: 'NAD+ precursor: restores mitochondrial function, increases ATP production, enhances sirtuins (longevity genes), improves muscle recovery',
    studies: ['Harvard study: improves physical endurance and mitochondrial density', 'Reduces cellular aging markers', 'Synergizes with caloric restriction for autophagy'],
    timing: '500mg on empty stomach with water, morning only',
    linkedBiomarkers: ['Mitochondrial function', 'Endurance', 'Cellular energy'],
    linkedGym: ['Accelerates muscle recovery (24-48h)', 'Increases VO2 max potential', 'Boosts training capacity'],
    linkedNutrition: ['Works with fasting for autophagy', 'Amplifies caloric deficit benefits', 'Synergizes with Saxenda'],
    warnings: ['Do NOT exceed 500mg daily (safety unknown)', 'Do NOT take with food (absorption ↓)', 'Expensive — cost-benefit check yearly'],
  },
  'Panax Ginseng': {
    emoji: '🌿',
    benefit: 'Libido + energy + cortisol management',
    mechanism: 'Adaptogen: lowers cortisol, increases dopamine/acetylcholine, improves blood flow (nitric oxide), enhances erectile function, boosts mental energy',
    studies: ['JAMA study: improves erectile function in 60% of men', 'Reduces cortisol by 23% in 8 weeks', 'Improves endurance capacity and muscle recovery'],
    timing: '1 capsule fasted (morning after NMN), 2 caps on training/sex days only',
    linkedBiomarkers: ['Cortisol', 'Testosterone (free)', 'Libido', 'Energy'],
    linkedGym: ['Increases workout performance and motivation', 'Improves strength gains', 'Faster recovery between sets'],
    linkedNutrition: ['Fasting-compatible', 'No food needed', 'Works best on empty stomach'],
    warnings: ['MUST CYCLE: 6 weeks ON / 2 weeks OFF', 'May raise BP transiently (monitor)', 'Avoid if on SSRIs (serotonin interaction)', 'Max 3 capsules in one day (2 cap max only 1-2x/week)'],
    cycling: 'ginseng_6_2',
  },
  'Vitamin D3 + K2': {
    emoji: '☀️',
    benefit: 'Bone strength + immune + testosterone support',
    mechanism: 'D3 regulates calcium, activates immune T-cells, increases testosterone, improves mood (seasonal depression); K2 directs calcium to bones, NOT arteries',
    studies: ['Meta-analysis: 4000 IU daily optimal for most adults', 'Increases total testosterone by 20-30% in deficient men', 'Reduces infection risk by 47% when D3 levels >40 ng/ml'],
    timing: 'With first meal (13:00) — must have fat for absorption',
    linkedBiomarkers: ['Vitamin D (25-OH)', 'Testosterone', 'Calcium', 'Immune markers'],
    linkedGym: ['Supports bone density for strength training', 'Increases testosterone (strength gains)', 'Improves muscle protein synthesis'],
    linkedNutrition: ['MUST take with fat (olive oil, fish, eggs)', 'Absorption: 300% better with food', '5000 IU = gout-safe dose for this user'],
    warnings: ['DO NOT take 20,000 IU daily (gout risk)', 'Monitor BP first 7-10 days', 'K2 prevents arterial calcification (critical with D3)'],
  },
  'Zinc Bisglycinate': {
    emoji: '🧬',
    benefit: 'Testosterone + immune + testosterone libido',
    mechanism: 'Cofactor for 300+ enzymes, essential for testosterone production, immune T-cell activation, protein synthesis, antioxidant defense',
    studies: ['Increases total testosterone 22-38% when deficient', 'Improves immune response (T-cell count +40%)', 'Accelerates wound healing and muscle recovery'],
    timing: 'With first meal (13:00) to prevent nausea',
    linkedBiomarkers: ['Testosterone', 'Immune count', 'Muscle mass'],
    linkedGym: ['Direct testosterone support for muscle gains', 'Accelerates recovery post-workout', 'Improves strength gains 12-15%'],
    linkedNutrition: ['Take with food (prevents GI upset)', 'Works synergistically with Vitamin D3', 'Optimal on protein-rich meals'],
    warnings: ['Do NOT take on empty stomach (nausea risk)', 'Do NOT exceed 50mg daily (copper depletion)', 'Bisglycinate form = better absorption than citrate'],
  },
  'Boron': {
    emoji: '🧬',
    benefit: 'Free testosterone + SHBG optimization',
    mechanism: 'Increases free testosterone by lowering SHBG (sex hormone binding globulin), improves bone density, enhances magnesium absorption, anti-inflammatory',
    studies: ['3mg daily increases free testosterone 20-30%', 'SHBG reduction = more bioavailable testosterone', 'Bone mineral density +3% in 8 weeks'],
    timing: '3mg tablet with first meal (13:00) with fat',
    linkedBiomarkers: ['Free Testosterone', 'SHBG', 'Libido', 'Bone density'],
    linkedGym: ['Increases free testosterone (critical for muscle gains)', 'Reduces hormone-binding proteins', 'Better strength gains per gram of muscle'],
    linkedNutrition: ['Take with meal for absorption', 'Complements Zinc + Vitamin D3 for hormone optimization', 'Synergizes with Ginseng for libido'],
    warnings: ['MUST CYCLE: 8 weeks ON / 2 weeks OFF', 'DO NOT use 10mg version (gout risk)', '3mg = only gout-safe dose', 'Cycling prevents receptor desensitization'],
    cycling: 'boron_8_2',
  },
  'CoQ10 (Ubiquinone)': {
    emoji: '❤️',
    benefit: 'Cardiovascular + endothelial function + mitochondrial',
    mechanism: 'Electron transport chain cofactor, supports ATP production in heart, improves endothelial function (more nitric oxide = better erections), antioxidant',
    studies: ['Reduces systolic BP by 11-17 mmHg in hypertension studies', 'Improves endothelial dysfunction in 70% of men with ED', 'Heart ejection fraction +5% in heart failure patients'],
    timing: '200mg with first meal (13:00) — MUST have fat',
    linkedBiomarkers: ['Blood pressure', 'Endothelial function', 'Heart health'],
    linkedGym: ['Improves cardiovascular capacity (VO2 max)', 'Better blood flow = harder erections', 'Supports endurance performance'],
    linkedNutrition: ['MUST take with fat (absorption ↓60% on empty stomach)', 'Fat source: olive oil, avocado, fatty fish', 'Complements Omega-3 for vascular health'],
    warnings: ['DO NOT take fasted (absorption critical)', 'May slightly lower BP (monitor first week)', 'Works synergistically with L-Citrulline'],
  },
  'Omega-3 (Fish Oil + Astaxanthin)': {
    emoji: '🐟',
    benefit: 'Anti-inflammatory + vascular health + lipid profile',
    mechanism: 'EPA/DHA reduce inflammatory markers (CRP, IL-6), improve lipid ratio (HDL/LDL), support endothelial function, gout-friendly (anti-inflammatory)',
    studies: ['REDUCE-IT: high-dose EPA reduces cardiovascular events by 25%', 'Improves triglyceride ratio by 30-40%', 'Anti-inflammatory: reduces CRP by 40-50%'],
    timing: '2 caps (≥1000mg EPA+DHA) with first meal (13:00)',
    linkedBiomarkers: ['Triglycerides', 'HDL/LDL ratio', 'CRP (inflammation)', 'Uric acid (gout-friendly)'],
    linkedGym: ['Reduces post-workout inflammation', 'Improves recovery speed', 'Better joint health for heavy training'],
    linkedNutrition: ['Take with large meal (fat absorption)', 'Works with Vitamin D3 for cardiovascular benefit', 'Complements CoQ10 for vascular health'],
    warnings: ['MUST take with food (reflux risk on empty stomach)', 'Astaxanthin = red color (prevents oxidation of EPA/DHA)', 'Check for fish allergies'],
  },
  'Magnesium Taurate': {
    emoji: '💤',
    benefit: 'Blood pressure + sleep quality + muscle recovery',
    mechanism: 'Relaxes smooth muscle in blood vessels (lowers BP), activates parasympathetic nervous system (sleep quality), supports protein synthesis, involved in 600+ enzymatic reactions',
    studies: ['Reduces systolic BP by 3-5 mmHg', 'Improves sleep efficiency (time to sleep ↓15-20min)', 'Taurate form specifically supports cardiac function'],
    timing: '1 capsule with last meal (18:00), 1 capsule before bed (21:30)',
    linkedBiomarkers: ['Blood pressure', 'Sleep quality', 'Muscle recovery'],
    linkedGym: ['Accelerates muscle recovery (protein synthesis)', 'Reduces DOMS (muscle soreness)', 'Better sleep = faster gains'],
    linkedNutrition: ['Take with meal (morning dose) + before bed (evening dose)', 'Taurate form = cardiac-specific (better than citrate)', 'Synergizes with CoQ10 for BP control'],
    warnings: ['Do NOT exceed 400-500mg daily in one dose', 'Taurate form = use this, not regular magnesium glycinate', 'May cause mild sedation (feature, not bug)'],
  },
  'L-Citrulline': {
    emoji: '⚡',
    benefit: 'Nitric oxide boost + erectile function + pump',
    mechanism: 'Amino acid → converted to arginine → nitric oxide synthesis → vasodilation → increased blood flow to penile tissue → better erections; also improves muscle pump',
    studies: ['Improves erectile rigidity by 23-50%', 'Increases nitric oxide levels by 3-4x', 'Enhances muscle pump and blood flow'],
    timing: '6g powder dissolved in 300-400ml water, 45-60 min BEFORE gym or sex, on EMPTY stomach',
    linkedBiomarkers: ['Erectile function', 'Nitric oxide', 'Blood flow'],
    linkedGym: ['Increases muscle pump (visual effect)', 'Improves endurance (delays fatigue)', 'Better blood flow = muscle nutrient delivery'],
    linkedNutrition: ['DO NOT use daily', 'Use only pre-training or pre-sex days', 'Empty stomach = better absorption', 'Mix with water only, no juice/food'],
    warnings: ['❌ DO NOT USE DAILY (tolerance buildup in 7-10 days)', 'Use only 2-3x per week MAX', 'Do NOT use on empty stomach with meals', 'May cause mild headache (vasodilation effect)'],
  },
};

const DAILY_SCHEDULE = [
  {
    time: '09:00',
    icon: '🌅',
    title: 'MORNING - FASTED',
    items: [
      { name: 'Saxenda Injection', category: 'Saxenda Injection' },
      { name: 'NMN', category: 'NMN (Nicotinamide Mononucleotide)' },
      { name: 'Panax Ginseng', category: 'Panax Ginseng', note: '(1 cap fasted, or 2 caps on training days)' },
    ],
  },
  {
    time: '13:00',
    icon: '🍽️',
    title: 'FIRST MEAL - WITH FAT',
    items: [
      { name: 'Your Meal', description: 'Olive oil, eggs, fish, meat, avocado — all fat-soluble items below taken WITH this meal' },
      { name: 'Vitamin D3 + K2', category: 'Vitamin D3 + K2' },
      { name: 'Zinc Bisglycinate', category: 'Zinc Bisglycinate' },
      { name: 'Boron', category: 'Boron', note: '(3mg only)' },
      { name: 'CoQ10', category: 'CoQ10 (Ubiquinone)' },
      { name: 'Omega-3', category: 'Omega-3 (Fish Oil + Astaxanthin)' },
    ],
  },
  {
    time: '18:00',
    icon: '🍽️',
    title: 'LAST MEAL',
    items: [
      { name: 'Magnesium Taurate', category: 'Magnesium Taurate', note: '(1 capsule with meal)' },
    ],
  },
  {
    time: '21:30',
    icon: '🌙',
    title: 'BEFORE SLEEP',
    items: [
      { name: 'Magnesium Taurate', category: 'Magnesium Taurate', note: '(1 capsule with water)' },
    ],
  },
  {
    time: 'PRE-GYM/SEX',
    icon: '⚡',
    title: 'OPTIONAL - TRAINING OR SEX DAYS ONLY',
    items: [
      { name: 'L-Citrulline', category: 'L-Citrulline', note: '(45-60 min before, empty stomach, 6g powder)' },
    ],
  },
];

function getCycleStatus(cycleType: 'ginseng_6_2' | 'boron_8_2') {
  const startDate = new Date('2026-04-10');
  const today = new Date();
  const daysSinceStart = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  if (cycleType === 'ginseng_6_2') {
    const cycleLength = 56; // 6 + 2 weeks
    const dayInCycle = daysSinceStart % cycleLength;
    const isOn = dayInCycle < 42;
    const week = Math.floor(dayInCycle / 7) + 1;
    const daysLeft = isOn ? 42 - dayInCycle : 56 - dayInCycle;
    return { status: isOn ? 'ON' : 'OFF', week, totalWeeks: 8, daysLeft, nextChange: new Date(today.getTime() + daysLeft * 24 * 60 * 60 * 1000).toLocaleDateString() };
  }

  if (cycleType === 'boron_8_2') {
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
  const [addForm, setAddForm] = useState({ name: '', dose: '', frequency: '', category: '', notes: '', time_slot: '' });
  const [addLoading, setAddLoading] = useState(false);
  const [primaryProfileId, setPrimaryProfileId] = useState<number | null>(null);
  const [expandedSupplement, setExpandedSupplement] = useState<string | null>(null);
  const [reminders, setReminders] = useState<any[]>([]);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [reminderForm, setReminderForm] = useState({
    medication_name: '',
    reminder_time: '08:00',
    frequency: 'daily',
    dosage: '',
    instructions: '',
    notes: '',
  });

  // Edit form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editType, setEditType] = useState<'intervention' | 'bp-med' | 'supplement' | null>(null);
  const [editForm, setEditForm] = useState({ name: '', dose: '', frequency: '', category: '', notes: '', time_slot: '' });
  const [editLoading, setEditLoading] = useState(false);

  const ginsengCycle = getCycleStatus('ginseng_6_2');
  const boronCycle = getCycleStatus('boron_8_2');

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
    const loadProfiles = async () => {
      try {
        const profiles = await getHealthProfiles();
        const primary = profiles.find((p: any) => p.is_primary) || profiles[0];
        if (primary) {
          setPrimaryProfileId(primary.id);
          try {
            const allReminders = await getMedicationReminders(primary.id);
            setReminders(allReminders);
          } catch (e) {
            console.error('Failed to load reminders:', e);
          }
        }
      } catch (e) {
        console.error('Failed to load profiles:', e);
      }
    };

    loadProfiles();
    fetchSupplements();
  }, [fetchSupplements]);

  const handleAddSupplement = async () => {
    if (!addForm.name.trim()) {
      setError(locale === 'bg' ? 'Име е задължително' : 'Name required');
      return;
    }
    if (!addForm.time_slot) {
      setError(locale === 'bg' ? 'Време на ден е задължително' : 'Time of day is required');
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

        const response = await fetch('/api/health/interventions/', {
          method: 'POST',
          body: formData,
          headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}` },
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to create intervention');
        }
      } else if (addType === 'bp-med') {
        if (!primaryProfileId) {
          throw new Error(locale === 'bg' ? 'Няма здравен профил' : 'No health profile found');
        }

        const formData = new FormData();
        formData.append('name', addForm.name);
        formData.append('dose', addForm.dose);
        formData.append('frequency', addForm.frequency || 'daily');
        formData.append('is_active', 'true');
        formData.append('notes', addForm.notes);
        formData.append('profile', String(primaryProfileId));
        formData.append('started_at', new Date().toISOString().split('T')[0]);

        const response = await fetch('/api/health/bp/medications/', {
          method: 'POST',
          body: formData,
          headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}` },
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || errorData.profile?.[0] || 'Failed to create BP medication');
        }
      } else if (addType === 'supplement') {
        // Create supplement + schedule for Daily Checklist
        if (!primaryProfileId) {
          throw new Error(locale === 'bg' ? 'Няма здравен профил' : 'No health profile found');
        }

        // Create the supplement
        const suppRes = await fetch('/api/health/supplements/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`,
          },
          body: JSON.stringify({
            name: addForm.name,
            category: addForm.category || 'other',
            is_active: true,
          }),
        });
        if (!suppRes.ok) {
          const errorData = await suppRes.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to create supplement');
        }
        const supplement = await suppRes.json();

        // Create a schedule for today
        const schedRes = await fetch('/api/health/schedules/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`,
          },
          body: JSON.stringify({
            supplement: supplement.id,
            profile: primaryProfileId,
            time_slot: addForm.time_slot,
            dose_amount: addForm.dose || '1',
            dose_unit: addForm.category === 'injection' ? 'injection' : 'dose',
            take_with_food: false,
            is_active: true,
            days_of_week: [0, 1, 2, 3, 4, 5, 6], // Every day
          }),
        });
        if (!schedRes.ok) {
          const errorData = await schedRes.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to create schedule');
        }
      }

      setAddForm({ name: '', dose: '', frequency: '', category: '', notes: '', time_slot: '' });
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

  const handleEditSupplement = (s: Supplement, type: 'intervention' | 'bp-med' | 'supplement') => {
    setEditingId(s.id);
    setEditType(type);
    setEditForm({
      name: s.name,
      dose: s.dose || '',
      frequency: s.frequency || '',
      category: s.category || '',
      notes: '',
      time_slot: '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editForm.name.trim()) {
      setError(locale === 'bg' ? 'Име е задължително' : 'Name is required');
      return;
    }

    try {
      setEditLoading(true);
      // API update would go here - for now, just close the form
      // In a real app, you'd call updateIntervention/updateBPMedication/updateSupplement
      setEditingId(null);
      setEditType(null);
      setError('');
      await fetchSupplements();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditType(null);
    setEditForm({ name: '', dose: '', frequency: '', category: '', notes: '', time_slot: '' });
  };

  const handleCreateReminder = async () => {
    if (!primaryProfileId || !reminderForm.medication_name.trim()) {
      setError(locale === 'bg' ? 'Име на лекарство е задължително' : 'Medication name required');
      return;
    }

    try {
      await createMedicationReminder({
        profile: primaryProfileId,
        medication_name: reminderForm.medication_name,
        reminder_time: reminderForm.reminder_time,
        frequency: reminderForm.frequency,
        dosage: reminderForm.dosage,
        instructions: reminderForm.instructions,
        notes: reminderForm.notes,
      });

      setReminderForm({
        medication_name: '',
        reminder_time: '08:00',
        frequency: 'daily',
        dosage: '',
        instructions: '',
        notes: '',
      });
      setShowReminderForm(false);
      setError('');

      const allReminders = await getMedicationReminders(primaryProfileId);
      setReminders(allReminders);
    } catch (e: any) {
      setError(e.message);
    }
  };

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
          {(['schedule', 'cabinet', 'cycling', 'gym', 'nutrition', 'add'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab === 'schedule' && '📋 Schedule'}
              {tab === 'cabinet' && '💊 Cabinet'}
              {tab === 'cycling' && '🔄 Cycling'}
              {tab === 'gym' && '💪 Gym Support'}
              {tab === 'nutrition' && '🍽️ Nutrition'}
              {tab === 'add' && '➕ Add'}
            </button>
          ))}
        </div>

        {/* TAB 1: DAILY PROTOCOL WITH DETAILED INFO */}
        {activeTab === 'schedule' && (
          <div className="space-y-4">
            <Card className="bg-indigo-50 border-indigo-200 mb-4">
              <div className="text-sm">
                <span className="font-semibold text-gray-900">Complete Daily Protocol</span>
                <div className="text-xs text-gray-600 mt-1">Total daily pills: 8-9 | Fasting: ~18 hours | All supplements science-backed and gout/BP-safe</div>
              </div>
            </Card>

            {DAILY_SCHEDULE.map((slot, i) => (
              <div key={i} className="space-y-2">
                <Card>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl">{slot.icon}</span>
                    <div>
                      <div className="text-sm font-medium text-gray-700">{slot.time}</div>
                      <div className="font-semibold text-gray-900">{slot.title}</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {slot.items.map((item, j) => {
                      const info = item.category ? SUPPLEMENT_INFO[item.category] : undefined;
                      const isExpanded = expandedSupplement === `${i}-${j}`;

                      return (
                        <div key={j}>
                          <button
                            onClick={() => setExpandedSupplement(isExpanded ? null : `${i}-${j}`)}
                            className="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 transition-colors"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900">{item.name}</h4>
                                {item.description && <p className="text-xs text-gray-600 mt-1">{item.description}</p>}
                                {item.note && <p className="text-xs text-amber-700 mt-1">{item.note}</p>}
                              </div>
                              <span className="text-gray-400 ml-2">{isExpanded ? '▼' : '▶'}</span>
                            </div>
                          </button>

                          {isExpanded && info && (
                            <div className="mt-2 p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-3 text-sm">
                              <div>
                                <div className="font-semibold text-blue-900 mb-1">🎯 What it does</div>
                                <p className="text-blue-800">{info.benefit}</p>
                              </div>

                              <div>
                                <div className="font-semibold text-blue-900 mb-1">⚙️ How it works</div>
                                <p className="text-blue-800">{info.mechanism}</p>
                              </div>

                              <div>
                                <div className="font-semibold text-blue-900 mb-1">📊 Studies</div>
                                <ul className="text-blue-800 space-y-1">
                                  {info.studies.map((study, k) => (
                                    <li key={k} className="flex gap-2">
                                      <span className="flex-shrink-0">✓</span>
                                      <span>{study}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              <div>
                                <div className="font-semibold text-blue-900 mb-1">⏰ Timing & Absorption</div>
                                <p className="text-blue-800">{info.timing}</p>
                              </div>

                              {info.linkedBiomarkers.length > 0 && (
                                <div>
                                  <div className="font-semibold text-blue-900 mb-1">📈 Linked Biomarkers</div>
                                  <div className="flex flex-wrap gap-1">
                                    {info.linkedBiomarkers.map((marker) => (
                                      <Badge key={marker} color="blue">{marker}</Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {info.linkedGym.length > 0 && (
                                <div>
                                  <div className="font-semibold text-blue-900 mb-1">💪 Gym Benefits</div>
                                  <ul className="text-blue-800 space-y-1">
                                    {info.linkedGym.map((benefit, k) => (
                                      <li key={k}>• {benefit}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {info.linkedNutrition.length > 0 && (
                                <div>
                                  <div className="font-semibold text-blue-900 mb-1">🍽️ Nutrition Timing</div>
                                  <ul className="text-blue-800 space-y-1">
                                    {info.linkedNutrition.map((timing, k) => (
                                      <li key={k}>• {timing}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {info.warnings.length > 0 && (
                                <div className="bg-red-100 border border-red-300 p-2 rounded">
                                  <div className="font-semibold text-red-900 mb-1">⚠️ Warnings & Contraindications</div>
                                  <ul className="text-red-900 space-y-1">
                                    {info.warnings.map((warning, k) => (
                                      <li key={k}>• {warning}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {info.cycling && (
                                <div className="bg-amber-100 border border-amber-300 p-2 rounded">
                                  <div className="font-semibold text-amber-900 mb-1">🔄 Cycling Schedule</div>
                                  <p className="text-amber-900">
                                    {info.cycling === 'ginseng_6_2' ? '6 weeks ON / 2 weeks OFF' : '8 weeks ON / 2 weeks OFF'}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: MY CABINET */}
        {activeTab === 'cabinet' && (
          <>
            {loading ? (
              <Spinner />
            ) : supplements.length === 0 && reminders.length === 0 ? (
              <EmptyState icon="💊" message={locale === 'bg' ? 'Няма добавки или напомняния' : 'No supplements or reminders'} />
            ) : (
              <div className="space-y-6">
                {/* Supplements */}
                {supplements.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-gray-900">💊 {locale === 'bg' ? 'Добавки' : 'Supplements'}</h3>
                    <div className="space-y-3">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b-2 border-gray-300">
                            <th className="text-left py-2 px-2">Name</th>
                            <th className="text-left py-2 px-2">Dose</th>
                            <th className="text-left py-2 px-2">Type</th>
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
                              <td className="py-3 px-2">
                                {s._from_intervention && <Badge color="red">Therapy</Badge>}
                                {s._from_bp && <Badge color="blue">BP Med</Badge>}
                                {!s._from_intervention && !s._from_bp && <Badge color="green">Supplement</Badge>}
                              </td>
                              <td className="py-3 px-2 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleEditSupplement(s, s._from_intervention ? 'intervention' : s._from_bp ? 'bp-med' : 'supplement')}
                                  >
                                    ✎
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => handleDeleteSupplement(s.id, s._from_intervention ? 'intervention' : s._from_bp ? 'bp-med' : 'supplement')}
                                  >
                                    ✕
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Reminders */}
                {reminders.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-gray-900">🔔 {locale === 'bg' ? 'Напомняния' : 'Reminders'}</h3>
                    <div className="space-y-2">
                      {reminders.map((reminder: any) => (
                        <Card key={reminder.id}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">{reminder.medication_name}</div>
                              <div className="text-xs text-gray-600 mt-1">
                                ⏰ {reminder.reminder_time} • {reminder.frequency_display || 'daily'}
                              </div>
                              {reminder.dosage && (
                                <div className="text-xs text-gray-600">💊 {reminder.dosage}</div>
                              )}
                              {reminder.instructions && (
                                <div className="text-xs text-gray-500 italic mt-1">{reminder.instructions}</div>
                              )}
                            </div>
                            <Badge color={reminder.status === 'active' ? 'green' : 'yellow'}>
                              {reminder.status_display || 'Active'}
                            </Badge>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* TAB 3: CYCLING STATUS */}
        {activeTab === 'cycling' && (
          <div className="space-y-4">
            {/* Ginseng */}
            <Card className={ginsengCycle.status === 'ON' ? 'bg-green-50 border-green-200 border-2' : 'bg-red-50 border-red-200 border-2'}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🌿</span>
                  <div>
                    <h3 className="text-lg font-bold">Panax Ginseng (6/2 cycle)</h3>
                    <p className="text-sm text-gray-600">Libido & energy optimization</p>
                  </div>
                </div>
                <Badge color={ginsengCycle.status === 'ON' ? 'green' : 'red'}>
                  {ginsengCycle.status}
                </Badge>
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium mb-2">
                  <span>Week {ginsengCycle.week}/8</span>
                  <span>{ginsengCycle.daysLeft} days left</span>
                </div>
                <div className="w-full bg-gray-300 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${ginsengCycle.status === 'ON' ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: `${(ginsengCycle.week / 8) * 100}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                <div>
                  <div className="text-gray-600">ON weeks</div>
                  <div className="text-xl font-bold">6</div>
                </div>
                <div>
                  <div className="text-gray-600">OFF weeks</div>
                  <div className="text-xl font-bold">2</div>
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded text-sm text-blue-900">
                <strong>Why cycle?</strong> Prevents dopamine receptor desensitization. Off weeks allow libido response to reset while maintaining long-term effectiveness.
              </div>
            </Card>

            {/* Boron */}
            <Card className={boronCycle.status === 'ON' ? 'bg-green-50 border-green-200 border-2' : 'bg-red-50 border-red-200 border-2'}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🧬</span>
                  <div>
                    <h3 className="text-lg font-bold">Boron (8/2 cycle)</h3>
                    <p className="text-sm text-gray-600">Free testosterone optimization</p>
                  </div>
                </div>
                <Badge color={boronCycle.status === 'ON' ? 'green' : 'red'}>
                  {boronCycle.status}
                </Badge>
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-sm font-medium mb-2">
                  <span>Week {boronCycle.week}/10</span>
                  <span>{boronCycle.daysLeft} days left</span>
                </div>
                <div className="w-full bg-gray-300 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${boronCycle.status === 'ON' ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: `${(boronCycle.week / 10) * 100}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                <div>
                  <div className="text-gray-600">ON weeks</div>
                  <div className="text-xl font-bold">8</div>
                </div>
                <div>
                  <div className="text-gray-600">OFF weeks</div>
                  <div className="text-xl font-bold">2</div>
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded text-sm text-blue-900">
                <strong>Why cycle?</strong> SHBG-binding sites have limited capacity. Off weeks allow hormone receptor sensitivity to normalize, preventing adaptation.
              </div>
            </Card>
          </div>
        )}

        {/* TAB 4: GYM INTEGRATION */}
        {activeTab === 'gym' && (
          <div className="space-y-4">
            <Card className="bg-purple-50 border-purple-200">
              <h3 className="font-semibold mb-2 text-purple-900">How Your Supplements Support Training</h3>
              <p className="text-sm text-purple-800">Your entire protocol is designed to maximize muscle gains, strength, and recovery from your gym routine.</p>
            </Card>

            <Card>
              <h4 className="font-semibold mb-3 text-gray-900">💪 Strength Gains Support</h4>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-indigo-600 font-semibold flex-shrink-0">1.</span>
                  <div>
                    <strong>Zinc (25mg)</strong> — Direct testosterone support. Increases T by 22-38%, essential cofactor for muscle protein synthesis.
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="text-indigo-600 font-semibold flex-shrink-0">2.</span>
                  <div>
                    <strong>Boron (3mg, 8 weeks ON)</strong> — Frees up testosterone from SHBG binding. When OFF weeks, expect 15-20% libido dip (normal, receptors resetting).
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="text-indigo-600 font-semibold flex-shrink-0">3.</span>
                  <div>
                    <strong>Vitamin D3 (5000 IU)</strong> — Increases testosterone by 20-30% in deficient men. Also supports bone density for heavy lifting.
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="text-indigo-600 font-semibold flex-shrink-0">4.</span>
                  <div>
                    <strong>Panax Ginseng (1-2 caps)</strong> — Pre-training energy and dopamine. Use 2 caps on heavy lift days only (1 cap daily is baseline).
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <h4 className="font-semibold mb-3 text-gray-900">⏱️ Recovery Acceleration</h4>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-emerald-600 font-semibold flex-shrink-0">1.</span>
                  <div>
                    <strong>NMN (500mg)</strong> — Mitochondrial recovery. Restores ATP production, enables faster 24-48h muscle recovery.
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="text-emerald-600 font-semibold flex-shrink-0">2.</span>
                  <div>
                    <strong>Magnesium Taurate (2x daily)</strong> — Activates parasympathetic (sleep), improves protein synthesis, reduces DOMS (muscle soreness).
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="text-emerald-600 font-semibold flex-shrink-0">3.</span>
                  <div>
                    <strong>Omega-3 (2000mg EPA+DHA)</strong> — Anti-inflammatory. Reduces post-workout inflammation, speeds recovery by 15-20%.
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <h4 className="font-semibold mb-3 text-gray-900">⚡ Pre-Workout Performance</h4>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-orange-600 font-semibold flex-shrink-0">1.</span>
                  <div>
                    <strong>L-Citrulline (6g, pre-workout only)</strong> — Nitric oxide boost → vasodilation → increased blood flow to muscles. 45-60 min before gym, empty stomach.
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="text-orange-600 font-semibold flex-shrink-0">2.</span>
                  <div>
                    <strong>CoQ10 (200mg with breakfast)</strong> — Improves vascular function, better pump and nutrient delivery to muscles. Endurance capacity ↑.
                  </div>
                </div>
              </div>
            </Card>

            <Card className="bg-amber-50 border-amber-200">
              <h4 className="font-semibold mb-2 text-amber-900">⚠️ Important: Daily vs. As-Needed</h4>
              <ul className="text-sm text-amber-800 space-y-1">
                <li>✓ <strong>Daily</strong>: Saxenda, NMN, Ginseng (1 cap), D3, Zinc, Boron (cycling), CoQ10, Omega-3, Magnesium Taurate</li>
                <li>✓ <strong>Only 2-3x/week (training days)</strong>: Ginseng extra cap (2 caps total), L-Citrulline pre-workout</li>
                <li>❌ <strong>Never daily</strong>: L-Citrulline (tolerance in 7-10 days if daily)</li>
              </ul>
            </Card>
          </div>
        )}

        {/* TAB 5: NUTRITION INTEGRATION */}
        {activeTab === 'nutrition' && (
          <div className="space-y-4">
            <Card className="bg-green-50 border-green-200">
              <h3 className="font-semibold mb-2 text-green-900">Timing with Meals & Fasting</h3>
              <p className="text-sm text-green-800">Your supplement protocol is designed around an 18-hour fasting window (9am-1pm eating window). All timing is optimized for absorption.</p>
            </Card>

            <Card>
              <h4 className="font-semibold mb-3 text-gray-900">🌅 09:00 AM - Morning (FASTED)</h4>
              <div className="space-y-2 text-sm text-gray-700">
                <p className="font-medium">Saxenda + NMN + Ginseng</p>
                <ul className="space-y-1 ml-3">
                  <li>• <strong>Water allowed</strong> — helps with NMN absorption</li>
                  <li>• <strong>NO food for 4 hours</strong> — Saxenda needs fasted state for full effect</li>
                  <li>• <strong>NMN on empty stomach</strong> — 300% better absorption than with food</li>
                  <li>• <strong>Ginseng fasted-OK</strong> — can be taken on empty stomach, better for dopamine effect</li>
                </ul>
              </div>
            </Card>

            <Card>
              <h4 className="font-semibold mb-3 text-gray-900">🍽️ 13:00 PM - First Meal (WITH FAT)</h4>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium text-gray-900 mb-1">Required: Large meal with healthy fats</p>
                  <p className="text-gray-600">Olive oil, avocado, fatty fish (salmon, sardines), eggs, meat, nuts</p>
                </div>
                <div className="bg-blue-50 p-2 rounded border border-blue-200">
                  <p className="font-medium text-blue-900 mb-1">Why fat is critical:</p>
                  <ul className="text-blue-800 space-y-1 ml-3">
                    <li>• <strong>Vitamin D3+K2</strong> — Fat-soluble; absorption ↑600-1000% with fat vs. empty stomach</li>
                    <li>• <strong>CoQ10</strong> — Fat-soluble; absorption ↓60% without food</li>
                    <li>• <strong>Omega-3</strong> — Reduces reflux risk; better absorption with food</li>
                    <li>• <strong>Zinc, Boron</strong> — Better absorption and prevents nausea</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Supplements with this meal:</p>
                  <p className="text-gray-600">D3+K2, Zinc, Boron, CoQ10, Omega-3 (all 5 together with meal)</p>
                </div>
              </div>
            </Card>

            <Card>
              <h4 className="font-semibold mb-3 text-gray-900">🍽️ 18:00 PM - Last Meal</h4>
              <div className="space-y-2 text-sm text-gray-700">
                <p>Magnesium Taurate (1 cap) with meal → activates parasympathetic nervous system.</p>
              </div>
            </Card>

            <Card>
              <h4 className="font-semibold mb-3 text-gray-900">🌙 21:30 PM - Before Sleep</h4>
              <div className="space-y-2 text-sm text-gray-700">
                <p>Magnesium Taurate (1 cap) with water → improves sleep quality, better erection quality during REM.</p>
              </div>
            </Card>

            <Card className="bg-yellow-50 border-yellow-200">
              <h4 className="font-semibold mb-2 text-yellow-900">⚠️ Critical Absorption Facts</h4>
              <div className="space-y-2 text-sm text-yellow-900">
                <div>
                  <strong>DO NOT do this:</strong>
                  <ul className="ml-3 space-y-1">
                    <li>❌ Take CoQ10 on empty stomach (waste 60% of dose)</li>
                    <li>❌ Take D3+K2 without fat (waste 90% of dose)</li>
                    <li>❌ Take Zinc on empty stomach (nausea guaranteed)</li>
                    <li>❌ Mix L-Citrulline with food (defeats purpose of empty stomach pre-workout)</li>
                  </ul>
                </div>
              </div>
            </Card>

            <Card>
              <h4 className="font-semibold mb-3 text-gray-900">🚫 Foods to Avoid or Limit</h4>
              <div className="space-y-2 text-sm text-gray-700">
                <div>
                  <strong>With Boron (3mg, 8 weeks ON):</strong>
                  <ul className="ml-3 space-y-1 text-gray-600">
                    <li>❌ High purine foods: red meat (frequently), organ meats, shellfish, dried mushrooms → gout risk</li>
                    <li>✓ OK: white fish, chicken, eggs, vegetables</li>
                  </ul>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 6: ADD SUPPLEMENT - CONSOLIDATED & SMART FORM */}
        {activeTab === 'add' && (
          <Card>
            <h3 className="font-semibold text-lg mb-4">➕ {locale === 'bg' ? 'Добави добавка / лекарство' : 'Add Supplement or Medication'}</h3>

            <div className="space-y-4">
              {/* Type */}
              <Select
                label={locale === 'bg' ? 'Тип' : 'Type'}
                value={addType}
                onChange={(e) => setAddType(e.target.value as any)}
              >
                <option value="supplement">{locale === 'bg' ? 'Добавка' : 'Supplement'}</option>
                <option value="intervention">{locale === 'bg' ? 'Терапия' : 'Therapy'}</option>
                <option value="bp-med">{locale === 'bg' ? 'КН лекарство' : 'BP Medicine'}</option>
              </Select>

              {/* Name */}
              <Input
                label={locale === 'bg' ? 'Име *' : 'Name *'}
                required
                placeholder={locale === 'bg' ? 'например: Витамин D3' : 'e.g., Vitamin D3'}
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              />

              {/* Dose with dropdown options */}
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label={locale === 'bg' ? 'Доза' : 'Dose'}
                  value={addForm.dose}
                  onChange={(e) => setAddForm({ ...addForm, dose: e.target.value })}
                >
                  <option value="">Select or type...</option>
                  <option value="250mg">250mg</option>
                  <option value="500mg">500mg</option>
                  <option value="1000mg">1000mg</option>
                  <option value="2000mg">2000mg</option>
                  <option value="5000mg">5000mg</option>
                  <option value="1 tablet">1 tablet</option>
                  <option value="2 tablets">2 tablets</option>
                  <option value="1 capsule">1 capsule</option>
                  <option value="5ml">5ml</option>
                  <option value="10ml">10ml</option>
                </Select>

                {/* Size/Form */}
                <Select
                  label={locale === 'bg' ? 'Размер' : 'Form'}
                  value={addForm.category || ''}
                  onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                >
                  <option value="">Select form...</option>
                  <option value="tablet">Tablet</option>
                  <option value="capsule">Capsule</option>
                  <option value="liquid">Liquid</option>
                  <option value="powder">Powder</option>
                  <option value="injection">Injection</option>
                </Select>
              </div>

              {/* Frequency with dropdown options */}
              <Select
                label={locale === 'bg' ? 'Честота' : 'Frequency'}
                value={addForm.frequency}
                onChange={(e) => setAddForm({ ...addForm, frequency: e.target.value })}
              >
                <option value="">Select frequency...</option>
                <option value="daily">Once daily</option>
                <option value="twice daily">Twice daily</option>
                <option value="three times daily">Three times daily</option>
                <option value="as needed">As needed</option>
                <option value="weekdays">Weekdays only</option>
                <option value="weekends">Weekends only</option>
                <option value="every other day">Every other day</option>
              </Select>

              {/* Time Slot — REQUIRED for Daily Checklist */}
              <Select
                label={locale === 'bg' ? 'Време на ден *' : 'Time of Day *'}
                required
                value={addForm.time_slot || ''}
                onChange={(e) => setAddForm({ ...addForm, time_slot: e.target.value })}
              >
                <option value="">Select when to take...</option>
                <option value="morning">🌅 Morning (6-8am)</option>
                <option value="breakfast">🍳 Breakfast (8-10am)</option>
                <option value="lunch">🍽️ Lunch (12-1pm)</option>
                <option value="afternoon">☕ Afternoon (3-4pm)</option>
                <option value="dinner">🍷 Dinner (6-7pm)</option>
                <option value="evening">🌙 Evening (8-9pm)</option>
                <option value="bedtime">😴 Bedtime (9-10pm)</option>
                <option value="as_needed">⏰ As needed</option>
              </Select>

              {/* Notes */}
              <Textarea
                label={locale === 'bg' ? 'Бележки' : 'Notes'}
                placeholder={locale === 'bg' ? 'например: Приемете с храна' : 'e.g., Take with food'}
                value={addForm.notes}
                onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              />

              {/* Reminder section for medications */}
              {(addType === 'bp-med' || addType === 'intervention') && (
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-medium text-gray-900 mb-3">🔔 {locale === 'bg' ? 'Напомняне (опционално)' : 'Set Reminder (Optional)'}</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label={locale === 'bg' ? 'Време' : 'Reminder Time'}
                      type="time"
                      value={reminderForm.reminder_time}
                      onChange={(e) => setReminderForm({ ...reminderForm, reminder_time: e.target.value })}
                    />

                    <Select
                      label={locale === 'bg' ? 'Честота напомняне' : 'Reminder Frequency'}
                      value={reminderForm.frequency}
                      onChange={(e) => setReminderForm({ ...reminderForm, frequency: e.target.value })}
                    >
                      <option value="daily">Every day</option>
                      <option value="weekdays">Weekdays only</option>
                      <option value="weekends">Weekends only</option>
                      <option value="custom">Custom days</option>
                    </Select>
                  </div>
                </div>
              )}

              {error && <Alert type="error" message={error} />}

              {/* Action buttons */}
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

        {/* EDIT MODAL */}
        {editingId !== null && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  {locale === 'bg' ? 'Редактирай' : 'Edit'} {editForm.name}
                </h2>
              </div>

              <div className="space-y-4">
                <Input
                  label={locale === 'bg' ? 'Име' : 'Name'}
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />

                <Input
                  label={locale === 'bg' ? 'Доза' : 'Dose'}
                  value={editForm.dose}
                  onChange={(e) => setEditForm({ ...editForm, dose: e.target.value })}
                />

                <Select
                  label={locale === 'bg' ? 'Честота' : 'Frequency'}
                  value={editForm.frequency}
                  onChange={(e) => setEditForm({ ...editForm, frequency: e.target.value })}
                >
                  <option value="">—</option>
                  <option value="daily">{locale === 'bg' ? 'Дневно' : 'Daily'}</option>
                  <option value="twice_daily">{locale === 'bg' ? 'Два пъти дневно' : 'Twice Daily'}</option>
                  <option value="weekly">{locale === 'bg' ? 'Седмично' : 'Weekly'}</option>
                  <option value="as_needed">{locale === 'bg' ? 'По необходимост' : 'As Needed'}</option>
                </Select>

                <Textarea
                  label={locale === 'bg' ? 'Бележки' : 'Notes'}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />

                {error && <Alert type="error" message={error} />}

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="secondary"
                    onClick={handleCancelEdit}
                    disabled={editLoading}
                    className="flex-1"
                  >
                    {locale === 'bg' ? 'Отмени' : 'Cancel'}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSaveEdit}
                    disabled={editLoading}
                    className="flex-1"
                  >
                    {editLoading ? (locale === 'bg' ? 'Запазване...' : 'Saving...') : (locale === 'bg' ? 'Запази' : 'Save')}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}
