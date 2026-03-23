'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getPlaylists, createPlaylist, deletePlaylist } from '../../lib/api';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../lib/i18n';
import NavBar from '../../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Textarea, Alert, EmptyState, Spinner } from '../../components/ui';

interface Playlist {
  id: number;
  name: string;
  description: string;
  song_count: number;
  created_at: string;
  updated_at: string;
}

export default function PlaylistsPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', description: '' });

  useEffect(() => {
    getPlaylists()
      .then(setPlaylists)
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const created = await createPlaylist(form);
      setPlaylists((prev) => [created, ...prev]);
      setShowForm(false);
      setForm({ name: '', description: '' });
    } catch {
      setError(t('common.error', locale));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('music.delete_playlist_confirm', locale))) return;
    await deletePlaylist(id);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  };

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('music.playlists', locale)}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/music')}
          action={
            <Button onClick={() => setShowForm(true)}>+ {t('music.new_playlist', locale)}</Button>
          }
        />

        <Alert type="error" message={error} />

        {/* New playlist form */}
        {showForm && (
          <Card className="mb-6">
            <form onSubmit={handleCreate} className="space-y-4">
              <Input
                label={t('music.playlist_name', locale)}
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
              <Textarea
                label={t('music.playlist_description', locale)}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
              <div className="flex gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? '...' : t('common.save', locale)}
                </Button>
                <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setForm({ name: '', description: '' }); }}>
                  {t('common.cancel', locale)}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Playlist grid */}
        {playlists.length === 0 ? (
          <EmptyState icon="🎶" message={t('music.no_playlists', locale)} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {playlists.map((pl) => (
              <Card key={pl.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(`/music/playlists/${pl.id}`)}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">🎵</span>
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{pl.name}</h3>
                    </div>
                    {pl.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 mb-2">{pl.description}</p>
                    )}
                    <p className="text-xs text-gray-400">{pl.song_count} {t('music.tracks', locale)}</p>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(pl.id)}>
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
