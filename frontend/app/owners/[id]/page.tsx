'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { getOwner, updateOwner } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Textarea, Alert, Spinner } from '../../components/ui';

export default function EditOwnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { locale } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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

  useEffect(() => {
    getOwner(Number(id))
      .then((data) => {
        setForm({
          full_name: data.full_name || '',
          phone: data.phone || '',
          email: data.email || '',
          id_number: data.id_number || '',
          address: data.address || '',
          bank_name: data.bank_name || '',
          bank_iban: data.bank_iban || '',
          notes: data.notes || '',
        });
      })
      .catch(() => router.push('/owners'))
      .finally(() => setLoading(false));
  }, [id, router]);

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateOwner(Number(id), form);
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
          title={t('owners.edit', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/owners')}
        />

        <Alert type="error" message={error} />
        <Alert type="success" message={success} />

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

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? '...' : t('common.save', locale)}
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.push('/owners')}>
                {t('common.cancel', locale)}
              </Button>
            </div>
          </form>
        </Card>
      </PageContent>
    </PageShell>
  );
}
