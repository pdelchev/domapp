'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import {
  getVehicle, updateVehicle, deleteVehicle,
  getVehicleObligations, createObligation, updateObligation, deleteObligation,
  renewObligation,
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

interface ObFile { id: number; file: string; label: string; file_size: number; uploaded_at: string }

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
  files?: ObFile[];
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
  const vehicleId = parseInt(id);
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
  // Which obligation is being edited inline (null = none)
  const [editingObId, setEditingObId] = useState<number | null>(null);

  const [form, setForm] = useState({
    plate_number: '', make: '', model: '', year: '', color: '',
    fuel_type: '', vin: '', engine_cc: '', first_registration_date: '',
    linked_property: '', notes: '', is_active: true,
  });

  // Shared form for both add & edit obligation
  const emptyObForm = {
    obligation_type: 'mtpl', custom_type_name: '', start_date: '',
    end_date: '', provider: '', policy_number: '', cost: '', notes: '',
  };
  const [obForm, setObForm] = useState(emptyObForm);

  const flash = (msg: string, type: 'success' | 'error' = 'success') => {
    if (type === 'error') setError(msg);
    else setSuccess(msg);
    setTimeout(() => { setError(''); setSuccess(''); }, 3000);
  };

  const loadData = async () => {
    try {
      const [v, obs, props] = await Promise.all([
        getVehicle(vehicleId),
        getVehicleObligations(vehicleId, 'current=true'),
        getProperties(),
      ]);
      setVehicle(v);
      setObligations(obs);
      setProperties(props);
      setForm({
        plate_number: v.plate_number, make: v.make, model: v.model,
        year: v.year?.toString() || '', color: v.color || '',
        fuel_type: v.fuel_type || '', vin: v.vin || '',
        engine_cc: v.engine_cc?.toString() || '',
        first_registration_date: v.first_registration_date || '',
        linked_property: v.linked_property?.toString() || '',
        notes: v.notes || '', is_active: v.is_active,
      });
    } catch {
      setError('Failed to load vehicle');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [id]);

  // --- Vehicle CRUD ---
  const handleSaveVehicle = async () => {
    try {
      const data: Record<string, unknown> = {
        plate_number: form.plate_number.toUpperCase().trim(),
        make: form.make.trim(), model: form.model.trim(),
        color: form.color, fuel_type: form.fuel_type || '',
        vin: form.vin, notes: form.notes, is_active: form.is_active,
        year: form.year ? parseInt(form.year) : null,
        engine_cc: form.engine_cc ? parseInt(form.engine_cc) : null,
        first_registration_date: form.first_registration_date || null,
        linked_property: form.linked_property ? parseInt(form.linked_property) : null,
      };
      const updated = await updateVehicle(vehicleId, data);
      setVehicle(updated);
      setEditing(false);
      flash(t('common.saved', locale));
    } catch { flash('Failed to save', 'error'); }
  };

  const handleDeleteVehicle = async () => {
    if (!confirm(t('vehicles.delete_confirm', locale))) return;
    await deleteVehicle(vehicleId);
    router.push('/vehicles');
  };

  // --- Obligation CRUD ---
  const handleAddObligation = async () => {
    if (!obForm.start_date || !obForm.end_date) { flash('Start and end date required', 'error'); return; }
    try {
      await createObligation(vehicleId, {
        obligation_type: obForm.obligation_type,
        custom_type_name: obForm.custom_type_name,
        start_date: obForm.start_date,
        end_date: obForm.end_date,
        provider: obForm.provider,
        policy_number: obForm.policy_number,
        cost: obForm.cost ? parseFloat(obForm.cost) : null,
        reminder_days: [30, 7, 1],
        notes: obForm.notes,
      });
      setShowAddOb(false);
      setObForm(emptyObForm);
      loadData();
    } catch { flash('Failed to add', 'error'); }
  };

  const startEditOb = (ob: Obligation) => {
    setEditingObId(ob.id);
    setObForm({
      obligation_type: ob.obligation_type,
      custom_type_name: ob.custom_type_name,
      start_date: ob.start_date,
      end_date: ob.end_date || '',
      provider: ob.provider,
      policy_number: ob.policy_number,
      cost: ob.cost || '',
      notes: ob.notes,
    });
  };

  const handleSaveOb = async () => {
    if (!editingObId) return;
    try {
      await updateObligation(editingObId, {
        obligation_type: obForm.obligation_type,
        custom_type_name: obForm.custom_type_name,
        start_date: obForm.start_date,
        end_date: obForm.end_date || null,
        provider: obForm.provider,
        policy_number: obForm.policy_number,
        cost: obForm.cost ? parseFloat(obForm.cost) : null,
        notes: obForm.notes,
      });
      setEditingObId(null);
      setObForm(emptyObForm);
      loadData();
    } catch { flash('Failed to save', 'error'); }
  };

  const handleDeleteOb = async (obId: number) => {
    await deleteObligation(obId);
    loadData();
  };

  const handleRenew = async (ob: Obligation) => {
    // Auto-calculate: new start = old end, new end = old end + 1 year
    const oldEnd = ob.end_date;
    if (!oldEnd) { flash('Cannot renew — no end date', 'error'); return; }
    const newStart = oldEnd;
    const d = new Date(oldEnd);
    d.setFullYear(d.getFullYear() + 1);
    const newEnd = d.toISOString().split('T')[0];
    try {
      await renewObligation(ob.id, {
        start_date: newStart,
        end_date: newEnd,
        provider: ob.provider || undefined,
        policy_number: ob.policy_number || undefined,
      });
      flash(t('common.saved', locale));
      loadData();
    } catch { flash('Failed to renew', 'error'); }
  };

  const handleFileUpload = async (obId: number, file: File) => {
    await uploadObligationFile(obId, file);
    loadData();
  };

  const handleFileDelete = async (fileId: number) => {
    await deleteObligationFile(fileId);
    loadData();
  };

  if (loading) return <PageShell><NavBar /><PageContent size="lg"><Spinner /></PageContent></PageShell>;
  if (!vehicle) return <PageShell><NavBar /><PageContent size="lg"><Alert type="error" message="Vehicle not found" /></PageContent></PageShell>;

  const cancelEdit = () => { setEditingObId(null); setShowAddOb(false); setObForm(emptyObForm); };

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={`${vehicle.make} ${vehicle.model} — ${vehicle.plate_number}`}
          onBack={() => router.push('/vehicles')}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => { setEditing(!editing); }}>
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

        {/* Vehicle Info */}
        {editing ? (
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label={t('vehicles.plate', locale)} value={form.plate_number} onChange={(e) => setForm((p) => ({ ...p, plate_number: e.target.value }))} required />
              <Input label={t('vehicles.make', locale)} value={form.make} onChange={(e) => setForm((p) => ({ ...p, make: e.target.value }))} required />
              <Input label={t('vehicles.model', locale)} value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} required />
              <Input label={t('vehicles.year', locale)} type="number" value={form.year} onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))} />
              <Input label={t('vehicles.color', locale)} value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} />
              <Select label={t('vehicles.fuel', locale)} value={form.fuel_type} onChange={(e) => setForm((p) => ({ ...p, fuel_type: e.target.value }))}>
                <option value="">—</option>
                {['petrol','diesel','lpg','electric','hybrid','plugin_hybrid','cng'].map((f) => (
                  <option key={f} value={f}>{t(`fuel.${f}`, locale)}</option>
                ))}
              </Select>
              <Input label={t('vehicles.vin', locale)} value={form.vin} onChange={(e) => setForm((p) => ({ ...p, vin: e.target.value }))} />
              <Select label={t('vehicles.property', locale)} value={form.linked_property} onChange={(e) => setForm((p) => ({ ...p, linked_property: e.target.value }))}>
                <option value="">—</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div className="mt-4">
              <Textarea label={t('vehicles.notes', locale)} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
            <div className="mt-4">
              <Button onClick={handleSaveVehicle}>{t('common.save', locale)}</Button>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <InfoField label={t('vehicles.plate', locale)} value={vehicle.plate_number} />
              <InfoField label={t('vehicles.make', locale)} value={`${vehicle.make} ${vehicle.model}`} />
              {vehicle.year && <InfoField label={t('vehicles.year', locale)} value={vehicle.year} />}
              {vehicle.fuel_type && <InfoField label={t('vehicles.fuel', locale)} value={t(`fuel.${vehicle.fuel_type}`, locale)} />}
              {vehicle.color && <InfoField label={t('vehicles.color', locale)} value={vehicle.color} />}
              {vehicle.vin && <InfoField label={t('vehicles.vin', locale)} value={vehicle.vin} mono />}
              {vehicle.property_name && <InfoField label={t('vehicles.property', locale)} value={vehicle.property_name} />}
            </div>
          </Card>
        )}

        {/* Obligations */}
        <div className="mt-6 flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">{t('vehicles.compliance', locale)}</h2>
          <Button size="sm" onClick={() => { cancelEdit(); setShowAddOb(true); }}>
            + {t('obligation.add', locale)}
          </Button>
        </div>

        {/* Add / Edit Obligation Form */}
        {(showAddOb || editingObId) && (
          <Card className="mb-4">
            <h3 className="font-medium text-gray-900 mb-3">
              {editingObId ? t('obligation.edit', locale) : t('obligation.add', locale)}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select label={t('obligation.type', locale)} value={obForm.obligation_type} onChange={(e) => setObForm((p) => ({ ...p, obligation_type: e.target.value }))}>
                {OB_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.key, locale)}</option>)}
              </Select>
              {obForm.obligation_type === 'custom' && (
                <Input label={t('obligation.custom_name', locale)} value={obForm.custom_type_name} onChange={(e) => setObForm((p) => ({ ...p, custom_type_name: e.target.value }))} />
              )}
              <Input label={t('obligation.start_date', locale)} type="date" value={obForm.start_date} onChange={(e) => setObForm((p) => ({ ...p, start_date: e.target.value }))} required />
              <Input label={t('obligation.end_date', locale)} type="date" value={obForm.end_date} onChange={(e) => setObForm((p) => ({ ...p, end_date: e.target.value }))} required />
              <Input label={t('obligation.cost', locale)} type="number" value={obForm.cost} onChange={(e) => setObForm((p) => ({ ...p, cost: e.target.value }))} placeholder="BGN" />
              <Input label={t('obligation.provider', locale)} value={obForm.provider} onChange={(e) => setObForm((p) => ({ ...p, provider: e.target.value }))} placeholder="DZI, Bulstrad..." />
              <Input label={t('obligation.policy_no', locale)} value={obForm.policy_number} onChange={(e) => setObForm((p) => ({ ...p, policy_number: e.target.value }))} />
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={editingObId ? handleSaveOb : handleAddObligation}>
                {t('common.save', locale)}
              </Button>
              <Button size="sm" variant="secondary" onClick={cancelEdit}>
                {t('common.cancel', locale)}
              </Button>
            </div>
          </Card>
        )}

        {/* Obligations Table */}
        {obligations.length === 0 && !showAddOb ? (
          <Card>
            <div className="text-center text-gray-500 py-6">{t('obligation.no_obligations', locale)}</div>
          </Card>
        ) : obligations.length > 0 && (
          <Card padding={false}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-700">{t('obligation.type', locale)}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700 hidden md:table-cell">{t('obligation.end_date', locale)}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700 hidden md:table-cell">{t('obligation.provider', locale)}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700 hidden md:table-cell">{t('obligation.cost', locale)}</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-700">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">{t('obligation.files', locale)}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {obligations.map((ob) => (
                  <tr key={ob.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{ob.display_name}</div>
                      <div className="text-xs text-gray-500 md:hidden">
                        {ob.end_date || '—'} {ob.cost ? `· ${ob.cost} ${ob.currency}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{ob.end_date || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{ob.provider || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{ob.cost ? `${ob.cost} ${ob.currency}` : '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge color={STATUS_BADGE[ob.status] || 'gray'}>
                        {t(`obligation.status_${ob.status}`, locale)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* Files inline */}
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {ob.files && ob.files.map((f) => (
                          <span key={f.id} className="inline-flex items-center gap-1 bg-gray-100 rounded px-1.5 py-0.5 text-xs">
                            <a href={f.file} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{f.label || 'File'}</a>
                            <button onClick={() => handleFileDelete(f.id)} className="text-red-400 hover:text-red-600">&times;</button>
                          </span>
                        ))}
                        <label className="text-indigo-600 hover:text-indigo-800 cursor-pointer text-xs">
                          +
                          <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(ob.id, e.target.files[0]); }} />
                        </label>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => startEditOb(ob)}>
                          {t('vehicles.edit', locale)}
                        </Button>
                        {ob.end_date && ob.is_current && (
                          <Button variant="secondary" size="sm" onClick={() => handleRenew(ob)}>
                            {t('obligation.renew', locale)}
                          </Button>
                        )}
                        <Button variant="danger" size="sm" onClick={() => handleDeleteOb(ob.id)}>
                          {t('common.delete', locale)}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </PageContent>
    </PageShell>
  );
}

function InfoField({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div>
      <span className="text-gray-500 text-xs">{label}</span>
      <div className={`font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  );
}
