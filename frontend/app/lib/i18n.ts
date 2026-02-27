export type Locale = 'en' | 'bg';

const translations: Record<string, Record<Locale, string>> = {
  // Auth
  'login.title': { en: 'Welcome Back', bg: 'Добре дошли' },
  'login.subtitle': { en: 'Sign in to manage your properties', bg: 'Влезте за да управлявате имотите си' },
  'login.username': { en: 'Username', bg: 'Потребителско име' },
  'login.password': { en: 'Password', bg: 'Парола' },
  'login.submit': { en: 'Sign In', bg: 'Вход' },
  'login.register': { en: "Don't have an account? Register", bg: 'Нямате акаунт? Регистрация' },
  'login.error': { en: 'Invalid credentials', bg: 'Невалидни данни' },

  // Nav
  'nav.dashboard': { en: 'Dashboard', bg: 'Табло' },
  'nav.owners': { en: 'Owners', bg: 'Собственици' },
  'nav.properties': { en: 'Properties', bg: 'Имоти' },
  'nav.tenants': { en: 'Tenants', bg: 'Наематели' },
  'nav.notifications': { en: 'Notifications', bg: 'Известия' },
  'nav.logout': { en: 'Logout', bg: 'Изход' },

  // Dashboard
  'dash.portfolio_value': { en: 'Portfolio Value', bg: 'Стойност на портфолио' },
  'dash.monthly_income': { en: 'Monthly Income', bg: 'Месечен приход' },
  'dash.monthly_expenses': { en: 'Monthly Expenses', bg: 'Месечни разходи' },
  'dash.net_cash_flow': { en: 'Net Cash Flow', bg: 'Нетен паричен поток' },
  'dash.occupancy': { en: 'Occupancy Rate', bg: 'Процент на заетост' },
  'dash.upcoming_rent': { en: 'Upcoming Rent', bg: 'Предстоящ наем' },
  'dash.overdue': { en: 'Overdue Rent', bg: 'Просрочен наем' },
  'dash.expiring_docs': { en: 'Expiring Documents', bg: 'Изтичащи документи' },
  'dash.properties': { en: 'Properties', bg: 'Имоти' },
  'dash.active_leases': { en: 'Active Leases', bg: 'Активни договори' },

  // Common
  'common.add': { en: 'Add', bg: 'Добави' },
  'common.edit': { en: 'Edit', bg: 'Редактирай' },
  'common.delete': { en: 'Delete', bg: 'Изтрий' },
  'common.save': { en: 'Save', bg: 'Запази' },
  'common.cancel': { en: 'Cancel', bg: 'Отказ' },
  'common.search': { en: 'Search...', bg: 'Търсене...' },
  'common.loading': { en: 'Loading...', bg: 'Зареждане...' },
  'common.no_data': { en: 'No data yet', bg: 'Няма данни все още' },
};

export function t(key: string, locale: Locale): string {
  return translations[key]?.[locale] || key;
}