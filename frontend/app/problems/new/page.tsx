'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createProblem, getProperties } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Select, Textarea, Alert } from '../../components/ui';

interface PropertyItem {
  id: number;
  name: string;
}

const CATEGORIES = [
  'plumbing', 'electrical', 'appliance', 'structural', 'pest',
  'hvac', 'security', 'cleaning', 'noise', 'damage', 'tenant', 'other',
];

export default function NewProblemPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    property: '',
    title: '',
    description: '',
    category: 'other',
    priority: 'medium',
    reported_by: '',
    assigned_to: '',
    estimated_cost: '',
  });

  useEffect(() => {
    getProperties().then(setProperties).catch(() => router.push('/login'));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        property: Number(form.property),
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
        reported_by: form.reported_by,
        assigned_to: form.assigned_to,
      };
      if (form.estimated_cost) data.estimated_cost = form.estimated_cost;
      await createProblem(data);
      router.push('/problems');
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
          title={t('problems.add', locale)}
          onBack={() => router.push('/problems')}
          backLabel={t('common.back', locale)}
        />

        <Alert type="error" message={error} />

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label={t('problems.property', locale)}
                required
                value={form.property}
                onChange={(e) => setForm((prev) => ({ ...prev, property: e.target.value }))}
              >
                <option value="">{t('common.select', locale)}</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
              <Select
                label={t('problems.priority', locale)}
                value={form.priority}
                onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
              >
                <option value="emergency">{t('problems.emergency', locale)}</option>
                <option value="high">{t('problems.high', locale)}</option>
                <option value="medium">{t('problems.medium', locale)}</option>
                <option value="low">{t('problems.low', locale)}</option>
              </Select>
            </div>

            <Input
              label={t('problems.problem_title', locale)}
              required
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder={locale === 'en' ? 'e.g. Water leak in bathroom' : 'напр. Теч на вода в банята'}
            />

            <Textarea
              label={t('problems.description', locale)}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
              placeholder={locale === 'en' ? 'Describe the problem in detail...' : 'Опишете проблема подробно...'}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label={t('problems.category', locale)}
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`problems.${c === 'security' ? 'security_cat' : c === 'tenant' ? 'tenant_issue' : c}`, locale)}
                  </option>
                ))}
              </Select>
              <Input
                label={t('problems.estimated_cost', locale)}
                type="number"
                value={form.estimated_cost}
                onChange={(e) => setForm((prev) => ({ ...prev, estimated_cost: e.target.value }))}
                placeholder="EUR"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t('problems.reported_by', locale)}
                value={form.reported_by}
                onChange={(e) => setForm((prev) => ({ ...prev, reported_by: e.target.value }))}
                placeholder={locale === 'en' ? 'Tenant name, neighbor, etc.' : 'Име на наемател, съсед и т.н.'}
              />
              <Input
                label={t('problems.assigned_to', locale)}
                value={form.assigned_to}
                onChange={(e) => setForm((prev) => ({ ...prev, assigned_to: e.target.value }))}
                placeholder={locale === 'en' ? 'Contractor or handyman' : 'Майстор или фирма'}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? t('common.loading', locale) : t('common.save', locale)}
              </Button>
              <Button variant="secondary" type="button" onClick={() => router.push('/problems')}>
                {t('common.cancel', locale)}
              </Button>
            </div>
          </form>
        </Card>
      </PageContent>
    </PageShell>
  );
}
