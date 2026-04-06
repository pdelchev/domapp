'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getExpenses, createExpense, updateExpense, deleteExpense, getProperties } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Select, Input, Textarea, Alert, Spinner, EmptyState, DataTable } from '../../components/ui';

interface Expense {
  id: number;
  property: number;
  property_name: string;
  category: string;
  description: string | null;
  amount: string;
  due_date: string | null;
  paid_date: string | null;
  recurring: boolean;
  recurrence_frequency: string | null;
  notes: string | null;
}

interface Property {
  id: number;
  name: string;
}

const CATEGORIES = ['mortgage', 'electricity', 'water', 'internet', 'insurance', 'maintenance', 'tax'];

const EMPTY_FORM = {
  property: '',
  category: '',
  description: '',
  amount: '',
  due_date: '',
  paid_date: '',
  recurring: false,
  recurrence_frequency: '',
  notes: '',
};

export default function ExpensesPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    Promise.all([getExpenses(), getProperties()])
      .then(([e, p]) => { setExpenses(e); setProperties(p); })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const set = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError('');
    setShowForm(true);
  };

  const openEdit = (expense: Expense) => {
    setForm({
      property: String(expense.property),
      category: expense.category,
      description: expense.description || '',
      amount: expense.amount,
      due_date: expense.due_date || '',
      paid_date: expense.paid_date || '',
      recurring: expense.recurring,
      recurrence_frequency: expense.recurrence_frequency || '',
      notes: expense.notes || '',
    });
    setEditingId(expense.id);
    setError('');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        property: Number(form.property),
        amount: Number(form.amount),
        due_date: form.due_date || null,
        paid_date: form.paid_date || null,
        recurrence_frequency: form.recurrence_frequency || null,
      };
      if (editingId) {
        const updated = await updateExpense(editingId, payload);
        setExpenses((prev) => prev.map((ex) => (ex.id === editingId ? updated : ex)));
      } else {
        const created = await createExpense(payload);
        setExpenses((prev) => [...prev, created]);
      }
      setShowForm(false);
    } catch {
      setError(t('common.error', locale));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('expenses.delete_confirm', locale))) return;
    await deleteExpense(id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  const fmt = (v: string | number) =>
    new Intl.NumberFormat(locale === 'bg' ? 'bg-BG' : 'en-US', { style: 'currency', currency: 'EUR' }).format(Number(v));

  const filtered = expenses.filter((e) => {
    const matchesCat = !categoryFilter || e.category === categoryFilter;
    const matchesProp = !propertyFilter || e.property === Number(propertyFilter);
    return matchesCat && matchesProp;
  });

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent>
        <PageHeader
          title={t('expenses.title', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/finance')}
          action={
            <Button onClick={openNew}>+ {t('expenses.add', locale)}</Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <Select
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            className="max-w-[200px]"
          >
            <option value="">{t('finance.all_properties', locale)}</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="max-w-[200px]"
          >
            <option value="">{t('expenses.all_categories', locale)}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(`expenses.${c}`, locale)}</option>
            ))}
          </Select>
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <Card className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              {editingId ? t('expenses.edit', locale) : t('expenses.add', locale)}
            </h3>
            <Alert type="error" message={error} />
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select label={t('expenses.property', locale)} value={form.property} onChange={(e) => set('property', e.target.value)} required>
                  <option value="">{t('common.select', locale)}</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
                <Select label={t('expenses.category', locale)} value={form.category} onChange={(e) => set('category', e.target.value)} required>
                  <option value="">{t('common.select', locale)}</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{t(`expenses.${c}`, locale)}</option>
                  ))}
                </Select>
                <Input label={t('expenses.description', locale)} value={form.description} onChange={(e) => set('description', e.target.value)} />
                <Input label={t('expenses.amount', locale)} type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} required />
                <Input label={t('expenses.due_date', locale)} type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
                <Input label={t('expenses.paid_date', locale)} type="date" value={form.paid_date} onChange={(e) => set('paid_date', e.target.value)} />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.recurring} onChange={(e) => set('recurring', e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  {t('expenses.recurring', locale)}
                </label>
                {form.recurring && (
                  <Select value={form.recurrence_frequency} onChange={(e) => set('recurrence_frequency', e.target.value)} className="max-w-[160px]">
                    <option value="">{t('common.select', locale)}</option>
                    <option value="monthly">{t('expenses.monthly', locale)}</option>
                    <option value="yearly">{t('expenses.yearly', locale)}</option>
                  </Select>
                )}
              </div>
              <Textarea label={t('expenses.notes', locale)} value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
              <div className="flex gap-3 pt-1">
                <Button type="submit" disabled={saving}>
                  {saving ? '...' : t('common.save', locale)}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                  {t('common.cancel', locale)}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Table */}
        <DataTable<Expense>
          columns={[
            {
              key: 'category',
              header: t('expenses.category', locale),
              primary: true,
              render: (row) => (
                <>
                  <Badge color="indigo">{t(`expenses.${row.category}`, locale)}</Badge>
                  {row.recurring && <Badge color="purple">{t('expenses.recurring', locale)}</Badge>}
                </>
              ),
            },
            {
              key: 'property',
              header: t('expenses.property', locale),
              secondary: true,
              hideOnMobile: true,
              render: (row) => row.property_name,
            },
            {
              key: 'description',
              header: t('expenses.description', locale),
              hideOnMobile: true,
              render: (row) => row.description || '—',
            },
            {
              key: 'amount',
              header: t('expenses.amount', locale),
              className: 'text-right',
              render: (row) => <span className="font-medium">{fmt(row.amount)}</span>,
            },
            {
              key: 'paid_date',
              header: t('expenses.paid_date', locale),
              hideOnMobile: true,
              render: (row) => row.paid_date || <span className="text-yellow-600">{t('finance.pending', locale)}</span>,
            },
          ]}
          data={filtered}
          keyExtractor={(row) => row.id}
          rowActions={(row) => (
            <>
              <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                {t('common.edit', locale)}
              </Button>
              <Button variant="danger" size="sm" onClick={() => handleDelete(row.id)}>
                {t('common.delete', locale)}
              </Button>
            </>
          )}
          emptyIcon="📋"
          emptyMessage={t('common.no_data', locale)}
        />
      </PageContent>
    </PageShell>
  );
}
