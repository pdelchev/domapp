'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getOwners, getProperties } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import { Button, Input, Select, Textarea, Alert, FormSection } from './ui';

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Alert type="error" message={error} />
      <Alert type="success" message={success} />

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

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={saving}>
          {saving ? '...' : t('common.save', locale)}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push('/properties')}>
          {t('common.cancel', locale)}
        </Button>
      </div>
    </form>
  );
}
