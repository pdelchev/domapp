'use client';

// Unified Life landing page — one HealthScore + sub-scores + deltas + history sparkline
// + active interventions + blood test results + recommendations (merged from lifestyle).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import NavBar from '../components/NavBar';
import {
  PageShell, PageContent, PageHeader, Card, Button,
  Badge, EmptyState, Spinner, Alert, Input, Select, Textarea,
} from '../components/ui';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import {
  getLifeSummary, deleteIntervention,
  getVitalsDashboard, getCardiometabolicAge, getBPPerKgSlope,
  getStageRegressionForecast, saveInterventionLogs, getEmergencyCard,
} from '../lib/api';
// RitualModal removed — replaced by /health/checkin wizard

type Snapshot = {
  id: number;
  date: string;
  composite_score: number | null;
  blood_score: number | null;
  bp_score: number | null;
  recovery_score: number | null;
  lifestyle_score: number | null;
  confidence: number;
  inputs: Record<string, unknown>;
};

type Intervention = {
  id: number;
  name: string;
  category: string;
  dose: string;
  frequency: string;
  reminder_times: string[];
  started_on: string;
  ended_on: string | null;
  hypothesis: string;
  target_metrics: string[];
  evidence_grade: string;
  source_url: string;
  notes: string;
  is_active: boolean;
  last_taken_date: string | null;
  taken_today: boolean | null;
  photo?: string | null;
};

type PhenoAge = {
  phenoage: number | null;
  chronological_age: number | null;
  age_accel: number | null;
  mortality_score: number | null;
  report_id: number | null;
  test_date: string | null;
  inputs_used: Record<string, number>;
  missing_markers: string[];
  note: string | null;
};

type Briefing = {
  date: string;
  headline: string;
  advice: string[];
  metrics: {
    recovery: number | null;
    bp_sys_avg: number | null;
    bp_dia_avg: number | null;
    bp_reading_count_7d: number;
    active_interventions: number;
  };
};

type LifeSummary = {
  profile: { id: number; full_name: string; sex: string; is_primary: boolean };
  today: Snapshot & { snapshot_id: number | null };
  deltas: Record<string, { prior_date: string; composite_score: number | null; blood_score: number | null; bp_score: number | null; recovery_score: number | null } | null>;
  history: Snapshot[];
  active_interventions: Intervention[];
  phenoage: PhenoAge;
  briefing: Briefing;
};

// Vitals section types
interface VitalsDash {
  latest_weight: { weight_kg: string; bmi: number | null; waist_hip_ratio: number | null; measured_at: string } | null;
  latest_bp_session: { measured_at: string; avg_systolic: number; avg_diastolic: number; stage: string } | null;
}
interface CMAge { chronological_age: number; cardiometabolic_age: number; delta_years: number; signals_present: number; confidence: number; }
interface Slope { status: string; slope_mmhg_per_kg?: number; r_squared?: number; paired_days?: number; need?: number; }
interface Forecast { status: string; kg_to_lose?: number; target_systolic?: number; eta_date?: string; weeks?: number; }

const STAGE_COLORS: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  normal: 'green', elevated: 'yellow', stage_1: 'yellow', stage_2: 'red', crisis: 'red',
};

const FREQ_LABELS: Record<string, string> = {
  daily: '1×/day', twice_daily: '2×/day', three_daily: '3×/day',
  weekly: 'Weekly', as_needed: 'PRN', one_time: 'Once',
};

// ── Blood test data (from latest results) ──
interface BloodResult {
  id: string; category: string;
  name: { en: string; bg: string }; code: string;
  refMin: number; refMax: number; unit: string;
  value: number; status: 'optimal' | 'borderline' | 'abnormal';
}

const BLOOD_RESULTS: BloodResult[] = [
  { id: 'glu', category: 'metabolic', name: { en: 'Glucose (fasting)', bg: 'Глюкоза (на гладно)' }, code: 'GLU', refMin: 3.9, refMax: 6.1, unit: 'mmol/L', value: 8.64, status: 'abnormal' },
  { id: 'alt', category: 'liver', name: { en: 'ALT (SGPT)', bg: 'АЛТ (СГПТ)' }, code: 'ALT', refMin: 0, refMax: 41, unit: 'U/L', value: 49.7, status: 'abnormal' },
  { id: 'ast', category: 'liver', name: { en: 'AST (SGOT)', bg: 'АСТ (СГОТ)' }, code: 'AST', refMin: 0, refMax: 40, unit: 'U/L', value: 32.8, status: 'borderline' },
  { id: 'ggt', category: 'liver', name: { en: 'GGT', bg: 'ГГТ' }, code: 'GGT', refMin: 0, refMax: 55, unit: 'U/L', value: 35, status: 'borderline' },
  { id: 'alp', category: 'liver', name: { en: 'Alkaline Phosphatase', bg: 'Алкална фосфатаза (АФ)' }, code: 'ALP', refMin: 40, refMax: 130, unit: 'U/L', value: 73, status: 'optimal' },
  { id: 'crea', category: 'kidney', name: { en: 'Creatinine', bg: 'Креатинин' }, code: 'CREA', refMin: 62, refMax: 106, unit: 'μmol/L', value: 95, status: 'optimal' },
  { id: 'urea', category: 'kidney', name: { en: 'Urea', bg: 'Урея' }, code: 'UREA', refMin: 2.5, refMax: 7.1, unit: 'mmol/L', value: 5.3, status: 'optimal' },
  { id: 'uric', category: 'kidney', name: { en: 'Uric Acid', bg: 'Пикочна киселина' }, code: 'URIC', refMin: 200, refMax: 430, unit: 'μmol/L', value: 481, status: 'abnormal' },
  { id: 'ca', category: 'electrolytes', name: { en: 'Calcium', bg: 'Калций' }, code: 'CA', refMin: 2.15, refMax: 2.55, unit: 'mmol/L', value: 2.43, status: 'optimal' },
  { id: 'p', category: 'electrolytes', name: { en: 'Phosphorus', bg: 'Фосфор' }, code: 'P', refMin: 0.81, refMax: 1.45, unit: 'mmol/L', value: 1.23, status: 'optimal' },
  { id: 'tp', category: 'protein', name: { en: 'Total Protein', bg: 'Общ белтък' }, code: 'TP', refMin: 60, refMax: 83, unit: 'g/L', value: 81.5, status: 'borderline' },
  { id: 'alb', category: 'protein', name: { en: 'Albumin', bg: 'Албумин' }, code: 'ALB', refMin: 35, refMax: 55, unit: 'g/L', value: 44.6, status: 'optimal' },
  { id: 'psa', category: 'tumor', name: { en: 'Total PSA', bg: 'Общ ПСА' }, code: 'PSA', refMin: 0, refMax: 4, unit: 'ng/mL', value: 0.73, status: 'optimal' },
  { id: 'cea', category: 'tumor', name: { en: 'CEA', bg: 'Карциноембрионален антиген' }, code: 'CEA', refMin: 0, refMax: 3.8, unit: 'ng/mL', value: 0.22, status: 'optimal' },
  { id: 'ca199', category: 'tumor', name: { en: 'CA 19-9', bg: 'CA 19-9' }, code: 'CA199', refMin: 0, refMax: 34, unit: 'U/mL', value: 8.38, status: 'optimal' },
];

interface Recommendation {
  icon: string; priority: 'high' | 'medium' | 'low';
  title: { en: string; bg: string }; description: { en: string; bg: string };
  linkedResults: string[];
}

const RECOMMENDATIONS: Recommendation[] = [
  { icon: '🏥', priority: 'high', title: { en: 'Metabolic Syndrome Pattern Detected', bg: 'Открит модел на метаболитен синдром' }, description: { en: 'Elevated glucose combined with liver enzyme changes suggests metabolic syndrome risk. Focus: 1) Cut refined carbs & sugar, 2) Exercise 30+ min daily, 3) Reduce belly fat, 4) Mediterranean diet.', bg: 'Комбинацията от повишена глюкоза и промени в чернодробните ензими предполага риск от метаболитен синдром. Фокус: 1) Намалете рафинираните въглехидрати и захарта, 2) Упражнения 30+ мин дневно, 3) Свалете коремните мазнини, 4) Средиземноморска диета.' }, linkedResults: ['glu', 'alt', 'ast'] },
  { icon: '🫁', priority: 'high', title: { en: 'Elevated Liver Enzymes', bg: 'Множество повишени чернодробни ензими' }, description: { en: 'Two or more elevated liver enzymes suggest liver stress. Actions: eliminate alcohol for 30 days, reduce sugar, exercise daily, drink coffee (protective).', bg: 'Два или повече повишени чернодробни ензима предполагат чернодробно натоварване. Действия: елиминирайте алкохола за 30 дни, намалете захарта, упражнения ежедневно, пийте кафе (защитно).' }, linkedResults: ['alt', 'ast', 'ggt'] },
  { icon: '⚡', priority: 'high', title: { en: 'Fasting Glucose Significantly Elevated', bg: 'Значително повишена кръвна захар на гладно' }, description: { en: 'Fasting glucose of 8.64 mmol/L is well above reference (3.9-6.1). This indicates pre-diabetic or diabetic range. Urgent: consult endocrinologist, HbA1c test needed, strict carb management.', bg: 'Глюкоза на гладно 8.64 mmol/L е значително над нормата (3.9-6.1). Това показва пре-диабетен или диабетен диапазон. Спешно: консултация с ендокринолог, необходим HbA1c тест, строг контрол на въглехидратите.' }, linkedResults: ['glu'] },
  { icon: '🫘', priority: 'medium', title: { en: 'Uric Acid Above Normal', bg: 'Пикочна киселина над нормата' }, description: { en: 'Risk of gout, kidney stones. Linked to metabolic syndrome. Reduce purine-rich foods: organ meats, sardines, beer. Drink plenty of water. Limit fructose & alcohol. Cherry extract may help.', bg: 'Риск от подагра, бъбречни камъни. Свързано с метаболитен синдром. Намалете храни богати на пурини: карантии, сардини, бира. Пийте много вода. Ограничете фруктозата и алкохола. Екстракт от череши може да помогне.' }, linkedResults: ['uric', 'glu'] },
  { icon: '🧬', priority: 'low', title: { en: 'Total Protein: Upper Borderline', bg: 'Общ белтък: горна граница' }, description: { en: 'Most common cause is dehydration. Ensure adequate hydration (2.5-3L water/day). Distribute protein evenly across meals (1.2-1.6g/kg body weight).', bg: 'Най-честа причина е дехидратация. Осигурете адекватна хидратация (2.5-3L вода/ден). Разпределете протеина равномерно в храненията (1.2-1.6г/кг телесно тегло).' }, linkedResults: ['tp'] },
  { icon: '❤️', priority: 'high', title: { en: 'Blood Pressure Monitoring Recommended', bg: 'Препоръчва се проследяване на кръвното налягане' }, description: { en: 'Elevated glucose + liver enzyme changes indicate cardiovascular risk. Regular BP monitoring is critical. Track your blood pressure alongside blood results for integrated cardiovascular risk assessment.', bg: 'Повишена глюкоза + промени в чернодробните ензими показват сърдечно-съдов риск. Редовното мониториране на кръвното налягане е критично. Проследявайте кръвното налягане заедно с кръвните резултати.' }, linkedResults: ['glu', 'alt'] },
];

const CATEGORY_LABELS: Record<string, { en: string; bg: string; icon: string }> = {
  metabolic: { en: 'Metabolic Panel', bg: 'Метаболитен панел', icon: '⚡' },
  liver: { en: 'Liver Function', bg: 'Чернодробна функция', icon: '🫁' },
  kidney: { en: 'Kidney Function', bg: 'Бъбречна функция', icon: '🫘' },
  electrolytes: { en: 'Electrolytes', bg: 'Електролити', icon: '⚡' },
  protein: { en: 'Protein Panel', bg: 'Протеинов панел', icon: '🧬' },
  tumor: { en: 'Tumor Markers', bg: 'Туморни маркери', icon: '🔬' },
};

const STATUS_COLORS: Record<string, 'green' | 'yellow' | 'red'> = { optimal: 'green', borderline: 'yellow', abnormal: 'red' };
const PRIORITY_COLORS: Record<string, 'red' | 'yellow' | 'blue'> = { high: 'red', medium: 'yellow', low: 'blue' };

function scoreColor(score: number | null) {
  if (score == null) return 'text-gray-400';
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBg(score: number | null) {
  if (score == null) return 'bg-gray-100';
  if (score >= 80) return 'bg-green-50';
  if (score >= 60) return 'bg-amber-50';
  return 'bg-red-50';
}

function DeltaArrow({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-400 text-xs">—</span>;
  if (value === 0) return <span className="text-gray-500 text-xs">±0</span>;
  const up = value > 0;
  return (
    <span className={`text-xs font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(value)}
    </span>
  );
}

function Sparkline({ values, width = 220, height = 40 }: { values: (number | null)[]; width?: number; height?: number }) {
  const clean = values.filter((v): v is number => v != null);
  if (clean.length < 2) return <div className="text-xs text-gray-400">Not enough history yet</div>;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = Math.max(max - min, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => {
    if (v == null) return null;
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).filter(Boolean).join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} className="text-indigo-500" />
    </svg>
  );
}

function SubScoreCard({
  label, score, delta7, delta30, href, hint,
}: { label: string; score: number | null; delta7: number | null; delta30: number | null; href?: string; hint?: string }) {
  const body = (
    <Card>
      <div className="flex items-start justify-between mb-0.5">
        <div className="text-[13px] font-medium text-gray-700">{label}</div>
        {href && <span className="text-xs text-gray-400">→</span>}
      </div>
      {hint && <div className="text-[10px] text-gray-400 mb-2 leading-snug">{hint}</div>}
      <div className={`text-4xl font-bold ${scoreColor(score)}`}>
        {score != null ? score : '—'}
      </div>
      <div className="flex gap-4 mt-2 text-xs text-gray-500">
        <div>7d <DeltaArrow value={delta7} /></div>
        <div>30d <DeltaArrow value={delta30} /></div>
      </div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function LifePage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [data, setData] = useState<LifeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [vitals, setVitals] = useState<VitalsDash | null>(null);
  const [cmAge, setCmAge] = useState<CMAge | null>(null);
  const [slope, setSlope] = useState<Slope | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [ritualOpen, setRitualOpen] = useState(false);
  const [bloodOpen, setBloodOpen] = useState(false);
  const [recsOpen, setRecsOpen] = useState(false);
  const [emergencyCard, setEmergencyCard] = useState<any | null>(null);
  const [todaySchedules, setTodaySchedules] = useState<any[]>([]);
  const [doseLogs, setDoseLogs] = useState<Record<number, any>>({});
  const [today] = useState(() => new Date().toISOString().split('T')[0]);
  const [savingDose, setSavingDose] = useState<number | null>(null);

  // Edit intervention/medication state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    dose: '',
    dose_unit: 'mg',
    form: 'tablet',
    frequency: 'daily',
    category: 'supplement',
    notes: '',
    reminder_time: '',
    photo_file: null as File | null,
  });
  const [editingMedication, setEditingMedication] = useState(false);

  // Add vitals form state (BP + Weight + Measurements)
  const [showAddVitalsForm, setShowAddVitalsForm] = useState(false);
  const [vitalsForm, setVitalsForm] = useState({
    bp_systolic: '',
    bp_diastolic: '',
    pulse: '',
    arm: 'left' as 'left' | 'right',
    posture: 'sitting' as 'sitting' | 'standing' | 'lying',
    is_after_caffeine: false,
    is_after_exercise: false,
    is_after_medication: false,
    is_stressed: false,
    is_clinic_reading: false,
    is_fasting: false,
    weight: '',
    waist_cm: '',
    notes: '',
  });
  const [addingVitals, setAddingVitals] = useState(false);

  // Add medication form state
  const [showAddMedicationForm, setShowAddMedicationForm] = useState(false);
  const [newMedicationForm, setNewMedicationForm] = useState({
    name: '',
    dose: '',
    dose_unit: 'mg',
    form: 'tablet', // tablet, liquid, ampule, powder, injection, patch, etc.
    frequency: 'daily',
    category: 'supplement', // supplement, medication, therapy
    notes: '',
    photo_file: null as File | null,
  });
  const [addingMedication, setAddingMedication] = useState(false);

  // Photo preview popup
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState('');
  const [previewPhotoName, setPreviewPhotoName] = useState('');

  // Daily activities tracking (stored in localStorage for persistence)
  const [dailyActivities, setDailyActivities] = useState<Record<string, boolean>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`daily_activities_${today}`);
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await getLifeSummary();
      setData(res);
      setError('');
      const pid = res?.profile?.id;
      if (pid) {
        Promise.all([
          getVitalsDashboard(pid).catch(() => null),
          getCardiometabolicAge(pid).catch(() => null),
          getBPPerKgSlope(pid).catch(() => null),
          getStageRegressionForecast(pid).catch(() => null),
          getEmergencyCard().catch(() => null),
        ]).then(([d, a, s, f, card]) => {
          setVitals(d); setCmAge(a); setSlope(s); setForecast(f); setEmergencyCard(card);
        });

        // Load today's schedule
        try {
          const schedRes = await fetch(`/api/health/schedules/today/?profile=${pid}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}` },
          });
          if (schedRes.ok) {
            const scheds = await schedRes.json();
            setTodaySchedules(scheds);

            // Load dose logs for today
            const logsRes = await fetch(`/api/health/doses/?date=${today}`, {
              headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}` },
            });
            if (logsRes.ok) {
              const logs = await logsRes.json();
              const logsMap = logs.reduce((acc: any, log: any) => {
                acc[log.schedule_id] = log;
                return acc;
              }, {});
              setDoseLogs(logsMap);
            }
          }
        } catch (e) {
          console.error('Failed to load schedules:', e);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleEnd = async (id: number) => {
    if (!confirm(locale === 'bg' ? 'Маркирай тази интервенция като приключена днес?' : 'Mark this intervention as ended today?')) return;
    try {
      const res = await fetch(`/api/health/interventions/${id}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({ ended_on: new Date().toISOString().slice(0, 10) }),
      });
      if (!res.ok) throw new Error('Failed to end intervention');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(locale === 'bg' ? 'Изтрий тази интервенция?' : 'Delete this intervention? This cannot be undone.')) return;
    try {
      await deleteIntervention(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleToggleDose = async (scheduleId: number, currentTaken: boolean | null) => {
    const newTaken = currentTaken === true ? false : currentTaken === false ? null : true;
    setSavingDose(scheduleId);

    try {
      const response = await fetch('/api/health/doses/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          schedule_id: scheduleId,
          date: today,
          taken: newTaken !== null ? newTaken : undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to update dose log');
      const updatedLog = await response.json();
      setDoseLogs((prev) => ({
        ...prev,
        [scheduleId]: updatedLog,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setSavingDose(null);
    }
  };

  const handleMarkTaken = async (iv: Intervention) => {
    const newTaken = !iv.taken_today;
    // Optimistic update
    if (data) {
      setData({
        ...data,
        active_interventions: data.active_interventions.map(i =>
          i.id === iv.id ? { ...i, taken_today: newTaken, last_taken_date: newTaken ? today : i.last_taken_date } : i
        ),
      });
    }
    try {
      await saveInterventionLogs(today, [{ intervention: iv.id, taken: newTaken }]);
    } catch (e) {
      await load(); // revert on error
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const toggleActivity = (activityId: string) => {
    const newActivities = {
      ...dailyActivities,
      [activityId]: !dailyActivities[activityId],
    };
    setDailyActivities(newActivities);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`daily_activities_${today}`, JSON.stringify(newActivities));
    }
  };

  const handleAddMedication = async () => {
    if (!newMedicationForm.name.trim()) {
      setError(locale === 'bg' ? 'Име е задължително' : 'Name is required');
      return;
    }

    try {
      setAddingMedication(true);

      const formData = new FormData();
      formData.append('name', newMedicationForm.name);
      formData.append('dose', newMedicationForm.dose || '');
      formData.append('frequency', newMedicationForm.frequency);
      formData.append('category', newMedicationForm.category);
      formData.append('hypothesis', newMedicationForm.notes);
      formData.append('started_on', new Date().toISOString().split('T')[0]); // Today's date
      formData.append('evidence_grade', 'B');

      const response = await fetch('/api/health/interventions/', {
        method: 'POST',
        body: formData,
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}` },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API Error:', errorData);
        throw new Error(errorData.detail || (locale === 'bg' ? 'Неуспешно добавяне' : 'Failed to create'));
      }

      await load();
      setShowAddMedicationForm(false);
      setNewMedicationForm({
        name: '',
        dose: '',
        dose_unit: 'mg',
        form: 'tablet',
        frequency: 'daily',
        category: 'supplement',
        notes: '',
        photo_file: null,
      });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : (locale === 'bg' ? 'Грешка' : 'Error'));
    } finally {
      setAddingMedication(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setNewMedicationForm({ ...newMedicationForm, photo_file: e.target.files[0] });
    }
  };

  const handleSaveVitals = async () => {
    try {
      setAddingVitals(true);
      const pid = data?.profile?.id;
      if (!pid) throw new Error('Profile not found');

      // Save BP reading if provided
      if (vitalsForm.bp_systolic && vitalsForm.bp_diastolic) {
        const bpRes = await fetch('/api/health/bp/readings/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`,
          },
          body: JSON.stringify({
            profile: pid,
            systolic: parseInt(vitalsForm.bp_systolic),
            diastolic: parseInt(vitalsForm.bp_diastolic),
            pulse: vitalsForm.pulse ? parseInt(vitalsForm.pulse) : null,
            measured_at: new Date().toISOString(),
            arm: vitalsForm.arm,
            posture: vitalsForm.posture,
            is_after_caffeine: vitalsForm.is_after_caffeine,
            is_after_exercise: vitalsForm.is_after_exercise,
            is_after_medication: vitalsForm.is_after_medication,
            is_stressed: vitalsForm.is_stressed,
            is_clinic_reading: vitalsForm.is_clinic_reading,
            is_fasting: vitalsForm.is_fasting,
            notes: vitalsForm.notes,
          }),
        });
        if (!bpRes.ok) {
          const errorData = await bpRes.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to save BP reading');
        }
      }

      // TODO: Save weight and waist measurements if provided
      // For now, just show success and reload

      setShowAddVitalsForm(false);
      setVitalsForm({
        bp_systolic: '',
        bp_diastolic: '',
        pulse: '',
        arm: 'left',
        posture: 'sitting',
        is_after_caffeine: false,
        is_after_exercise: false,
        is_after_medication: false,
        is_stressed: false,
        is_clinic_reading: false,
        is_fasting: false,
        weight: '',
        waist_cm: '',
        notes: '',
      });
      await load();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : (locale === 'bg' ? 'Грешка' : 'Error'));
    } finally {
      setAddingVitals(false);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <NavBar />
        <PageContent size="lg">
          <Spinner message={t('common.loading', locale)} />
        </PageContent>
      </PageShell>
    );
  }

  const snapshot = data?.today;
  const d7 = data?.deltas?.['7'] ?? data?.deltas?.[7 as unknown as string];
  const d30 = data?.deltas?.['30'] ?? data?.deltas?.[30 as unknown as string];
  const historyComposite = (data?.history ?? []).map((s) => s.composite_score);
  const bloodCategories = [...new Set(BLOOD_RESULTS.map((r) => r.category))];

  // Schedule grouping for daily checklist
  const TIME_SLOTS: Record<string, string> = {
    morning: '🌅',
    breakfast: '🍳',
    lunch: '🍽️',
    afternoon: '☕',
    dinner: '🍷',
    evening: '🌙',
    bedtime: '😴',
    as_needed: '⏰',
  };

  const timeOrder = ['morning', 'breakfast', 'lunch', 'afternoon', 'dinner', 'evening', 'bedtime', 'as_needed'];
  const sortedSchedules = [...todaySchedules].sort((a, b) =>
    timeOrder.indexOf(a.time_slot) - timeOrder.indexOf(b.time_slot)
  );

  const groupedByTime: Record<string, any[]> = {};
  sortedSchedules.forEach(s => {
    if (!groupedByTime[s.time_slot]) groupedByTime[s.time_slot] = [];
    groupedByTime[s.time_slot].push(s);
  });

  const takenCount = Object.values(doseLogs).filter((log) => log.taken === true).length;
  const skippedCount = Object.values(doseLogs).filter((log) => log.taken === false).length;
  const pendingCount = todaySchedules.length - takenCount - skippedCount;

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('nav.health_hub', locale)}
          action={
            <div className="flex gap-2 flex-wrap">
              <Link href="/health/genetic">
                <Button>
                  🧬 {locale === 'bg' ? 'Гени' : 'Genes'}
                </Button>
              </Link>
              <Link href="/health/routine">
                <Button variant="secondary">
                  💊 {t('nav.daily_routine', locale)}
                </Button>
              </Link>
              <Button
                variant="secondary"
                onClick={() => setShowAddVitalsForm(true)}
              >
                + {locale === 'bg' ? 'Добави измервания' : 'Add Vitals'}
              </Button>
            </div>
          }
        />

        {error && <Alert type="error" message={error} />}

        {/* EMERGENCY CARD PREVIEW */}
        {emergencyCard && (
          <button
            onClick={() => router.push('/health/emergency')}
            className="w-full text-left mb-4 hover:opacity-90 transition-opacity"
          >
            <Card className="bg-gradient-to-r from-red-500 to-red-600 text-white border-red-600">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                <div>
                  <div className="text-[11px] opacity-75">{locale === 'bg' ? 'Име' : 'Name'}</div>
                  <div className="font-semibold text-sm">{emergencyCard.profile_full_name}</div>
                </div>
                <div>
                  <div className="text-[11px] opacity-75">{locale === 'bg' ? 'Възраст' : 'Age'}</div>
                  <div className="font-semibold">
                    {emergencyCard.profile_dob
                      ? Math.floor((Date.now() - new Date(emergencyCard.profile_dob).getTime()) / 31557600000)
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] opacity-75">{locale === 'bg' ? 'Пол' : 'Sex'}</div>
                  <div className="font-semibold">
                    {emergencyCard.profile_sex === 'female' ? (locale === 'bg' ? 'Ж' : 'F') : (locale === 'bg' ? 'М' : 'M')}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] opacity-75">{locale === 'bg' ? 'Кръв' : 'Blood'}</div>
                  <div className="font-bold text-base">{emergencyCard.blood_type}</div>
                </div>
                <div>
                  <div className="text-[11px] opacity-75">{locale === 'bg' ? 'Условия' : 'Conditions'}</div>
                  <div className="font-semibold text-[11px] truncate">
                    {emergencyCard.chronic_conditions?.split('\n')[0] || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] opacity-75">{locale === 'bg' ? 'Лекар' : 'Doctor'}</div>
                  <div className="font-semibold text-[11px] truncate">
                    {emergencyCard.primary_doctor_name || '—'}
                  </div>
                </div>
              </div>
              <div className="text-right text-[11px] opacity-75 mt-2">
                🚨 {locale === 'bg' ? 'Кликнете за редактиране →' : 'Click to edit →'}
              </div>
            </Card>
          </button>
        )}

        {/* ═══ UNIFIED DAILY ROUTINE ═══ */}
        <div className="mt-6 mb-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          📅 {locale === 'bg' ? 'Дневен режим' : 'Daily Routine'}
        </div>
        {todaySchedules.length === 0 && (data?.active_interventions ?? []).length === 0 ? (
          <Card>
            <EmptyState
              icon="💊"
              message={locale === 'bg'
                ? 'Няма планирани лекарства за днес'
                : 'No medications scheduled for today'}
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Progress Summary — includes supplements, medications, AND daily activities */}
            {(() => {
              const DAILY_ACTIVITIES = ['breakfast', 'lunch', 'dinner', 'gym', 'bp_check', 'water'];
              const activitiesDone = DAILY_ACTIVITIES.filter(a => dailyActivities[a]).length;

              const totalItems = todaySchedules.length + (data?.active_interventions ?? []).length + DAILY_ACTIVITIES.length;
              const takenMeds = (data?.active_interventions ?? []).filter(iv => iv.taken_today === true).length;
              const totalTaken = takenCount + takenMeds + activitiesDone;
              const progressPercent = totalItems > 0 ? (totalTaken / totalItems) * 100 : 0;

              return (
                <Card className="mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-medium text-gray-600">
                      {totalTaken}/{totalItems} {locale === 'bg' ? 'завършено' : 'completed'}
                    </div>
                    <div className="flex gap-1">
                      {totalTaken > 0 && <Badge color="green">✓ {totalTaken}</Badge>}
                      {totalItems - totalTaken > 0 && <Badge color="gray">{totalItems - totalTaken}</Badge>}
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-green-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </Card>
              );
            })()}


            {/* Supplements/Schedules organized by time slot */}
            {Object.entries(groupedByTime).length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-700 px-2 py-2 mb-2">
                  💊 {locale === 'bg' ? 'График' : 'Schedule'}
                </div>
                <div className="space-y-3">
                  {Object.entries(groupedByTime).map(([timeSlot, items]) => (
                    <div key={timeSlot}>
                      <div className="text-xs font-medium text-gray-600 px-2 py-1 mb-2">
                        {TIME_SLOTS[timeSlot]} {locale === 'bg' ? timeSlot : timeSlot.charAt(0).toUpperCase() + timeSlot.slice(1)}
                      </div>
                <div className="space-y-2">
                  {items.map((schedule) => {
                    const log = doseLogs[schedule.id];
                    const taken = log?.taken;
                    return (
                      <Card key={schedule.id} className="!p-0 overflow-hidden">
                        <div className="flex">
                          {/* Take button — left strip */}
                          <button
                            type="button"
                            onClick={() => handleToggleDose(schedule.id, taken)}
                            disabled={savingDose === schedule.id}
                            className={`flex-shrink-0 w-16 flex flex-col items-center justify-center gap-1 transition-colors ${
                              taken === true
                                ? 'bg-green-50 text-green-600 hover:bg-green-100'
                                : taken === false
                                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                  : 'bg-gray-50 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600'
                            } ${savingDose === schedule.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            title={taken === true
                              ? (locale === 'bg' ? 'Отмени' : 'Undo taken')
                              : taken === false
                                ? (locale === 'bg' ? 'Маркирай като взето' : 'Mark as taken')
                                : (locale === 'bg' ? 'Маркирай като взето' : 'Mark as taken')}
                          >
                            <span className="text-xl">
                              {taken === true ? '✓' : taken === false ? '✗' : '○'}
                            </span>
                            <span className="text-[9px] font-medium leading-tight">
                              {taken === true
                                ? (locale === 'bg' ? 'Взето' : 'Taken')
                                : taken === false
                                  ? (locale === 'bg' ? 'Пропуск' : 'Skip')
                                  : (locale === 'bg' ? 'Вземи' : 'Take')}
                            </span>
                          </button>

                          {/* Content */}
                          <div className="flex-1 min-w-0 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-lg flex-shrink-0">💊</span>
                                <div className="min-w-0">
                                  <div className="font-semibold text-sm text-gray-900 truncate">{schedule.supplement_name}</div>
                                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    {schedule.dose_amount && (
                                      <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                                        {schedule.dose_amount} {schedule.dose_unit}
                                      </span>
                                    )}
                                    {schedule.time_slot && (
                                      <span className="text-xs text-gray-500">⏰ {schedule.time_slot}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                    </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Interventions (medications/supplements) */}
            {(data?.active_interventions ?? []).length > 0 && (
              <div>
                <div className="flex items-center justify-between px-2 py-2 mb-2">
                  <div className="text-xs font-semibold text-gray-700">
                    💊 {locale === 'bg' ? 'Лекарства' : 'Medications & Supplements'}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowAddMedicationForm(true)}
                    title={locale === 'bg' ? 'Добави' : 'Add'}
                  >
                    +
                  </Button>
                </div>
                <div className="space-y-2">
                  {data!.active_interventions.map((iv) => {
                    const isMed = iv.category === 'medication';
                    const icon = isMed ? '💊' : iv.category === 'supplement' ? '🧬' : iv.category === 'diet' ? '🥗' : iv.category === 'exercise' ? '🏃' : '⚡';
                    const takenToday = iv.taken_today === true;
                    return (
                      <Card key={iv.id} className="!p-0 overflow-hidden">
                        <div className="flex">
                          {/* Take button — left strip */}
                          <button
                            type="button"
                            onClick={() => handleMarkTaken(iv)}
                            className={`flex-shrink-0 w-16 flex flex-col items-center justify-center gap-1 transition-colors ${
                              takenToday
                                ? 'bg-green-50 text-green-600 hover:bg-green-100'
                                : 'bg-gray-50 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600'
                            }`}
                            title={takenToday
                              ? (locale === 'bg' ? 'Отмени' : 'Undo taken')
                              : (locale === 'bg' ? 'Маркирай като взето' : 'Mark taken')}
                          >
                            <span className="text-xl">{takenToday ? '✓' : '○'}</span>
                            <span className="text-[9px] font-medium leading-tight">
                              {takenToday
                                ? (locale === 'bg' ? 'Взето' : 'Taken')
                                : (locale === 'bg' ? 'Вземи' : 'Take')}
                            </span>
                          </button>

                          {/* Content */}
                          <div className="flex-1 min-w-0 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-lg flex-shrink-0">{icon}</span>
                                <div className="min-w-0">
                                  <div className="font-semibold text-sm text-gray-900 truncate">{iv.name}</div>
                                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    {iv.dose && (
                                      <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                                        {iv.dose}
                                      </span>
                                    )}
                                    {iv.reminder_times && iv.reminder_times.length > 0 && (
                                      <span className="text-xs text-gray-400">⏰ {iv.reminder_times.join(', ')}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {iv.photo ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (iv.photo) {
                                        setPreviewPhotoUrl(iv.photo.startsWith('http') ? iv.photo : `/api/media/${iv.photo}`);
                                        setPreviewPhotoName(iv.name);
                                        setShowPhotoPreview(true);
                                      }
                                    }}
                                    className="relative group focus:outline-none"
                                    title={locale === 'bg' ? 'Щракнете за увеличение' : 'Click to enlarge'}
                                  >
                                    <img
                                      src={iv.photo.startsWith('http') ? iv.photo : `/api/media/${iv.photo}`}
                                      alt={iv.name}
                                      className="w-12 h-12 rounded object-cover bg-gray-100 border border-indigo-200 cursor-pointer hover:shadow-lg transition-shadow"
                                    />
                                  </button>
                                ) : (
                                  <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center text-xs text-gray-400 border border-dashed border-gray-300">
                                    📷
                                  </div>
                                )}
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingId(iv.id);
                                      setEditForm({
                                        name: iv.name || '',
                                        dose: iv.dose || '',
                                        dose_unit: 'mg',
                                        form: 'tablet',
                                        frequency: iv.frequency || 'daily',
                                        category: iv.category || 'supplement',
                                        notes: iv.notes || '',
                                        reminder_time: iv.reminder_times?.[0] || '',
                                        photo_file: null,
                                      });
                                    }}
                                    title={locale === 'bg' ? 'Редактирай' : 'Edit'}
                                  >
                                    ✎
                                  </Button>
                                  {iv.evidence_grade && iv.evidence_grade !== 'B' && (
                                    <div title={locale === 'bg' ? 'Качество на доказателствата' : 'Evidence quality'}>
                                      <Badge color={iv.evidence_grade === 'A' ? 'green' : iv.evidence_grade === 'C' ? 'yellow' : 'gray'}>
                                        {iv.evidence_grade}
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Daily Activities — Meals, Gym, BP Checks */}
            <div>
              <div className="text-xs font-semibold text-gray-700 px-2 py-2 mb-2">
                🎯 {locale === 'bg' ? 'Активности' : 'Activities'}
              </div>
              <div className="space-y-2">
                {/* Meals */}
                {[
                  { id: 'breakfast', emoji: '🍳', name: locale === 'bg' ? 'Закуска' : 'Breakfast', time: '8-10am' },
                  { id: 'lunch', emoji: '🍽️', name: locale === 'bg' ? 'Обяд' : 'Lunch', time: '12-1pm' },
                  { id: 'dinner', emoji: '🍷', name: locale === 'bg' ? 'Вечеря' : 'Dinner', time: '6-7pm' },
                ].map((meal) => (
                  <Card key={meal.id} className="!p-0 overflow-hidden">
                    <div className="flex">
                      <button
                        type="button"
                        onClick={() => toggleActivity(meal.id)}
                        className={`flex-shrink-0 w-16 flex flex-col items-center justify-center gap-1 transition-colors ${
                          dailyActivities[meal.id]
                            ? 'bg-green-50 text-green-600 hover:bg-green-100'
                            : 'bg-gray-50 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600'
                        }`}
                      >
                        <span className="text-xl">{dailyActivities[meal.id] ? '✓' : '○'}</span>
                        <span className="text-[9px] font-medium leading-tight">
                          {dailyActivities[meal.id]
                            ? (locale === 'bg' ? 'Взято' : 'Done')
                            : (locale === 'bg' ? 'Вземи' : 'Do')}
                        </span>
                      </button>
                      <div className="flex-1 min-w-0 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-lg flex-shrink-0">{meal.emoji}</span>
                            <div className="min-w-0">
                              <div className="font-semibold text-sm text-gray-900">{meal.name}</div>
                              <div className="text-xs text-gray-500">{meal.time}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}

                {/* Gym/Training */}
                <Card className="!p-0 overflow-hidden">
                  <div className="flex">
                    <button
                      type="button"
                      onClick={() => toggleActivity('gym')}
                      className={`flex-shrink-0 w-16 flex flex-col items-center justify-center gap-1 transition-colors ${
                        dailyActivities['gym']
                          ? 'bg-green-50 text-green-600 hover:bg-green-100'
                          : 'bg-gray-50 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600'
                      }`}
                    >
                      <span className="text-xl">{dailyActivities['gym'] ? '✓' : '○'}</span>
                      <span className="text-[9px] font-medium leading-tight">
                        {dailyActivities['gym']
                          ? (locale === 'bg' ? 'Взято' : 'Done')
                          : (locale === 'bg' ? 'Вземи' : 'Do')}
                      </span>
                    </button>
                    <div className="flex-1 min-w-0 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg flex-shrink-0">🏋️</span>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-gray-900">{locale === 'bg' ? 'Тренировка' : 'Gym & Training'}</div>
                            <div className="text-xs text-gray-500">{locale === 'bg' ? 'Работен план' : 'Daily routine'}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Blood Pressure Check */}
                <Card className="!p-0 overflow-hidden">
                  <div className="flex">
                    <button
                      type="button"
                      onClick={() => toggleActivity('bp_check')}
                      className={`flex-shrink-0 w-16 flex flex-col items-center justify-center gap-1 transition-colors ${
                        dailyActivities['bp_check']
                          ? 'bg-green-50 text-green-600 hover:bg-green-100'
                          : 'bg-gray-50 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600'
                      }`}
                    >
                      <span className="text-xl">{dailyActivities['bp_check'] ? '✓' : '○'}</span>
                      <span className="text-[9px] font-medium leading-tight">
                        {dailyActivities['bp_check']
                          ? (locale === 'bg' ? 'Взято' : 'Done')
                          : (locale === 'bg' ? 'Вземи' : 'Do')}
                      </span>
                    </button>
                    <div className="flex-1 min-w-0 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg flex-shrink-0">❤️</span>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-gray-900">{locale === 'bg' ? 'Кръвно налягане' : 'Blood Pressure Check'}</div>
                            <div className="text-xs text-gray-500">{locale === 'bg' ? 'Измерване' : 'Morning reading'}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Water Intake */}
                <Card className="!p-0 overflow-hidden">
                  <div className="flex">
                    <button
                      type="button"
                      onClick={() => toggleActivity('water')}
                      className={`flex-shrink-0 w-16 flex flex-col items-center justify-center gap-1 transition-colors ${
                        dailyActivities['water']
                          ? 'bg-green-50 text-green-600 hover:bg-green-100'
                          : 'bg-gray-50 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600'
                      }`}
                    >
                      <span className="text-xl">{dailyActivities['water'] ? '✓' : '○'}</span>
                      <span className="text-[9px] font-medium leading-tight">
                        {dailyActivities['water']
                          ? (locale === 'bg' ? 'Взято' : 'Done')
                          : (locale === 'bg' ? 'Вземи' : 'Do')}
                      </span>
                    </button>
                    <div className="flex-1 min-w-0 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg flex-shrink-0">💧</span>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-gray-900">{locale === 'bg' ? 'Вода' : 'Hydration'}</div>
                            <div className="text-xs text-gray-500">{locale === 'bg' ? '2.5L+ дневно' : '2.5L+ daily'}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* DAILY LOG FORM — Compact grid layout */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-700 mb-3">
                    📊 {locale === 'bg' ? 'Дневен дневник' : 'Daily Log'}
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Mood */}
                    <div>
                      <label className="text-[11px] font-medium text-gray-600 block mb-1">😊 {locale === 'bg' ? 'Настроение' : 'Mood'}</label>
                      <input type="range" min="1" max="10" defaultValue="5" className="w-full h-1.5 bg-gray-200 rounded" />
                      <div className="text-[10px] text-gray-500 text-center mt-0.5">5/10</div>
                    </div>

                    {/* Energy */}
                    <div>
                      <label className="text-[11px] font-medium text-gray-600 block mb-1">⚡ {locale === 'bg' ? 'Енергия' : 'Energy'}</label>
                      <input type="range" min="1" max="10" defaultValue="5" className="w-full h-1.5 bg-gray-200 rounded" />
                      <div className="text-[10px] text-gray-500 text-center mt-0.5">5/10</div>
                    </div>

                    {/* Sleep */}
                    <div>
                      <label className="text-[11px] font-medium text-gray-600 block mb-1">😴 {locale === 'bg' ? 'Сън (ч)' : 'Sleep (h)'}</label>
                      <input type="number" defaultValue="7" inputMode="decimal" className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
                    </div>

                    {/* Water */}
                    <div>
                      <label className="text-[11px] font-medium text-gray-600 block mb-1">💧 {locale === 'bg' ? 'Вода (мл)' : 'Water (ml)'}</label>
                      <input type="number" defaultValue="2000" inputMode="numeric" className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
                    </div>
                  </div>
                </div>

                {/* AI RECOMMENDATIONS */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-700 mb-2">
                    🤖 {locale === 'bg' ? 'ИИ препоръки' : 'AI Tips'}
                  </h4>
                  <ul className="text-[11px] text-gray-600 space-y-1">
                    <li>• {locale === 'bg' ? 'Продължи редовното приемане на лекарствата' : 'Keep meds consistent'}</li>
                    <li>• {locale === 'bg' ? 'Целта: 8 часа сън' : 'Aim for 8 hours sleep'}</li>
                    <li>• {locale === 'bg' ? 'Пий 2.5L+ вода дневно' : 'Drink 2.5L+ daily'}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MORNING BRIEFING */}
        {data?.briefing && (
          <Card>
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-[13px] font-medium text-gray-700">
                {t('life.briefing', locale)} · {data.briefing.date}
              </div>
              <div className="text-xs text-gray-500">{data.briefing.headline}</div>
            </div>
            {data.briefing.advice.length === 0 ? (
              <div className="text-sm text-gray-500">{t('life.briefing_empty', locale)}</div>
            ) : (
              <ul className="space-y-1.5">
                {data.briefing.advice.map((line, i) => (
                  <li key={i} className="text-sm text-gray-800 flex gap-2">
                    <span className="text-indigo-500 flex-shrink-0">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* HERO: composite score + sparkline */}
        <Card>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="text-[13px] font-medium text-gray-700">
                {t('life.health_score', locale)} · {data?.profile.full_name}
              </div>
              <div className="text-[11px] text-gray-400 mb-1">{t('life.health_score_hint', locale)}</div>
              <div className={`text-7xl font-bold ${scoreColor(snapshot?.composite_score ?? null)}`}>
                {snapshot?.composite_score ?? '—'}
              </div>
              <div className="flex gap-4 mt-2 text-sm text-gray-600">
                <div>7d <DeltaArrow value={d7?.composite_score ?? null} /></div>
                <div>30d <DeltaArrow value={d30?.composite_score ?? null} /></div>
                <div className="text-xs text-gray-400">
                  {t('life.confidence', locale)}: {Math.round((snapshot?.confidence ?? 0) * 100)}%
                </div>
              </div>
            </div>
            <div className={`flex-1 md:max-w-sm ${scoreBg(snapshot?.composite_score ?? null)} rounded-lg p-4`}>
              <div className="text-[13px] font-medium text-gray-700 mb-2">{t('life.trend_30d', locale)}</div>
              <Sparkline values={historyComposite} width={320} height={56} />
            </div>
          </div>
        </Card>

        {/* Sub-scores grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <SubScoreCard
            label={t('life.sub.blood', locale)}
            hint={t('life.sub.blood_hint', locale)}
            score={snapshot?.blood_score ?? null}
            delta7={d7?.blood_score ?? null}
            delta30={d30?.blood_score ?? null}
            href="/health"
          />
          <SubScoreCard
            label={t('life.sub.bp', locale)}
            hint={t('life.sub.bp_hint', locale)}
            score={snapshot?.bp_score ?? null}
            delta7={d7?.bp_score ?? null}
            delta30={d30?.bp_score ?? null}
            href="/health/bp"
          />
          <SubScoreCard
            label={t('life.sub.recovery', locale)}
            hint={t('life.sub.recovery_hint', locale)}
            score={snapshot?.recovery_score ?? null}
            delta7={d7?.recovery_score ?? null}
            delta30={d30?.recovery_score ?? null}
            href="/health/recovery"
          />
          <SubScoreCard
            label={t('life.sub.lifestyle', locale)}
            hint={t('life.sub.lifestyle_hint', locale)}
            score={snapshot?.lifestyle_score ?? null}
            delta7={null}
            delta30={null}
          />
        </div>

        {/* ═══ QUICK TOOLS ═══ */}
        <div className="mt-6 mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {locale === 'bg' ? 'Бързи инструменти' : 'Quick Tools'}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link href="/health/recovery" className="block group">
            <Card className="hover:shadow-md transition-shadow h-full">
              <div className="flex items-center gap-3">
                <span className="text-3xl">&#x1F49A;</span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{locale === 'bg' ? 'WHOOP' : 'WHOOP Recovery'}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{locale === 'bg' ? 'Стрейн, пулс' : 'Strain, HR & recovery'}</p>
                </div>
              </div>
            </Card>
          </Link>
          <Link href="/health/bp" className="block group">
            <Card className="hover:shadow-md transition-shadow h-full">
              <div className="flex items-center gap-3">
                <span className="text-3xl">&#x2764;&#xFE0F;</span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{locale === 'bg' ? 'Кръвно налягане' : 'Blood Pressure'}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{locale === 'bg' ? 'КН и сърдечен риск' : 'Track BP & CV risk'}</p>
                </div>
              </div>
            </Card>
          </Link>
          <Link href="/health/lifestyle/meals" className="block group">
            <Card className="hover:shadow-md transition-shadow h-full">
              <div className="flex items-center gap-3">
                <span className="text-3xl">&#x1F957;</span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{locale === 'bg' ? 'Меню' : 'Meal Plan'}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{locale === 'bg' ? 'Ротиращо меню' : 'Daily rotating menu'}</p>
                </div>
              </div>
            </Card>
          </Link>
          <Link href="/health/lifestyle/gym" className="block group">
            <Card className="hover:shadow-md transition-shadow h-full">
              <div className="flex items-center gap-3">
                <span className="text-3xl">&#x1F3CB;&#xFE0F;</span>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{locale === 'bg' ? 'Фитнес' : 'Gym & Sports'}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{locale === 'bg' ? 'Тренировки' : 'Training & recovery'}</p>
                </div>
              </div>
            </Card>
          </Link>
        </div>

        {/* ═══ HEALTH PROTOCOLS ═══ */}

        {/* ═══ BIOLOGICAL AGE ═══ */}
        {(data?.phenoage || cmAge) && (
          <>
            <div className="mt-6 mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              {t('life.bio_age_section', locale)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data?.phenoage && (
                <Card>
                  <div className="flex items-baseline justify-between mb-3">
                    <div>
                      <div className="text-[13px] font-medium text-gray-700">{t('life.phenoage', locale)}</div>
                      <div className="text-[11px] text-gray-400">Levine 2018 · 9 blood markers</div>
                    </div>
                    {data.phenoage.test_date && <div className="text-xs text-gray-500">{data.phenoage.test_date}</div>}
                  </div>
                  {data.phenoage.phenoage != null ? (
                    <div className="flex items-end gap-5">
                      <div>
                        <div className="text-[11px] text-gray-500">{t('life.bio_age', locale)}</div>
                        <div className="text-5xl font-bold text-indigo-600">{data.phenoage.phenoage}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-gray-500">{t('life.chron_age', locale)}</div>
                        <div className="text-3xl font-medium text-gray-700">{data.phenoage.chronological_age}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-gray-500">Δ</div>
                        <div className={`text-3xl font-medium ${(data.phenoage.age_accel ?? 0) < 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {(data.phenoage.age_accel ?? 0) >= 0 ? '+' : ''}{data.phenoage.age_accel}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">{data.phenoage.note}</div>
                  )}
                </Card>
              )}
              {cmAge && cmAge.signals_present > 0 && (
                <Card>
                  <div className="flex items-baseline justify-between mb-3">
                    <div>
                      <div className="text-[13px] font-medium text-gray-700">{t('vitals.cm_age_title', locale)}</div>
                      <div className="text-[11px] text-gray-400">BP + body comp · {cmAge.signals_present}/4 signals</div>
                    </div>
                  </div>
                  <div className="flex items-end gap-5">
                    <div>
                      <div className="text-[11px] text-gray-500">{t('life.bio_age', locale)}</div>
                      <div className="text-5xl font-bold text-indigo-600">{cmAge.cardiometabolic_age}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">{t('life.chron_age', locale)}</div>
                      <div className="text-3xl font-medium text-gray-700">{cmAge.chronological_age}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">Δ</div>
                      <div className={`text-3xl font-medium ${cmAge.delta_years <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {cmAge.delta_years >= 0 ? '+' : ''}{cmAge.delta_years}
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </>
        )}

        {/* ═══ VITALS SNAPSHOT ═══ */}
        {(vitals || slope) && (
          <>
            <div className="mt-6 mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              {t('life.vitals_section', locale)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link href="/health/weight" className="block">
                <Card className="hover:shadow-md transition-shadow h-full">
                  <div className="flex items-start justify-between">
                    <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide">{t('nav.weight', locale)}</div>
                    <span className="text-xs text-gray-400">→</span>
                  </div>
                  <div className="text-[10px] text-gray-400 mb-2 leading-snug">{t('life.weight_hint', locale)}</div>
                  {vitals?.latest_weight ? (
                    <>
                      <div className="text-3xl font-semibold text-gray-900">
                        {Number(vitals.latest_weight.weight_kg).toFixed(1)}
                        <span className="text-lg text-gray-500 ml-1">kg</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(vitals.latest_weight.measured_at).toLocaleDateString()}
                      </div>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {vitals.latest_weight.bmi && <Badge color="indigo">BMI {vitals.latest_weight.bmi}</Badge>}
                        {vitals.latest_weight.waist_hip_ratio && <Badge color="blue">WHR {vitals.latest_weight.waist_hip_ratio}</Badge>}
                      </div>
                    </>
                  ) : <div className="text-sm text-gray-500 py-4">{t('weight.no_readings', locale)}</div>}
                </Card>
              </Link>

              <Link href="/health/bp" className="block">
                <Card className="hover:shadow-md transition-shadow h-full">
                  <div className="flex items-start justify-between">
                    <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide">{t('nav.bp', locale)}</div>
                    <span className="text-xs text-gray-400">→</span>
                  </div>
                  <div className="text-[10px] text-gray-400 mb-2 leading-snug">{t('life.bp_hint', locale)}</div>
                  {vitals?.latest_bp_session ? (
                    <>
                      <div className="text-3xl font-semibold text-gray-900">
                        {Math.round(vitals.latest_bp_session.avg_systolic)}/{Math.round(vitals.latest_bp_session.avg_diastolic)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(vitals.latest_bp_session.measured_at).toLocaleDateString()}
                      </div>
                      <Badge color={STAGE_COLORS[vitals.latest_bp_session.stage] || 'gray'}>
                        {vitals.latest_bp_session.stage.replace('_', ' ')}
                      </Badge>
                    </>
                  ) : <div className="text-sm text-gray-500 py-4">{t('vitals.no_bp', locale)}</div>}
                </Card>
              </Link>

              <Card>
                <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide">{t('vitals.bp_per_kg', locale)}</div>
                <div className="text-[10px] text-gray-400 mb-2 leading-snug">{t('life.slope_hint', locale)}</div>
                {slope?.status === 'ok' ? (
                  <>
                    <div className="text-3xl font-semibold text-gray-900">
                      {slope.slope_mmhg_per_kg! > 0 ? '+' : ''}{slope.slope_mmhg_per_kg}
                      <span className="text-sm text-gray-500 ml-1">mmHg/kg</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      R² {slope.r_squared} • {slope.paired_days}d {t('vitals.paired', locale)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-gray-600">
                      {slope?.paired_days || 0} / {slope?.need || 20} {t('vitals.paired_days_needed', locale)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{t('vitals.log_weight_bp', locale)}</div>
                  </>
                )}
              </Card>
            </div>

            {forecast?.status === 'ok' && (
              <Card>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <div className="text-[13px] font-medium text-gray-500 uppercase tracking-wide">{t('vitals.forecast_title', locale)}</div>
                    <div className="text-[10px] text-gray-400 mb-2 leading-snug">{t('life.forecast_hint', locale)}</div>
                    <div className="text-lg text-gray-900">
                      {t('vitals.forecast_lose', locale).replace('{kg}', String(forecast.kg_to_lose))}
                      {' → '}
                      <span className="font-medium">{forecast.target_systolic} mmHg</span>
                    </div>
                    {forecast.eta_date && (
                      <div className="text-sm text-gray-600 mt-1">
                        ETA: {new Date(forecast.eta_date).toLocaleDateString()} ({forecast.weeks} wks)
                      </div>
                    )}
                  </div>
                  <Badge color="indigo">{t('vitals.projection', locale)}</Badge>
                </div>
              </Card>
            )}

            {/* Add Measurements Button */}
            <div className="mt-4">
              <Button
                variant="primary"
                onClick={() => setShowAddVitalsForm(true)}
                className="w-full"
              >
                {locale === 'bg' ? '❤️ Добави измервания' : '❤️ Add Measurements'}
              </Button>
            </div>
          </>
        )}

        {/* ═══ BLOOD TEST RESULTS (from lifestyle) ═══ */}
        <div className="mt-6 mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {locale === 'bg' ? 'Кръвни резултати' : 'Blood Test Results'}
        </div>
        <Card>
          <button
            type="button"
            onClick={() => setBloodOpen(!bloodOpen)}
            className="w-full flex items-center justify-between"
          >
            <div>
              <div className="text-[13px] font-medium text-gray-700">
                {locale === 'bg' ? 'Последни резултати' : 'Latest Results'}
              </div>
              <div className="text-[10px] text-gray-400">
                {locale === 'bg'
                  ? 'Преглед на кръвните тестове по системи'
                  : 'Blood test overview by body system'}
              </div>
            </div>
            <span className={`text-gray-400 transition-transform ${bloodOpen ? 'rotate-180' : ''}`}>▼</span>
          </button>
          {bloodOpen && (
            <div className="mt-4 space-y-4">
              {bloodCategories.map(cat => {
                const catLabel = CATEGORY_LABELS[cat];
                const results = BLOOD_RESULTS.filter(r => r.category === cat);
                return (
                  <div key={cat}>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <span>{catLabel?.icon}</span> {catLabel?.[locale] || cat}
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 text-left">
                            <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">{locale === 'bg' ? 'Тест' : 'Test'}</th>
                            <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase text-right hidden sm:table-cell">{locale === 'bg' ? 'Референция' : 'Reference'}</th>
                            <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase text-right">{locale === 'bg' ? 'Резултат' : 'Result'}</th>
                            <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase text-center">{locale === 'bg' ? 'Статус' : 'Status'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {results.map(r => (
                            <tr key={r.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <span className="text-sm font-medium text-gray-900">{r.name[locale]}</span>
                                <span className="text-xs text-gray-400 ml-1.5">{r.code}</span>
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-500 text-right hidden sm:table-cell">
                                {r.refMin}–{r.refMax} {r.unit}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={`text-sm font-semibold ${r.status === 'abnormal' ? 'text-red-600' : r.status === 'borderline' ? 'text-yellow-600' : 'text-gray-900'}`}>
                                  {r.value}
                                </span>
                                <span className="text-xs text-gray-400 ml-1">{r.unit}</span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <Badge color={STATUS_COLORS[r.status]}>
                                  {r.status === 'optimal' ? (locale === 'bg' ? 'Оптимален' : 'Optimal') :
                                   r.status === 'borderline' ? (locale === 'bg' ? 'Гранична' : 'Borderline') :
                                   (locale === 'bg' ? 'Отклонение' : 'Abnormal')}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ═══ RECOMMENDATIONS (from lifestyle) ═══ */}
        <div className="mt-6 mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {locale === 'bg' ? 'Препоръки' : 'Recommendations'}
        </div>
        <Card>
          <button
            type="button"
            onClick={() => setRecsOpen(!recsOpen)}
            className="w-full flex items-center justify-between"
          >
            <div>
              <div className="text-[13px] font-medium text-gray-700">
                {locale === 'bg' ? 'Персонализирани препоръки' : 'Personalized Recommendations'}
              </div>
              <div className="text-[10px] text-gray-400">
                {locale === 'bg'
                  ? 'На база кръвните ви резултати'
                  : 'Based on your blood test results'}
              </div>
            </div>
            <span className={`text-gray-400 transition-transform ${recsOpen ? 'rotate-180' : ''}`}>▼</span>
          </button>
          {recsOpen && (
            <div className="mt-4 space-y-4">
              {RECOMMENDATIONS.map((rec, i) => {
                const linked = BLOOD_RESULTS.filter(r => rec.linkedResults.includes(r.id));
                return (
                  <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="text-2xl mt-0.5">{rec.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-semibold text-gray-900">{rec.title[locale]}</h3>
                        <Badge color={PRIORITY_COLORS[rec.priority]}>
                          {rec.priority === 'high' ? (locale === 'bg' ? 'Висок' : 'High Priority') :
                           rec.priority === 'medium' ? (locale === 'bg' ? 'Среден' : 'Medium Priority') :
                           (locale === 'bg' ? 'Нисък' : 'Low Priority')}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">{rec.description[locale]}</p>
                      {linked.length > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-gray-400">{locale === 'bg' ? 'Свързани:' : 'Linked:'}</span>
                          {linked.map(r => (
                            <Badge key={r.id} color={STATUS_COLORS[r.status]}>{r.code} {r.value}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Edit Intervention Modal */}
        {editingId !== null && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <Card className="w-full max-w-md my-8">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  {locale === 'bg' ? '✎ Редактирай' : '✎ Edit'}
                </h2>
              </div>

              <div className="space-y-4">
                {/* Name */}
                <Input
                  label={locale === 'bg' ? 'Име' : 'Name'}
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />

                {/* Category */}
                <Select
                  label={locale === 'bg' ? 'Вид' : 'Type'}
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                >
                  <option value="supplement">{locale === 'bg' ? 'Добавка/Витамин' : 'Supplement/Vitamin'}</option>
                  <option value="medication">{locale === 'bg' ? 'Лекарство' : 'Medication'}</option>
                  <option value="therapy">{locale === 'bg' ? 'Терапия' : 'Therapy'}</option>
                </Select>

                {/* Dose */}
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={locale === 'bg' ? 'Доза' : 'Dose'}
                    type="number"
                    value={editForm.dose}
                    onChange={(e) => setEditForm({ ...editForm, dose: e.target.value })}
                    inputMode="decimal"
                  />
                  <Select
                    label={locale === 'bg' ? 'Единица' : 'Unit'}
                    value={editForm.dose_unit}
                    onChange={(e) => setEditForm({ ...editForm, dose_unit: e.target.value })}
                  >
                    <option value="mg">mg</option>
                    <option value="g">g</option>
                    <option value="mcg">mcg</option>
                    <option value="IU">IU</option>
                    <option value="ml">ml</option>
                    <option value="units">units</option>
                  </Select>
                </div>

                {/* Form (tablet, liquid, etc.) */}
                <Select
                  label={locale === 'bg' ? 'Форма' : 'Form'}
                  value={editForm.form}
                  onChange={(e) => setEditForm({ ...editForm, form: e.target.value })}
                >
                  <option value="tablet">{locale === 'bg' ? 'Таблетка' : 'Tablet'}</option>
                  <option value="capsule">{locale === 'bg' ? 'Капсула' : 'Capsule'}</option>
                  <option value="liquid">{locale === 'bg' ? 'Течност' : 'Liquid'}</option>
                  <option value="powder">{locale === 'bg' ? 'Прах' : 'Powder'}</option>
                  <option value="ampule">{locale === 'bg' ? 'Ампула' : 'Ampule'}</option>
                  <option value="injection">{locale === 'bg' ? 'Инжекция' : 'Injection'}</option>
                  <option value="patch">{locale === 'bg' ? 'Пластир' : 'Patch'}</option>
                  <option value="spray">{locale === 'bg' ? 'Спрей' : 'Spray'}</option>
                  <option value="other">{locale === 'bg' ? 'Друго' : 'Other'}</option>
                </Select>

                {/* Frequency */}
                <Select
                  label={locale === 'bg' ? 'Честота' : 'Frequency'}
                  value={editForm.frequency}
                  onChange={(e) => setEditForm({ ...editForm, frequency: e.target.value })}
                >
                  <option value="daily">{locale === 'bg' ? 'Дневно' : 'Daily'}</option>
                  <option value="twice_daily">{locale === 'bg' ? 'Два пъти дневно' : 'Twice Daily'}</option>
                  <option value="three_times">{locale === 'bg' ? 'Три пъти дневно' : 'Three Times Daily'}</option>
                  <option value="every_other_day">{locale === 'bg' ? 'Всеки втори ден' : 'Every Other Day'}</option>
                  <option value="weekly">{locale === 'bg' ? 'Седмично' : 'Weekly'}</option>
                  <option value="twice_weekly">{locale === 'bg' ? 'Два пъти седмично' : 'Twice Weekly'}</option>
                  <option value="as_needed">{locale === 'bg' ? 'По необходимост' : 'As Needed'}</option>
                </Select>

                {/* Reminder Time */}
                <Input
                  label={locale === 'bg' ? '⏰ Час' : '⏰ Reminder Time'}
                  type="time"
                  value={editForm.reminder_time}
                  onChange={(e) => setEditForm({ ...editForm, reminder_time: e.target.value })}
                />

                {/* Notes */}
                <Textarea
                  label={locale === 'bg' ? 'Бележки' : 'Notes'}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder={locale === 'bg' ? 'Време, храна, странични ефекти...' : 'Timing, food, side effects...'}
                />

                {/* Photo Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {locale === 'bg' ? '📷 Снимка' : '📷 Photo'}
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setEditForm({ ...editForm, photo_file: e.target.files[0] });
                      }
                    }}
                    className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:border file:border-gray-300 file:rounded file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100"
                  />
                  {editForm.photo_file && (
                    <div className="mt-3">
                      <img
                        src={URL.createObjectURL(editForm.photo_file)}
                        alt="Preview"
                        className="w-24 h-24 rounded object-cover border border-indigo-200 bg-indigo-50"
                      />
                      <p className="text-xs text-gray-600 mt-2 font-medium">
                        ✓ {editForm.photo_file.name}
                      </p>
                    </div>
                  )}
                </div>

                {error && <Alert type="error" message={error} />}

                {/* Action buttons */}
                <div className="flex gap-3 pt-4">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingId(null);
                      setEditForm({
                        name: '',
                        dose: '',
                        dose_unit: 'mg',
                        form: 'tablet',
                        frequency: 'daily',
                        category: 'supplement',
                        notes: '',
                        reminder_time: '',
                        photo_file: null,
                      });
                    }}
                    disabled={editingMedication}
                    className="flex-1"
                  >
                    {locale === 'bg' ? 'Отмени' : 'Cancel'}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={async () => {
                      if (!editForm.name.trim()) {
                        setError(locale === 'bg' ? 'Име е задължително' : 'Name is required');
                        return;
                      }
                      try {
                        setEditingMedication(true);

                        const formData = new FormData();
                        formData.append('name', editForm.name);
                        formData.append('dose', editForm.dose || '');
                        formData.append('frequency', editForm.frequency);
                        formData.append('category', editForm.category);
                        formData.append('hypothesis', editForm.notes);
                        if (editForm.reminder_time) {
                          formData.append('reminder_times', JSON.stringify([editForm.reminder_time]));
                        }
                        if (editForm.photo_file) {
                          formData.append('photo', editForm.photo_file);
                        }

                        const response = await fetch(`/api/health/interventions/${editingId}/`, {
                          method: 'PATCH',
                          body: formData,
                          headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}` },
                        });

                        if (!response.ok) {
                          const errorData = await response.json().catch(() => ({}));
                          console.error('API Error:', errorData);
                          throw new Error(errorData.detail || (locale === 'bg' ? 'Неуспешно обновяване' : 'Failed to update'));
                        }

                        await load();
                        setEditingId(null);
                        setError('');
                      } catch (e) {
                        setError(e instanceof Error ? e.message : (locale === 'bg' ? 'Грешка' : 'Error'));
                      } finally {
                        setEditingMedication(false);
                      }
                    }}
                    disabled={editingMedication}
                    className="flex-1"
                  >
                    {editingMedication
                      ? (locale === 'bg' ? 'Запазване...' : 'Saving...')
                      : (locale === 'bg' ? 'Запази' : 'Save')}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ADD MEDICATION/SUPPLEMENT/VITAMIN Modal */}
        {showAddMedicationForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <Card className="w-full max-w-md my-8">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  {locale === 'bg' ? '➕ Добави лекарство' : '➕ Add Medication/Supplement'}
                </h2>
              </div>

              <div className="space-y-4">
                {/* Name */}
                <Input
                  label={locale === 'bg' ? 'Име' : 'Name'}
                  value={newMedicationForm.name}
                  onChange={(e) => setNewMedicationForm({ ...newMedicationForm, name: e.target.value })}
                  placeholder={locale === 'bg' ? 'Вит. D, Липитор, Саксенда' : 'e.g. Vitamin D, Lipitor, Saxenda'}
                />

                {/* Category */}
                <Select
                  label={locale === 'bg' ? 'Вид' : 'Type'}
                  value={newMedicationForm.category}
                  onChange={(e) => setNewMedicationForm({ ...newMedicationForm, category: e.target.value })}
                >
                  <option value="supplement">{locale === 'bg' ? 'Добавка/Витамин' : 'Supplement/Vitamin'}</option>
                  <option value="medication">{locale === 'bg' ? 'Лекарство' : 'Medication'}</option>
                  <option value="therapy">{locale === 'bg' ? 'Терапия' : 'Therapy'}</option>
                </Select>

                {/* Dose */}
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={locale === 'bg' ? 'Доза' : 'Dose'}
                    type="number"
                    value={newMedicationForm.dose}
                    onChange={(e) => setNewMedicationForm({ ...newMedicationForm, dose: e.target.value })}
                    inputMode="decimal"
                  />
                  <Select
                    label={locale === 'bg' ? 'Единица' : 'Unit'}
                    value={newMedicationForm.dose_unit}
                    onChange={(e) => setNewMedicationForm({ ...newMedicationForm, dose_unit: e.target.value })}
                  >
                    <option value="mg">mg</option>
                    <option value="g">g</option>
                    <option value="mcg">mcg</option>
                    <option value="IU">IU</option>
                    <option value="ml">ml</option>
                    <option value="units">units</option>
                  </Select>
                </div>

                {/* Form (tablet, liquid, etc.) */}
                <Select
                  label={locale === 'bg' ? 'Форма' : 'Form'}
                  value={newMedicationForm.form}
                  onChange={(e) => setNewMedicationForm({ ...newMedicationForm, form: e.target.value })}
                >
                  <option value="tablet">{locale === 'bg' ? 'Таблетка' : 'Tablet'}</option>
                  <option value="capsule">{locale === 'bg' ? 'Капсула' : 'Capsule'}</option>
                  <option value="liquid">{locale === 'bg' ? 'Течност' : 'Liquid'}</option>
                  <option value="powder">{locale === 'bg' ? 'Прах' : 'Powder'}</option>
                  <option value="ampule">{locale === 'bg' ? 'Ампула' : 'Ampule'}</option>
                  <option value="injection">{locale === 'bg' ? 'Инжекция' : 'Injection'}</option>
                  <option value="patch">{locale === 'bg' ? 'Пластир' : 'Patch'}</option>
                  <option value="spray">{locale === 'bg' ? 'Спрей' : 'Spray'}</option>
                  <option value="other">{locale === 'bg' ? 'Друго' : 'Other'}</option>
                </Select>

                {/* Frequency */}
                <Select
                  label={locale === 'bg' ? 'Честота' : 'Frequency'}
                  value={newMedicationForm.frequency}
                  onChange={(e) => setNewMedicationForm({ ...newMedicationForm, frequency: e.target.value })}
                >
                  <option value="daily">{locale === 'bg' ? 'Дневно' : 'Daily'}</option>
                  <option value="twice_daily">{locale === 'bg' ? 'Два пъти дневно' : 'Twice Daily'}</option>
                  <option value="three_times">{locale === 'bg' ? 'Три пъти дневно' : 'Three Times Daily'}</option>
                  <option value="every_other_day">{locale === 'bg' ? 'Всеки втори ден' : 'Every Other Day'}</option>
                  <option value="weekly">{locale === 'bg' ? 'Седмично' : 'Weekly'}</option>
                  <option value="twice_weekly">{locale === 'bg' ? 'Два пъти седмично' : 'Twice Weekly'}</option>
                  <option value="as_needed">{locale === 'bg' ? 'По необходимост' : 'As Needed'}</option>
                </Select>

                {/* Notes */}
                <Textarea
                  label={locale === 'bg' ? 'Бележки' : 'Notes'}
                  value={newMedicationForm.notes}
                  onChange={(e) => setNewMedicationForm({ ...newMedicationForm, notes: e.target.value })}
                  placeholder={locale === 'bg' ? 'Време, храна, странични ефекти...' : 'Timing, food, side effects...'}
                />

                {/* Photo Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {locale === 'bg' ? '📷 Снимка' : '📷 Photo'}
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:border file:border-gray-300 file:rounded file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100"
                  />
                  {newMedicationForm.photo_file && (
                    <p className="text-xs text-gray-600 mt-2">
                      ✓ {newMedicationForm.photo_file.name}
                    </p>
                  )}
                </div>

                {error && <Alert type="error" message={error} />}

                {/* Action buttons */}
                <div className="flex gap-3 pt-4">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowAddMedicationForm(false);
                      setNewMedicationForm({
                        name: '',
                        dose: '',
                        dose_unit: 'mg',
                        form: 'tablet',
                        frequency: 'daily',
                        category: 'supplement',
                        notes: '',
                        photo_file: null,
                      });
                    }}
                    disabled={addingMedication}
                    className="flex-1"
                  >
                    {locale === 'bg' ? 'Отмени' : 'Cancel'}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleAddMedication}
                    disabled={addingMedication}
                    className="flex-1"
                  >
                    {addingMedication
                      ? (locale === 'bg' ? 'Добавяне...' : 'Adding...')
                      : (locale === 'bg' ? 'Добави' : 'Add')}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ADD VITALS Modal */}
        {showAddVitalsForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <Card className="w-full max-w-md my-8">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  ❤️ {locale === 'bg' ? 'Добави измервания' : 'Add Vitals'}
                </h2>
              </div>

              <div className="space-y-4">
                {/* Blood Pressure Section */}
                <div className="border-b pb-4">
                  <div className="text-xs font-semibold text-gray-700 mb-3">
                    🩸 {locale === 'bg' ? 'Кръвно налягане' : 'Blood Pressure'}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <Input
                      label={locale === 'bg' ? 'Систолно' : 'Systolic'}
                      type="number"
                      value={vitalsForm.bp_systolic}
                      onChange={(e) => setVitalsForm({ ...vitalsForm, bp_systolic: e.target.value })}
                      inputMode="numeric"
                      placeholder="120"
                    />
                    <Input
                      label={locale === 'bg' ? 'Диастолно' : 'Diastolic'}
                      type="number"
                      value={vitalsForm.bp_diastolic}
                      onChange={(e) => setVitalsForm({ ...vitalsForm, bp_diastolic: e.target.value })}
                      inputMode="numeric"
                      placeholder="80"
                    />
                    <Input
                      label={locale === 'bg' ? 'Пулс' : 'Pulse'}
                      type="number"
                      value={vitalsForm.pulse}
                      onChange={(e) => setVitalsForm({ ...vitalsForm, pulse: e.target.value })}
                      inputMode="numeric"
                      placeholder="72"
                    />
                  </div>

                  {/* Arm Selection */}
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      {locale === 'bg' ? 'Ръка' : 'Arm'}
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setVitalsForm({ ...vitalsForm, arm: 'left' })}
                        className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                          vitalsForm.arm === 'left'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {locale === 'bg' ? 'Лява' : 'Left'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setVitalsForm({ ...vitalsForm, arm: 'right' })}
                        className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                          vitalsForm.arm === 'right'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {locale === 'bg' ? 'Дясна' : 'Right'}
                      </button>
                    </div>
                  </div>

                  {/* Posture Selection */}
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      {locale === 'bg' ? 'Поза' : 'Posture'}
                    </label>
                    <div className="flex gap-2">
                      {(['sitting', 'standing', 'lying'] as const).map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setVitalsForm({ ...vitalsForm, posture: pos })}
                          className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                            vitalsForm.posture === pos
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {locale === 'bg'
                            ? pos === 'sitting' ? 'Седнал' : pos === 'standing' ? 'Правостоящ' : 'Легнал'
                            : pos.charAt(0).toUpperCase() + pos.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Context Tags */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      {locale === 'bg' ? 'Контекст' : 'Context'}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'is_after_caffeine', emoji: '☕', en: 'After coffee', bg: 'След кафе' },
                        { key: 'is_after_exercise', emoji: '🏃', en: 'After exercise', bg: 'След упражнение' },
                        { key: 'is_after_medication', emoji: '💊', en: 'After medication', bg: 'След лекарство' },
                        { key: 'is_stressed', emoji: '😰', en: 'Stressed', bg: 'Стресиран' },
                        { key: 'is_clinic_reading', emoji: '🏥', en: 'Clinical', bg: 'Клинично' },
                        { key: 'is_fasting', emoji: '🍴', en: 'Fasting', bg: 'На гладно' },
                      ].map((ctx) => (
                        <button
                          key={ctx.key}
                          type="button"
                          onClick={() => setVitalsForm({
                            ...vitalsForm,
                            [ctx.key]: !vitalsForm[ctx.key as keyof typeof vitalsForm],
                          })}
                          className={`px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                            vitalsForm[ctx.key as keyof typeof vitalsForm]
                              ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                              : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-150'
                          }`}
                        >
                          <span>{ctx.emoji}</span>
                          <span className="hidden sm:inline">{locale === 'bg' ? ctx.bg : ctx.en}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Weight Section */}
                <div className="border-b pb-4">
                  <div className="text-xs font-semibold text-gray-700 mb-3">
                    ⚖️ {locale === 'bg' ? 'Тегло' : 'Weight'}
                  </div>
                  <Input
                    label={locale === 'bg' ? 'Килограми' : 'Kilograms'}
                    type="number"
                    step="0.1"
                    value={vitalsForm.weight}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, weight: e.target.value })}
                    inputMode="decimal"
                    placeholder="70.5"
                  />
                </div>

                {/* Body Measurements Section */}
                <div className="border-b pb-4">
                  <div className="text-xs font-semibold text-gray-700 mb-3">
                    📏 {locale === 'bg' ? 'Обиколки' : 'Measurements'}
                  </div>
                  <Input
                    label={locale === 'bg' ? 'Талия (см)' : 'Waist (cm)'}
                    type="number"
                    value={vitalsForm.waist_cm}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, waist_cm: e.target.value })}
                    inputMode="numeric"
                    placeholder="85"
                  />
                </div>

                {/* Notes */}
                <Textarea
                  label={locale === 'bg' ? 'Бележки' : 'Notes'}
                  value={vitalsForm.notes}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, notes: e.target.value })}
                  placeholder={locale === 'bg' ? 'Условия, време на ден, други...' : 'Conditions, time of day, other...'}
                />

                {error && <Alert type="error" message={error} />}

                {/* Action buttons */}
                <div className="flex gap-3 pt-4">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowAddVitalsForm(false);
                      setVitalsForm({
                        bp_systolic: '',
                        bp_diastolic: '',
                        pulse: '',
                        arm: 'left',
                        posture: 'sitting',
                        is_after_caffeine: false,
                        is_after_exercise: false,
                        is_after_medication: false,
                        is_stressed: false,
                        is_clinic_reading: false,
                        is_fasting: false,
                        weight: '',
                        waist_cm: '',
                        notes: '',
                      });
                    }}
                    disabled={addingVitals}
                    className="flex-1"
                  >
                    {locale === 'bg' ? 'Отмени' : 'Cancel'}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSaveVitals}
                    disabled={addingVitals || (!vitalsForm.bp_systolic && !vitalsForm.weight)}
                    className="flex-1"
                  >
                    {addingVitals
                      ? (locale === 'bg' ? 'Запазване...' : 'Saving...')
                      : (locale === 'bg' ? 'Запази' : 'Save')}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Photo Preview Modal */}
        {showPhotoPreview && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowPhotoPreview(false)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <Card className="w-full max-w-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{previewPhotoName}</h3>
                <button
                  type="button"
                  onClick={() => setShowPhotoPreview(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                  title={locale === 'bg' ? 'Затвори' : 'Close'}
                >
                  ✕
                </button>
              </div>
              <div className="bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center" style={{ aspectRatio: '1' }}>
                <img
                  src={previewPhotoUrl}
                  alt={previewPhotoName}
                  className="w-full h-full object-contain"
                />
              </div>
              </Card>
            </div>
          </div>
        )}

        {/* RitualModal replaced by unified wizard at /health/checkin */}
      </PageContent>
    </PageShell>
  );
}
