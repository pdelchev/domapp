'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getMe, updateProfile, getSubAccounts, createSubAccount, updateSubAccount, deleteSubAccount } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Select, Alert, EmptyState, Spinner, Badge } from '../components/ui';

interface UserProfile {
  id: number; username: string; email: string; first_name: string;
  phone: string; role: string; allowed_modules: string[];
  own_health_data: boolean; avatar_color: string;
  is_admin?: boolean; effective_modules?: string[];
}

interface SubAccount {
  id: number; username: string; email: string; first_name: string;
  phone: string; role: string; allowed_modules: string[];
  own_health_data: boolean; avatar_color: string;
}

const ALL_MODULES = [
  { key: 'health', icon: '❤️', color: 'bg-rose-500' },
  { key: 'properties', icon: '🏠', color: 'bg-blue-500' },
  { key: 'finance', icon: '💰', color: 'bg-emerald-500' },
  { key: 'music', icon: '🎵', color: 'bg-purple-500' },
  { key: 'dashboard', icon: '📊', color: 'bg-indigo-500' },
  { key: 'notifications', icon: '🔔', color: 'bg-amber-500' },
];

const AVATAR_COLORS = ['indigo', 'rose', 'blue', 'emerald', 'purple', 'amber', 'teal', 'orange'];

const EMPTY_SUB = {
  first_name: '', username: '', email: '', phone: '', password: '',
  role: 'viewer', allowed_modules: [] as string[],
  own_health_data: true, avatar_color: 'blue',
};

export default function SettingsPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [me, setMe] = useState<UserProfile | null>(null);
  const [subs, setSubs] = useState<SubAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Profile form
  const [profileForm, setProfileForm] = useState({ first_name: '', phone: '', avatar_color: 'indigo' });

  // Sub-account form
  const [showSubForm, setShowSubForm] = useState(false);
  const [editingSubId, setEditingSubId] = useState<number | null>(null);
  const [subForm, setSubForm] = useState(EMPTY_SUB);

  useEffect(() => {
    Promise.all([getMe(), getSubAccounts().catch(() => [])])
      .then(([user, accounts]) => {
        setMe(user);
        setProfileForm({ first_name: user.first_name, phone: user.phone || '', avatar_color: user.avatar_color || 'indigo' });
        setSubs(accounts);
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      const updated = await updateProfile(profileForm);
      setMe((prev) => prev ? { ...prev, ...updated } : prev);
      setSuccess(t('settings.saved', locale));
      setTimeout(() => setSuccess(''), 3000);
    } catch { setError(t('common.error', locale)); }
    finally { setSaving(false); }
  };

  const openNewSub = () => {
    setSubForm(EMPTY_SUB);
    setEditingSubId(null);
    setError('');
    setShowSubForm(true);
  };

  const openEditSub = (sub: SubAccount) => {
    setSubForm({
      first_name: sub.first_name, username: sub.username, email: sub.email,
      phone: sub.phone || '', password: '', role: sub.role,
      allowed_modules: sub.allowed_modules || [],
      own_health_data: sub.own_health_data, avatar_color: sub.avatar_color || 'blue',
    });
    setEditingSubId(sub.id);
    setError('');
    setShowSubForm(true);
  };

  const submitSub = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = { ...subForm };
      if (!payload.password) delete (payload as Record<string, unknown>).password;
      if (editingSubId) {
        const updated = await updateSubAccount(editingSubId, payload);
        setSubs((prev) => prev.map((s) => s.id === editingSubId ? updated : s));
      } else {
        const created = await createSubAccount(payload);
        setSubs((prev) => [...prev, created]);
      }
      setShowSubForm(false);
    } catch { setError(t('common.error', locale)); }
    finally { setSaving(false); }
  };

  const handleDeleteSub = async (id: number) => {
    if (!confirm(t('settings.delete_confirm', locale))) return;
    await deleteSubAccount(id);
    setSubs((prev) => prev.filter((s) => s.id !== id));
  };

  const toggleModule = (mod: string) => {
    setSubForm((prev) => ({
      ...prev,
      allowed_modules: prev.allowed_modules.includes(mod)
        ? prev.allowed_modules.filter((m) => m !== mod)
        : [...prev.allowed_modules, mod],
    }));
  };

  if (loading) return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;

  const isAdmin = me?.role === 'admin' || me?.is_admin;

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader title={t('settings.title', locale)} />

        <Alert type="error" message={error} />
        <Alert type="success" message={success} />

        {/* ===== My Profile ===== */}
        <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <span className={`w-8 h-8 rounded-full bg-${profileForm.avatar_color}-500 flex items-center justify-center text-white text-sm font-bold`}>
            {me?.first_name?.[0] || me?.username?.[0] || '?'}
          </span>
          {t('settings.profile', locale)}
        </h2>
        <Card className="mb-8">
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label={t('settings.name', locale)} value={profileForm.first_name} onChange={(e) => setProfileForm((p) => ({ ...p, first_name: e.target.value }))} />
              <Input label={t('settings.phone', locale)} value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            {/* Avatar color */}
            <div>
              <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">{t('settings.avatar_color', locale)}</label>
              <div className="flex gap-2">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setProfileForm((p) => ({ ...p, avatar_color: c }))}
                    className={`w-8 h-8 rounded-full bg-${c}-500 transition-all ${
                      profileForm.avatar_color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'opacity-60 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="text-sm text-gray-500">
              {t('settings.username', locale)}: <span className="font-medium text-gray-900">{me?.username}</span> &middot; {t('settings.role', locale)}: <Badge color="indigo">{me?.role}</Badge>
            </div>
            <Button type="submit" disabled={saving}>{saving ? '...' : t('common.save', locale)}</Button>
          </form>
        </Card>

        {/* ===== Sub-Accounts ===== */}
        {isAdmin && (
          <>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{t('settings.sub_accounts', locale)}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{t('settings.sub_accounts_desc', locale)}</p>
              </div>
              <Button onClick={openNewSub}>+ {t('settings.add_account', locale)}</Button>
            </div>

            {showSubForm && (
              <Card className="mb-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  {editingSubId ? t('settings.edit_account', locale) : t('settings.add_account', locale)}
                </h3>
                <form onSubmit={submitSub} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label={t('settings.name', locale)} value={subForm.first_name} onChange={(e) => setSubForm((p) => ({ ...p, first_name: e.target.value }))} required />
                    <Input label={t('settings.username', locale)} value={subForm.username} onChange={(e) => setSubForm((p) => ({ ...p, username: e.target.value }))} required={!editingSubId} disabled={!!editingSubId} />
                    <Input label={t('settings.email', locale)} type="email" value={subForm.email} onChange={(e) => setSubForm((p) => ({ ...p, email: e.target.value }))} />
                    <Input label={t('settings.phone', locale)} value={subForm.phone} onChange={(e) => setSubForm((p) => ({ ...p, phone: e.target.value }))} />
                    <Input label={t('settings.password', locale)} type="password" value={subForm.password} onChange={(e) => setSubForm((p) => ({ ...p, password: e.target.value }))} required={!editingSubId} placeholder={editingSubId ? t('settings.password_hint', locale) : ''} />
                    <Select label={t('settings.role', locale)} value={subForm.role} onChange={(e) => setSubForm((p) => ({ ...p, role: e.target.value }))}>
                      <option value="admin">{t('settings.role_admin', locale)}</option>
                      <option value="manager">{t('settings.role_manager', locale)}</option>
                      <option value="viewer">{t('settings.role_viewer', locale)}</option>
                    </Select>
                  </div>

                  {/* Module access toggles */}
                  {subForm.role !== 'admin' && (
                    <div>
                      <label className="text-[13px] font-medium text-gray-700 mb-2 block">{t('settings.modules_access', locale)}</label>
                      <p className="text-xs text-gray-400 mb-2">{locale === 'en' ? 'Select which modules this user can access. Leave empty for all.' : 'Изберете до кои модули този потребител има достъп. Оставете празно за всички.'}</p>
                      <div className="flex flex-wrap gap-2">
                        {ALL_MODULES.map((mod) => {
                          const selected = subForm.allowed_modules.includes(mod.key);
                          return (
                            <button
                              key={mod.key}
                              type="button"
                              onClick={() => toggleModule(mod.key)}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                                selected
                                  ? `${mod.color} text-white shadow-sm`
                                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}
                            >
                              <span>{mod.icon}</span>
                              {t(`nav.${mod.key === 'health' ? 'health_hub' : mod.key}`, locale)}
                            </button>
                          );
                        })}
                      </div>
                      {subForm.allowed_modules.length === 0 && (
                        <p className="text-xs text-green-600 mt-1">{t('settings.all_modules', locale)}</p>
                      )}
                    </div>
                  )}

                  {/* Health data isolation */}
                  <label className="flex items-start gap-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={subForm.own_health_data}
                      onChange={(e) => setSubForm((p) => ({ ...p, own_health_data: e.target.checked }))}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-5 h-5 mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">{t('settings.own_health', locale)}</span>
                      <p className="text-xs text-gray-400 mt-0.5">{t('settings.own_health_desc', locale)}</p>
                    </div>
                  </label>

                  {/* Avatar color */}
                  <div>
                    <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">{t('settings.avatar_color', locale)}</label>
                    <div className="flex gap-2">
                      {AVATAR_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setSubForm((p) => ({ ...p, avatar_color: c }))}
                          className={`w-8 h-8 rounded-full bg-${c}-500 transition-all ${
                            subForm.avatar_color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'opacity-60 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button type="submit" disabled={saving}>{saving ? '...' : t('common.save', locale)}</Button>
                    <Button type="button" variant="secondary" onClick={() => setShowSubForm(false)}>{t('common.cancel', locale)}</Button>
                  </div>
                </form>
              </Card>
            )}

            {/* Sub-account list */}
            {subs.length === 0 && !showSubForm ? (
              <EmptyState icon="👥" message={t('settings.no_accounts', locale)} />
            ) : (
              <div className="space-y-3">
                {subs.map((sub) => (
                  <Card key={sub.id}>
                    <div className="flex items-center gap-3">
                      <span className={`w-10 h-10 rounded-full bg-${sub.avatar_color || 'blue'}-500 flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                        {sub.first_name?.[0] || sub.username?.[0] || '?'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{sub.first_name || sub.username}</span>
                          <Badge color={sub.role === 'admin' ? 'red' : sub.role === 'manager' ? 'blue' : 'gray'}>{sub.role}</Badge>
                          {sub.own_health_data && <Badge color="green">❤️</Badge>}
                        </div>
                        <p className="text-xs text-gray-500">{sub.email || sub.username}</p>
                        {sub.allowed_modules && sub.allowed_modules.length > 0 && sub.role !== 'admin' && (
                          <div className="flex gap-1 mt-1">
                            {sub.allowed_modules.map((m) => {
                              const mod = ALL_MODULES.find((am) => am.key === m);
                              return <span key={m} className="text-xs">{mod?.icon || m}</span>;
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => openEditSub(sub)}>{t('common.edit', locale)}</Button>
                        <Button variant="danger" size="sm" onClick={() => handleDeleteSub(sub.id)}>{t('common.delete', locale)}</Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </PageContent>
    </PageShell>
  );
}
