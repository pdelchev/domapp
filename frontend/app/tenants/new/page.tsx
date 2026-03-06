'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createTenant } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Alert } from '../../components/ui';

export default function NewTenantPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    id_number: '',
  });

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createTenant(form);
      router.push('/tenants');
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
          title={t('tenants.add', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/tenants')}
        />

        <Alert type="error" message={error} />

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label={t('tenants.full_name', locale)} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required />
              <Input label={t('tenants.phone', locale)} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              <Input label={t('tenants.email', locale)} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              <Input label={t('tenants.id_number', locale)} value={form.id_number} onChange={(e) => set('id_number', e.target.value)} />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? '...' : t('common.save', locale)}
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.push('/tenants')}>
                {t('common.cancel', locale)}
              </Button>
            </div>
          </form>
        </Card>

        <p className="mt-4 text-sm text-gray-500">
          {locale === 'en'
            ? 'After creating the tenant, go to Leases to assign them to a property.'
            : 'След създаване на наемателя, отидете в Договори за да го свържете с имот.'}
        </p>
      </PageContent>
    </PageShell>
  );
}
