'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { getProblem, updateProblem, deleteProblem, getProperties } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Select, Textarea, Alert, Badge } from '../../components/ui';

interface PropertyItem {
  id: number;
  name: string;
}

const CATEGORIES = [
  'plumbing', 'electrical', 'appliance', 'structural', 'pest',
  'hvac', 'security', 'cleaning', 'noise', 'damage', 'tenant', 'other',
];

const STATUS_COLORS: Record<string, 'red' | 'yellow' | 'indigo' | 'green' | 'gray'> = {
  open: 'red',
  in_progress: 'yellow',
  resolved: 'green',
  closed: 'gray',
};

export default function EditProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { locale } = useLanguage();
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    property: '',
    title: '',
    description: '',
    category: 'other',
    priority: 'medium',
    status: 'open',
    reported_by: '',
    assigned_to: '',
    estimated_cost: '',
    actual_cost: '',
    resolution_notes: '',
  });

  useEffect(() => {
    Promise.all([
      getProblem(Number(id)),
      getProperties(),
    ]).then(([problem, props]) => {
      setProperties(props);
      setForm({
        property: String(problem.property),
        title: problem.title,
        description: problem.description || '',
        category: problem.category,
        priority: problem.priority,
        status: problem.status,
        reported_by: problem.reported_by || '',
        assigned_to: problem.assigned_to || '',
        estimated_cost: problem.estimated_cost ? String(problem.estimated_cost) : '',
        actual_cost: problem.actual_cost ? String(problem.actual_cost) : '',
        resolution_notes: problem.resolution_notes || '',
      });
    }).catch(() => router.push('/login')).finally(() => setLoading(false));
  }, [id, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        property: Number(form.property),
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
        status: form.status,
        reported_by: form.reported_by,
        assigned_to: form.assigned_to,
        resolution_notes: form.resolution_notes,
      };
      if (form.estimated_cost) data.estimated_cost = form.estimated_cost;
      else data.estimated_cost = null;
      if (form.actual_cost) data.actual_cost = form.actual_cost;
      else data.actual_cost = null;
      await updateProblem(Number(id), data);
      setSuccess(t('common.saved', locale));
    } catch {
      setError(t('common.error', locale));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('problems.delete_confirm', locale))) return;
    await deleteProblem(Number(id));
    router.push('/problems');
  };

  if (loading) {
    return (
      <PageShell>
        <NavBar />
        <PageContent size="md">
          <div className="flex items-center justify-center py-32">
            <div className="animate-spin h-5 w-5 border-2 border-indigo-600 border-t-transparent rounded-full" />
          </div>
        </PageContent>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={t('problems.edit', locale)}
          onBack={() => router.push('/problems')}
          backLabel={t('common.back', locale)}
          action={
            <div className="flex gap-2 items-center">
              <Badge color={STATUS_COLORS[form.status] || 'gray'}>
                {t(`problems.${form.status}`, locale)}
              </Badge>
              <Button variant="danger" size="sm" onClick={handleDelete}>
                {t('common.delete', locale)}
              </Button>
            </div>
          }
        />

        <Alert type="error" message={error} />
        <Alert type="success" message={success} />

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
                label={t('problems.status', locale)}
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="open">{t('problems.open', locale)}</option>
                <option value="in_progress">{t('problems.in_progress', locale)}</option>
                <option value="resolved">{t('problems.resolved', locale)}</option>
                <option value="closed">{t('problems.closed', locale)}</option>
              </Select>
            </div>

            <Input
              label={t('problems.problem_title', locale)}
              required
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            />

            <Textarea
              label={t('problems.description', locale)}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t('problems.reported_by', locale)}
                value={form.reported_by}
                onChange={(e) => setForm((prev) => ({ ...prev, reported_by: e.target.value }))}
              />
              <Input
                label={t('problems.assigned_to', locale)}
                value={form.assigned_to}
                onChange={(e) => setForm((prev) => ({ ...prev, assigned_to: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t('problems.estimated_cost', locale)}
                type="number"
                value={form.estimated_cost}
                onChange={(e) => setForm((prev) => ({ ...prev, estimated_cost: e.target.value }))}
                placeholder="EUR"
              />
              <Input
                label={t('problems.actual_cost', locale)}
                type="number"
                value={form.actual_cost}
                onChange={(e) => setForm((prev) => ({ ...prev, actual_cost: e.target.value }))}
                placeholder="EUR"
              />
            </div>

            <Textarea
              label={t('problems.resolution_notes', locale)}
              value={form.resolution_notes}
              onChange={(e) => setForm((prev) => ({ ...prev, resolution_notes: e.target.value }))}
              rows={3}
              placeholder={locale === 'en' ? 'What was done to resolve this...' : 'Какво беше направено за решаване...'}
            />

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
