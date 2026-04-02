'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import {
  getVehicle, updateVehicle, deleteVehicle,
  getVehicleObligations, createObligation, updateObligation, deleteObligation,
  renewObligation, createVehiclePresets,
  uploadObligationFile, deleteObligationFile,
  getProperties,
} from '../../lib/api';
import NavBar from '../../components/NavBar';
import {
  PageShell, PageContent, PageHeader, Card, Button, Badge,
  Input, Select, Textarea, Alert, Spinner,
} from '../../components/ui';

const OB_TYPE_OPTIONS = [
  { value: 'mtpl', key: 'obligation.mtpl' },
  { value: 'kasko', key: 'obligation.kasko' },
  { value: 'vignette', key: 'obligation.vignette' },
  { value: 'mot', key: 'obligation.mot' },
  { value: 'vehicle_tax', key: 'obligation.vehicle_tax' },
  { value: 'green_card', key: 'obligation.green_card' },
  { value: 'assistance', key: 'obligation.assistance' },
  { value: 'custom', key: 'obligation.custom' },
];

const STATUS_BADGE: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  active: 'green',
  expiring_soon: 'yellow',
  expired: 'red',
  no_expiry: 'gray',
};

interface Obligation {
  id: number;
  obligation_type: string;
  custom_type_name: string;
  display_name: string;
  start_date: string;
  end_date: string | null;
  provider: string;
  policy_number: string;
  cost: string | null;
  currency: string;
  reminder_days: number[];
  is_current: boolean;
  status: string;
  notes: string;
  files?: Array<{ id: number; file: string; label: string; file_size: number; uploaded_at: string }>;
}

interface VehicleData {
  id: number;
  plate_number: string;
  make: string;
  model: string;
  year: number | null;
  color: string;
  fuel_type: string;
  vin: string;
  engine_cc: number | null;
  first_registration_date: string | null;
  linked_property: number | null;
  property_name: string | null;
  is_active: boolean;
  notes: string;
  current_obligations: Obligation[];
}

export default function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { locale } = useLanguage();

  const [vehicle, setVehicle] = useState<VehicleData | null>(null);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [properties, setProperties] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState(false);
  const [showAddOb, setShowAddOb] = useState(false);
  const [renewingId, setRenewingId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Vehicle edit form
  const [form, setForm] = useState({
    plate_number: '', make: '', model: '', year: '', color: '',
    fuel_type: '', vin: '', engine_cc: '', first_registration_date: '',
    linked_property: '', notes: '', is_active: true,
  });

  // New obligation form
  const [obForm, setObForm] = useState({
    obligation_type: 'mtpl', custom_type_name: '', start_date: '',
    end_date: '', provider: '', policy_number: '', cost: '',
    currency: 'BGN', reminder_days: '30,7,1', notes: '',
  });

  // Renew form
  const [renewForm, setRenewForm] = useState({
    start_date: '', end_date: '', cost: '', provider: '', policy_number: '',
  });

  const loadData = async () => {
    try {
      const [v, obs, props] = await Promise.all([
        getVehicle(parseInt(id)),
        getVehicleObligations(parseInt(id), 'current=true'),
        getProperties(),
      ]);
      setVehicle(v);
      setObligations(obs);
      setProperties(props);
      setForm({
        plate_number: v.plate_number,
        make: v.make,
        model: v.model,
        year: v.year?.toString() || '',
        color: v.color || '',
        fuel_type: v.fuel_type || '',
        vin: v.vin || '',
        engine_cc: v.engine_cc?.toString() || '',
        first_registration_date: v.first_registration_date || '',
        linked_property: v.linked_property?.toString() || '',
        notes: v.notes || '',
        is_active: v.is_active,
      });
    } catch {
      setError('Failed to load vehicle');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [id]);

  const handleSaveVehicle = async () => {
    try {
      const data: Record<string, unknown> = {
        plate_number: form.plate_number.toUpperCase().trim(),
        make: form.make.trim(),
        model: form.model.trim(),
        color: form.color,
        fuel_type: form.fuel_type || '',
        vin: form.vin,
        notes: form.notes,
        is_active: form.is_active,
      };
      if (form.year) data.year = parseInt(form.year);
      else data.year = null;
      if (form.engine_cc) data.engine_cc = parseInt(form.engine_cc);
      else data.engine_cc = null;
      data.first_registration_date = form.first_registration_date || null;
      data.linked_property = form.linked_property ? parseInt(form.linked_property) : null;

      const updated = await updateVehicle(parseInt(id), data);
      setVehicle(updated);
      setEditing(false);
      setSuccess(t('common.saved', locale));
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to save');
    }
  };

  const handleDeleteVehicle = async () => {
    if (!confirm(t('vehicles.delete_confirm', locale))) return;
    try {
      await deleteVehicle(parseInt(id));
      router.push('/vehicles');
    } catch {
      setError('Failed to delete');
    }
  };

  const handleAddObligation = async () => {
    try {
      const data: Record<string, unknown> = {
        obligation_type: obForm.obligation_type,
        custom_type_name: obForm.custom_type_name,
        start_date: obForm.start_date,
        end_date: obForm.end_date || null,
        provider: obForm.provider,
        policy_number: obForm.policy_number,
        cost: obForm.cost ? parseFloat(obForm.cost) : null,
        currency: obForm.currency,
        reminder_days: obForm.reminder_days.split(',').map((d) => parseInt(d.trim())).filter((d) => !isNaN(d)),
        notes: obForm.notes,
      };
      await createObligation(parseInt(id), data);
      setShowAddOb(false);
      setObForm({
        obligation_type: 'mtpl', custom_type_name: '', start_date: '',
        end_date: '', provider: '', policy_number: '', cost: '',
        currency: 'BGN', reminder_days: '30,7,1', notes: '',
      });
      loadData();
    } catch {
      setError('Failed to add obligation');
    }
  };

  const handleRenew = async (obligationId: number) => {
    try {
      await renewObligation(obligationId, {
        start_date: renewForm.start_date,
        end_date: renewForm.end_date,
        cost: renewForm.cost ? parseFloat(renewForm.cost) : undefined,
        provider: renewForm.provider || undefined,
        policy_number: renewForm.policy_number || undefined,
      });
      setRenewingId(null);
      setRenewForm({ start_date: '', end_date: '', cost: '', provider: '', policy_number: '' });
      loadData();
    } catch {
      setError('Failed to renew');
    }
  };

  const handleDeleteObligation = async (obId: number) => {
    try {
      await deleteObligation(obId);
      loadData();
    } catch {
      setError('Failed to delete obligation');
    }
  };

  const handleAddPresets = async () => {
    try {
      const result = await createVehiclePresets(parseInt(id));
      setSuccess(`${t('vehicles.presets_added', locale)} (${result.created})`);
      setTimeout(() => setSuccess(''), 3000);
      loadData();
    } catch {
      setError('Failed to add presets');
    }
  };

  const handleFileUpload = async (obId: number, file: File) => {
    try {
      await uploadObligationFile(obId, file);
      loadData();
    } catch {
      setError('Failed to upload file');
    }
  };

  const handleFileDelete = async (fileId: number) => {
    try {
      await deleteObligationFile(fileId);
      loadData();
    } catch {
      setError('Failed to delete file');
    }
  };

  const loadHistory = async () => {
    try {
      const all = await getVehicleObligations(parseInt(id));
      setObligations(all);
      setShowHistory(true);
    } catch {
      setError('Failed to load history');
    }
  };

  if (loading) return (
    <PageShell><NavBar /><PageContent size="lg"><Spinner /></PageContent></PageShell>
  );

  if (!vehicle) return (
    <PageShell><NavBar /><PageContent size="lg"><Alert type="error" message="Vehicle not found" /></PageContent></PageShell>
  );

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={`${vehicle.make} ${vehicle.model} — ${vehicle.plate_number}`}
          onBack={() => router.push('/vehicles')}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(!editing)}>
                {editing ? t('common.cancel', locale) : t('vehicles.edit', locale)}
              </Button>
              <Button variant="danger" size="sm" onClick={handleDeleteVehicle}>
                {t('common.delete', locale)}
              </Button>
            </div>
          }
        />

        <Alert type="error" message={error} />
        <Alert type="success" message={success} />

        {/* Vehicle Info Card */}
        {editing ? (
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label={t('vehicles.plate', locale)} name="plate_number" value={form.plate_number} onChange={(e) => setForm((p) => ({ ...p, plate_number: e.target.value }))} required />
              <Input label={t('vehicles.make', locale)} name="make" value={form.make} onChange={(e) => setForm((p) => ({ ...p, make: e.target.value }))} required />
              <Input label={t('vehicles.model', locale)} name="model" value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} required />
              <Input label={t('vehicles.year', locale)} type="number" value={form.year} onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))} />
              <Input label={t('vehicles.color', locale)} value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} />
              <Select label={t('vehicles.fuel', locale)} value={form.fuel_type} onChange={(e) => setForm((p) => ({ ...p, fuel_type: e.target.value }))}>
                <option value="">—</option>
                <option value="petrol">{t('fuel.petrol', locale)}</option>
                <option value="diesel">{t('fuel.diesel', locale)}</option>
                <option value="lpg">{t('fuel.lpg', locale)}</option>
                <option value="electric">{t('fuel.electric', locale)}</option>
                <option value="hybrid">{t('fuel.hybrid', locale)}</option>
                <option value="plugin_hybrid">{t('fuel.plugin_hybrid', locale)}</option>
                <option value="cng">{t('fuel.cng', locale)}</option>
              </Select>
              <Input label={t('vehicles.vin', locale)} value={form.vin} onChange={(e) => setForm((p) => ({ ...p, vin: e.target.value }))} />
              <Input label={t('vehicles.engine_cc', locale)} type="number" value={form.engine_cc} onChange={(e) => setForm((p) => ({ ...p, engine_cc: e.target.value }))} />
              <Input label={t('vehicles.first_reg', locale)} type="date" value={form.first_registration_date} onChange={(e) => setForm((p) => ({ ...p, first_registration_date: e.target.value }))} />
              <Select label={t('vehicles.property', locale)} value={form.linked_property} onChange={(e) => setForm((p) => ({ ...p, linked_property: e.target.value }))}>
                <option value="">—</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div className="mt-4">
              <Textarea label={t('vehicles.notes', locale)} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-indigo-600" />
              <span className="text-sm text-gray-700">{t('vehicles.active', locale)}</span>
            </div>
            <div className="mt-4">
              <Button onClick={handleSaveVehicle}>{t('common.save', locale)}</Button>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-gray-500">{t('vehicles.plate', locale)}</span><div className="font-medium">{vehicle.plate_number}</div></div>
              <div><span className="text-gray-500">{t('vehicles.make', locale)}</span><div className="font-medium">{vehicle.make} {vehicle.model}</div></div>
              {vehicle.year && <div><span className="text-gray-500">{t('vehicles.year', locale)}</span><div className="font-medium">{vehicle.year}</div></div>}
              {vehicle.fuel_type && <div><span className="text-gray-500">{t('vehicles.fuel', locale)}</span><div className="font-medium">{t(`fuel.${vehicle.fuel_type}`, locale)}</div></div>}
              {vehicle.color && <div><span className="text-gray-500">{t('vehicles.color', locale)}</span><div className="font-medium">{vehicle.color}</div></div>}
              {vehicle.vin && <div><span className="text-gray-500">{t('vehicles.vin', locale)}</span><div className="font-medium font-mono text-xs">{vehicle.vin}</div></div>}
              {vehicle.property_name && <div><span className="text-gray-500">{t('vehicles.property', locale)}</span><div className="font-medium">{vehicle.property_name}</div></div>}
            </div>
          </Card>
        )}

        {/* Obligations Section */}
        <div className="mt-6 flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {showHistory ? t('obligation.history', locale) : t('vehicles.compliance', locale)}
          </h2>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => showHistory ? (setShowHistory(false), loadData()) : loadHistory()}>
              {showHistory ? t('vehicles.compliance', locale) : t('obligation.history', locale)}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleAddPresets}>
              {t('vehicles.add_presets', locale)}
            </Button>
            <Button size="sm" onClick={() => setShowAddOb(!showAddOb)}>
              + {t('obligation.add', locale)}
            </Button>
          </div>
        </div>

        {/* Add Obligation Form */}
        {showAddOb && (
          <Card>
            <h3 className="font-medium text-gray-900 mb-3">{t('obligation.add', locale)}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select label={t('obligation.type', locale)} value={obForm.obligation_type} onChange={(e) => setObForm((p) => ({ ...p, obligation_type: e.target.value }))}>
                {OB_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{t(o.key, locale)}</option>
                ))}
              </Select>
              {obForm.obligation_type === 'custom' && (
                <Input label={t('obligation.custom_name', locale)} value={obForm.custom_type_name} onChange={(e) => setObForm((p) => ({ ...p, custom_type_name: e.target.value }))} />
              )}
              <Input label={t('obligation.start_date', locale)} type="date" value={obForm.start_date} onChange={(e) => setObForm((p) => ({ ...p, start_date: e.target.value }))} required />
              <Input label={t('obligation.end_date', locale)} type="date" value={obForm.end_date} onChange={(e) => setObForm((p) => ({ ...p, end_date: e.target.value }))} />
              <Input label={t('obligation.provider', locale)} value={obForm.provider} onChange={(e) => setObForm((p) => ({ ...p, provider: e.target.value }))} placeholder="DZI, Bulstrad..." />
              <Input label={t('obligation.policy_no', locale)} value={obForm.policy_number} onChange={(e) => setObForm((p) => ({ ...p, policy_number: e.target.value }))} />
              <Input label={t('obligation.cost', locale)} type="number" value={obForm.cost} onChange={(e) => setObForm((p) => ({ ...p, cost: e.target.value }))} />
              <Input label={t('obligation.reminders', locale)} value={obForm.reminder_days} onChange={(e) => setObForm((p) => ({ ...p, reminder_days: e.target.value }))} placeholder="30,7,1" />
            </div>
            <div className="mt-3">
              <Textarea label={t('vehicles.notes', locale)} value={obForm.notes} onChange={(e) => setObForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={handleAddObligation}>{t('common.save', locale)}</Button>
              <Button size="sm" variant="secondary" onClick={() => setShowAddOb(false)}>{t('common.cancel', locale)}</Button>
            </div>
          </Card>
        )}

        {/* Obligations List */}
        {obligations.length === 0 ? (
          <Card>
            <div className="text-center text-gray-500 py-4">{t('obligation.no_obligations', locale)}</div>
          </Card>
        ) : (
          <div className="space-y-3">
            {obligations.map((ob) => (
              <ObligationCard
                key={ob.id}
                ob={ob}
                locale={locale}
                isRenewing={renewingId === ob.id}
                renewForm={renewForm}
                onToggleRenew={() => {
                  if (renewingId === ob.id) {
                    setRenewingId(null);
                  } else {
                    setRenewingId(ob.id);
                    setRenewForm({ start_date: ob.end_date || '', end_date: '', cost: '', provider: ob.provider, policy_number: ob.policy_number });
                  }
                }}
                onRenewChange={(field, value) => setRenewForm((p) => ({ ...p, [field]: value }))}
                onRenew={() => handleRenew(ob.id)}
                onDelete={() => handleDeleteObligation(ob.id)}
                onFileUpload={(file) => handleFileUpload(ob.id, file)}
                onFileDelete={handleFileDelete}
              />
            ))}
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}

// Obligation card component
function ObligationCard({
  ob, locale, isRenewing, renewForm, onToggleRenew, onRenewChange, onRenew, onDelete, onFileUpload, onFileDelete,
}: {
  ob: Obligation;
  locale: 'en' | 'bg';
  isRenewing: boolean;
  renewForm: { start_date: string; end_date: string; cost: string; provider: string; policy_number: string };
  onToggleRenew: () => void;
  onRenewChange: (field: string, value: string) => void;
  onRenew: () => void;
  onDelete: () => void;
  onFileUpload: (file: File) => void;
  onFileDelete: (fileId: number) => void;
}) {
  const statusColor = STATUS_BADGE[ob.status] || 'gray';
  const borderColor: Record<string, string> = {
    active: 'border-l-green-500',
    expiring_soon: 'border-l-amber-400',
    expired: 'border-l-red-500',
    no_expiry: 'border-l-gray-300',
  };

  return (
    <div className={`bg-white border border-gray-200 rounded-xl shadow-sm border-l-4 ${borderColor[ob.status] || 'border-l-gray-200'}`}>
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{ob.display_name}</span>
              <Badge color={statusColor}>
                {t(`obligation.status_${ob.status}`, locale)}
              </Badge>
              {!ob.is_current && <Badge color="gray">Historical</Badge>}
            </div>
            <div className="mt-1 text-sm text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
              {ob.start_date && <span>{t('obligation.start_date', locale)}: {ob.start_date}</span>}
              {ob.end_date && <span>{t('obligation.end_date', locale)}: {ob.end_date}</span>}
              {ob.provider && <span>{t('obligation.provider', locale)}: {ob.provider}</span>}
              {ob.cost && <span>{t('obligation.cost', locale)}: {ob.cost} {ob.currency}</span>}
              {ob.policy_number && <span>#{ob.policy_number}</span>}
            </div>
          </div>
          <div className="flex gap-1.5">
            {ob.is_current && (
              <Button variant="secondary" size="sm" onClick={onToggleRenew}>
                {t('obligation.renew', locale)}
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={onDelete}>
              {t('common.delete', locale)}
            </Button>
          </div>
        </div>

        {/* File upload / list */}
        {ob.files && ob.files.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {ob.files.map((f) => (
              <div key={f.id} className="flex items-center gap-1 bg-gray-50 rounded px-2 py-1 text-xs">
                <a href={f.file} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  {f.label || 'File'}
                </a>
                <button onClick={() => onFileDelete(f.id)} className="text-red-400 hover:text-red-600 ml-1">&times;</button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2">
          <label className="inline-flex items-center gap-1 text-xs text-indigo-600 cursor-pointer hover:text-indigo-800">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('obligation.upload_file', locale)}
            <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) onFileUpload(e.target.files[0]); }} />
          </label>
        </div>
      </div>

      {/* Renew form */}
      {isRenewing && (
        <div className="border-t border-gray-100 p-4 bg-gray-50 rounded-b-xl">
          <h4 className="text-sm font-medium text-gray-700 mb-2">{t('obligation.renew', locale)}: {ob.display_name}</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Input label={t('obligation.start_date', locale)} type="date" value={renewForm.start_date} onChange={(e) => onRenewChange('start_date', e.target.value)} required />
            <Input label={t('obligation.end_date', locale)} type="date" value={renewForm.end_date} onChange={(e) => onRenewChange('end_date', e.target.value)} required />
            <Input label={t('obligation.cost', locale)} type="number" value={renewForm.cost} onChange={(e) => onRenewChange('cost', e.target.value)} />
            <Input label={t('obligation.provider', locale)} value={renewForm.provider} onChange={(e) => onRenewChange('provider', e.target.value)} />
            <Input label={t('obligation.policy_no', locale)} value={renewForm.policy_number} onChange={(e) => onRenewChange('policy_number', e.target.value)} />
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={onRenew}>{t('common.save', locale)}</Button>
            <Button size="sm" variant="secondary" onClick={onToggleRenew}>{t('common.cancel', locale)}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
