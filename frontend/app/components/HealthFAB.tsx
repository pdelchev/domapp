'use client';

/**
 * §COMPONENT: Health FAB — floating speed-dial for quick health actions.
 * §UPDATED: Now uses unified daily tracking routes (no more ritual).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';

const ACTIONS = [
  { key: 'checkin', icon: '✅', label: 'Daily Check-In', color: 'bg-indigo-500', href: '/health/checkin' },
  { key: 'supplements', icon: '💊', label: 'My Supplements', color: 'bg-purple-500', href: '/health/supplements' },
  { key: 'timeline', icon: '📊', label: 'Timeline', color: 'bg-blue-500', href: '/health/timeline' },
  { key: 'bp', icon: '❤️', label: 'Blood Pressure', color: 'bg-rose-500', href: '/health/bp' },
] as const;

export default function HealthFAB() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [open, setOpen] = useState(false);

  const handleAction = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-[60]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Speed dial */}
      {open && (
        <div className="fixed bottom-24 right-5 z-[70] flex flex-col-reverse items-end gap-3">
          {ACTIONS.map((action, i) => (
            <button
              key={action.key}
              onClick={() => handleAction(action.href)}
              className="flex items-center gap-3 animate-[slideUp_0.2s_ease-out_forwards]"
              style={{ animationDelay: `${i * 50}ms`, opacity: 0 }}
            >
              <span className="bg-white text-gray-800 text-sm font-medium px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
                {action.label}
              </span>
              <span className={`w-11 h-11 ${action.color} rounded-full flex items-center justify-center shadow-lg text-lg`}>
                {action.icon}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Main FAB */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`fixed bottom-6 right-5 z-[70] w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ${
          open
            ? 'bg-gray-700 rotate-45'
            : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'
        }`}
      >
        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
