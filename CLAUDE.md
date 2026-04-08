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
  notes/          # Notes with block editor, folders, tags, entity linking
  health/         # Blood results tracker + BP monitoring: PDF parsing, biomarker analysis, scoring, recommendations, BP sessions, cardiovascular risk
  vehicles/       # Vehicle obligation tracker: insurance, vignette, MOT, tax, reminders
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
    notes/page.tsx              # Notes — 3-panel Apple Notes-style (sidebar, list, block editor)
    problems/page.tsx           # Problems list (card-based with filters, quick status change)
    problems/new/page.tsx       # Report new problem form
    problems/[id]/page.tsx      # Edit problem + resolution tracking
    notifications/page.tsx      # Notifications list with type/read filters, dismiss, mark all read
    health/page.tsx             # Health dashboard — scores, results, recommendations
    health/upload/page.tsx      # Upload blood test PDFs (single + bulk) or manual entry
    health/report/[id]/page.tsx # Report detail — results table, trends, biomarker education
    health/bp/page.tsx          # Blood pressure dashboard — readings, sessions, staging, trends
    health/bp/readings/page.tsx # Full BP readings history with filters + export
    health/bp/medications/page.tsx # BP medication tracking + adherence calendar
    health/bp/statistics/page.tsx  # Deep BP stats — variability, circadian, context correlations
    health/recovery/page.tsx    # WHOOP Recovery dashboard — scores, HRV, sleep, strain, CV fitness
    health/recovery/history/page.tsx  # Recovery history with trend charts
    health/recovery/sleep/page.tsx    # Sleep analysis — stages, efficiency, debt, trends
    health/recovery/workouts/page.tsx # Workout history — strain, HR zones, activities
    health/recovery/stats/page.tsx    # Deep stats — HRV analysis, correlations, CV fitness
    health/lifestyle/page.tsx   # Lifestyle hub — blood results, recommendations, quick nav (moved from /lifestyle)
    health/lifestyle/tests/page.tsx   # Follow-up test recommendations by priority
    health/lifestyle/meals/page.tsx   # 15-day meal plan (DASH + Mediterranean)
    health/lifestyle/gym/page.tsx     # Weekly workout plan + supplements
    vehicles/page.tsx           # Vehicles — compliance dashboard, traffic-light grid
    vehicles/new/page.tsx       # Add vehicle form with BG presets option
    vehicles/[id]/page.tsx      # Vehicle detail — info, obligations CRUD, renew, file uploads
    context/LanguageContext.tsx  # React Context for EN/BG locale
    components/
      ui.tsx                    # Design system — all shared UI components
      NavBar.tsx                # Top nav + mobile bottom tab bar + More sheet
      HealthFAB.tsx             # Health tracking quick-add floating button
      MusicPlayer.tsx           # Persistent audio player with Media Session API
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

## App Modules & Navigation (CRITICAL GUARDRAIL)

DomApp is organized into **6 top-level modules**. Every module and sub-page MUST be accessible from the navigation. When adding new pages, you MUST update the NavBar MODULES array.

### Module Structure
| Module | Icon | Color | Pages |
|--------|------|-------|-------|
| **Health Hub** | ❤️ | `bg-rose-500` | `/lifestyle` (hub), `/lifestyle/track` (daily tracking), `/lifestyle/meals`, `/lifestyle/gym`, `/lifestyle/tests` |
| **Properties** | 🏠 | `bg-blue-500` | `/properties`, `/owners`, `/tenants`, `/leases`, `/documents`, `/problems` |
| **Finance** | 💰 | `bg-emerald-500` | `/finance`, `/finance/payments`, `/finance/expenses`, `/investments` |
| **Music** | 🎵 | `bg-purple-500` | `/music`, `/music/playlists` |
| **Dashboard** | 📊 | `bg-indigo-500` | `/dashboard` |
| **Notifications** | 🔔 | `bg-amber-500` | `/notifications` |

### Navigation Rules (NEVER BREAK THESE)
1. **Every page must be reachable** from NavBar — either via bottom tab, desktop dropdown, or More sheet
2. **Mobile bottom tab bar** (PWA): 4 main modules (Health, Properties, Finance, Music) + "More" (⋯) button
3. **More sheet**: opens from ⋯ button, shows remaining modules as colorful icon grid (Dashboard, Notifications, Documents, Problems, Investments, Owners, Tenants, Leases)
4. **Desktop top bar**: all modules with dropdown submenus showing all sub-pages
5. **Hamburger menu** (non-PWA mobile): shows all modules with expandable sub-items
6. When adding a new page: add it to `MODULES` array in `NavBar.tsx`, add to `MORE_ITEMS` if not a bottom tab
7. **Mobile-first**: design for mobile viewport first, then enhance for desktop. All forms must use `inputMode` for proper mobile keyboards
8. **Health Hub is the primary module** — it should be the first bottom tab and the default landing for health-conscious users

### Mobile Design Priorities
- Bottom tab bar with large touch targets (48px+)
- More sheet with colorful icon grid (like iOS/Android app launchers)
- No tables on mobile — use card-based layouts
- All number inputs use `inputMode="numeric"` or `inputMode="decimal"`
- Forms should work in bottom sheets when possible (no full page navigation for quick entries)

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
| `/api/notes/folders/` | GET, POST | List/create note folders |
| `/api/notes/folders/<id>/` | GET, PUT, DELETE | Folder detail/update/delete |
| `/api/notes/tags/` | GET, POST | List/create note tags |
| `/api/notes/tags/<id>/` | GET, PUT, DELETE | Tag detail/update/delete |
| `/api/notes/` | GET, POST | List/create notes (?folder=&tag=&search=&pinned=&archived=&trashed=&property=&tenant=) |
| `/api/notes/<id>/` | GET, PUT, PATCH, DELETE | Note detail/update/delete |
| `/api/notes/<id>/duplicate/` | POST | Clone a note |
| `/api/notes/summary/` | GET | Note counts (total, pinned, archived, trashed, checklist stats) |
| `/api/notes/quick-capture/` | POST | Minimal note creation (title + optional body + entity link) |

| `/api/health/profiles/` | GET, POST | List/create health profiles |
| `/api/health/profiles/<id>/` | GET, PUT, DELETE | Profile detail/update/delete |
| `/api/health/reports/` | GET, POST | List/create blood reports (with optional PDF) |
| `/api/health/reports/<id>/` | GET, PUT, DELETE | Report detail with results + recommendations |
| `/api/health/reports/bulk-upload/` | POST | Bulk PDF upload (multipart: files[], profile, test_date) |
| `/api/health/reports/<id>/results/` | POST, PUT | Manual result entry/update |
| `/api/health/biomarkers/` | GET | List canonical biomarkers (?category=) |
| `/api/health/biomarker-categories/` | GET | List biomarker categories |
| `/api/health/biomarker-history/<id>/` | GET | Trend data for one biomarker (?profile=) |
| `/api/health/compare/` | GET | Compare two reports (?report_a=&report_b=) |
| `/api/health/dashboard/` | GET | Health dashboard with scores + recommendations (?profile=) |
| `/api/health/bp/readings/` | GET, POST | List/create BP readings (?profile=&days=&stage=) |
| `/api/health/bp/readings/<id>/` | GET, PUT, DELETE | BP reading detail/update/delete |
| `/api/health/bp/sessions/` | GET, POST | List/create BP sessions with nested readings |
| `/api/health/bp/sessions/<id>/` | GET, DELETE | Session detail with readings |
| `/api/health/bp/dashboard/` | GET | BP dashboard: latest, averages, staging, trend (?profile=) |
| `/api/health/bp/statistics/` | GET | Deep BP stats: circadian, variability, correlations (?profile=&days=) |
| `/api/health/bp/cardiovascular-risk/` | GET | Combined BP + blood biomarker risk score (?profile=) |
| `/api/health/bp/medications/` | GET, POST | List/create BP medications (?profile=&active=) |
| `/api/health/bp/medications/<id>/` | GET, PUT, DELETE | Medication detail/update/delete |
| `/api/health/bp/med-logs/` | GET, POST | List/create medication adherence logs |
| `/api/health/bp/alerts/` | GET | List BP alerts (?profile=&read=&severity=&type=) |
| `/api/health/bp/alerts/<id>/mark_read/` | PATCH | Mark single BP alert as read |
| `/api/health/bp/alerts/mark_all_read/` | POST | Mark all BP alerts as read |
| `/api/health/bp/medication-effectiveness/` | GET | Before/after BP comparison for medication (?medication=) |
| `/api/health/bp/export/` | GET | Export BP data as CSV/PDF (?profile=&format=&date_from=&date_to=) |
| `/api/health/whoop/connect/` | GET | Get WHOOP OAuth2 authorization URL |
| `/api/health/whoop/callback/` | POST | Exchange OAuth code for tokens, create connection |
| `/api/health/whoop/disconnect/` | POST | Disconnect WHOOP, revoke tokens |
| `/api/health/whoop/status/` | GET | Connection status (is_active, last_sync) |
| `/api/health/whoop/sync/` | POST | Manual data sync trigger (?days=7) |
| `/api/health/whoop/dashboard/` | GET | Recovery dashboard (latest, trends, distributions) |
| `/api/health/whoop/recoveries/` | GET | Recovery history (?days=30, paginated) |
| `/api/health/whoop/sleeps/` | GET | Sleep history (?days=30, paginated) |
| `/api/health/whoop/workouts/` | GET | Workout history (?days=30, paginated) |
| `/api/health/whoop/recovery-stats/` | GET | Deep recovery/HRV statistics (?days=30) |
| `/api/health/whoop/sleep-stats/` | GET | Deep sleep statistics (?days=30) |
| `/api/health/whoop/strain-stats/` | GET | Workout/strain statistics (?days=30) |
| `/api/health/whoop/cardiovascular-fitness/` | GET | Combined CV fitness (WHOOP + BP + blood) |
| `/api/vehicles/` | GET, POST | List/create vehicles (?property=&active=) |
| `/api/vehicles/<id>/` | GET, PUT, DELETE | Vehicle detail/update/delete |
| `/api/vehicles/summary/` | GET | Compliance dashboard (counts + upcoming expirations) |
| `/api/vehicles/cost-report/` | GET | Annual cost breakdown by vehicle (?year=) |
| `/api/vehicles/expiring/` | GET | Obligations expiring within N days (?days=30) |
| `/api/vehicles/<id>/obligations/` | GET, POST | List/create obligations for vehicle (?type=&current=) |
| `/api/vehicles/<id>/presets/` | POST | Create Bulgarian preset obligations for vehicle |
| `/api/vehicles/obligations/<id>/` | GET, PUT, DELETE | Obligation detail/update/delete |
| `/api/vehicles/obligations/<id>/renew/` | POST | Quick-renew obligation (copies to new period) |
| `/api/vehicles/obligations/<id>/files/` | GET, POST | List/upload files for obligation |
| `/api/vehicles/obligations/files/<id>/` | DELETE | Delete uploaded file |

## Health Data-Driven Guardrail (CRITICAL)

All health-related recommendations MUST be grounded in the user's actual data. Never generate generic advice — always pull from real measurements.

### Data Sources (Priority Order)
1. **Blood test results** — biomarker flags, trends, system scores from `/api/health/dashboard/` and `/api/health/reports/`
2. **Blood pressure** — 30-day averages, AHA staging from `/api/health/bp/dashboard/`
3. **WHOOP recovery** — HRV, RHR, recovery score, sleep quality, strain from `/api/health/whoop/dashboard/`
4. **Weight & body composition** — BMI, body fat %, trend from weight entries
5. **Daily ritual adherence** — supplement compliance, skipped items

### What This Means in Practice
- **Meal plan changes** — Must reference specific biomarker flags (e.g., "high uric acid → reduce purine", "elevated glucose → lower GI foods", "low Vitamin D → add fatty fish"). Never change meals without a data reason.
- **Supplement dose changes** — Must reference blood results or BP data (e.g., "Vitamin D still low after 3 months → increase from 2000IU to 4000IU", "BP well-controlled → review CoQ10 dose"). Never adjust doses arbitrarily.
- **Gym routine changes** — Must reference WHOOP strain/recovery data (e.g., "avg recovery <40% → reduce volume", "HRV trending up → can increase intensity"). Also reference blood markers (e.g., "elevated liver enzymes + high strain → more rest days").
- **Daily ritual/protocol changes** — Must reference adherence data + health outcomes (e.g., "sleep score improved since adding Glycine → keep", "BP still elevated → review medication timing").
- **Test panel additions** — Already data-driven via `health/test_panel.py` — dynamic tests are triggered by blood/BP/WHOOP/weight data.

### Never Do
- Add/remove supplements without referencing blood test or BP data
- Change meal plan without referencing biomarker flags
- Modify gym intensity without checking WHOOP recovery trends
- Make health recommendations based on general knowledge alone — always check the user's actual numbers first

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
- **NoteFolder**: user FK, name, color, icon, parent (self FK for nesting), position
- **NoteTag**: user FK, name, color (unique_together: user + name)
- **Note**: user FK, folder FK, title, content (JSONField — block array), color, is_pinned, is_archived, is_trashed, trashed_at, linked_property FK, linked_tenant FK, linked_lease FK, linked_problem FK, tags M2M, checklist_stats (denormalized JSON), word_count, is_template, template_name
- **BiomarkerCategory**: name, name_bg, slug, icon, body_system, sort_order (seeded)
- **Biomarker**: category FK, name, name_bg, abbreviation, aliases (JSON), unit, alt_units (JSON), ref ranges (M/F), optimal range, critical thresholds, description/high_meaning/low_meaning (EN+BG), improve_tips (JSON EN+BG)
- **HealthProfile**: user FK, full_name, date_of_birth, sex, is_primary, notes
- **BloodReport**: user FK, profile FK, test_date, lab_name, lab_type, file, overall_score (0-100), system_scores (JSON), parsed_raw (JSON), parse_warnings (JSON)
- **BloodResult**: report FK, biomarker FK, value, unit, flag (8 tiers: optimal→critical), deviation_pct
- **HealthRecommendation**: report FK, category (diet/exercise/supplement/medical/lifestyle), priority, title/description (EN+BG), related_biomarkers (JSON)
- **Vehicle**: user FK, linked_property FK (optional), plate_number, make, model, year, color, fuel_type, vin, engine_cc, first_registration_date, is_active, notes
- **VehicleObligation**: vehicle FK, obligation_type (mtpl/kasko/vignette/mot/vehicle_tax/green_card/assistance/custom), custom_type_name, start_date, end_date, provider, policy_number, cost, currency, reminder_days (JSON), is_current, notes
- **ObligationFile**: obligation FK, file, label, file_size, uploaded_at
- **VehicleReminder**: obligation FK, remind_at, sent, sent_at, notification_id
- **BPSession**: user FK, profile FK, measured_at, avg_systolic, avg_diastolic, avg_pulse, reading_count, stage (AHA), notes
- **BPReading**: user FK, profile FK, session FK (nullable), systolic, diastolic, pulse, measured_at, arm (left/right), posture (sitting/standing/lying), context tags (caffeine/exercise/medication/stressed/clinic/fasting), notes
- **BPMedication**: user FK, profile FK, name, dose, frequency (daily/twice_daily/as_needed/other), started_at, ended_at, is_active, notes
- **BPMedLog**: medication FK, date, taken (bool), taken_at — unique_together: medication + date
- **BPAlert**: user FK, profile FK, alert_type (8 types: crisis/sustained_high/stage_change/morning_surge/white_coat/masked/variability/medication_effective), severity, title/title_bg, message/message_bg, related_reading FK, is_read
- **WhoopConnection**: user OneToOne, whoop_user_id, access/refresh_token, token_expires_at, scopes, last_sync_at, is_active, sync_error
- **WhoopCycle**: user FK, whoop_id (unique), start/end, timezone_offset, score_state, strain (0-21), kilojoule, avg/max_heart_rate
- **WhoopRecovery**: user FK, cycle OneToOne, sleep_id, score_state, recovery_score (0-100), resting_heart_rate, hrv_rmssd_milli, spo2_percentage, skin_temp_celsius
- **WhoopSleep**: user FK, whoop_id (unique), cycle FK, start/end, nap, score_state, performance/consistency/efficiency pct, respiratory_rate, stage durations (light/sws/rem/awake milli), sleep_cycle_count, disturbance_count, sleep_needed (baseline/debt/strain/nap milli)
- **WhoopWorkout**: user FK, whoop_id (unique), cycle FK, sport_id/name, start/end, score_state, strain, avg/max_heart_rate, kilojoule, distance_meter, HR zone durations (0-5 milli)

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
- [x] Step 14.8: Notes — Apple Notes-style block editor with folders, tags, checklists, tables, entity linking, auto-save
- [x] Step 14.9: Health Tracker — blood results tracking, PDF parsing (Ramus/LINA), biomarker analysis, body system scoring, lifestyle recommendations, multi-person profiles
- [x] Step 15.0: Vehicles — Bulgarian vehicle obligation tracker (insurance, vignette, MOT, tax), compliance dashboard, multi-vehicle, cost analytics, quick-renew, file uploads, multi-tier reminders
- [x] Step 15.05: Blood Pressure — AHA staging, session-based measurement, circadian analysis, cardiovascular risk (BP + blood biomarkers), context correlations, medication tracking, white-coat/masked detection, trend projection, doctor export
- [x] Step 15.06: Lifestyle → Health merge — moved /lifestyle to /health/lifestyle, added BP links to lifestyle, DASH diet principles, BP supplements
- [x] Step 15.07: WHOOP Integration — OAuth2 connection, recovery/sleep/strain sync, HRV analysis, cardiovascular fitness scoring (WHOOP + BP + blood), Celery periodic sync
- [ ] Step 15.1: Celery tasks (auto-notifications, reminders)
- [ ] Step 16: Financial reports & charts
