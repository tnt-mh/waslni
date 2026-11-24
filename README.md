# Waslni — Le covoiturage rendu facile

**Waslni** is a complete, mobile-first carpooling platform for Algeria. It connects drivers and passengers across all 58 wilayas, with lawful cost-sharing, document verification, PIN-based boarding, cash payments, ratings, in-app messaging, and a full moderation dashboard — in **French**, **Arabic (full RTL)**, and **English**.

> Le covoiturage rendu facile. — Carpooling, made easy.

The application is a responsive, installable **PWA** with two explicitly separated modes:

- **Production (default):** Supabase Auth, PostgreSQL, row-level security, private Storage, RPCs, and Realtime. Production never falls back to demo data or `localStorage`.
- **Demo:** local seeded data, clearly labelled demo accounts, and local persistence. Select it only with `VITE_APP_MODE=demo`.

See [UPGRADE-DELIVERY-REPORT.md](UPGRADE-DELIVERY-REPORT.md) for backup details, migration inventory, validation results, limitations, and deployment steps.

---

## Highlights

- **One account, two roles.** Switch between passenger and driver modes at any time.
- **Real, working flows.** Search → ride details → booking request → driver decision → 4-digit PIN → boarding → completion → dual cash confirmation → review. Every button does something.
- **Trust & safety first.** Per-step verification badges (phone, ID, licence, vehicle), private documents, PIN boarding, trusted contacts, SOS with real Algerian emergency numbers, and reporting + moderation.
- **Honest by design.** Demo data is clearly labelled and separated from real data. The app never fakes SMS delivery, identity verification, online payments, live tracking, or emergency intervention.
- **Lawful cost-sharing.** Prices are framed as fuel/toll/wear sharing — never commercial transport — with estimates clearly marked as indicative.
- **Trilingual + RTL.** French (default), Arabic with a true right-to-left layout, and English. Prices in DZD (DA / دج), phones in +213 format.

---

## Feature overview

### Passenger
- Home with search ("Où souhaitez-vous aller ?"), recent searches, popular destinations, upcoming reservations, favourite drivers.
- Results with sort/filter and **list + schematic map** views.
- Ride details, "Réserver ma place", booking requests, ride requests when no ride exists.
- Reservation detail with PIN, share-ride, safety shortcuts, cancellation.

### Driver
- Document verification (ID, licence, carte grise, selfie) with statuses: `not_submitted / pending / verified / rejected / expired`. **Unverified drivers can never publish.**
- Dashboard stats, a **10-step publish wizard**, recurring rides, edit/cancel.
- Accept/reject bookings, PIN boarding, mark no-show, complete rides.

### Trust, payments, ratings, messaging
- PIN boarding, share ride with trusted contacts, SOS (17 / 1055 / 14) with an explicit "no guaranteed intervention" disclaimer.
- **Cash only**, paid directly passenger → driver; total shown before booking; **both parties confirm**; history kept.
- 1–5 star ratings with optional categories, only from verified completed bookings; report abusive reviews.
- 1-to-1 messaging with ride context, quick replies, block/report. Demo auto-replies are clearly tagged.

### Admin
- Desktop-first dashboard with responsive mobile tables: users, document review, reports, moderation history, appeals, staff, rides, reservations, reviews, cities, and announcements.
- Backend-enforced `super_admin`, `admin`, `moderator`, and `read_only` permissions.
- Warnings, temporary timeouts, permanent bans, authorized reversals, appeal decisions, immutable audit records, and staff-only notes.
- Restricted users stay authenticated and can view their own restriction history and submit appeals.

### Unique touches
- Recurring rides, smart matching, women-only preference, favourite drivers, ride-request matching, and a savings / CO₂ calculator (labelled as estimates).

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | React 19 + TypeScript (strict) |
| Build tool | Vite 6 |
| Routing | React Router 7 (HashRouter) |
| State | Zustand 5; demo-only persistence |
| Animation | Framer Motion 12 |
| Icons | lucide-react |
| Dates | date-fns |
| Validation | zod |
| Backend (production) | Supabase Auth, PostgreSQL 15, RLS, Storage, Realtime, Edge Functions |
| Delivery | Installable PWA (manifest + service worker) |

---

## Dependencies

This is a **Node.js** project, so the canonical, installable manifest is [`package.json`](package.json) (locked by `package-lock.json`). A flat, human-readable listing is also provided in [`requirements.txt`](requirements.txt) — note those are **npm** packages, installed with `npm install`, not pip.

### Runtime dependencies

| Package | Version | Purpose |
| --- | --- | --- |
| `@supabase/supabase-js` | 2.119.2 | Production backend client |
| `react` | 19.1.0 | UI library |
| `react-dom` | 19.1.0 | React DOM renderer |
| `react-router-dom` | 7.18.6 | Client-side routing |
| `zustand` | 5.0.5 | State management + demo-only persistence |
| `framer-motion` | 12.43.0 | Animations & transitions |
| `lucide-react` | 0.511.0 | Icon set |
| `date-fns` | 4.1.0 | Date formatting & helpers |
| `zod` | 4.6.7 | Schema validation |

### Dev dependencies

| Package | Version | Purpose |
| --- | --- | --- |
| `vite` | 6.3.5 | Dev server & bundler |
| `@vitejs/plugin-react` | 4.5.0 | React fast-refresh for Vite |
| `typescript` | 5.8.3 | Type checking |
| `@types/react` | 19.1.6 | React type definitions |
| `@types/react-dom` | 19.1.5 | React DOM type definitions |
| `@types/node` | 22.15.29 | Node type definitions |

---

## Getting started

### Prerequisites
- **Node.js 20+** and **npm**.
- A Supabase project for production.
- Supabase CLI only when deploying migrations/functions from the terminal.

### Install

```bash
npm install
```

### Run the local demo

```bash
# macOS / Linux
VITE_APP_MODE=demo npm run dev

# Windows PowerShell
$env:VITE_APP_MODE="demo"; npm run dev
```

Open `http://localhost:5173`. Production is the default, so `npm run dev` without Supabase configuration intentionally shows a setup error instead of loading demo data.

### Type-check and build

```bash
npm run typecheck
npm run build
npm run preview
npm audit --omit=dev
```

The production output is `dist/`.

### Demo accounts

On the welcome screen, open **"Comptes de démonstration"**. Password for every demo account is **`demo1234`**.

| Account | Role | Email |
| --- | --- | --- |
| Amina Tounsi | Passenger | `amina@demo.waslni.dz` |
| Karim Benali | Verified driver | `karim@demo.waslni.dz` |
| Admin Waslni | Super administrator | `admin@waslni.dz` |

Other seeded drivers/passengers (Yacine, Sara, Lina, Amine, Mohand, Nassim, Rym) are also available. Demo records are tagged **Démo** and kept separate from data you create.

---

## Project structure

```
.
├── public/                         # PWA assets and service worker
├── src/
│   ├── components/                 # UI kit, public shell, admin shell/tables
│   ├── screens/                    # Passenger, driver, auth, admin, safety
│   ├── lib/                        # Types, demo store, cloud store, runtime, staff
│   └── i18n/                       # FR / EN / AR dictionaries and RTL provider
├── supabase/
│   ├── migrations/                 # Ordered base schema, hardening, RPCs, storage, seed
│   ├── functions/document-url/     # Audited 60-second private document URLs
│   └── schema.sql                  # Legacy manual bootstrap reference
├── .env.example
├── package.json
├── package-lock.json
├── requirements.txt
└── UPGRADE-DELIVERY-REPORT.md
```

---

## PWA

The app is installable: it ships a web manifest, theme colour, icons, and a service worker (registered in production builds). Offline persistence applies only to the explicitly selected local demo mode; production requires Supabase and displays connection errors rather than pretending data was saved.

## Production configuration

Copy the example and fill in public project settings:

```bash
cp .env.example .env.local
```

```dotenv
VITE_APP_MODE=production
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_MAPBOX_TOKEN=
VITE_VAPID_PUBLIC_KEY=
```

Only the Supabase **anon/public key** belongs in frontend environment variables. Never put a service-role key, database password, SMS credential, or private document URL in `VITE_*` variables or client code. The in-app **Settings → Integrations** screen reports configuration and connection status without claiming unavailable services are connected.

## Supabase deployment

### 1. Configure Auth and Storage

1. Create a PostgreSQL 15 Supabase project.
2. Enable email authentication and configure the application Site URL and redirect URLs.
3. For phone OTP, configure a real SMS provider and template. Until delivery succeeds, the app states that no code has been sent; demo OTP behavior is unavailable in production.
4. Keep `driver-documents` private. Migration `20261124000300_private_storage.sql` creates the bucket and owner-scoped policies.

### 2. Apply migrations in lexical order

The migration directory is self-contained for a fresh database:

```text
20261123999900_base_schema.sql
20261124000000_staff_moderation.sql
20261124000100_hardened_rls.sql
20261124000200_backend_rpcs.sql
20261124000300_private_storage.sql
20261124000400_private_access_and_contracts.sql
20261124000500_security_races_and_privacy.sql
20261124000600_ride_and_conversation_parity.sql
20261124000700_seed_cities.sql
```

With the Supabase CLI:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Alternatively, run each file top-to-bottom in the Supabase SQL editor in the order above. Take a database backup first and review the migration plan before applying it to an existing project.

[`supabase/schema.sql`](supabase/schema.sql) is retained as a **legacy manual bootstrap reference**. Do not rerun it after the hardening migrations; doing so would restore superseded grants and policies.

### 3. Assign the first administrator

Create the administrator account through normal signup, then run a one-time service-role SQL command in the Supabase SQL editor:

```sql
insert into public.staff_members (user_id, role, active, created_by)
select id, 'super_admin', true, null
from public.users
where email = 'administrator@example.com'
on conflict (user_id) do update
set role = 'super_admin', active = true, updated_at = now();
```

Authorization uses `staff_members`, not the editable frontend or the legacy `users.role` flag. Never expose the service-role key to perform this operation from the browser.

### 4. Deploy the private-document Edge Function

The frontend never receives a public identity-document URL. The `document-url` function validates the caller, records access, and returns a 60-second signed URL.

```bash
supabase functions deploy document-url
supabase secrets set ALLOWED_ORIGINS=https://your-domain.example
```

`ALLOWED_ORIGINS` is a comma-separated list of exact frontend origins. Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the function runtime; the service-role key is used only inside that server-side function.

### 5. Deploy the frontend

Set production environment variables in the hosting provider, run `npm run build`, and deploy `dist/`. The existing Wasmer deployment can be updated with the new output and environment variables; the published demo URL is not automatically converted into a production backend.

---

## Honesty & safety guarantees

- Identity verification, SMS, payments, live location, and emergency response are **never simulated as real**. Where an integration is absent, the UI says so.
- Identity documents are private and only visible to moderation — never on public profiles.
- SOS shows real emergency numbers and clearly states it does not guarantee intervention.
- Prices represent lawful cost-sharing, not unlicensed commercial transport.
- Reviews only come from verified, completed bookings; duplicate bookings and negative seats are prevented.

---

## Security model

- Supabase Auth owns production credentials and sessions.
- PostgreSQL RLS and `SECURITY DEFINER` RPCs enforce ownership, staff permissions, booking transitions, seat capacity, moderation, and document access.
- Privileged table writes are revoked from normal clients even when a policy exists.
- Booking capacity is serialized on the ride row and protected by a partial unique active-booking index.
- Identity documents use owner-prefixed paths in a private bucket. Metadata is soft-superseded so immutable access-audit foreign keys remain valid.
- Staff notes, evidence, and moderation history are not exposed to normal users.
- Warnings do not suspend accounts. Timeouts and bans are separate restrictions, and only authorized staff can reverse them.
- Private/sensitive tables are excluded from Realtime publication. Private state refreshes after mutations, every 30 seconds while visible, and on focus/visibility changes.
- A production connection failure is shown as an error; the app never silently switches to local data.

Frontend permission helpers control navigation and presentation only. Backend checks are the security boundary.

## Validation status

The repository has no automated test runner yet. Completed checks include:

- `npm run typecheck`
- `npm run build`
- `npm audit --omit=dev` with zero reported production vulnerabilities
- Browser checks of demo passenger, driver, admin, mobile layout, Arabic RTL, and production fail-closed configuration
- Browser checks of timeout routing, restriction privacy, appeal submission, independent reversal, restored access, and staff-role promotion
- Static SQL migration review

A real Supabase project was not available in the development environment. Migration execution, multi-user RLS tests, OTP delivery, booking-race tests, Storage/Edge Function deployment, and production Realtime must still be verified in the target project before launch. See the delivery report for the full test matrix and limitations.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript check only |
| `npm audit --omit=dev` | Audit production dependencies |

---

## License

Provided as-is for demonstration and evaluation. Add your preferred license before public distribution.