'use client';

import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallBanner() {
  const { locale } = useLanguage();
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Don't show if already installed as PWA
    const isStandalone =
      ('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone) ||
      window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    // Only show on mobile
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) return;

    // Detect iOS (no beforeinstallprompt support)
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    setIsIOS(ios);

    if (ios) {
      // iOS Safari — show instructions banner
      const isSafari = /Safari/i.test(navigator.userAgent) && !/CriOS|FxiOS|OPiOS/i.test(navigator.userAgent);
      if (isSafari) {
        setShow(true);
      }
    } else {
      // Android/Chrome — listen for beforeinstallprompt
      const handler = (e: Event) => {
        e.preventDefault();
        deferredPrompt.current = e as BeforeInstallPromptEvent;
        setShow(true);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === 'accepted') {
      setShow(false);
    }
    deferredPrompt.current = null;
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[70] safe-bottom bg-indigo-600 text-white px-4 py-3 shadow-lg">
      <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{t('pwa.install_title', locale)}</p>
          {isIOS ? (
            <p className="text-xs text-indigo-200 mt-0.5 flex items-center flex-wrap gap-1">
              <span>{locale === 'bg' ? 'Натисни' : 'Tap'}</span>
              <svg className="w-4 h-4 inline shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span>{locale === 'bg' ? 'и после "Към Начален екран"' : 'then "Add to Home Screen"'}</span>
            </p>
          ) : (
            <p className="text-xs text-indigo-200 mt-0.5">{t('pwa.install_desc', locale)}</p>
          )}
        </div>
        {!isIOS && (
          <button
            onClick={handleInstall}
            className="shrink-0 px-4 py-1.5 bg-white text-indigo-700 text-sm font-semibold rounded-lg hover:bg-indigo-50 transition-colors"
          >
            {t('pwa.install_button', locale)}
          </button>
        )}
        <button
          onClick={() => setShow(false)}
          className="shrink-0 p-1 text-indigo-200 hover:text-white transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
