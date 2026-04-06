'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createOwner } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Textarea, Alert, StickyActionBar } from '../../components/ui';

export default function NewOwnerPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    id_number: '',
    address: '',
    bank_name: '',
    bank_iban: '',
    notes: '',
  });

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createOwner(form);
      router.push('/owners');
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
          title={t('owners.add', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/owners')}
        />

        <Alert type="error" message={error} />

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label={t('owners.full_name', locale)} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required />
              <Input label={t('owners.phone', locale)} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              <Input label={t('owners.email', locale)} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              <Input label={t('owners.id_number', locale)} value={form.id_number} onChange={(e) => set('id_number', e.target.value)} />
            </div>

            <Textarea label={t('owners.address', locale)} value={form.address} onChange={(e) => set('address', e.target.value)} rows={2} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label={t('owners.bank_name', locale)} value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} />
              <Input label={t('owners.bank_iban', locale)} value={form.bank_iban} onChange={(e) => set('bank_iban', e.target.value)} />
            </div>

            <Textarea label={t('owners.notes', locale)} value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />

            <StickyActionBar>
              <Button type="submit" disabled={saving} className="flex-1 md:flex-none">
                {saving ? '...' : t('common.save', locale)}
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.push('/owners')} className="flex-1 md:flex-none">
                {t('common.cancel', locale)}
              </Button>
            </StickyActionBar>
          </form>
        </Card>
      </PageContent>
    </PageShell>
  );
}
