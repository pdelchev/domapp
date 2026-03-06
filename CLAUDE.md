# DomApp — Property Management System

## Project Overview
DomApp is a property management application for Bulgarian property managers. It tracks property owners, properties, tenants, leases, rent payments, expenses, documents, and notifications. Supports EN/BG language toggle.

## Tech Stack
- **Backend**: Django 6.0, Django REST Framework 3.16, SimpleJWT 5.5, Celery 5.6, SQLite (dev)
- **Frontend**: Next.js 16, React 19, TypeScript 5, Tailwind CSS 4
- **Auth**: JWT via SimpleJWT (access + refresh tokens in localStorage)

## Project Structure
```
backend/
  core/           # Django settings, root urls, wsgi, celery config
  accounts/       # Custom User model (AbstractUser + phone), auth views
  properties/     # PropertyOwner, Property, Unit models + CRUD API
  tenants/        # Tenant model + CRUD API
  leases/         # Lease model + CRUD API
  finance/        # RentPayment, Expense models + CRUD API
  documents/      # Document model (file uploads) + API
  problems/       # Problem/emergency tracking per property + CRUD API
  notifications/  # Notification model + API
  dashboard/      # Dashboard summary endpoint (aggregations)

frontend/
  app/
    page.tsx                    # Root — redirects to /login
    layout.tsx                  # Root layout (Inter font, LanguageProvider)
    globals.css                 # Tailwind import + base styles + slide-up animation
    login/page.tsx              # Login page
    dashboard/page.tsx          # Dashboard with metric cards, collection progress, action cards (batch pay, undo)
    owners/page.tsx             # Owners list (table)
    owners/new/page.tsx         # Add owner form
    owners/[id]/page.tsx        # Edit owner form
    properties/page.tsx         # Properties list (table with filters)
    properties/new/page.tsx     # Add property form
    properties/[id]/page.tsx    # Property view (read-only details, leases, documents)
    properties/[id]/edit/page.tsx # Edit property form
    tenants/page.tsx            # Tenants list (table with status filters)
    tenants/new/page.tsx        # Add tenant form
    tenants/[id]/page.tsx       # Edit tenant + linked leases & payments
    leases/page.tsx             # Leases list (table with status/frequency filters)
    leases/new/page.tsx         # Add lease form (property, tenant, frequency, amount)
    leases/[id]/page.tsx        # Edit lease + payment table with mark-paid
    finance/page.tsx            # Finance dashboard (income, expenses, net per property)
    finance/payments/page.tsx   # Rent payments list with filters + mark paid
    finance/expenses/page.tsx   # Expenses list with filters + inline add/edit
    documents/page.tsx          # Document Vault — cross-property compliance dashboard + searchable list
    problems/page.tsx           # Problems list (card-based with filters, quick status change)
    problems/new/page.tsx       # Report new problem form
    problems/[id]/page.tsx      # Edit problem + resolution tracking
    notifications/page.tsx      # Notifications list with type/read filters, dismiss, mark all read
    context/LanguageContext.tsx  # React Context for EN/BG locale
    components/
      ui.tsx                    # Design system — all shared UI components
      NavBar.tsx                # Top navigation bar
      PropertyForm.tsx          # Property form with collapsible sections
    lib/
      api.ts                    # API client (fetch wrapper, token refresh, CRUD)
      i18n.ts                   # Translation dictionary + t() helper
```

## Commands
```bash
# Start both servers
./start.sh

# Backend only
cd backend && source venv/bin/activate && python manage.py runserver 0.0.0.0:8000

# Frontend only
cd frontend && npm run dev -- -p 3000

# Port conflict troubleshooting (EADDRINUSE)
# Next.js spawns child processes (next-server) that `lsof -t` may miss.
# Always use `fuser -k <port>/tcp` to kill ALL processes on a port.
# start.sh already does this, but if running manually:
fuser -k 3000/tcp 2>/dev/null && sleep 1
fuser -k 8000/tcp 2>/dev/null && sleep 1

# Django management
cd backend && source venv/bin/activate
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
python manage.py shell

# Frontend
cd frontend && npm run build
cd frontend && npm run lint
```

## Design System (`app/components/ui.tsx`)

All UI across the app uses components from `ui.tsx`. When building new pages, always import from here — never write raw Tailwind for standard controls.

### Tokens
| Token | Value |
|-------|-------|
| Primary color | `indigo-600` (hover: `indigo-700`) |
| Text | `gray-900` body, `gray-700` labels, `gray-500` muted |
| Borders | `gray-200` cards, `gray-300` controls |
| Background | `gray-50` page, `white` surfaces |
| Radius | `rounded-lg` (8px) controls, `rounded-xl` (12px) cards |
| Control height | `h-10` (40px) — buttons, inputs, selects |
| Label size | `text-[13px]` with `font-medium` |
| Control text | `text-sm` (14px) |
| Focus ring | `ring-2 ring-indigo-500` |

### Components
| Component | Usage |
|-----------|-------|
| `Button` | `variant`: `primary` / `secondary` / `danger` / `ghost`. `size`: `sm` / `md` / `lg` |
| `Input` | Text input with optional `label` and `required` indicator |
| `Select` | Dropdown with optional `label` |
| `Textarea` | Multi-line input with optional `label` |
| `Card` | White surface with border + shadow. `padding={false}` for tables |
| `PageShell` | `min-h-screen bg-gray-50` wrapper |
| `PageContent` | Centered content. `size`: `sm` (672px) / `md` (896px) / `lg` (1152px) |
| `PageHeader` | Title + optional action button + optional back link |
| `Badge` | Small label. `color`: `gray`/`indigo`/`green`/`red`/`yellow`/`blue`/`purple` |
| `EmptyState` | Icon + message for empty lists |
| `Alert` | `type`: `error` / `success`. Renders nothing if message is empty |
| `Spinner` | Loading indicator with optional message |
| `FormSection` | Collapsible section for long forms (icon, title, open/onToggle) |

### Page Layout Pattern
```tsx
<PageShell>
  <NavBar />
  <PageContent size="lg">
    <PageHeader title="..." action={<Button>+ Add</Button>} />
    {/* Content */}
  </PageContent>
</PageShell>
```

### List Page Pattern
Use `<Card padding={false}>` wrapping a `<table>` with standard thead/tbody. Rows are clickable with `hover:bg-gray-50 cursor-pointer`. Actions column uses `Button variant="ghost"` and `Button variant="danger"` with `size="sm"`.

### Form Page Pattern
Use `<PageContent size="md">` with `<PageHeader onBack={...}>`. Wrap form fields in `<Card>`. Use `grid grid-cols-1 md:grid-cols-2 gap-4` for field layout. Save/Cancel buttons at bottom with `<Button>` primary + `<Button variant="secondary">`.

## API Endpoints
All endpoints require JWT auth (`Authorization: Bearer <token>`) except login/register.

| Endpoint | Methods | Notes |
|----------|---------|-------|
| `/api/auth/login/` | POST | Returns access + refresh tokens |
| `/api/auth/register/` | POST | Creates user + returns tokens |
| `/api/auth/me/` | GET | Current user info |
| `/api/auth/logout/` | POST | Blacklists refresh token |
| `/api/auth/token/refresh/` | POST | Refreshes access token |
| `/api/owners/` | GET, POST | List/create owners |
| `/api/owners/<id>/` | GET, PUT, DELETE | Owner detail/update/delete |
| `/api/properties/` | GET, POST | List/create properties (?owner=) |
| `/api/properties/<id>/` | GET, PUT, DELETE | Property detail/update/delete |
| `/api/units/` | GET, POST | List/create units (?property=) |
| `/api/units/<id>/` | GET, PUT, DELETE | Unit detail/update/delete |
| `/api/tenants/` | GET, POST | List/create tenants (?property=) |
| `/api/tenants/<id>/` | GET, PUT, DELETE | Tenant detail/update/delete |
| `/api/leases/` | GET, POST | List/create leases (?property=&status=) |
| `/api/leases/<id>/` | GET, PUT, DELETE | Lease detail/update/delete |
| `/api/rent-payments/` | GET, POST | List/create payments (?lease=&status=) |
| `/api/rent-payments/<id>/` | GET, PATCH | Payment detail/update (no DELETE) |
| `/api/rent-payments/batch-mark-paid/` | POST | Batch mark payments as paid (accepts `{ids, payment_method, payment_date}`) |
| `/api/expenses/` | GET, POST | List/create expenses (?property=&category=) |
| `/api/expenses/<id>/` | GET, PUT, DELETE | Expense detail/update/delete |
| `/api/documents/` | GET, POST | List/upload documents (?property=&type=&search=&expiry=) |
| `/api/documents/<id>/` | GET, DELETE | Document detail/delete (no PUT) |
| `/api/documents/smart-folders/<property_id>/` | GET | Smart folders for property (based on metadata) |
| `/api/documents/compliance/` | GET | Cross-property compliance summary (expired, expiring, by property) |
| `/api/notifications/` | GET | List notifications (?type=&read=true/false) |
| `/api/notifications/<id>/` | PATCH | Mark notification as read |
| `/api/notifications/unread-count/` | GET | Unread notification count (for badge) |
| `/api/notifications/mark-all-read/` | POST | Mark all notifications as read |
| `/api/notifications/<id>/dismiss/` | DELETE | Delete a notification |
| `/api/dashboard/summary/` | GET | Dashboard metrics + collection progress (month_payments_total/collected, month_total_due/collected) |
| `/api/finance/summary/` | GET | Finance summary (income, expenses, net by property) |
| `/api/problems/` | GET, POST | List/create problems (?property=&status=&priority=&category=) |
| `/api/problems/<id>/` | GET, PUT, DELETE | Problem detail/update/delete |
| `/api/problems/summary/` | GET | Problem counts by status and priority |

## Conventions
- **All data is user-scoped**: Every model has a `user` FK to the manager. Querysets filter by `request.user`.
- **Frontend pages**: `'use client'` directive, React hooks, `useLanguage()` for locale, `t()` for translations.
- **API calls**: Use functions from `app/lib/api.ts`. The `apiFetch` wrapper auto-refreshes tokens on 401.
- **i18n**: All user-facing strings go through `t('key', locale)`. Keys follow `section.label` pattern (e.g., `nav.dashboard`, `common.save`).
- **Styling**: Always use `ui.tsx` components. Never write raw button/input Tailwind classes in pages.
- **Nav bar**: Shared `NavBar` component. Used on every authenticated page.
- **Currency**: EUR, formatted via `Intl.NumberFormat`.
- **API proxy**: Next.js rewrites proxy `/api/*` to Django (`localhost:8000`). API_URL is empty string (relative URLs). No CORS issues in Codespaces.
- **Component pattern**: Page-level components as default exports. Shared components in `app/components/`.
- **Form state**: Use functional updater `setForm((prev) => ...)` to avoid stale closures. Never define React components inside other components (causes focus loss on re-render).

## Key Models
- **PropertyOwner**: full_name, phone, email, id_number, address, bank_name, bank_iban, notes
- **Property**: name, address, city, country, property_type, cadastral_number, square_meters, purchase_price/date, current_value, mortgage, utilities, insurance, building_management, security, access codes, notes
- **Unit**: property FK, unit_number, floor, square_meters, notes
- **Tenant**: user FK, full_name, phone, email, id_number (contact record only — property/dates/deposit live on Lease)
- **Lease**: property FK, tenant FK, start/end_date, monthly_rent, rent_frequency (monthly/weekly/biweekly/one_time), rent_due_day, deposit, status, auto_generate_payments, next_payment_date
- **RentPayment**: lease FK, due_date, amount_due/paid, payment_date, status, payment_method
- **Expense**: property FK, category, description, amount, due/paid_date, is_recurring
- **Document**: property FK, document_type (19 types), file, label, expiry_date, file_size, uploaded_at, replaces (version chain FK), reminders
- **Notification**: user FK, notification_type, title, message, related_property, read_status
- **Problem**: user FK, property FK, title, description, category (12 types), priority (emergency/high/medium/low), status (open/in_progress/resolved/closed), reported_by, assigned_to, estimated_cost, actual_cost, resolution_notes, resolved_at

## Roadmap
- [x] Step 1: Project scaffold
- [x] Steps 2-3: Database models + admin
- [x] Step 4: Authentication
- [x] Step 5: All API endpoints
- [x] Step 6: Frontend — login, dashboard, API client, i18n
- [x] Step 7: Properties CRUD pages (list, add, edit)
- [x] Step 8: Owners CRUD pages (list, add, edit)
- [x] Step 8.5: Design system — shared UI components, consistent styling
- [x] Step 9: Tenants CRUD pages (list, add, edit with linked leases & payments)
- [x] Step 10: Finance dashboard (income, expenses, net per property)
- [x] Step 11: Rent payment tracking (list with filters, mark paid)
- [x] Step 12: Expense tracking (list with filters, inline add/edit)
- [x] Step 12.5: Leases management (CRUD, frequency options, auto-payment generation, mark-paid with method)
- [x] Step 13: Property view page + document management (view, upload by type, delete)
- [x] Step 13.5: Dashboard redesign — card-based payments, quick-pay, batch mark-paid, undo toasts, collection progress bar, smart method memory (localStorage)
- [x] Step 14: Notifications center (list with type/read filters, mark read, mark all read, dismiss, unread badge in NavBar)
- [x] Step 14.5: Document Vault — smart folders, compliance dashboard, version chain, expanded document types
- [x] Step 14.7: Problems/Emergencies — issue tracker per property (CRUD, priorities, categories, cost tracking, resolution notes, quick status actions, property view integration)
- [ ] Step 15: Celery tasks (auto-notifications, reminders)
- [ ] Step 16: Financial reports & charts
