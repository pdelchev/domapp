'use client';
// §NAV: frontend weight goals CRUD
// §RULE: one active goal per profile (backend auto-deactivates others on create)

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../../context/LanguageContext';
import { t } from '../../../lib/i18n';
import {
  getHealthProfiles, getWeightGoals, createWeightGoal,
  updateWeightGoal, deleteWeightGoal,
} from '../../../lib/api';
import NavBar from '../../../components/NavBar';
import {
  PageShell, PageContent, PageHeader, Card, Button, Badge, Alert,
  Spinner, Input, Select, EmptyState,
} from '../../../components/ui';

interface Profile { id: number; full_name: string; is_primary: boolean; }
interface Goal {
  id: number; profile: number; goal_type: string;
  start_weight_kg: string; target_weight_kg: string; weekly_rate_kg: string;
  started_at: string; target_date: string; is_active: boolean;
  progress: { percent_complete: number; actual_weekly_rate_kg: number; needed_weekly_rate_kg: number; on_track: boolean; days_remaining: number } | null;
}

export default function WeightGoalsPage() {
  const { locale } = useLanguage();
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const threeMonths = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  const [form, setForm] = useState({
    goal_type: 'lose',
    start_weight_kg: '',
    target_weight_kg: '',
    weekly_rate_kg: '-0.5',
    started_at: today,
    target_date: threeMonths,
  });

  const load = useCallback(async (pid: number) => {
    setLoading(true); setError('');
    try { setGoals(await getWeightGoals({ profile: pid })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Load failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    getHealthProfiles().then((ps: Profile[]) => {
      setProfiles(ps);
      const primary = ps.find(p => p.is_primary) || ps[0];
      if (primary) { setProfileId(primary.id); load(primary.id); }
      else setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId) return;
    setError('');
    try {
      await createWeightGoal({
        profile: profileId,
        goal_type: form.goal_type,
        start_weight_kg: form.start_weight_kg,
        target_weight_kg: form.target_weight_kg,
        weekly_rate_kg: form.weekly_rate_kg,
        started_at: form.started_at,
        target_date: form.target_date,
        is_active: true,
      });
      setShowForm(false);
      load(profileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('weight.confirm_delete_goal', locale))) return;
    try { await deleteWeightGoal(id); if (profileId) load(profileId); }
    catch (e) { setError(e instanceof Error ? e.message : 'Delete failed'); }
  };

  const handleDeactivate = async (g: Goal) => {
    try { await updateWeightGoal(g.id, { is_active: false }); if (profileId) load(profileId); }
    catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
  };

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={t('weight.goals', locale)}
          onBack={() => router.push('/health/weight')}
          action={<Button onClick={() => setShowForm(!showForm)}>{showForm ? t('common.cancel', locale) : '+ ' + t('weight.new_goal', locale)}</Button>}
        />

        <Alert type="error" message={error} />

        {showForm && (
          <Card>
            <form onSubmit={handleCreate} className="space-y-4">
              <Select label={t('weight.goal_type', locale)}
                      value={form.goal_type}
                      onChange={e => setForm(p => ({ ...p, goal_type: e.target.value }))}>
                <option value="lose">{t('weight.lose', locale)}</option>
                <option value="gain">{t('weight.gain', locale)}</option>
                <option value="maintain">{t('weight.maintain', locale)}</option>
              </Select>
              <div className="grid grid-cols-2 gap-4">
                <Input label={t('weight.start_kg', locale)} type="number" step="0.1" required
                       value={form.start_weight_kg}
                       onChange={e => setForm(p => ({ ...p, start_weight_kg: e.target.value }))} />
                <Input label={t('weight.target_kg', locale)} type="number" step="0.1" required
                       value={form.target_weight_kg}
                       onChange={e => setForm(p => ({ ...p, target_weight_kg: e.target.value }))} />
              </div>
              <Input label={t('weight.weekly_rate', locale) + ' (kg/wk, signed)'} type="number" step="0.05" required
                     value={form.weekly_rate_kg}
                     onChange={e => setForm(p => ({ ...p, weekly_rate_kg: e.target.value }))} />
              <div className="grid grid-cols-2 gap-4">
                <Input label={t('weight.start_date', locale)} type="date" required
                       value={form.started_at}
                       onChange={e => setForm(p => ({ ...p, started_at: e.target.value }))} />
                <Input label={t('weight.target_date', locale)} type="date" required
                       value={form.target_date}
                       onChange={e => setForm(p => ({ ...p, target_date: e.target.value }))} />
              </div>
              <Button type="submit">{t('common.save', locale)}</Button>
            </form>
          </Card>
        )}

        {loading ? <Spinner /> : goals.length === 0 ? (
          <EmptyState icon="🎯" message={t('weight.no_goals', locale)} />
        ) : (
          <div className="space-y-3 mt-4">
            {goals.map(g => (
              <Card key={g.id}>
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div>
                    <div className="font-medium text-gray-900">
                      {g.start_weight_kg} → {g.target_weight_kg} kg
                      {g.is_active && <Badge color="green">{t('weight.active', locale)}</Badge>}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {t('weight.by', locale)} {new Date(g.target_date).toLocaleDateString()}
                      {' • '}{g.weekly_rate_kg} kg/wk
                    </div>
                    {g.progress && (
                      <>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                          <div
                            className={`h-2 rounded-full ${g.progress.on_track ? 'bg-green-500' : 'bg-amber-500'}`}
                            style={{ width: `${g.progress.percent_complete}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {g.progress.percent_complete}% •{' '}
                          {g.progress.actual_weekly_rate_kg}/{g.progress.needed_weekly_rate_kg} kg/wk •{' '}
                          {g.progress.days_remaining}d
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {g.is_active && (
                      <Button variant="ghost" size="sm" onClick={() => handleDeactivate(g)}>
                        {t('weight.deactivate', locale)}
                      </Button>
                    )}
                    <Button variant="danger" size="sm" onClick={() => handleDelete(g.id)}>
                      {t('common.delete', locale)}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}
