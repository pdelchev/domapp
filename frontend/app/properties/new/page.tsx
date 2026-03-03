'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createProperty } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader } from '../../components/ui';
import PropertyForm, { EMPTY_FORM, PropertyFormData } from '../../components/PropertyForm';

export default function NewPropertyPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (data: PropertyFormData) => {
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        payload[key] = value === '' ? null : value;
      }
      await createProperty(payload);
      router.push('/properties');
    } catch {
      setError(t('common.error', locale));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={t('properties.add', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/properties')}
        />
        <PropertyForm
          initialData={EMPTY_FORM}
          onSubmit={handleSubmit}
          saving={saving}
          error={error}
          success=""
        />
      </PageContent>
    </PageShell>
  );
}
