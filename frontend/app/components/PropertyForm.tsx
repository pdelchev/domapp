'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getOwners, getProperties, parseNotaryDeed } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import { Button, Input, Select, Textarea, Alert, FormSection, StickyActionBar } from './ui';

interface Owner {
  id: number;
  full_name: string;
}

interface PropertyOption {
  id: number;
  name: string;
  property_type: string;
}

interface PropertyFormData {
  owner: string;
  name: string;
  address: string;
  city: string;
  country: string;
  property_type: string;
  parent_property: string;
  notary_act_number: string;
  notary_act_date: string;
  seller_name: string;
  property_registry_number: string;
  cadastral_number: string;
  square_meters: string;
  purchase_price: string;
  purchase_date: string;
  current_value: string;
  mortgage_provider: string;
  mortgage_account_number: string;
  mortgage_monthly_payment: string;
  electricity_provider: string;
  electricity_account_number: string;
  water_provider: string;
  water_account_number: string;
  gas_provider: string;
  gas_account_number: string;
  heating_provider: string;
  heating_account_number: string;
  internet_provider: string;
  internet_account_number: string;
  insurance_provider: string;
  insurance_policy_number: string;
  annual_insurance_cost: string;
  building_management_provider: string;
  building_management_account_number: string;
  building_management_monthly_fee: string;
  security_provider: string;
  security_account_number: string;
  front_door_code: string;
  lock_box_code: string;
  notes: string;
}

const EMPTY_FORM: PropertyFormData = {
  owner: '',
  name: '',
  address: '',
  city: '',
  country: 'Bulgaria',
  property_type: 'apartment',
  parent_property: '',
  notary_act_number: '',
  notary_act_date: '',
  seller_name: '',
  property_registry_number: '',
  cadastral_number: '',
  square_meters: '',
  purchase_price: '',
  purchase_date: '',
  current_value: '',
  mortgage_provider: '',
  mortgage_account_number: '',
  mortgage_monthly_payment: '',
  electricity_provider: '',
  electricity_account_number: '',
  water_provider: '',
  water_account_number: '',
  gas_provider: '',
  gas_account_number: '',
  heating_provider: '',
  heating_account_number: '',
  internet_provider: '',
  internet_account_number: '',
  insurance_provider: '',
  insurance_policy_number: '',
  annual_insurance_cost: '',
  building_management_provider: '',
  building_management_account_number: '',
  building_management_monthly_fee: '',
  security_provider: '',
  security_account_number: '',
  front_door_code: '',
  lock_box_code: '',
  notes: '',
};

export { EMPTY_FORM };
export type { PropertyFormData };

export default function PropertyForm({
  initialData,
  onSubmit,
  saving,
  error,
  success,
}: {
  initialData?: PropertyFormData;
  onSubmit: (data: PropertyFormData) => void;
  saving: boolean;
  error: string;
  success: string;
}) {
  const router = useRouter();
  const { locale } = useLanguage();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [allProperties, setAllProperties] = useState<PropertyOption[]>([]);
  const [form, setForm] = useState<PropertyFormData>(initialData || EMPTY_FORM);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    basic: true,
    land: true,
  });
  const [deedParsing, setDeedParsing] = useState(false);
  const [deedSuccess, setDeedSuccess] = useState('');
  const [deedError, setDeedError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getOwners().then(setOwners).catch(() => {});
    getProperties().then(setAllProperties).catch(() => {});
  }, []);

  useEffect(() => {
    if (initialData) setForm(initialData);
  }, [initialData]);

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const toggle = (section: string) =>
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));

  const handleDeedUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDeedParsing(true);
    setDeedSuccess('');
    setDeedError('');
    try {
      const result = await parseNotaryDeed(file);
      if (result.error) {
        setDeedError(result.error);
      } else if (result.parsed_fields) {
        const fields = result.parsed_fields;
        setForm((prev) => {
          const updated = { ...prev };
          // Only fill empty fields — don't overwrite existing data
          const fieldMap: Record<string, keyof PropertyFormData> = {
            address: 'address',
            city: 'city',
            country: 'country',
            property_type: 'property_type',
            cadastral_number: 'cadastral_number',
            square_meters: 'square_meters',
            purchase_price: 'purchase_price',
            purchase_date: 'purchase_date',
            mortgage_provider: 'mortgage_provider',
            notary_act_number: 'notary_act_number',
            notary_act_date: 'notary_act_date',
            seller_name: 'seller_name',
            property_registry_number: 'property_registry_number',
          };
          for (const [parseKey, formKey] of Object.entries(fieldMap)) {
            if (fields[parseKey] && !updated[formKey]) {
              (updated as Record<string, string>)[formKey] = String(fields[parseKey]);
            }
          }
          // Append extra notes
          if (fields._extra_notes) {
            updated.notes = updated.notes
              ? `${updated.notes}\n\n${fields._extra_notes}`
              : fields._extra_notes;
          }
          return updated;
        });
        setDeedSuccess(t('properties.deed_parsed', locale));
        // Auto-open relevant sections
        setOpenSections((prev) => ({ ...prev, notary: true, land: true, mortgage: !!fields.mortgage_provider }));
        if (result.warnings?.length) {
          setDeedError(result.warnings.join('; '));
        }
      }
    } catch {
      setDeedError(t('properties.deed_parse_error', locale));
    } finally {
      setDeedParsing(false);
      // Reset file input so same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Alert type="error" message={error} />
      <Alert type="success" message={success} />

      {/* Notary Deed Upload */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📜</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">{t('properties.upload_deed', locale)}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {locale === 'bg' ? 'Качете PDF и полетата ще се попълнят автоматично' : 'Upload a PDF and fields will be auto-filled'}
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleDeedUpload}
            className="hidden"
            id="deed-upload"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={deedParsing}
            onClick={() => fileInputRef.current?.click()}
          >
            {deedParsing ? t('properties.parsing_deed', locale) : locale === 'bg' ? 'Избери файл' : 'Choose File'}
          </Button>
        </div>
        {deedSuccess && <p className="text-xs text-green-700 mt-2">{deedSuccess}</p>}
        {deedError && <p className="text-xs text-amber-700 mt-2">{deedError}</p>}
      </div>

      {/* Basic Information */}
      <FormSection title={t('properties.section.basic', locale)} icon="🏢" open={!!openSections.basic} onToggle={() => toggle('basic')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label={t('properties.name', locale)} value={form.name} onChange={(e) => set('name', e.target.value)} required />
          <Select label={t('properties.owner', locale)} value={form.owner} onChange={(e) => set('owner', e.target.value)} required>
            <option value="">{t('common.select', locale)}</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.full_name}</option>
            ))}
          </Select>
        </div>
        <Textarea label={t('properties.address', locale)} value={form.address} onChange={(e) => set('address', e.target.value)} rows={2} required />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label={t('properties.city', locale)} value={form.city} onChange={(e) => set('city', e.target.value)} required />
          <Input label={t('properties.country', locale)} value={form.country} onChange={(e) => set('country', e.target.value)} />
          <Select label={t('properties.type', locale)} value={form.property_type} onChange={(e) => set('property_type', e.target.value)}>
            <option value="apartment">{t('type.apartment', locale)}</option>
            <option value="house">{t('type.house', locale)}</option>
            <option value="studio">{t('type.studio', locale)}</option>
            <option value="commercial">{t('type.commercial', locale)}</option>
            <option value="parking">{t('type.parking', locale)}</option>
            <option value="garage">{t('type.garage', locale)}</option>
            <option value="storage">{t('type.storage', locale)}</option>
          </Select>
        </div>
        {['parking', 'garage', 'storage'].includes(form.property_type) && (
          <Select
            label={t('properties.parent_property', locale)}
            value={form.parent_property}
            onChange={(e) => set('parent_property', e.target.value)}
          >
            <option value="">{t('properties.no_parent', locale)}</option>
            {allProperties
              .filter((p) => !['parking', 'garage', 'storage'].includes(p.property_type) && p.id !== Number(initialData?.owner))
              .map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
          </Select>
        )}
      </FormSection>

      {/* Notary Deed Info */}
      <FormSection title={t('properties.section.notary', locale)} icon="📜" open={!!openSections.notary} onToggle={() => toggle('notary')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label={t('properties.notary_act_number', locale)} value={form.notary_act_number} onChange={(e) => set('notary_act_number', e.target.value)} />
          <Input label={t('properties.notary_act_date', locale)} type="date" value={form.notary_act_date} onChange={(e) => set('notary_act_date', e.target.value)} />
          <Input label={t('properties.seller_name', locale)} value={form.seller_name} onChange={(e) => set('seller_name', e.target.value)} />
          <Input label={t('properties.property_registry_number', locale)} value={form.property_registry_number} onChange={(e) => set('property_registry_number', e.target.value)} />
        </div>
      </FormSection>

      {/* Land & Acquisition */}
      <FormSection title={t('properties.section.land', locale)} icon="📐" open={!!openSections.land} onToggle={() => toggle('land')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label={t('properties.cadastral', locale)} value={form.cadastral_number} onChange={(e) => set('cadastral_number', e.target.value)} />
          <Input label={t('properties.sqm', locale)} type="number" value={form.square_meters} onChange={(e) => set('square_meters', e.target.value)} />
          <Input label={t('properties.purchase_price', locale)} type="number" value={form.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} />
          <Input label={t('properties.purchase_date', locale)} type="date" value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} />
          <Input label={t('properties.current_value', locale)} type="number" value={form.current_value} onChange={(e) => set('current_value', e.target.value)} />
        </div>
      </FormSection>

      {/* Mortgage */}
      <FormSection title={t('properties.section.mortgage', locale)} icon="🏦" open={!!openSections.mortgage} onToggle={() => toggle('mortgage')}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label={t('properties.mortgage_provider', locale)} value={form.mortgage_provider} onChange={(e) => set('mortgage_provider', e.target.value)} />
          <Input label={t('properties.mortgage_account', locale)} value={form.mortgage_account_number} onChange={(e) => set('mortgage_account_number', e.target.value)} />
          <Input label={t('properties.mortgage_payment', locale)} type="number" value={form.mortgage_monthly_payment} onChange={(e) => set('mortgage_monthly_payment', e.target.value)} />
        </div>
      </FormSection>

      {/* Utilities */}
      <FormSection title={t('properties.section.utilities', locale)} icon="⚡" open={!!openSections.utilities} onToggle={() => toggle('utilities')}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label={t('properties.electricity_provider', locale)} value={form.electricity_provider} onChange={(e) => set('electricity_provider', e.target.value)} />
            <Input label={t('properties.electricity_account', locale)} value={form.electricity_account_number} onChange={(e) => set('electricity_account_number', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label={t('properties.water_provider', locale)} value={form.water_provider} onChange={(e) => set('water_provider', e.target.value)} />
            <Input label={t('properties.water_account', locale)} value={form.water_account_number} onChange={(e) => set('water_account_number', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label={t('properties.gas_provider', locale)} value={form.gas_provider} onChange={(e) => set('gas_provider', e.target.value)} />
            <Input label={t('properties.gas_account', locale)} value={form.gas_account_number} onChange={(e) => set('gas_account_number', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label={t('properties.heating_provider', locale)} value={form.heating_provider} onChange={(e) => set('heating_provider', e.target.value)} />
            <Input label={t('properties.heating_account', locale)} value={form.heating_account_number} onChange={(e) => set('heating_account_number', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label={t('properties.internet_provider', locale)} value={form.internet_provider} onChange={(e) => set('internet_provider', e.target.value)} />
            <Input label={t('properties.internet_account', locale)} value={form.internet_account_number} onChange={(e) => set('internet_account_number', e.target.value)} />
          </div>
        </div>
      </FormSection>

      {/* Insurance */}
      <FormSection title={t('properties.section.insurance', locale)} icon="🛡️" open={!!openSections.insurance} onToggle={() => toggle('insurance')}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label={t('properties.insurance_provider', locale)} value={form.insurance_provider} onChange={(e) => set('insurance_provider', e.target.value)} />
          <Input label={t('properties.insurance_policy', locale)} value={form.insurance_policy_number} onChange={(e) => set('insurance_policy_number', e.target.value)} />
          <Input label={t('properties.insurance_cost', locale)} type="number" value={form.annual_insurance_cost} onChange={(e) => set('annual_insurance_cost', e.target.value)} />
        </div>
      </FormSection>

      {/* Building Management */}
      <FormSection title={t('properties.section.building', locale)} icon="🏗️" open={!!openSections.building} onToggle={() => toggle('building')}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label={t('properties.building_provider', locale)} value={form.building_management_provider} onChange={(e) => set('building_management_provider', e.target.value)} />
          <Input label={t('properties.building_account', locale)} value={form.building_management_account_number} onChange={(e) => set('building_management_account_number', e.target.value)} />
          <Input label={t('properties.building_fee', locale)} type="number" value={form.building_management_monthly_fee} onChange={(e) => set('building_management_monthly_fee', e.target.value)} />
        </div>
      </FormSection>

      {/* Security */}
      <FormSection title={t('properties.section.security', locale)} icon="🔒" open={!!openSections.security} onToggle={() => toggle('security')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label={t('properties.security_provider', locale)} value={form.security_provider} onChange={(e) => set('security_provider', e.target.value)} />
          <Input label={t('properties.security_account', locale)} value={form.security_account_number} onChange={(e) => set('security_account_number', e.target.value)} />
        </div>
      </FormSection>

      {/* Access Codes */}
      <FormSection title={t('properties.section.access', locale)} icon="🔑" open={!!openSections.access} onToggle={() => toggle('access')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label={t('properties.front_door_code', locale)} value={form.front_door_code} onChange={(e) => set('front_door_code', e.target.value)} />
          <Input label={t('properties.lock_box_code', locale)} value={form.lock_box_code} onChange={(e) => set('lock_box_code', e.target.value)} />
        </div>
      </FormSection>

      {/* Notes */}
      <FormSection title={t('properties.section.notes', locale)} icon="📝" open={!!openSections.notes} onToggle={() => toggle('notes')}>
        <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={4} />
      </FormSection>

      {/* Actions — sticky on mobile */}
      <StickyActionBar>
        <Button type="submit" disabled={saving} className="flex-1 md:flex-none">
          {saving ? '...' : t('common.save', locale)}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push('/properties')} className="flex-1 md:flex-none">
          {t('common.cancel', locale)}
        </Button>
      </StickyActionBar>
    </form>
  );
}
