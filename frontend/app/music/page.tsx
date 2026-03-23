'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSongs, uploadSong, deleteSong, getPlaylists, addSongToPlaylist } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import MusicPlayer, { Track } from '../components/MusicPlayer';
import { PageShell, PageContent, PageHeader, Card, Button, Badge, Input, EmptyState, Spinner, Alert } from '../components/ui';

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
  created_at: string;
}

interface PlaylistRef {
  id: number;
  name: string;
}

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

export default function MusicPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistRef[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');
  const [playerTracks, setPlayerTracks] = useState<Track[]>([]);
  const [playerIndex, setPlayerIndex] = useState(-1);
  const [addToPlaylistSongId, setAddToPlaylistSongId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [videoTrack, setVideoTrack] = useState<Song | null>(null);
  const [mediaFilter, setMediaFilter] = useState<'' | 'audio' | 'video'>('');

  useEffect(() => {
    Promise.all([getSongs(), getPlaylists()])
      .then(([s, p]) => { setSongs(s); setPlaylists(p); })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const handleBulkUpload = async (files: FileList | File[]) => {
    const ACCEPTED_EXT = ['.mp3', '.mp4', '.avi', '.mkv', '.mov', '.webm', '.wmv'];
    const mp3Files = Array.from(files).filter(f =>
      ACCEPTED_EXT.some(ext => f.name.toLowerCase().endsWith(ext)) ||
      f.type.startsWith('audio/') || f.type.startsWith('video/')
    );
    if (mp3Files.length === 0) return;

    setUploading(true);
    setError('');
    const uploaded: Song[] = [];

    for (let i = 0; i < mp3Files.length; i++) {
      const file = mp3Files[i];
      setUploadProgress(`${i + 1} / ${mp3Files.length}`);
      try {
        const formData = new FormData();
        formData.append('file', file);
        // Derive title from filename
        const title = file.name.replace(/\.mp3$/i, '');
        formData.append('title', title);
        const created = await uploadSong(formData);
        uploaded.push(created);
      } catch {
        // Continue with remaining files
      }
    }

    if (uploaded.length > 0) {
      setSongs((prev) => [...uploaded, ...prev]);
    }
    if (uploaded.length < mp3Files.length) {
      setError(`${mp3Files.length - uploaded.length} file(s) failed to upload`);
    }
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
    if (e.dataTransfer.files.length > 0) {
      handleBulkUpload(e.dataTransfer.files);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('music.delete_song_confirm', locale))) return;
    await deleteSong(id);
    setSongs((prev) => prev.filter((s) => s.id !== id));
  };

  const playSong = (index: number) => {
    const song = filtered[index];
    if (song.media_type === 'video') {
      setVideoTrack(song);
      return;
    }
    // Build audio-only track list for player
    const audioFiltered = filtered.filter((s) => s.media_type === 'audio');
    const audioIndex = audioFiltered.findIndex((s) => s.id === song.id);
    const tracks: Track[] = audioFiltered.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      album: s.album,
      file_url: s.file_url,
      duration: s.duration,
    }));
    setPlayerTracks(tracks);
    setPlayerIndex(audioIndex >= 0 ? audioIndex : 0);
  };

  const handleAddToPlaylist = async (playlistId: number) => {
    if (!addToPlaylistSongId) return;
    try {
      await addSongToPlaylist(playlistId, addToPlaylistSongId);
    } catch { /* ignore duplicates */ }
    setAddToPlaylistSongId(null);
  };

  const filtered = songs.filter((s) => {
    if (mediaFilter && s.media_type !== mediaFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return s.title.toLowerCase().includes(q) ||
           s.artist.toLowerCase().includes(q) ||
           s.album.toLowerCase().includes(q);
  });

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <PageHeader
          title={t('music.title', locale)}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => router.push('/music/playlists')}>
                {t('music.playlists', locale)}
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? uploadProgress : `+ ${t('music.upload', locale)}`}
              </Button>
            </div>
          }
        />

        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.mp4,.avi,.mkv,.mov,.webm,.wmv,audio/*,video/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        <Alert type="error" message={error} />

        {/* Drag & Drop zone */}
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
          {uploading && (
            <p className="text-sm text-indigo-600 mt-2 font-medium">
              {t('common.loading', locale)} {uploadProgress}
            </p>
          )}
        </div>

        {/* Search + Filter */}
        {songs.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <Input
              placeholder={t('common.search', locale)}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <div className="flex gap-1">
              {(['', 'audio', 'video'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setMediaFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    mediaFilter === f ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {f === '' ? t('music.all_songs', locale) : f === 'audio' ? '🎵 Audio' : '🎬 Video'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Song list */}
        {filtered.length === 0 ? (
          <EmptyState icon="🎵" message={t('music.no_songs', locale)} />
        ) : (
          <Card padding={false}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-10">#</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('music.song_title', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('music.artist', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">{t('music.album', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell text-right">{t('music.duration', locale)}</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('common.actions', locale)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((song, i) => {
                  const isActive = playerTracks[playerIndex]?.id === song.id;
                  return (
                    <tr
                      key={song.id}
                      className={`hover:bg-gray-50 cursor-pointer ${isActive ? 'bg-indigo-50' : ''}`}
                      onClick={() => playSong(i)}
                    >
                      <td className="px-5 py-3 text-sm text-gray-400">
                        {isActive ? (
                          <span className="text-indigo-600 font-medium">▶</span>
                        ) : (
                          i + 1
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${isActive ? 'text-indigo-600' : 'text-gray-900'}`}>{song.title}</span>
                          {song.media_type === 'video' && <Badge color="purple">🎬</Badge>}
                        </div>
                        <span className="text-xs text-gray-400 md:hidden">{song.artist || ''}</span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">{song.artist || '—'}</td>
                      <td className="px-5 py-3 text-sm text-gray-500 hidden lg:table-cell">{song.album || '—'}</td>
                      <td className="px-5 py-3 text-sm text-gray-500 hidden sm:table-cell text-right">{formatDuration(song.duration)}</td>
                      <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {playlists.length > 0 && (
                            <div className="relative">
                              <Button variant="ghost" size="sm" onClick={() => setAddToPlaylistSongId(addToPlaylistSongId === song.id ? null : song.id)}>
                                +
                              </Button>
                              {addToPlaylistSongId === song.id && (
                                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px] z-50">
                                  {playlists.map((pl) => (
                                    <button
                                      key={pl.id}
                                      onClick={() => handleAddToPlaylist(pl.id)}
                                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                      {pl.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <Button variant="danger" size="sm" onClick={() => handleDelete(song.id)}>
                            {t('common.delete', locale)}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

        {/* Summary */}
        {songs.length > 0 && (
          <div className="mt-4 flex gap-4">
            <Badge color="indigo">{songs.length} {t('music.tracks', locale)}</Badge>
            <Badge color="gray">{formatFileSize(songs.reduce((sum, s) => sum + s.file_size, 0))}</Badge>
          </div>
        )}

        {/* Spacer for player */}
        {playerIndex >= 0 && <div className="h-24" />}
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
            <video
              src={videoTrack.file_url}
              controls
              autoPlay
              className="w-full max-h-[calc(90vh-48px)]"
              style={{ objectFit: 'contain' }}
            />
          </div>
        </div>
      )}

      {/* Persistent audio player */}
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
