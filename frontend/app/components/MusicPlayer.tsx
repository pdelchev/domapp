'use client';

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
}

interface MusicPlayerProps {
  tracks: Track[];
  initialIndex?: number;
  onTrackChange?: (index: number) => void;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MusicPlayer({ tracks, initialIndex = 0, onTrackChange }: MusicPlayerProps) {
  const { locale } = useLanguage();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<'off' | 'all' | 'one'>('off');
  const [volume, setVolume] = useState(1);

  const current = tracks[currentIndex];

  // Update index when initialIndex changes
  useEffect(() => {
    if (initialIndex >= 0 && initialIndex < tracks.length) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, tracks.length]);

  // Set up Media Session API for lock screen / notification controls
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, current?.id]);

  const togglePlay = useCallback(async () => {
    if (!audioRef.current || !current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      await audioRef.current.play().catch(() => {});
    }
  }, [isPlaying, current]);

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

  if (!current || tracks.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-[55] px-4 py-2 safe-bottom-player">
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

      <div className="max-w-6xl mx-auto flex items-center gap-3">
        {/* Track info */}
        <div className="min-w-0 flex-1 max-w-[200px] sm:max-w-[280px]">
          <p className="text-sm font-medium text-gray-900 truncate">{current.title}</p>
          <p className="text-xs text-gray-500 truncate">{current.artist || t('music.unknown_artist', locale)}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Shuffle */}
          <button
            onClick={() => setShuffle(!shuffle)}
            className={`p-1.5 rounded-lg transition-colors hidden sm:block ${shuffle ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-gray-600'}`}
            title={t('music.shuffle', locale)}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </button>

          {/* Previous */}
          <button onClick={playPrev} className="p-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
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

          {/* Next */}
          <button onClick={playNext} className="p-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>

          {/* Repeat */}
          <button
            onClick={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}
            className={`p-1.5 rounded-lg transition-colors hidden sm:block ${repeat !== 'off' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-gray-600'}`}
            title={t('music.repeat', locale)}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            {repeat === 'one' && <span className="absolute text-[8px] font-bold">1</span>}
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex-1 flex items-center gap-2 min-w-0 hidden sm:flex">
          <span className="text-xs text-gray-500 w-10 text-right">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={seek}
            className="flex-1 h-1 accent-indigo-600 cursor-pointer"
          />
          <span className="text-xs text-gray-500 w-10">{formatTime(duration)}</span>
        </div>

        {/* Volume */}
        <div className="hidden lg:flex items-center gap-1">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              if (audioRef.current) audioRef.current.volume = v;
            }}
            className="w-20 h-1 accent-indigo-600 cursor-pointer"
          />
        </div>
      </div>

      {/* Mobile progress bar */}
      <div className="sm:hidden mt-1">
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={seek}
          className="w-full h-1 accent-indigo-600 cursor-pointer"
        />
        <div className="flex justify-between">
          <span className="text-[10px] text-gray-400">{formatTime(currentTime)}</span>
          <span className="text-[10px] text-gray-400">{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
