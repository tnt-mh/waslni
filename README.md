# Waslni — Le covoiturage rendu facile

**Waslni** is a complete, mobile-first carpooling platform for Algeria. It connects drivers and passengers across all 58 wilayas, with lawful cost-sharing, document verification, PIN-based boarding, cash payments, ratings, in-app messaging, and a full moderation dashboard — in **French**, **Arabic (full RTL)**, and **English**.

> Le covoiturage rendu facile. — Carpooling, made easy.

This repository ships a fully working **Progressive Web App** (the spec's permitted fallback when a native build isn't available) backed by a local, persistent demo store, **plus a production-ready Supabase SQL schema** (row-level security + seat-capacity trigger) ready to wire up.

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
- Users, document review (approve/reject), suspension, reports, review moderation, rides, reservations, analytics, cities, announcements — with strict role-based access.

### Unique touches
- Recurring rides, smart matching, women-only preference, favourite drivers, ride-request matching, and a savings / CO₂ calculator (labelled as estimates).

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | React 19 + TypeScript (strict) |
| Build tool | Vite 6 |
| Routing | React Router 7 (HashRouter) |
| State | Zustand 5 (persisted to `localStorage`) |
| Animation | Framer Motion 12 |
| Icons | lucide-react |
| Dates | date-fns |
| Validation | zod |
| Backend (production) | Supabase — see [`supabase/schema.sql`](supabase/schema.sql) |
| Delivery | Installable PWA (manifest + service worker) |

---

## Dependencies

This is a **Node.js** project, so the canonical, installable manifest is [`package.json`](package.json) (locked by `package-lock.json`). A flat, human-readable listing is also provided in [`requirements.txt`](requirements.txt) — note those are **npm** packages, installed with `npm install`, not pip.

### Runtime dependencies

| Package | Version | Purpose |
| --- | --- | --- |
| `react` | 19.1.0 | UI library |
| `react-dom` | 19.1.0 | React DOM renderer |
| `react-router-dom` | 7.6.2 | Client-side routing |
| `zustand` | 5.0.5 | State management + persistence |
| `framer-motion` | 12.43.0 | Animations & transitions |
| `lucide-react` | 0.511.0 | Icon set |
| `date-fns` | 4.1.0 | Date formatting & helpers |
| `zod` | 3.25.7 | Schema validation |

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
- **Node.js 18+** (Node 20/22 LTS recommended) and **npm**.

### Install & run

```bash
# 1. install dependencies
npm install

# 2. start the dev server (http://localhost:5173)
npm run dev

# 3. type-check
npm run typecheck

# 4. production build (outputs to dist/)
npm run build

# 5. preview the production build locally
npm run preview
```

### Demo accounts

On the welcome screen, open **"Comptes de démonstration"**. Password for every demo account is **`demo1234`**.

| Account | Role | Email |
| --- | --- | --- |
| Amina Tounsi | Passenger | `amina@demo.waslni.dz` |
| Karim Benali | Verified driver | `karim@demo.waslni.dz` |
| Admin | Administrator | `admin@waslni.dz` |

Other seeded drivers/passengers (Yacine, Sara, Lina, Amine, Mohand, Nassim, Rym) are also available. Demo records are tagged **Démo** and kept separate from data you create.

---

## Project structure

```
.
├── index.html                  # App shell, fonts, PWA meta
├── public/
│   ├── icon.svg                # Logo (road + pin + motion)
│   ├── manifest.webmanifest    # PWA manifest
│   ├── sw.js                   # Service worker
│   └── illustrations/          # Onboarding artwork
├── src/
│   ├── main.tsx                # Entry point + SW registration
│   ├── App.tsx                 # Routes, auth guards, shell
│   ├── components/             # UI kit, RideCard, SearchForm, CityPicker, MapView, …
│   ├── screens/                # Passenger, driver, auth, admin, safety screens
│   │   ├── auth/               # Welcome, onboarding, login, signup, phone OTP, profile setup
│   │   └── driver/             # Dashboard, publish wizard, verification, manage ride
│   ├── lib/                    # store, types, utils, cities, seed data
│   ├── i18n/                   # fr / en / ar dictionaries + provider
│   └── styles/global.css       # Design system (navy palette, RTL-aware)
├── supabase/schema.sql         # Production schema: tables, RLS, capacity trigger
├── requirements.txt            # Flat npm dependency listing (see note above)
├── package.json                # Canonical dependency manifest + scripts
└── vite.config.ts
```

---

## PWA

The app is installable: it ships a web manifest, theme colour, icons, and a service worker (registered in production builds). It works offline for the local demo store; cloud sync requires Supabase.

## Production backend (Supabase)

[`supabase/schema.sql`](supabase/schema.sql) defines the full relational model (users, vehicles, documents, verifications, rides, bookings, reviews, reports, messages, notifications, cities, announcements, …) with **row-level security** and a **trigger that prevents overbooking / negative seat capacity**. To go live:

1. Create a Supabase project and run `schema.sql`.
2. Add your project URL + anon key via the in-app **Settings → Integrations** screen (never commit service-role keys to the client).
3. Replace the local store actions with Supabase calls.

The in-app **Integrations** screen lists every external service (Supabase, SMS, maps, push, storage, location) and its connection status, so missing keys are explicit rather than silently faked.

---

## Honesty & safety guarantees

- Identity verification, SMS, payments, live location, and emergency response are **never simulated as real**. Where an integration is absent, the UI says so.
- Identity documents are private and only visible to moderation — never on public profiles.
- SOS shows real emergency numbers and clearly states it does not guarantee intervention.
- Prices represent lawful cost-sharing, not unlicensed commercial transport.
- Reviews only come from verified, completed bookings; duplicate bookings and negative seats are prevented.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript check only |

---

## License

Provided as-is for demonstration and evaluation. Add your preferred license before public distribution.