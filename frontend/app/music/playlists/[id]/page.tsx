'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { getPlaylist, updatePlaylist, getSongs, addSongToPlaylist, removeSongFromPlaylist } from '../../../lib/api';
import { useLanguage } from '../../../context/LanguageContext';
import { t } from '../../../lib/i18n';
import NavBar from '../../../components/NavBar';
import MusicPlayer, { Track } from '../../../components/MusicPlayer';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Textarea, Alert, EmptyState, Spinner } from '../../../components/ui';

interface Song {
  id: number;
  title: string;
  artist: string;
  album: string;
  file_url: string;
  duration: number;
}

interface PlaylistTrack {
  id: number;
  song: Song;
  position: number;
}

interface Playlist {
  id: number;
  name: string;
  description: string;
  song_count: number;
  tracks: PlaylistTrack[] | null;
}

interface AllSong {
  id: number;
  title: string;
  artist: string;
  album: string;
  file_url: string;
  duration: number;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PlaylistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { locale } = useLanguage();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [allSongs, setAllSongs] = useState<AllSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', description: '' });
  const [showAddSongs, setShowAddSongs] = useState(false);
  const [playerTracks, setPlayerTracks] = useState<Track[]>([]);
  const [playerIndex, setPlayerIndex] = useState(-1);

  const loadPlaylist = async () => {
    try {
      const pl = await getPlaylist(Number(id));
      setPlaylist(pl);
      setForm({ name: pl.name, description: pl.description });
    } catch {
      router.push('/login');
    }
  };

  useEffect(() => {
    Promise.all([getPlaylist(Number(id)), getSongs()])
      .then(([pl, songs]) => {
        setPlaylist(pl);
        setForm({ name: pl.name, description: pl.description });
        setAllSongs(songs);
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [id, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const updated = await updatePlaylist(Number(id), form);
      setPlaylist((prev) => prev ? { ...prev, ...updated } : prev);
      setEditing(false);
    } catch {
      setError(t('common.error', locale));
    } finally {
      setSaving(false);
    }
  };

  const handleAddSong = async (songId: number) => {
    try {
      await addSongToPlaylist(Number(id), songId);
      await loadPlaylist();
    } catch { /* ignore duplicates */ }
  };

  const handleRemoveSong = async (songId: number) => {
    try {
      await removeSongFromPlaylist(Number(id), songId);
      await loadPlaylist();
    } catch { /* ignore */ }
  };

  const playPlaylist = (startIndex: number = 0) => {
    if (!playlist?.tracks) return;
    const tracks: Track[] = playlist.tracks.map((pt) => ({
      id: pt.song.id,
      title: pt.song.title,
      artist: pt.song.artist,
      album: pt.song.album,
      file_url: pt.song.file_url,
      duration: pt.song.duration,
    }));
    setPlayerTracks(tracks);
    setPlayerIndex(startIndex);
  };

  const trackIds = new Set(playlist?.tracks?.map((pt) => pt.song.id) || []);
  const availableSongs = allSongs.filter((s) => !trackIds.has(s.id));

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  if (!playlist) {
    return <PageShell><NavBar /><EmptyState icon="🎵" message={t('common.no_data', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={playlist.name}
          backLabel={t('common.back', locale)}
          onBack={() => router.push('/music/playlists')}
          action={
            <div className="flex gap-2">
              {playlist.tracks && playlist.tracks.length > 0 && (
                <Button onClick={() => playPlaylist(0)}>
                  ▶ {t('music.play', locale)}
                </Button>
              )}
              <Button variant="secondary" onClick={() => setShowAddSongs(!showAddSongs)}>
                + {t('music.add_to_playlist', locale)}
              </Button>
            </div>
          }
        />

        <Alert type="error" message={error} />

        {/* Edit name/description */}
        {editing ? (
          <Card className="mb-6">
            <form onSubmit={handleSave} className="space-y-4">
              <Input label={t('music.playlist_name', locale)} value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
              <Textarea label={t('music.playlist_description', locale)} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} rows={2} />
              <div className="flex gap-3">
                <Button type="submit" disabled={saving}>{saving ? '...' : t('common.save', locale)}</Button>
                <Button type="button" variant="secondary" onClick={() => setEditing(false)}>{t('common.cancel', locale)}</Button>
              </div>
            </form>
          </Card>
        ) : (
          <div className="mb-6 flex items-center gap-3">
            {playlist.description && <p className="text-sm text-gray-500">{playlist.description}</p>}
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>{t('common.edit', locale)}</Button>
          </div>
        )}

        {/* Add songs panel */}
        {showAddSongs && (
          <Card className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('music.add_to_playlist', locale)}</h3>
            {availableSongs.length === 0 ? (
              <p className="text-sm text-gray-500">{t('music.no_songs', locale)}</p>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                {availableSongs.map((song) => (
                  <div key={song.id} className="flex items-center justify-between py-2 px-1 hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{song.title}</p>
                      <p className="text-xs text-gray-500">{song.artist || t('music.unknown_artist', locale)}</p>
                    </div>
                    <Button size="sm" onClick={() => handleAddSong(song.id)}>+</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Track list */}
        {!playlist.tracks || playlist.tracks.length === 0 ? (
          <EmptyState icon="🎵" message={t('music.no_songs', locale)} />
        ) : (
          <Card padding={false}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-10">#</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('music.song_title', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('music.artist', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell text-right">{t('music.duration', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('common.actions', locale)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {playlist.tracks.map((pt, i) => {
                  const isActive = playerTracks[playerIndex]?.id === pt.song.id;
                  return (
                    <tr
                      key={pt.id}
                      className={`hover:bg-gray-50 cursor-pointer ${isActive ? 'bg-indigo-50' : ''}`}
                      onClick={() => playPlaylist(i)}
                    >
                      <td className="px-5 py-3 text-sm text-gray-400">
                        {isActive ? <span className="text-indigo-600 font-medium">▶</span> : i + 1}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-sm font-medium ${isActive ? 'text-indigo-600' : 'text-gray-900'}`}>{pt.song.title}</span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">{pt.song.artist || '—'}</td>
                      <td className="px-5 py-3 text-sm text-gray-500 hidden sm:table-cell text-right">{formatDuration(pt.song.duration)}</td>
                      <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="danger" size="sm" onClick={() => handleRemoveSong(pt.song.id)}>
                          {t('music.remove_from_playlist', locale)}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

        {/* Spacer for player */}
        {playerIndex >= 0 && <div className="h-24" />}
      </PageContent>

      {/* Persistent player */}
      {playerIndex >= 0 && (
        <MusicPlayer
          tracks={playerTracks}
          initialIndex={playerIndex}
          onTrackChange={setPlayerIndex}
        />
      )}
    </PageShell>
  );
}
