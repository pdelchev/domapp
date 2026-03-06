'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Locale } from '../lib/i18n';

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  locale: 'en',
  setLocale: () => {},
});

const LOCALE_KEY = 'domapp_locale';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [initialized, setInitialized] = useState(false);

  // On mount: restore from localStorage or detect from IP
  useEffect(() => {
    const saved = localStorage.getItem(LOCALE_KEY) as Locale | null;
    if (saved === 'en' || saved === 'bg') {
      setLocaleState(saved);
      setInitialized(true);
    } else {
      // No saved preference — detect country from IP
      fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) })
        .then((res) => res.json())
        .then((data) => {
          const detected: Locale = data.country_code === 'BG' ? 'bg' : 'en';
          setLocaleState(detected);
          localStorage.setItem(LOCALE_KEY, detected);
        })
        .catch(() => {
          // Fallback to English on error/timeout
          localStorage.setItem(LOCALE_KEY, 'en');
        })
        .finally(() => setInitialized(true));
    }

    // PWA service worker registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // Persist locale changes to localStorage
  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(LOCALE_KEY, newLocale);
  };

  // Avoid flash of wrong language — render children only after init
  if (!initialized) {
    return null;
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
