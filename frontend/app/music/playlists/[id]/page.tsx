'use client';

/**
 * Playlist Detail — Spotify-style with gradient header.
 *
 * AI-NAV: Gradient header using playlist color_preview.
 * AI-NAV: Track list with play indicator, remove button.
 * AI-NAV: Add songs panel with available songs.
 * AI-NAV: Inline edit for playlist name/description.
 */

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { getPlaylist, updatePlaylist, getSongs, addSongToPlaylist, removeSongFromPlaylist, recordSongPlay } from '../../../lib/api';
import { useLanguage } from '../../../context/LanguageContext';
import { t } from '../../../lib/i18n';
import NavBar from '../../../components/NavBar';
import MusicPlayer, { Track } from '../../../components/MusicPlayer';
import { PageShell, PageContent, Card, Button, Input, Textarea, Alert, EmptyState, Spinner } from '../../../components/ui';

interface Song {
  id: number;
  title: string;
  artist: string;
  album: string;
  file_url: string;
  duration: number;
  color_hex?: string;
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
  color_preview: string[];
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
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', description: '' });
  const [showAddSongs, setShowAddSongs] = useState(false);
  const [searchAdd, setSearchAdd] = useState('');
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
    } catch { setError(t('common.error', locale)); }
    finally { setSaving(false); }
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

  const handleRecordPlay = async (trackId: number) => {
    try { await recordSongPlay(trackId); } catch { /* non-critical */ }
  };

  const playPlaylist = (startIndex: number = 0) => {
    if (!playlist?.tracks) return;
    const tracks: Track[] = playlist.tracks.map((pt) => ({
      id: pt.song.id, title: pt.song.title, artist: pt.song.artist,
      album: pt.song.album, file_url: pt.song.file_url, duration: pt.song.duration,
      color_hex: pt.song.color_hex,
    }));
    setPlayerTracks(tracks);
    setPlayerIndex(startIndex);
  };

  const trackIds = new Set(playlist?.tracks?.map((pt) => pt.song.id) || []);
  const availableSongs = allSongs.filter((s) => {
    if (trackIds.has(s.id)) return false;
    if (!searchAdd) return true;
    const q = searchAdd.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q);
  });

  const gradientColor = playlist?.color_preview?.[0] || '#6366f1';

  if (loading) return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  if (!playlist) return <PageShell><NavBar /><EmptyState icon="🎵" message={t('common.no_data', locale)} /></PageShell>;

  return (
    <PageShell>
      <NavBar />

      {/* Gradient header */}
      <div
        className="px-4 sm:px-6 lg:px-8 pt-6 pb-8"
        style={{ background: `linear-gradient(180deg, ${gradientColor}40 0%, transparent 100%)` }}
      >
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => router.push('/music')}
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {t('common.back', locale)}
          </button>

          <div className="flex items-end gap-4">
            {/* Playlist cover mosaic */}
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl shadow-lg overflow-hidden grid grid-cols-2 shrink-0">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ background: playlist.color_preview?.[i] || gradientColor }} />
              ))}
            </div>

            <div className="min-w-0 flex-1">
              {editing ? (
                <form onSubmit={handleSave} className="space-y-2">
                  <input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="text-xl font-bold text-gray-900 bg-transparent border-b-2 border-indigo-500 outline-none w-full"
                    required
                  />
                  <input
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder={t('music.playlist_description', locale)}
                    className="text-sm text-gray-600 bg-transparent border-b border-gray-300 outline-none w-full"
                  />
                  <div className="flex gap-2 pt-1">
                    <Button type="submit" size="sm" disabled={saving}>{t('common.save', locale)}</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>{t('common.cancel', locale)}</Button>
                  </div>
                </form>
              ) : (
                <>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{playlist.name}</h1>
                  {playlist.description && <p className="text-sm text-gray-600 truncate mt-0.5">{playlist.description}</p>}
                  <p className="text-xs text-gray-500 mt-1">{playlist.song_count} {t('music.tracks', locale)}</p>
                </>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 mt-4">
            {playlist.tracks && playlist.tracks.length > 0 && (
              <button
                onClick={() => playPlaylist(0)}
                className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105"
              >
                <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            )}
            {!editing && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                {t('common.edit', locale)}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowAddSongs(!showAddSongs)}>
              + {t('music.add_to_playlist', locale)}
            </Button>
          </div>
        </div>
      </div>

      <PageContent size="lg">
        <Alert type="error" message={error} />

        {/* Add songs panel */}
        {showAddSongs && (
          <Card className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">{t('music.add_to_playlist', locale)}</h3>
              <button onClick={() => setShowAddSongs(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <input
              type="text"
              placeholder={t('common.search', locale)}
              value={searchAdd}
              onChange={(e) => setSearchAdd(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {availableSongs.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">{t('music.no_songs', locale)}</p>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                {availableSongs.slice(0, 50).map((song) => (
                  <div key={song.id} className="flex items-center justify-between py-2 hover:bg-gray-50 rounded-lg px-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-md shrink-0" style={{ background: song.color_hex || '#6366f1' }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{song.title}</p>
                        <p className="text-xs text-gray-500">{song.artist || ''}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => handleAddSong(song.id)}>+</Button>
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
          <div className="space-y-1">
            {playlist.tracks.map((pt, i) => {
              const isActive = playerTracks[playerIndex]?.id === pt.song.id;
              return (
                <div
                  key={pt.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    isActive ? 'bg-indigo-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => playPlaylist(i)}
                >
                  {/* Track number / playing indicator */}
                  <div className="w-6 text-center shrink-0">
                    {isActive ? (
                      <div className="flex gap-0.5 justify-center">
                        <div className="w-0.5 h-3 bg-indigo-600 rounded-full animate-pulse" />
                        <div className="w-0.5 h-4 bg-indigo-600 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                        <div className="w-0.5 h-2 bg-indigo-600 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">{i + 1}</span>
                    )}
                  </div>

                  {/* Song color dot */}
                  <div
                    className="w-8 h-8 rounded-md shrink-0"
                    style={{ background: pt.song.color_hex || '#6366f1' }}
                  />

                  {/* Song info */}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-indigo-600' : 'text-gray-900'}`}>
                      {pt.song.title}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{pt.song.artist || ''}</p>
                  </div>

                  {/* Duration */}
                  <span className="text-xs text-gray-400 hidden sm:block">{formatDuration(pt.song.duration)}</span>

                  {/* Remove button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveSong(pt.song.id); }}
                    className="p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    title={t('music.remove_from_playlist', locale)}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Spacer for player */}
        {playerIndex >= 0 && <div className="h-20" />}
      </PageContent>

      {/* Persistent player */}
      {playerIndex >= 0 && (
        <MusicPlayer
          tracks={playerTracks}
          initialIndex={playerIndex}
          onTrackChange={setPlayerIndex}
          onPlay={handleRecordPlay}
        />
      )}
    </PageShell>
  );
}
