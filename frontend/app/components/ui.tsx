'use client';

import React from 'react';

// ============================================================================
// DESIGN SYSTEM — DomApp v2
// ============================================================================
// Colors:    Indigo-600 primary, gray-900 text, gray-500 muted, white surfaces
// Radius:    lg (8px) controls, 2xl (16px) cards
// Spacing:   h-11 (44px) controls on md+, h-10 mobile; Apple HIG touch targets
// Font:      text-sm (14px) controls, text-[13px] labels
// Shadows:   shadow-xs cards, none controls
// Feedback:  active:scale-[0.97] on interactive elements
// ============================================================================

// --- Button -----------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BTN_BASE = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.97]';

const BTN_SIZES = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 md:h-11 px-4 text-sm',
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

const INPUT_BASE = 'w-full h-10 md:h-11 px-3 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-500';

export function Input({
  label,
  required,
  className = '',
  ...props
}: {
  label?: React.ReactNode;
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
  label?: React.ReactNode;
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
  label?: React.ReactNode;
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
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white border border-gray-200 rounded-2xl shadow-xs ${padding ? 'p-5 md:p-6' : 'overflow-x-auto'} ${onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

// --- Page Shell -------------------------------------------------------------

export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-50 pwa-shell pb-16 md:pb-0">{children}</div>;
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
    <main className={`${widths[size]} mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8`}>
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
    <div className="mb-5 md:mb-6">
      {(backHref || onBack) && (
        <button
          onClick={onBack || undefined}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3 transition-colors active:scale-[0.97]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {backLabel || 'Back'}
        </button>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900 truncate">{title}</h1>
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
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${BADGE_COLORS[color]}`}>
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
    <Card className="!py-16 text-center">
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
    <div className={`p-3 border rounded-xl text-sm mb-4 ${styles}`}>
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
      <span className="absolute left-0 top-full mt-2 px-3 py-1.5 text-xs text-white bg-gray-900 rounded-lg shadow-lg whitespace-normal max-w-[220px] text-left opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all duration-150 pointer-events-none z-50">
        {text}
        <span className="absolute left-4 bottom-full w-0 h-0 border-x-[5px] border-x-transparent border-b-[5px] border-b-gray-900" />
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
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      <div className="flex items-center bg-gray-50 hover:bg-gray-100 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center justify-between px-4 py-3 text-left active:bg-gray-100"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
            {icon && <span className="text-base">{icon}</span>}
            {title}
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
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

// --- Data Table (responsive: cards on mobile, table on desktop) -------------

export interface DataColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  hideOnMobile?: boolean;
  primary?: boolean;
  secondary?: boolean;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  onRowClick,
  rowActions,
  keyExtractor,
  emptyIcon = '📋',
  emptyMessage = 'No data',
}: {
  columns: DataColumn<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => React.ReactNode;
  keyExtractor: (row: T) => string | number;
  emptyIcon?: string;
  emptyMessage?: string;
}) {
  if (data.length === 0) {
    return <EmptyState icon={emptyIcon} message={emptyMessage} />;
  }

  const primaryCol = columns.find(c => c.primary);
  const secondaryCol = columns.find(c => c.secondary);
  const detailCols = columns.filter(c => !c.primary && !c.secondary && !c.hideOnMobile);

  return (
    <>
      {/* Mobile: card view */}
      <div className="md:hidden space-y-2">
        {data.map((row) => (
          <div
            key={keyExtractor(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`bg-white border border-gray-200 rounded-2xl p-4 ${onRowClick ? 'cursor-pointer active:bg-gray-50 active:scale-[0.99] transition-all' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {primaryCol && (
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {primaryCol.render(row)}
                  </div>
                )}
                {secondaryCol && (
                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                    {secondaryCol.render(row)}
                  </div>
                )}
              </div>
              {rowActions && (
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  {rowActions(row)}
                </div>
              )}
            </div>
            {detailCols.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                {detailCols.map((col) => (
                  <div key={col.key} className="text-xs text-gray-500">
                    <span className="text-gray-400">{col.header}: </span>
                    {col.render(row)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: table view */}
      <div className="hidden md:block">
        <Card padding={false}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                {columns.map((col) => (
                  <th key={col.key} className={`px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${col.className || ''}`}>
                    {col.header}
                  </th>
                ))}
                {rowActions && (
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((row) => (
                <tr
                  key={keyExtractor(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`${onRowClick ? 'hover:bg-gray-50 cursor-pointer' : ''} transition-colors`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-5 py-3.5 text-sm ${col.primary ? 'font-medium text-gray-900' : 'text-gray-500'} ${col.className || ''}`}>
                      {col.render(row)}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="px-5 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        {rowActions(row)}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

// --- Bottom Sheet (mobile modal from bottom) --------------------------------

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[70] bsheet-backdrop-in" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[71] bg-white rounded-t-2xl shadow-2xl bsheet-in max-h-[85vh] flex flex-col safe-bottom">
        <div className="flex items-center justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 active:scale-[0.9]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </>
  );
}

// --- Sticky Action Bar (fixed save/cancel on mobile) ------------------------

export function StickyActionBar({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Mobile: fixed bottom bar */}
      <div className="md:hidden fixed bottom-14 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-3 safe-bottom flex gap-3">
        {children}
      </div>
      {/* Desktop: inline */}
      <div className="hidden md:flex gap-3 pt-4">
        {children}
      </div>
    </>
  );
}
