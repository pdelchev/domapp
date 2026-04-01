'use client';

/**
 * MusicPlayer — Spotify-style persistent audio player.
 *
 * AI-NAV: Two modes: mini-bar (fixed bottom) and full-screen (overlay).
 * AI-NAV: Mini-bar shows track info + play/pause + progress line.
 * AI-NAV: Tap mini-bar → expand to full-screen with all controls.
 * AI-NAV: Full-screen: gradient background, large controls, queue, sleep timer.
 * AI-NAV: Media Session API for lock screen / notification controls.
 * AI-NAV: onPlay callback fires to parent for play tracking API call.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';

export interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  file_url: string;
  duration: number;
  color_hex?: string;
}

interface MusicPlayerProps {
  tracks: Track[];
  initialIndex?: number;
  onTrackChange?: (index: number) => void;
  onPlay?: (trackId: number) => void;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MusicPlayer({ tracks, initialIndex = 0, onTrackChange, onPlay }: MusicPlayerProps) {
  const { locale } = useLanguage();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<'off' | 'all' | 'one'>('off');
  const [volume, setVolume] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const playReportedRef = useRef<number | null>(null);

  const current = tracks[currentIndex];
  const gradientColor = current?.color_hex || '#6366f1';

  // Update index when initialIndex prop changes
  useEffect(() => {
    if (initialIndex >= 0 && initialIndex < tracks.length) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, tracks.length]);

  // Media Session API — lock screen controls
  useEffect(() => {
    if (!current || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist || t('music.unknown_artist', locale),
      album: current.album || '',
    });
    navigator.mediaSession.setActionHandler('play', () => audioRef.current?.play());
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
    navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, locale]);

  // Play when track changes
  useEffect(() => {
    if (!audioRef.current || !current) return;
    audioRef.current.load();
    if (isPlaying) {
      audioRef.current.play().catch(() => {});
    }
    onTrackChange?.(currentIndex);
    // Report play to parent (for API tracking)
    if (current.id !== playReportedRef.current) {
      playReportedRef.current = current.id;
      onPlay?.(current.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, current?.id]);

  // Sleep timer effect
  useEffect(() => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    if (sleepTimer && sleepTimer > 0) {
      sleepTimerRef.current = setTimeout(() => {
        audioRef.current?.pause();
        setSleepTimer(null);
      }, sleepTimer * 60 * 1000);
    }
    return () => { if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current); };
  }, [sleepTimer]);

  const togglePlay = useCallback(async () => {
    if (!audioRef.current || !current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      await audioRef.current.play().catch(() => {});
      // Report play on first play action
      if (current.id !== playReportedRef.current) {
        playReportedRef.current = current.id;
        onPlay?.(current.id);
      }
    }
  }, [isPlaying, current, onPlay]);

  const playNext = useCallback(() => {
    if (tracks.length === 0) return;
    if (shuffle) {
      let next = Math.floor(Math.random() * tracks.length);
      if (next === currentIndex && tracks.length > 1) next = (next + 1) % tracks.length;
      setCurrentIndex(next);
    } else {
      setCurrentIndex((prev) => (prev + 1) % tracks.length);
    }
  }, [tracks.length, shuffle, currentIndex]);

  const playPrev = useCallback(() => {
    if (tracks.length === 0) return;
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
    } else {
      setCurrentIndex((prev) => (prev - 1 + tracks.length) % tracks.length);
    }
  }, [tracks.length]);

  const handleEnded = useCallback(() => {
    if (repeat === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    } else if (repeat === 'all' || currentIndex < tracks.length - 1) {
      playNext();
    } else {
      setIsPlaying(false);
    }
  }, [repeat, currentIndex, tracks.length, playNext]);

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!current || tracks.length === 0) return null;

  return (
    <>
      <audio
        ref={audioRef}
        src={current.file_url}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onDurationChange={() => setDuration(audioRef.current?.duration || 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
        preload="auto"
      />

      {/* ===== FULL-SCREEN NOW PLAYING ===== */}
      {expanded && (
        <div
          className="fixed inset-0 z-[70] flex flex-col"
          style={{ background: `linear-gradient(180deg, ${gradientColor} 0%, #111827 60%)` }}
        >
          {/* Top bar — close button */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <button onClick={() => setExpanded(false)} className="p-2 text-white/70 hover:text-white">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <p className="text-xs text-white/50 font-medium uppercase tracking-wider">{t('music.now_playing', locale)}</p>
            <div className="w-10" />
          </div>

          {/* Album art area — gradient circle */}
          <div className="flex-1 flex items-center justify-center px-8">
            <div
              className="w-64 h-64 sm:w-72 sm:h-72 rounded-2xl shadow-2xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${gradientColor}, ${gradientColor}88)` }}
            >
              <svg className="w-20 h-20 text-white/30" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          </div>

          {/* Track info */}
          <div className="px-8 mb-4">
            <h2 className="text-xl font-bold text-white truncate">{current.title}</h2>
            <p className="text-sm text-white/60 truncate">{current.artist || t('music.unknown_artist', locale)}</p>
          </div>

          {/* Progress bar */}
          <div className="px-8 mb-2">
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={currentTime}
              onChange={seek}
              className="w-full h-1 accent-white cursor-pointer"
            />
            <div className="flex justify-between mt-1">
              <span className="text-xs text-white/50">{formatTime(currentTime)}</span>
              <span className="text-xs text-white/50">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Main controls */}
          <div className="flex items-center justify-center gap-6 mb-6">
            <button
              onClick={() => setShuffle(!shuffle)}
              className={`p-2 rounded-full transition-colors ${shuffle ? 'text-white bg-white/20' : 'text-white/40 hover:text-white/70'}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            </button>

            <button onClick={playPrev} className="p-2 text-white hover:text-white/80">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            <button onClick={togglePlay} className="p-4 rounded-full bg-white text-gray-900 hover:scale-105 transition-transform">
              {isPlaying ? (
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                </svg>
              ) : (
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button onClick={playNext} className="p-2 text-white hover:text-white/80">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>

            <button
              onClick={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}
              className={`p-2 rounded-full transition-colors relative ${repeat !== 'off' ? 'text-white bg-white/20' : 'text-white/40 hover:text-white/70'}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              {repeat === 'one' && <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold text-white bg-white/30 rounded-full w-4 h-4 flex items-center justify-center">1</span>}
            </button>
          </div>

          {/* Bottom controls — volume + sleep timer */}
          <div className="flex items-center justify-between px-8 pb-8 safe-bottom-player">
            {/* Volume */}
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
              <input
                type="range"
                min={0} max={1} step={0.05}
                value={volume}
                onChange={(e) => { const v = Number(e.target.value); setVolume(v); if (audioRef.current) audioRef.current.volume = v; }}
                className="w-24 h-1 accent-white cursor-pointer"
              />
            </div>

            {/* Sleep timer */}
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <select
                value={sleepTimer || ''}
                onChange={(e) => setSleepTimer(e.target.value ? Number(e.target.value) : null)}
                className="bg-white/10 text-white/70 text-xs rounded-lg px-2 py-1 border border-white/10"
              >
                <option value="">{t('music.sleep_off', locale)}</option>
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="60">1 hr</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ===== MINI PLAYER BAR ===== */}
      {!expanded && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-[55] safe-bottom-player">
          {/* Progress line at top of mini player */}
          <div className="h-0.5 bg-gray-100">
            <div
              className="h-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div
            className="max-w-6xl mx-auto flex items-center gap-3 px-4 py-2 cursor-pointer"
            onClick={() => setExpanded(true)}
          >
            {/* Color dot + track info */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: gradientColor }}
              >
                <svg className="w-5 h-5 text-white/60" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{current.title}</p>
                <p className="text-xs text-gray-500 truncate">{current.artist || t('music.unknown_artist', locale)}</p>
              </div>
            </div>

            {/* Play/pause + next — stop propagation to not expand */}
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button onClick={togglePlay} className="p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                {isPlaying ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <button onClick={playNext} className="p-2 text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
