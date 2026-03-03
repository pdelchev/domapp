'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { getProperty, updateProperty } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Spinner } from '../../components/ui';
import PropertyForm, { EMPTY_FORM, PropertyFormData } from '../../components/PropertyForm';

export default function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { locale } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [initialData, setInitialData] = useState<PropertyFormData>(EMPTY_FORM);

  useEffect(() => {
    getProperty(Number(id))
      .then((data) => {
        const mapped: PropertyFormData = { ...EMPTY_FORM };
        for (const key of Object.keys(EMPTY_FORM) as Array<keyof PropertyFormData>) {
          const val = data[key];
          mapped[key] = val != null ? String(val) : '';
        }
        setInitialData(mapped);
      })
      .catch(() => router.push('/properties'))
      .finally(() => setLoading(false));
  }, [id, router]);

  const handleSubmit = async (data: PropertyFormData) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        payload[key] = value === '' ? null : value;
      }
      await updateProperty(Number(id), payload);
      setSuccess(t('common.saved', locale));
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError(t('common.error', locale));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={t('properties.edit', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/properties')}
        />
        <PropertyForm
          initialData={initialData}
          onSubmit={handleSubmit}
          saving={saving}
          error={error}
          success={success}
        />
      </PageContent>
    </PageShell>
  );
}
