'use client';

/**
 * Music Library — Spotify-inspired redesign.
 *
 * AI-NAV: Main music page with tabbed navigation (Library / Playlists).
 * AI-NAV: Library tab: recently played, search, filter pills, song card grid.
 * AI-NAV: Playlists tab: playlist cards, inline create form.
 * AI-NAV: Persistent MusicPlayer at bottom (mini-bar → full-screen).
 * AI-NAV: Upload via button or drag-drop zone.
 * AI-NAV: Favorites toggle, play tracking via API.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  getSongs, uploadSong, deleteSong, updateSong,
  getPlaylists, createPlaylist, deletePlaylist, addSongToPlaylist,
  getRecentlyPlayed, toggleSongFavorite, recordSongPlay,
} from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import MusicPlayer, { Track } from '../components/MusicPlayer';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Input, Textarea, EmptyState, Spinner, Alert } from '../components/ui';

// === Types ===

interface Song {
  id: number;
  title: string;
  artist: string;
  album: string;
  file: string;
  file_url: string;
  media_type: 'audio' | 'video';
  file_size: number;
  duration: number;
  is_favorite: boolean;
  play_count: number;
  last_played_at: string | null;
  color_hex: string;
  created_at: string;
}

interface Playlist {
  id: number;
  name: string;
  description: string;
  song_count: number;
  color_preview: string[];
  created_at: string;
  updated_at: string;
}

// === Helpers ===

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// === Song Card Component (defined outside to avoid re-render focus loss) ===

function SongCard({
  song, isActive, locale, onPlay, onFavorite, onAddToPlaylist, onDelete, playlists
}: {
  song: Song;
  isActive: boolean;
  locale: 'en' | 'bg';
  onPlay: () => void;
  onFavorite: () => void;
  onAddToPlaylist: (playlistId: number) => void;
  onDelete: () => void;
  playlists: Playlist[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`group relative rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-lg ${
        isActive ? 'ring-2 ring-indigo-500 shadow-lg' : ''
      }`}
      onClick={onPlay}
    >
      {/* Color gradient background */}
      <div
        className="aspect-square flex items-center justify-center relative"
        style={{ background: `linear-gradient(135deg, ${song.color_hex}, ${song.color_hex}99)` }}
      >
        {/* Play overlay on hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          {isActive ? (
            <div className="flex gap-1">
              <div className="w-1 h-5 bg-white rounded-full animate-pulse" />
              <div className="w-1 h-7 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-1 h-4 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
              <svg className="w-6 h-6 text-gray-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          )}
        </div>

        {/* Music icon */}
        <svg className="w-12 h-12 text-white/20 group-hover:text-white/10 transition-colors" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>

        {/* Video badge */}
        {song.media_type === 'video' && (
          <span className="absolute top-2 left-2 bg-black/50 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
            VIDEO
          </span>
        )}

        {/* Favorite button */}
        <button
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/30 hover:bg-black/50 transition-colors opacity-0 group-hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onFavorite(); }}
        >
          <svg
            className={`w-4 h-4 ${song.is_favorite ? 'text-red-400 fill-red-400' : 'text-white'}`}
            fill={song.is_favorite ? 'currentColor' : 'none'}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
        </button>

        {/* Context menu button */}
        <button
          className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/30 hover:bg-black/50 transition-colors opacity-0 group-hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
        >
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
          </svg>
        </button>

        {/* Context menu dropdown */}
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
            <div className="absolute bottom-10 right-2 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[160px] z-50" onClick={(e) => e.stopPropagation()}>
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => { onAddToPlaylist(pl.id); setMenuOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  + {pl.name}
                </button>
              ))}
              <hr className="my-1 border-gray-100" />
              <button
                onClick={() => { onDelete(); setMenuOpen(false); }}
                className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                {t('common.delete', locale)}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Song info */}
      <div className="p-3 bg-white">
        <p className={`text-sm font-medium truncate ${isActive ? 'text-indigo-600' : 'text-gray-900'}`}>
          {song.title}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {song.artist || t('music.unknown_artist', locale)}
        </p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-gray-400">{formatDuration(song.duration)}</span>
          {song.is_favorite && (
            <svg className="w-3 h-3 text-red-400 fill-red-400" viewBox="0 0 24 24">
              <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

// === Playlist Card Component ===

function PlaylistCard({
  playlist, locale, onClick, onDelete
}: {
  playlist: Playlist;
  locale: 'en' | 'bg';
  onClick: () => void;
  onDelete: () => void;
}) {
  const colors = playlist.color_preview.length > 0
    ? playlist.color_preview
    : ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd'];

  return (
    <div
      className="group rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-lg border border-gray-200"
      onClick={onClick}
    >
      {/* Mosaic cover from song colors */}
      <div className="aspect-square grid grid-cols-2 relative">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ background: colors[i] || colors[0] || '#6366f1' }} />
        ))}
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
            <svg className="w-6 h-6 text-gray-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      <div className="p-3 bg-white flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{playlist.name}</p>
          <p className="text-xs text-gray-500">{playlist.song_count} {t('music.tracks', locale)}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// === Main Page ===

export default function MusicPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Song[]>([]);

  // UI state
  const [tab, setTab] = useState<'library' | 'playlists'>('library');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'' | 'favorite' | 'audio' | 'video'>('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // Playlist form
  const [showPlaylistForm, setShowPlaylistForm] = useState(false);
  const [playlistForm, setPlaylistForm] = useState({ name: '', description: '' });
  const [savingPlaylist, setSavingPlaylist] = useState(false);

  // Player
  const [playerTracks, setPlayerTracks] = useState<Track[]>([]);
  const [playerIndex, setPlayerIndex] = useState(-1);
  const [videoTrack, setVideoTrack] = useState<Song | null>(null);

  // Load data
  useEffect(() => {
    Promise.all([getSongs(), getPlaylists(), getRecentlyPlayed()])
      .then(([s, p, r]) => { setSongs(s); setPlaylists(p); setRecentlyPlayed(r); })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  // === Upload ===
  const handleBulkUpload = async (files: FileList | File[]) => {
    const ACCEPTED_EXT = ['.mp3', '.mp4', '.avi', '.mkv', '.mov', '.webm', '.wmv'];
    const valid = Array.from(files).filter(f =>
      ACCEPTED_EXT.some(ext => f.name.toLowerCase().endsWith(ext)) ||
      f.type.startsWith('audio/') || f.type.startsWith('video/')
    );
    if (valid.length === 0) return;

    setUploading(true);
    setError('');
    const uploaded: Song[] = [];

    for (let i = 0; i < valid.length; i++) {
      const file = valid[i];
      setUploadProgress(`${i + 1} / ${valid.length}`);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', file.name.replace(/\.[^/.]+$/, ''));
        const created = await uploadSong(formData);
        uploaded.push(created);
      } catch { /* continue */ }
    }

    if (uploaded.length > 0) setSongs((prev) => [...uploaded, ...prev]);
    if (uploaded.length < valid.length) setError(`${valid.length - uploaded.length} file(s) failed`);
    setUploading(false);
    setUploadProgress('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleBulkUpload(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleBulkUpload(e.dataTransfer.files);
  };

  // === Actions ===
  const handleDelete = async (id: number) => {
    if (!confirm(t('music.delete_song_confirm', locale))) return;
    await deleteSong(id);
    setSongs((prev) => prev.filter((s) => s.id !== id));
  };

  const handleFavorite = async (id: number) => {
    try {
      const res = await toggleSongFavorite(id);
      setSongs((prev) => prev.map((s) => s.id === id ? { ...s, is_favorite: res.is_favorite } : s));
    } catch { /* ignore */ }
  };

  const handleAddToPlaylist = async (playlistId: number, songId: number) => {
    try { await addSongToPlaylist(playlistId, songId); } catch { /* ignore duplicates */ }
  };

  const handleRecordPlay = useCallback(async (trackId: number) => {
    try { await recordSongPlay(trackId); } catch { /* non-critical */ }
  }, []);

  const playSong = (song: Song, songList: Song[]) => {
    if (song.media_type === 'video') {
      setVideoTrack(song);
      return;
    }
    const audioList = songList.filter((s) => s.media_type === 'audio');
    const idx = audioList.findIndex((s) => s.id === song.id);
    const tracks: Track[] = audioList.map((s) => ({
      id: s.id, title: s.title, artist: s.artist, album: s.album,
      file_url: s.file_url, duration: s.duration, color_hex: s.color_hex,
    }));
    setPlayerTracks(tracks);
    setPlayerIndex(idx >= 0 ? idx : 0);
  };

  // === Playlist CRUD ===
  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistForm.name.trim()) return;
    setSavingPlaylist(true);
    try {
      const created = await createPlaylist(playlistForm);
      setPlaylists((prev) => [created, ...prev]);
      setShowPlaylistForm(false);
      setPlaylistForm({ name: '', description: '' });
    } catch { setError(t('common.error', locale)); }
    finally { setSavingPlaylist(false); }
  };

  const handleDeletePlaylist = async (id: number) => {
    if (!confirm(t('music.delete_playlist_confirm', locale))) return;
    await deletePlaylist(id);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  };

  // === Filtering ===
  const filtered = songs.filter((s) => {
    if (filter === 'favorite' && !s.is_favorite) return false;
    if (filter === 'audio' && s.media_type !== 'audio') return false;
    if (filter === 'video' && s.media_type !== 'video') return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q) || s.album.toLowerCase().includes(q);
  });

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-900">{t('music.title', locale)}</h1>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} size="sm">
            {uploading ? uploadProgress : `+ ${t('music.upload', locale)}`}
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.mp4,.avi,.mkv,.mov,.webm,.wmv,audio/*,video/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        <Alert type="error" message={error} />

        {/* Tab switcher */}
        <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
          {(['library', 'playlists'] as const).map((t_) => (
            <button
              key={t_}
              onClick={() => setTab(t_)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t_ ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t_ === 'library' ? t('music.songs', locale) : t('music.playlists', locale)}
            </button>
          ))}
        </div>

        {/* ===== LIBRARY TAB ===== */}
        {tab === 'library' && (
          <>
            {/* Recently played — horizontal scroll */}
            {recentlyPlayed.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('music.recently_played', locale)}</h2>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                  {recentlyPlayed.slice(0, 10).map((song) => (
                    <button
                      key={song.id}
                      onClick={() => playSong(song, songs)}
                      className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors shrink-0"
                    >
                      <div
                        className="w-8 h-8 rounded-md shrink-0"
                        style={{ background: song.color_hex }}
                      />
                      <div className="text-left min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate max-w-[100px]">{song.title}</p>
                        <p className="text-[10px] text-gray-500 truncate max-w-[100px]">{song.artist || ''}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Drop zone (only when no songs or dragging) */}
            {(songs.length === 0 || dragOver) && (
              <div
                className={`border-2 border-dashed rounded-xl p-8 mb-6 text-center transition-colors cursor-pointer ${
                  dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <svg className="w-10 h-10 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3v11.25" />
                </svg>
                <p className="text-sm text-gray-500">{t('music.drop_files', locale)}</p>
              </div>
            )}

            {/* Search + filter pills */}
            {songs.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <div className="relative flex-1 max-w-sm">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <input
                    type="text"
                    placeholder={t('common.search', locale)}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-10 pl-10 pr-3 text-sm text-gray-900 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex gap-1 flex-wrap">
                  {([
                    { key: '' as const, label: t('music.all_songs', locale) },
                    { key: 'favorite' as const, label: '♥' },
                    { key: 'audio' as const, label: t('music.audio', locale) },
                    { key: 'video' as const, label: t('music.video', locale) },
                  ]).map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        filter === f.key
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Song grid */}
            {filtered.length === 0 ? (
              songs.length === 0 ? (
                <EmptyState icon="🎵" message={t('music.no_songs', locale)} />
              ) : (
                <EmptyState icon="🔍" message={t('music.no_results', locale)} />
              )
            ) : (
              <div
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              >
                {filtered.map((song) => (
                  <SongCard
                    key={song.id}
                    song={song}
                    isActive={playerTracks[playerIndex]?.id === song.id}
                    locale={locale}
                    onPlay={() => playSong(song, filtered)}
                    onFavorite={() => handleFavorite(song.id)}
                    onAddToPlaylist={(plId) => handleAddToPlaylist(plId, song.id)}
                    onDelete={() => handleDelete(song.id)}
                    playlists={playlists}
                  />
                ))}
              </div>
            )}

            {/* Stats bar */}
            {songs.length > 0 && (
              <div className="mt-5 flex gap-3 flex-wrap">
                <Badge color="indigo">{songs.length} {t('music.tracks', locale)}</Badge>
                <Badge color="gray">{formatFileSize(songs.reduce((sum, s) => sum + s.file_size, 0))}</Badge>
                {songs.filter(s => s.is_favorite).length > 0 && (
                  <Badge color="red">♥ {songs.filter(s => s.is_favorite).length}</Badge>
                )}
              </div>
            )}
          </>
        )}

        {/* ===== PLAYLISTS TAB ===== */}
        {tab === 'playlists' && (
          <>
            {/* Create form */}
            {showPlaylistForm ? (
              <Card className="mb-6">
                <form onSubmit={handleCreatePlaylist} className="space-y-4">
                  <Input
                    label={t('music.playlist_name', locale)}
                    value={playlistForm.name}
                    onChange={(e) => setPlaylistForm((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                  <Textarea
                    label={t('music.playlist_description', locale)}
                    value={playlistForm.description}
                    onChange={(e) => setPlaylistForm((prev) => ({ ...prev, description: e.target.value }))}
                    rows={2}
                  />
                  <div className="flex gap-3">
                    <Button type="submit" disabled={savingPlaylist}>{savingPlaylist ? '...' : t('common.save', locale)}</Button>
                    <Button type="button" variant="secondary" onClick={() => { setShowPlaylistForm(false); setPlaylistForm({ name: '', description: '' }); }}>
                      {t('common.cancel', locale)}
                    </Button>
                  </div>
                </form>
              </Card>
            ) : (
              <Button onClick={() => setShowPlaylistForm(true)} className="mb-6">
                + {t('music.new_playlist', locale)}
              </Button>
            )}

            {/* Playlist grid */}
            {playlists.length === 0 ? (
              <EmptyState icon="🎶" message={t('music.no_playlists', locale)} />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {playlists.map((pl) => (
                  <PlaylistCard
                    key={pl.id}
                    playlist={pl}
                    locale={locale}
                    onClick={() => router.push(`/music/playlists/${pl.id}`)}
                    onDelete={() => handleDeletePlaylist(pl.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Spacer for player */}
        {playerIndex >= 0 && <div className="h-20" />}
      </PageContent>

      {/* Video player modal */}
      {videoTrack && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={() => setVideoTrack(null)}>
          <div className="bg-black rounded-xl overflow-hidden max-w-4xl w-full max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 bg-gray-900">
              <h3 className="text-sm font-medium text-white truncate">{videoTrack.title}</h3>
              <button onClick={() => setVideoTrack(null)} className="text-gray-400 hover:text-white p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <video src={videoTrack.file_url} controls autoPlay className="w-full max-h-[calc(90vh-48px)]" style={{ objectFit: 'contain' }} />
          </div>
        </div>
      )}

      {/* Persistent audio player */}
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
