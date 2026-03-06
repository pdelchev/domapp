'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getNotifications, markNotificationRead, markAllNotificationsRead, dismissNotification } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import NavBar from '../components/NavBar';
import { PageShell, PageContent, PageHeader, Card, Badge, Button, Spinner, EmptyState } from '../components/ui';

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  related_object_id: number | null;
  related_property: number | null;
  property_name: string | null;
  read_status: boolean;
  created_at: string;
}

const TYPE_FILTERS = ['all', 'unread', 'rent_due', 'overdue', 'lease_expiry', 'document_expiry', 'payment_received'] as const;

const TYPE_COLORS: Record<string, 'red' | 'yellow' | 'blue' | 'green' | 'purple' | 'gray'> = {
  overdue: 'red',
  rent_due: 'yellow',
  lease_expiry: 'purple',
  document_expiry: 'blue',
  payment_received: 'green',
  info: 'gray',
};

const TYPE_ICONS: Record<string, string> = {
  overdue: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  rent_due: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  lease_expiry: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  document_expiry: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  payment_received: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  info: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z',
};

function timeAgo(dateStr: string, locale: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return t('notif.just_now', locale as 'en' | 'bg');
  if (diffMin < 60) return `${diffMin} ${t('notif.minutes_ago', locale as 'en' | 'bg')}`;
  if (diffHours < 24) return `${diffHours} ${t('notif.hours_ago', locale as 'en' | 'bg')}`;
  return `${diffDays} ${t('notif.days_ago', locale as 'en' | 'bg')}`;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async () => {
    try {
      const typeParam = filter !== 'all' && filter !== 'unread' ? filter : undefined;
      const readParam = filter === 'unread' ? 'false' : undefined;
      const data = await getNotifications(typeParam, readParam);
      setNotifications(data);
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [filter, router]);

  useEffect(() => { load(); }, [load]);

  const handleMarkRead = async (notif: Notification) => {
    if (notif.read_status) return;
    await markNotificationRead(notif.id);
    setNotifications((prev) =>
      prev.map((n) => n.id === notif.id ? { ...n, read_status: true } : n)
    );
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_status: true })));
  };

  const handleDismiss = async (id: number) => {
    await dismissNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleClick = (notif: Notification) => {
    handleMarkRead(notif);
    // Navigate to related resource
    if (notif.type === 'overdue' || notif.type === 'rent_due' || notif.type === 'payment_received') {
      if (notif.related_property) {
        router.push(`/properties/${notif.related_property}`);
      }
    } else if (notif.type === 'lease_expiry') {
      if (notif.related_object_id) {
        router.push(`/leases/${notif.related_object_id}`);
      }
    } else if (notif.type === 'document_expiry') {
      if (notif.related_property) {
        router.push(`/properties/${notif.related_property}`);
      }
    }
  };

  const unreadCount = notifications.filter((n) => !n.read_status).length;

  if (loading) {
    return <PageShell><NavBar /><Spinner message={t('common.loading', locale)} /></PageShell>;
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="md">
        <PageHeader
          title={t('notif.title', locale)}
          action={
            unreadCount > 0 ? (
              <Button variant="secondary" size="sm" onClick={handleMarkAllRead}>
                {t('notif.mark_all_read', locale)}
              </Button>
            ) : undefined
          }
        />

        {/* Filter pills */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setLoading(true); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                filter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? t('notif.all', locale) :
               f === 'unread' ? t('notif.unread', locale) :
               t(`notif.${f}`, locale)}
            </button>
          ))}
        </div>

        {/* Notification list */}
        {notifications.length === 0 ? (
          <Card className="py-8 text-center">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </div>
            <p className="text-sm text-gray-400">
              {filter === 'unread' ? t('notif.all_caught_up', locale) : t('notif.no_notifications', locale)}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {notifications.map((notif) => {
              const color = TYPE_COLORS[notif.type] || 'gray';
              const iconPath = TYPE_ICONS[notif.type] || TYPE_ICONS.info;
              const iconColorMap: Record<string, string> = {
                red: 'bg-red-100 text-red-600',
                yellow: 'bg-amber-100 text-amber-600',
                blue: 'bg-blue-100 text-blue-600',
                green: 'bg-green-100 text-green-600',
                purple: 'bg-purple-100 text-purple-600',
                gray: 'bg-gray-100 text-gray-500',
              };

              return (
                <Card
                  key={notif.id}
                  className={`!p-0 transition-all duration-200 ${
                    !notif.read_status ? 'border-l-[3px] border-l-indigo-500' : ''
                  }`}
                >
                  <div
                    className="flex gap-3 px-3 py-3 cursor-pointer active:bg-gray-50 transition-colors"
                    onClick={() => handleClick(notif)}
                  >
                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-full ${iconColorMap[color]} flex items-center justify-center shrink-0 mt-0.5`}>
                      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
                      </svg>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium truncate ${!notif.read_status ? 'text-gray-900' : 'text-gray-600'}`}>
                              {notif.title || t(`notif.${notif.type}`, locale)}
                            </span>
                            {!notif.read_status && (
                              <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge color={color}>
                              {t(`notif.${notif.type}`, locale)}
                            </Badge>
                            {notif.property_name && (
                              <span className="text-[11px] text-gray-400 truncate">{notif.property_name}</span>
                            )}
                            <span className="text-[11px] text-gray-400">{timeAgo(notif.created_at, locale)}</span>
                          </div>
                        </div>

                        {/* Dismiss button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDismiss(notif.id); }}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
                          title={t('notif.dismiss', locale)}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </PageContent>
    </PageShell>
  );
}
