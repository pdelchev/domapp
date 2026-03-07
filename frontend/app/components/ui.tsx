'use client';

import React from 'react';

// ============================================================================
// DESIGN SYSTEM — DomApp
// ============================================================================
// Colors:    Indigo-600 primary, gray-900 text, gray-500 muted, white surfaces
// Radius:    lg (8px) for all controls, xl (12px) for cards
// Spacing:   h-10 (40px) for all controls (inputs, buttons, selects)
// Font:      text-sm (14px) for controls, text-[13px] for labels
// Shadows:   shadow-sm for cards, none for controls
// ============================================================================

// --- Button -----------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BTN_BASE = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

const BTN_SIZES = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-6 text-sm',
};

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
  secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-indigo-500',
  danger: 'bg-white text-red-600 border border-gray-300 hover:bg-red-50 focus:ring-red-500',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 focus:ring-indigo-500',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${BTN_BASE} ${BTN_SIZES[size]} ${BTN_VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// --- Input ------------------------------------------------------------------

const INPUT_BASE = 'w-full h-10 px-3 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-500';

export function Input({
  label,
  required,
  className = '',
  ...props
}: {
  label?: string;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      {label && (
        <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        className={`${INPUT_BASE} ${className}`}
        required={required}
        step={props.type === 'number' ? 'any' : undefined}
        {...props}
      />
    </div>
  );
}

// --- Select -----------------------------------------------------------------

export function Select({
  label,
  required,
  children,
  className = '',
  ...props
}: {
  label?: string;
  required?: boolean;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      {label && (
        <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <select
        className={`${INPUT_BASE} ${className}`}
        required={required}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

// --- Textarea ---------------------------------------------------------------

export function Textarea({
  label,
  required,
  className = '',
  ...props
}: {
  label?: string;
  required?: boolean;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      {label && (
        <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <textarea
        className={`w-full px-3 py-2.5 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50 ${className}`}
        required={required}
        {...props}
      />
    </div>
  );
}

// --- Card -------------------------------------------------------------------

export function Card({
  children,
  className = '',
  padding = true,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl shadow-sm ${padding ? 'p-6' : 'overflow-x-auto'} ${className}`}>
      {children}
    </div>
  );
}

// --- Page Shell -------------------------------------------------------------

export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-50 pwa-shell">{children}</div>;
}

export function PageContent({
  children,
  size = 'lg',
}: {
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const widths = { sm: 'max-w-2xl', md: 'max-w-4xl', lg: 'max-w-6xl' };
  return (
    <main className={`${widths[size]} mx-auto px-4 sm:px-6 lg:px-8 py-8`}>
      {children}
    </main>
  );
}

// --- Page Header ------------------------------------------------------------

export function PageHeader({
  title,
  action,
  backHref,
  backLabel,
  onBack,
}: {
  title: string;
  action?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  onBack?: () => void;
}) {
  return (
    <div className="mb-6">
      {(backHref || onBack) && (
        <button
          onClick={onBack || undefined}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {backLabel || 'Back'}
        </button>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {action}
      </div>
    </div>
  );
}

// --- Badge ------------------------------------------------------------------

type BadgeColor = 'gray' | 'indigo' | 'green' | 'red' | 'yellow' | 'blue' | 'purple';

const BADGE_COLORS: Record<BadgeColor, string> = {
  gray: 'bg-gray-100 text-gray-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  green: 'bg-green-50 text-green-700',
  red: 'bg-red-50 text-red-700',
  yellow: 'bg-yellow-50 text-yellow-700',
  blue: 'bg-blue-50 text-blue-700',
  purple: 'bg-purple-50 text-purple-700',
};

export function Badge({
  children,
  color = 'gray',
}: {
  children: React.ReactNode;
  color?: BadgeColor;
}) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md ${BADGE_COLORS[color]}`}>
      {children}
    </span>
  );
}

// --- Empty State ------------------------------------------------------------

export function EmptyState({
  icon,
  message,
}: {
  icon: string;
  message: string;
}) {
  return (
    <Card className="py-16 text-center">
      <span className="text-4xl block mb-3">{icon}</span>
      <p className="text-sm text-gray-500">{message}</p>
    </Card>
  );
}

// --- Alert ------------------------------------------------------------------

export function Alert({
  type,
  message,
}: {
  type: 'error' | 'success';
  message: string;
}) {
  if (!message) return null;
  const styles = type === 'error'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-green-50 border-green-200 text-green-700';
  return (
    <div className={`p-3 border rounded-lg text-sm mb-4 ${styles}`}>
      {message}
    </div>
  );
}

// --- Loading Spinner --------------------------------------------------------

export function Spinner({ message }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="flex items-center gap-3 text-gray-400">
        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        {message && <span className="text-sm">{message}</span>}
      </div>
    </div>
  );
}

// --- Tooltip ----------------------------------------------------------------

export function Tooltip({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  if (!text) return <>{children}</>;
  return (
    <span className="relative group/tip inline-flex items-center gap-1 cursor-help">
      {children}
      <svg className="w-3.5 h-3.5 text-gray-300 group-hover/tip:text-gray-400 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827m0 4v.01" />
        <circle cx="12" cy="12" r="9.75" />
      </svg>
      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-1.5 text-xs text-white bg-gray-900 rounded-lg shadow-lg whitespace-normal max-w-[220px] text-center opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all duration-150 pointer-events-none z-50">
        {text}
        <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-gray-900" />
      </span>
    </span>
  );
}

// --- Collapsible Section (for forms) ----------------------------------------

export function FormSection({
  title,
  icon,
  open,
  onToggle,
  action,
  children,
}: {
  title: string;
  icon?: string;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center bg-gray-50 hover:bg-gray-100 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
            {icon && <span className="text-base">{icon}</span>}
            {title}
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {action && (
          <div className="pr-3 shrink-0" onClick={(e) => e.stopPropagation()}>
            {action}
          </div>
        )}
      </div>
      {open && <div className="p-4 space-y-4 bg-white">{children}</div>}
    </div>
  );
}
