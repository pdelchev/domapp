'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { getProperty, updateProperty, getOwners, getProperties, getLeases, getDocuments, uploadDocument, deleteDocument, getSmartFolders, getProblems, getUnits, createUnit, updateUnit, deleteUnit } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Input, Select, Textarea, FormSection, Spinner, Alert } from '../../components/ui';

interface PropertyData {
  id: number;
  owner: number;
  name: string;
  owner_name: string;
  address: string;
  city: string;
  country: string;
  property_type: string;
  cadastral_number: string | null;
  square_meters: number | null;
  purchase_price: number | null;
  purchase_date: string | null;
  current_value: number | null;
  price_per_sqm: number | null;
  mortgage_provider: string | null;
  mortgage_account_number: string | null;
  mortgage_monthly_payment: number | null;
  electricity_provider: string | null;
  electricity_account_number: string | null;
  water_provider: string | null;
  water_account_number: string | null;
  gas_provider: string | null;
  gas_account_number: string | null;
  heating_provider: string | null;
  heating_account_number: string | null;
  internet_provider: string | null;
  internet_account_number: string | null;
  insurance_provider: string | null;
  insurance_policy_number: string | null;
  annual_insurance_cost: number | null;
  building_management_provider: string | null;
  building_management_account_number: string | null;
  building_management_monthly_fee: number | null;
  security_provider: string | null;
  security_account_number: string | null;
  front_door_code: string | null;
  lock_box_code: string | null;
  notes: string | null;
  parent_property: number | null;
  parent_property_name: string | null;
  linked_properties: { id: number; name: string; property_type: string; cadastral_number: string | null; square_meters: number | null }[];
}

interface OwnerItem { id: number; full_name: string; }

interface Lease {
  id: number;
  tenant_name: string;
  unit_name: string | null;
  start_date: string;
  end_date: string;
  monthly_rent: string;
  rent_frequency: string;
  status: string;
}

interface DocRecord {
  id: number;
  file: string;
  file_name: string | null;
  document_type: string;
  label: string;
  expiry_date: string | null;
  expiry_status: 'expired' | 'expiring_soon' | 'valid' | null;
  notes: string | null;
  file_size: number;
  uploaded_at: string;
  replaces: number | null;
}

interface SmartFolder {
  type: string;
  label: string;
  count: number;
  expiry_warnings: number;
}

interface ProblemRecord {
  id: number;
  title: string;
  category: string;
  priority: string;
  status: string;
  assigned_to: string;
  created_at: string;
}

interface UnitRecord {
  id: number;
  property: number;
  unit_number: string;
  floor: number | null;
  square_meters: number | null;
  notes: string | null;
}

const TYPE_BADGE: Record<string, 'blue' | 'green' | 'yellow' | 'purple' | 'gray' | 'indigo'> = {
  apartment: 'blue',
  house: 'green',
  studio: 'yellow',
  commercial: 'purple',
  parking: 'gray',
  garage: 'gray',
  storage: 'indigo',
};

const ALL_DOC_TYPES = [
  'insurance', 'mortgage', 'lease', 'deed', 'tax',
  'utility_electricity', 'utility_water', 'utility_gas', 'utility_heating', 'utility_internet',
  'building_mgmt', 'security', 'notary', 'valuation', 'inspection',
  'maintenance', 'receipt', 'photo', 'other',
] as const;

// --- Read-only field display helpers ---
function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <dt className="text-[13px] font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}

function CurrencyField({ label, value }: { label: string; value: number | null | undefined }) {
  if (value == null) return null;
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(value);
  return (
    <div>
      <dt className="text-[13px] font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{formatted}</dd>
    </div>
  );
}

// Pencil icon button for section headers
function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
      title="Edit"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    </button>
  );
}

// Save / Cancel row at bottom of an editing section
function EditActions({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) {
  return (
    <div className="flex gap-2 pt-2 border-t border-gray-100 mt-2">
      <Button size="sm" onClick={onSave} disabled={saving}>
        {saving ? '...' : 'Save'}
      </Button>
      <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
    </div>
  );
}

// --- Helpers to convert prop data to/from edit form strings ---
function val(v: string | number | null | undefined): string {
  if (v == null) return '';
  return String(v);
}

export default function PropertyViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { locale } = useLanguage();
  const [prop, setProp] = useState<PropertyData | null>(null);
  const [owners, setOwners] = useState<OwnerItem[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [smartFolders, setSmartFolders] = useState<SmartFolder[]>([]);
  const [problems, setProblems] = useState<ProblemRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [unitForm, setUnitForm] = useState({ unit_number: '', floor: '', square_meters: '', notes: '' });
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [unitSaving, setUnitSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    basic: true, land: true,
  });
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [uploadFolder, setUploadFolder] = useState<string | null>(null);
  const [uploadForm, setUploadForm] = useState<{ expiry_date: string; notes: string; label?: string; replaces?: number }>({ expiry_date: '', notes: '' });
  const [uploading, setUploading] = useState(false);
  const [docError, setDocError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [allProperties, setAllProperties] = useState<{ id: number; name: string; property_type: string }[]>([]);

  // Inline editing state
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    Promise.all([
      getProperty(Number(id)),
      getOwners(),
      getProperties(),
      getLeases(Number(id)),
      getDocuments(Number(id)),
      getSmartFolders(Number(id)),
      getProblems(Number(id)),
      getUnits(Number(id)),
    ])
      .then(([propData, ownersData, propsData, leasesData, docsData, foldersData, problemsData, unitsData]) => {
        setProp(propData);
        setOwners(ownersData);
        setAllProperties(propsData);
        setLeases(leasesData);
        setDocs(docsData);
        setSmartFolders(foldersData);
        setProblems(problemsData);
        setUnits(unitsData);
      })
      .catch(() => router.push('/properties'))
      .finally(() => setLoading(false));
  }, [id, router]);

  const toggle = (section: string) =>
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));

  const toggleFolder = (type: string) =>
    setOpenFolders((prev) => ({ ...prev, [type]: !prev[type] }));

  const fmt = (v: string | number) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { style: 'currency', currency: 'EUR' }).format(Number(v));

  const leaseStatusColor = (s: string) => {
    if (s === 'active') return 'green' as const;
    if (s === 'terminated') return 'red' as const;
    return 'yellow' as const;
  };

  // --- Section editing logic ---
  // Maps section name to the property fields it contains
  const SECTION_FIELDS: Record<string, string[]> = {
    basic: ['name', 'owner', 'address', 'city', 'country', 'property_type', 'parent_property'],
    land: ['cadastral_number', 'square_meters', 'purchase_price', 'purchase_date', 'current_value'],
    mortgage: ['mortgage_provider', 'mortgage_account_number', 'mortgage_monthly_payment'],
    utilities: [
      'electricity_provider', 'electricity_account_number',
      'water_provider', 'water_account_number',
      'gas_provider', 'gas_account_number',
      'heating_provider', 'heating_account_number',
      'internet_provider', 'internet_account_number',
    ],
    insurance: ['insurance_provider', 'insurance_policy_number', 'annual_insurance_cost'],
    building: ['building_management_provider', 'building_management_account_number', 'building_management_monthly_fee'],
    security: ['security_provider', 'security_account_number'],
    access: ['front_door_code', 'lock_box_code'],
    notes: ['notes'],
  };

  const startEditing = (section: string) => {
    if (!prop) return;
    const fields = SECTION_FIELDS[section] || [];
    const formData: Record<string, string> = {};
    for (const f of fields) {
      formData[f] = val((prop as unknown as Record<string, unknown>)[f] as string | number | null);
    }
    setEditForm(formData);
    setEditingSection(section);
    setSaveMsg('');
    // Ensure the section is open
    setOpenSections((prev) => ({ ...prev, [section]: true }));
  };

  const cancelEditing = () => {
    setEditingSection(null);
    setEditForm({});
    setSaveMsg('');
  };

  const saveSection = async () => {
    if (!prop) return;
    setSaving(true);
    setSaveMsg('');
    try {
      // Build payload — send ALL property fields (PUT requires full object)
      const payload: Record<string, unknown> = {};
      const allFields = Object.keys(SECTION_FIELDS).flatMap((s) => SECTION_FIELDS[s]);
      for (const key of allFields) {
        const current = (prop as unknown as Record<string, unknown>)[key];
        payload[key] = current === null ? null : current;
      }
      // Override with edited fields
      for (const [key, value] of Object.entries(editForm)) {
        payload[key] = value === '' ? null : value;
      }
      const updated = await updateProperty(Number(id), payload);
      setProp(updated);
      setEditingSection(null);
      setEditForm({});
      setSaveMsg(t('common.saved', locale));
      setTimeout(() => setSaveMsg(''), 2000);
    } catch {
      setSaveMsg(t('common.error', locale));
    } finally {
      setSaving(false);
    }
  };

  const ef = (field: string) => editForm[field] ?? '';
  const setEf = (field: string, value: string) =>
    setEditForm((prev) => ({ ...prev, [field]: value }));

  // --- Document logic (unchanged) ---
  // --- Unit management ---
  const resetUnitForm = () => {
    setUnitForm({ unit_number: '', floor: '', square_meters: '', notes: '' });
    setEditingUnitId(null);
    setShowAddUnit(false);
  };

  const startEditUnit = (u: UnitRecord) => {
    setUnitForm({
      unit_number: u.unit_number,
      floor: u.floor != null ? String(u.floor) : '',
      square_meters: u.square_meters != null ? String(u.square_meters) : '',
      notes: u.notes || '',
    });
    setEditingUnitId(u.id);
    setShowAddUnit(false);
  };

  const handleSaveUnit = async () => {
    setUnitSaving(true);
    try {
      const payload = {
        property: Number(id),
        unit_number: unitForm.unit_number,
        floor: unitForm.floor ? Number(unitForm.floor) : null,
        square_meters: unitForm.square_meters ? Number(unitForm.square_meters) : null,
        notes: unitForm.notes || null,
      };
      if (editingUnitId) {
        const updated = await updateUnit(editingUnitId, payload);
        setUnits((prev) => prev.map((u) => u.id === editingUnitId ? updated : u));
      } else {
        const created = await createUnit(payload);
        setUnits((prev) => [...prev, created]);
      }
      resetUnitForm();
    } catch {
      // silently fail
    } finally {
      setUnitSaving(false);
    }
  };

  const handleDeleteUnit = async (unitId: number) => {
    if (!confirm(t('units.delete_confirm', locale))) return;
    try {
      await deleteUnit(unitId);
      setUnits((prev) => prev.filter((u) => u.id !== unitId));
    } catch {
      // silently fail
    }
  };

  const docsByType = ALL_DOC_TYPES.reduce((acc, type) => {
    acc[type] = docs.filter((d) => d.document_type === type);
    return acc;
  }, {} as Record<string, DocRecord[]>);

  const folderTypes = smartFolders.length > 0
    ? smartFolders.map((f) => f.type)
    : ALL_DOC_TYPES.filter((t2) => (docsByType[t2]?.length ?? 0) > 0);

  const expiryColor = (status: string | null) => {
    if (status === 'expired') return 'red' as const;
    if (status === 'expiring_soon') return 'yellow' as const;
    if (status === 'valid') return 'green' as const;
    return 'gray' as const;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleUpload = async (type: string) => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setDocError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('property', id);
      formData.append('document_type', type);
      if (uploadForm.expiry_date) formData.append('expiry_date', uploadForm.expiry_date);
      if (uploadForm.notes) formData.append('notes', uploadForm.notes);
      if (uploadForm.label) formData.append('label', uploadForm.label);
      if (uploadForm.replaces) formData.append('replaces', String(uploadForm.replaces));
      const newDoc = await uploadDocument(formData);
      setDocs((prev) => [...prev, newDoc]);
      setUploadFolder(null);
      setUploadForm({ expiry_date: '', notes: '', label: '', replaces: undefined });
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      setDocError(t('common.error', locale));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (docId: number) => {
    if (!confirm(t('docs.delete_confirm', locale))) return;
    try {
      await deleteDocument(docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      setDocError(t('common.error', locale));
    }
  };

  const fileName = (url: string) => {
    const parts = url.split('/');
    return decodeURIComponent(parts[parts.length - 1]);
  };

  if (loading || !prop) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  const isEditing = (section: string) => editingSection === section;

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={prop.name}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/properties')}
        />

        {saveMsg && (
          <Alert type={saveMsg === t('common.saved', locale) ? 'success' : 'error'} message={saveMsg} />
        )}

        {/* ====== Basic Info ====== */}
        <FormSection
          title={t('properties.section.basic', locale)}
          icon="🏢"
          open={!!openSections.basic}
          onToggle={() => toggle('basic')}
          action={!isEditing('basic') ? <EditButton onClick={() => startEditing('basic')} /> : undefined}
        >
          {isEditing('basic') ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label={t('properties.name', locale)} value={ef('name')} onChange={(e) => setEf('name', e.target.value)} required />
                <Select label={t('properties.owner', locale)} value={ef('owner')} onChange={(e) => setEf('owner', e.target.value)} required>
                  <option value="">{t('common.select', locale)}</option>
                  {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                </Select>
              </div>
              <Input label={t('properties.address', locale)} value={ef('address')} onChange={(e) => setEf('address', e.target.value)} required />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label={t('properties.city', locale)} value={ef('city')} onChange={(e) => setEf('city', e.target.value)} required />
                <Input label={t('properties.country', locale)} value={ef('country')} onChange={(e) => setEf('country', e.target.value)} />
                <Select label={t('properties.type', locale)} value={ef('property_type')} onChange={(e) => setEf('property_type', e.target.value)}>
                  <option value="apartment">{t('type.apartment', locale)}</option>
                  <option value="house">{t('type.house', locale)}</option>
                  <option value="studio">{t('type.studio', locale)}</option>
                  <option value="commercial">{t('type.commercial', locale)}</option>
                  <option value="parking">{t('type.parking', locale)}</option>
                  <option value="garage">{t('type.garage', locale)}</option>
                  <option value="storage">{t('type.storage', locale)}</option>
                </Select>
              </div>
              {['parking', 'garage', 'storage'].includes(ef('property_type')) && (
                <Select
                  label={t('properties.parent_property', locale)}
                  value={ef('parent_property')}
                  onChange={(e) => setEf('parent_property', e.target.value)}
                >
                  <option value="">{t('properties.no_parent', locale)}</option>
                  {allProperties
                    .filter((p) => !['parking', 'garage', 'storage'].includes(p.property_type) && p.id !== Number(id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </Select>
              )}
              <EditActions onSave={saveSection} onCancel={cancelEditing} saving={saving} />
            </div>
          ) : (
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Field label={t('properties.name', locale)} value={prop.name} />
              <Field label={t('properties.owner', locale)} value={prop.owner_name} />
              <Field label={t('properties.address', locale)} value={prop.address} />
              <Field label={t('properties.city', locale)} value={prop.city} />
              <Field label={t('properties.country', locale)} value={prop.country} />
              <div>
                <dt className="text-[13px] font-medium text-gray-500">{t('properties.type', locale)}</dt>
                <dd className="mt-0.5">
                  <Badge color={TYPE_BADGE[prop.property_type] || 'gray'}>
                    {t(`type.${prop.property_type}`, locale)}
                  </Badge>
                </dd>
              </div>
            </dl>
          )}
        </FormSection>

        {/* ====== Land & Acquisition ====== */}
        <FormSection
          title={t('properties.section.land', locale)}
          icon="📐"
          open={!!openSections.land}
          onToggle={() => toggle('land')}
          action={!isEditing('land') ? <EditButton onClick={() => startEditing('land')} /> : undefined}
        >
          {isEditing('land') ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label={t('properties.cadastral', locale)} value={ef('cadastral_number')} onChange={(e) => setEf('cadastral_number', e.target.value)} />
                <Input label={t('properties.sqm', locale)} type="number" value={ef('square_meters')} onChange={(e) => setEf('square_meters', e.target.value)} />
                <Input label={t('properties.purchase_price', locale)} type="number" value={ef('purchase_price')} onChange={(e) => setEf('purchase_price', e.target.value)} />
                <Input label={t('properties.purchase_date', locale)} type="date" value={ef('purchase_date')} onChange={(e) => setEf('purchase_date', e.target.value)} />
                <Input label={t('properties.current_value', locale)} type="number" value={ef('current_value')} onChange={(e) => setEf('current_value', e.target.value)} />
              </div>
              <EditActions onSave={saveSection} onCancel={cancelEditing} saving={saving} />
            </div>
          ) : (
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Field label={t('properties.cadastral', locale)} value={prop.cadastral_number} />
              <Field label={t('properties.sqm', locale)} value={prop.square_meters} />
              <CurrencyField label={t('properties.purchase_price', locale)} value={prop.purchase_price} />
              <Field label={t('properties.purchase_date', locale)} value={prop.purchase_date} />
              <CurrencyField label={t('properties.current_value', locale)} value={prop.current_value} />
              <CurrencyField label={t('properties.price_per_sqm', locale)} value={prop.price_per_sqm} />
            </dl>
          )}
        </FormSection>

        {/* ====== Mortgage ====== */}
        <FormSection
          title={t('properties.section.mortgage', locale)}
          icon="🏦"
          open={!!openSections.mortgage}
          onToggle={() => toggle('mortgage')}
          action={!isEditing('mortgage') ? <EditButton onClick={() => startEditing('mortgage')} /> : undefined}
        >
          {isEditing('mortgage') ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label={t('properties.mortgage_provider', locale)} value={ef('mortgage_provider')} onChange={(e) => setEf('mortgage_provider', e.target.value)} />
                <Input label={t('properties.mortgage_account', locale)} value={ef('mortgage_account_number')} onChange={(e) => setEf('mortgage_account_number', e.target.value)} />
                <Input label={t('properties.mortgage_payment', locale)} type="number" value={ef('mortgage_monthly_payment')} onChange={(e) => setEf('mortgage_monthly_payment', e.target.value)} />
              </div>
              <EditActions onSave={saveSection} onCancel={cancelEditing} saving={saving} />
            </div>
          ) : (
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Field label={t('properties.mortgage_provider', locale)} value={prop.mortgage_provider} />
              <Field label={t('properties.mortgage_account', locale)} value={prop.mortgage_account_number} />
              <CurrencyField label={t('properties.mortgage_payment', locale)} value={prop.mortgage_monthly_payment} />
            </dl>
          )}
        </FormSection>

        {/* ====== Utilities ====== */}
        <FormSection
          title={t('properties.section.utilities', locale)}
          icon="⚡"
          open={!!openSections.utilities}
          onToggle={() => toggle('utilities')}
          action={!isEditing('utilities') ? <EditButton onClick={() => startEditing('utilities')} /> : undefined}
        >
          {isEditing('utilities') ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label={t('properties.electricity_provider', locale)} value={ef('electricity_provider')} onChange={(e) => setEf('electricity_provider', e.target.value)} />
                <Input label={t('properties.electricity_account', locale)} value={ef('electricity_account_number')} onChange={(e) => setEf('electricity_account_number', e.target.value)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label={t('properties.water_provider', locale)} value={ef('water_provider')} onChange={(e) => setEf('water_provider', e.target.value)} />
                <Input label={t('properties.water_account', locale)} value={ef('water_account_number')} onChange={(e) => setEf('water_account_number', e.target.value)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label={t('properties.gas_provider', locale)} value={ef('gas_provider')} onChange={(e) => setEf('gas_provider', e.target.value)} />
                <Input label={t('properties.gas_account', locale)} value={ef('gas_account_number')} onChange={(e) => setEf('gas_account_number', e.target.value)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label={t('properties.heating_provider', locale)} value={ef('heating_provider')} onChange={(e) => setEf('heating_provider', e.target.value)} />
                <Input label={t('properties.heating_account', locale)} value={ef('heating_account_number')} onChange={(e) => setEf('heating_account_number', e.target.value)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label={t('properties.internet_provider', locale)} value={ef('internet_provider')} onChange={(e) => setEf('internet_provider', e.target.value)} />
                <Input label={t('properties.internet_account', locale)} value={ef('internet_account_number')} onChange={(e) => setEf('internet_account_number', e.target.value)} />
              </div>
              <EditActions onSave={saveSection} onCancel={cancelEditing} saving={saving} />
            </div>
          ) : (
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Field label={t('properties.electricity_provider', locale)} value={prop.electricity_provider} />
              <Field label={t('properties.electricity_account', locale)} value={prop.electricity_account_number} />
              <Field label={t('properties.water_provider', locale)} value={prop.water_provider} />
              <Field label={t('properties.water_account', locale)} value={prop.water_account_number} />
              <Field label={t('properties.gas_provider', locale)} value={prop.gas_provider} />
              <Field label={t('properties.gas_account', locale)} value={prop.gas_account_number} />
              <Field label={t('properties.heating_provider', locale)} value={prop.heating_provider} />
              <Field label={t('properties.heating_account', locale)} value={prop.heating_account_number} />
              <Field label={t('properties.internet_provider', locale)} value={prop.internet_provider} />
              <Field label={t('properties.internet_account', locale)} value={prop.internet_account_number} />
            </dl>
          )}
        </FormSection>

        {/* ====== Insurance ====== */}
        <FormSection
          title={t('properties.section.insurance', locale)}
          icon="🛡️"
          open={!!openSections.insurance}
          onToggle={() => toggle('insurance')}
          action={!isEditing('insurance') ? <EditButton onClick={() => startEditing('insurance')} /> : undefined}
        >
          {isEditing('insurance') ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label={t('properties.insurance_provider', locale)} value={ef('insurance_provider')} onChange={(e) => setEf('insurance_provider', e.target.value)} />
                <Input label={t('properties.insurance_policy', locale)} value={ef('insurance_policy_number')} onChange={(e) => setEf('insurance_policy_number', e.target.value)} />
                <Input label={t('properties.insurance_cost', locale)} type="number" value={ef('annual_insurance_cost')} onChange={(e) => setEf('annual_insurance_cost', e.target.value)} />
              </div>
              <EditActions onSave={saveSection} onCancel={cancelEditing} saving={saving} />
            </div>
          ) : (
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Field label={t('properties.insurance_provider', locale)} value={prop.insurance_provider} />
              <Field label={t('properties.insurance_policy', locale)} value={prop.insurance_policy_number} />
              <CurrencyField label={t('properties.insurance_cost', locale)} value={prop.annual_insurance_cost} />
            </dl>
          )}
        </FormSection>

        {/* ====== Building Management ====== */}
        <FormSection
          title={t('properties.section.building', locale)}
          icon="🏗️"
          open={!!openSections.building}
          onToggle={() => toggle('building')}
          action={!isEditing('building') ? <EditButton onClick={() => startEditing('building')} /> : undefined}
        >
          {isEditing('building') ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label={t('properties.building_provider', locale)} value={ef('building_management_provider')} onChange={(e) => setEf('building_management_provider', e.target.value)} />
                <Input label={t('properties.building_account', locale)} value={ef('building_management_account_number')} onChange={(e) => setEf('building_management_account_number', e.target.value)} />
                <Input label={t('properties.building_fee', locale)} type="number" value={ef('building_management_monthly_fee')} onChange={(e) => setEf('building_management_monthly_fee', e.target.value)} />
              </div>
              <EditActions onSave={saveSection} onCancel={cancelEditing} saving={saving} />
            </div>
          ) : (
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Field label={t('properties.building_provider', locale)} value={prop.building_management_provider} />
              <Field label={t('properties.building_account', locale)} value={prop.building_management_account_number} />
              <CurrencyField label={t('properties.building_fee', locale)} value={prop.building_management_monthly_fee} />
            </dl>
          )}
        </FormSection>

        {/* ====== Security ====== */}
        <FormSection
          title={t('properties.section.security', locale)}
          icon="🔒"
          open={!!openSections.security}
          onToggle={() => toggle('security')}
          action={!isEditing('security') ? <EditButton onClick={() => startEditing('security')} /> : undefined}
        >
          {isEditing('security') ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label={t('properties.security_provider', locale)} value={ef('security_provider')} onChange={(e) => setEf('security_provider', e.target.value)} />
                <Input label={t('properties.security_account', locale)} value={ef('security_account_number')} onChange={(e) => setEf('security_account_number', e.target.value)} />
              </div>
              <EditActions onSave={saveSection} onCancel={cancelEditing} saving={saving} />
            </div>
          ) : (
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Field label={t('properties.security_provider', locale)} value={prop.security_provider} />
              <Field label={t('properties.security_account', locale)} value={prop.security_account_number} />
            </dl>
          )}
        </FormSection>

        {/* ====== Access Codes ====== */}
        <FormSection
          title={t('properties.section.access', locale)}
          icon="🔑"
          open={!!openSections.access}
          onToggle={() => toggle('access')}
          action={!isEditing('access') ? <EditButton onClick={() => startEditing('access')} /> : undefined}
        >
          {isEditing('access') ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label={t('properties.front_door_code', locale)} value={ef('front_door_code')} onChange={(e) => setEf('front_door_code', e.target.value)} />
                <Input label={t('properties.lock_box_code', locale)} value={ef('lock_box_code')} onChange={(e) => setEf('lock_box_code', e.target.value)} />
              </div>
              <EditActions onSave={saveSection} onCancel={cancelEditing} saving={saving} />
            </div>
          ) : (
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Field label={t('properties.front_door_code', locale)} value={prop.front_door_code} />
              <Field label={t('properties.lock_box_code', locale)} value={prop.lock_box_code} />
            </dl>
          )}
        </FormSection>

        {/* ====== Notes ====== */}
        <FormSection
          title={t('properties.section.notes', locale)}
          icon="📝"
          open={!!openSections.notes}
          onToggle={() => toggle('notes')}
          action={!isEditing('notes') ? <EditButton onClick={() => startEditing('notes')} /> : undefined}
        >
          {isEditing('notes') ? (
            <div className="space-y-4">
              <Textarea value={ef('notes')} onChange={(e) => setEf('notes', e.target.value)} rows={4} />
              <EditActions onSave={saveSection} onCancel={cancelEditing} saving={saving} />
            </div>
          ) : (
            prop.notes ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{prop.notes}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">{t('common.no_data', locale)}</p>
            )
          )}
        </FormSection>

        {/* ====== Units ====== */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">{t('units.title', locale)}</h2>
            <Button variant="secondary" size="sm" onClick={() => { resetUnitForm(); setShowAddUnit(true); }}>
              + {t('units.add', locale)}
            </Button>
          </div>

          {(showAddUnit || editingUnitId) && (
            <Card className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                {editingUnitId ? t('units.edit', locale) : t('units.add', locale)}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input
                  label={t('units.unit_number', locale)}
                  value={unitForm.unit_number}
                  onChange={(e) => setUnitForm((prev) => ({ ...prev, unit_number: e.target.value }))}
                  required
                />
                <Input
                  label={t('units.floor', locale)}
                  type="number"
                  value={unitForm.floor}
                  onChange={(e) => setUnitForm((prev) => ({ ...prev, floor: e.target.value }))}
                />
                <Input
                  label={t('units.sqm', locale)}
                  type="number"
                  value={unitForm.square_meters}
                  onChange={(e) => setUnitForm((prev) => ({ ...prev, square_meters: e.target.value }))}
                />
                <Input
                  label={t('units.notes', locale)}
                  value={unitForm.notes}
                  onChange={(e) => setUnitForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={handleSaveUnit} disabled={unitSaving || !unitForm.unit_number}>
                  {unitSaving ? '...' : t('common.save', locale)}
                </Button>
                <Button size="sm" variant="secondary" onClick={resetUnitForm}>
                  {t('common.cancel', locale)}
                </Button>
              </div>
            </Card>
          )}

          {units.length === 0 && !showAddUnit ? (
            <Card className="py-6 text-center">
              <p className="text-sm text-gray-500">{t('units.no_units', locale)}</p>
            </Card>
          ) : units.length > 0 && (
            <Card padding={false}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('units.unit_number', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('units.floor', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('units.sqm', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('units.notes', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('common.actions', locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {units.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{u.unit_number}</td>
                      <td className="px-5 py-3 text-sm text-gray-500">{u.floor ?? '—'}</td>
                      <td className="px-5 py-3 text-sm text-gray-500">{u.square_meters ?? '—'}</td>
                      <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">{u.notes || '—'}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => startEditUnit(u)}>
                            {t('common.edit', locale)}
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => handleDeleteUnit(u.id)}>
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
        </div>

        {/* ====== Parent link ====== */}
        {prop.parent_property_name && (
          <div className="mt-6">
            <p className="text-sm text-gray-500">
              {t('properties.linked_to', locale)}:{' '}
              <button
                onClick={() => router.push(`/properties/${prop.parent_property}`)}
                className="text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {prop.parent_property_name}
              </button>
            </p>
          </div>
        )}

        {/* ====== Linked Properties ====== */}
        {prop.linked_properties && prop.linked_properties.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('properties.linked_properties', locale)}</h2>
            <Card padding={false}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('properties.name', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('properties.type', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('properties.cadastral', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right hidden md:table-cell">{t('properties.sqm', locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {prop.linked_properties.map((lp) => (
                    <tr
                      key={lp.id}
                      onClick={() => router.push(`/properties/${lp.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{lp.name}</td>
                      <td className="px-5 py-3">
                        <Badge color={TYPE_BADGE[lp.property_type] || 'gray'}>
                          {t(`type.${lp.property_type}`, locale)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">{lp.cadastral_number || '—'}</td>
                      <td className="px-5 py-3 text-sm text-gray-500 text-right hidden md:table-cell">{lp.square_meters || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {/* ====== Leases ====== */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">{t('properties.leases', locale)}</h2>
            <Button variant="secondary" size="sm" onClick={() => router.push('/leases/new')}>
              + {t('leases.add', locale)}
            </Button>
          </div>
          {leases.length === 0 ? (
            <Card className="py-8 text-center">
              <p className="text-sm text-gray-500">{t('common.no_data', locale)}</p>
            </Card>
          ) : (
            <Card padding={false}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('leases.tenant', locale)}</th>
                    {units.length > 0 && (
                      <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('leases.unit', locale)}</th>
                    )}
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('leases.rent_amount', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('leases.rent_frequency', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('leases.end_date', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('leases.status', locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leases.map((lease) => (
                    <tr
                      key={lease.id}
                      onClick={() => router.push(`/leases/${lease.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3 text-sm text-gray-900">{lease.tenant_name}</td>
                      {units.length > 0 && (
                        <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">{lease.unit_name || '—'}</td>
                      )}
                      <td className="px-5 py-3 text-sm text-gray-900 font-medium">{fmt(lease.monthly_rent)}</td>
                      <td className="px-5 py-3 hidden md:table-cell">
                        <Badge color="indigo">{t(`freq.${lease.rent_frequency}`, locale)}</Badge>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">{lease.end_date}</td>
                      <td className="px-5 py-3">
                        <Badge color={leaseStatusColor(lease.status)}>
                          {t(`leases.${lease.status}`, locale)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {/* ====== Problems ====== */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">{t('problems.title', locale)}</h2>
            <Button variant="secondary" size="sm" onClick={() => router.push('/problems/new')}>
              + {t('problems.add', locale)}
            </Button>
          </div>
          {problems.length === 0 ? (
            <Card className="py-8 text-center">
              <p className="text-sm text-gray-500">{t('problems.no_problems', locale)}</p>
            </Card>
          ) : (
            <Card padding={false}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('problems.problem_title', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('problems.category', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('problems.priority', locale)}</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('problems.status', locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {problems.map((problem) => (
                    <tr
                      key={problem.id}
                      onClick={() => router.push(`/problems/${problem.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3 text-sm text-gray-900">{problem.title}</td>
                      <td className="px-5 py-3 hidden md:table-cell">
                        <Badge color="gray">{t(`problems.${problem.category === 'security' ? 'security_cat' : problem.category === 'tenant' ? 'tenant_issue' : problem.category}`, locale)}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge color={problem.priority === 'emergency' ? 'red' : problem.priority === 'high' ? 'yellow' : problem.priority === 'medium' ? 'blue' : 'gray'}>
                          {t(`problems.${problem.priority}`, locale)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge color={problem.status === 'open' ? 'red' : problem.status === 'in_progress' ? 'yellow' : problem.status === 'resolved' ? 'green' : 'gray'}>
                          {t(`problems.${problem.status}`, locale)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {/* ====== Documents — Smart Folder View ====== */}
        <div className="mt-8 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">{t('docs.title', locale)}</h2>
            {docs.length > 0 && (
              <span className="text-xs text-gray-400">{docs.length} {t('docs.file', locale).toLowerCase()}s</span>
            )}
          </div>
          <Alert type="error" message={docError} />

          {docs.length === 0 && uploadFolder === null ? (
            <Card className="py-8 text-center">
              <p className="text-sm text-gray-500 mb-3">{t('docs.no_docs', locale)}</p>
              <Button variant="secondary" size="sm" onClick={() => setUploadFolder('lease')}>
                + {t('docs.upload', locale)}
              </Button>
            </Card>
          ) : (
            <div className="space-y-2">
              {[...folderTypes, ...ALL_DOC_TYPES.filter((t2) => !folderTypes.includes(t2) && (docsByType[t2]?.length > 0 || uploadFolder === t2))].map((type) => {
                const typeDocs = docsByType[type] || [];
                const isOpen = !!openFolders[type];
                const count = typeDocs.length;
                const folder = smartFolders.find((f) => f.type === type);
                const hasWarnings = folder ? folder.expiry_warnings > 0 : typeDocs.some((d) => d.expiry_status === 'expired' || d.expiry_status === 'expiring_soon');

                if (count === 0 && uploadFolder !== type && !folderTypes.includes(type)) return null;

                return (
                  <Card key={type}>
                    <button
                      type="button"
                      onClick={() => toggleFolder(type)}
                      className="w-full flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{isOpen ? '📂' : '📁'}</span>
                        <span className="text-sm font-medium text-gray-900">{t(`docs.${type}`, locale)}</span>
                        {count > 0 && <Badge color="gray">{count}</Badge>}
                        {hasWarnings && <Badge color="red">!</Badge>}
                      </div>
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>

                    {isOpen && (
                      <div className="mt-3 space-y-2">
                        {typeDocs.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <a
                                  href={doc.file}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700 truncate"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {doc.label || fileName(doc.file)}
                                </a>
                                {doc.expiry_status && (
                                  <Badge color={expiryColor(doc.expiry_status)}>
                                    {t(`docs.${doc.expiry_status}`, locale)}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-0.5">
                                {doc.expiry_date && (
                                  <span className={doc.expiry_status === 'expired' ? 'text-red-500' : doc.expiry_status === 'expiring_soon' ? 'text-amber-500' : ''}>
                                    {t('docs.expiry', locale)}: {doc.expiry_date}
                                  </span>
                                )}
                                {doc.file_size > 0 && <span>{formatSize(doc.file_size)}</span>}
                                {doc.notes && <span className="truncate max-w-[200px]">{doc.notes}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              {doc.expiry_date && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setUploadFolder(type);
                                    setUploadForm((prev) => ({ ...prev, replaces: doc.id }));
                                    setOpenFolders((prev) => ({ ...prev, [type]: true }));
                                  }}
                                  title={t('docs.renew', locale)}
                                >
                                  ↻
                                </Button>
                              )}
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeleteDoc(doc.id)}
                              >
                                {t('common.delete', locale)}
                              </Button>
                            </div>
                          </div>
                        ))}

                        {uploadFolder === type ? (
                          <div className="pt-2 border-t border-gray-200 space-y-2">
                            <input ref={fileRef} type="file" className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100" />
                            <div className="flex flex-wrap items-end gap-2">
                              <Input
                                type="date"
                                label={t('docs.expiry', locale)}
                                value={uploadForm.expiry_date}
                                onChange={(e) => setUploadForm((prev) => ({ ...prev, expiry_date: e.target.value }))}
                                className="w-40"
                              />
                              <Input
                                label={t('docs.label', locale)}
                                value={uploadForm.label || ''}
                                onChange={(e) => setUploadForm((prev) => ({ ...prev, label: e.target.value }))}
                                className="w-40"
                                placeholder={t('docs.label', locale)}
                              />
                              <Input
                                label={t('docs.notes', locale)}
                                value={uploadForm.notes}
                                onChange={(e) => setUploadForm((prev) => ({ ...prev, notes: e.target.value }))}
                                className="w-40"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleUpload(type)} disabled={uploading}>
                                {uploading ? '...' : t('docs.upload', locale)}
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => { setUploadFolder(null); setUploadForm({ expiry_date: '', notes: '', label: '', replaces: undefined }); }}>
                                {t('common.cancel', locale)}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setUploadFolder(type); setUploadForm({ expiry_date: '', notes: '', label: '', replaces: undefined }); }}
                          >
                            + {t('docs.upload', locale)}
                          </Button>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}

              {/* Add to new type button */}
              <div className="flex gap-2 pt-1">
                <Select
                  value=""
                  onChange={(e) => {
                    const type = e.target.value;
                    if (type) {
                      setUploadFolder(type);
                      setOpenFolders((prev) => ({ ...prev, [type]: true }));
                    }
                  }}
                  className="w-auto"
                >
                  <option value="">+ {t('docs.upload', locale)}...</option>
                  {ALL_DOC_TYPES.map((type) => (
                    <option key={type} value={type}>{t(`docs.${type}`, locale)}</option>
                  ))}
                </Select>
              </div>
            </div>
          )}
        </div>
      </PageContent>
    </PageShell>
  );
}
