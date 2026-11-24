# Waslni Upgrade Delivery Report

**Date:** 2026-11-24

**Repository:** `tnt-mh/waslni`

**Working branch:** `main`

**Original commit:** `8ff8b41d120264a85bfeabba00f869df7205c244`

**Delivery status:** Application upgrade implemented and locally validated. Production Supabase deployment and live-backend verification remain pending because no Supabase project credentials were available.

---

## 1. Backup and rollback record

The verified backup was created before any upgrade source edits.

| Item | Value |
| --- | --- |
| Backup directory | `C:\Users\PCPRODZ\Documents\Qoder\waslni-backups\waslni-pre-admin-desktop-upgrade-20261124-093124` |
| Source archive | `waslni-source-backup.tar.gz` |
| SHA-256 | `4ec45a2f502a94ffed66ba43e3d9b5d52c17806e9fd01ac5937eabcf956204e0` |
| Archive entries | 276 |
| Extracted inspection copy | `project/` |
| Manifest | `BACKUP-MANIFEST.txt` |
| Original branch and commit | `main` at `8ff8b41d120264a85bfeabba00f869df7205c244` |
| Backup branch | `backup/pre-admin-desktop-upgrade` at the same commit |
| Exclusions | `node_modules/` and `dist/` only |

The archive hash and entry count were rechecked at final delivery. No `.env`, private key, service-role key, database password, or other credential was found in the pre-upgrade source. The earlier incomplete backup directory `waslni-pre-admin-desktop-upgrade-20261124-092949` was left untouched.

For source rollback, use the backup branch or extracted copy in a separate working directory. Do not overwrite the current working tree without first preserving any new work. A production database rollback additionally requires a separate Supabase/database backup; the source archive does not contain production data.

---

## 2. Delivered changes

### Runtime and mode separation

- Production is now the default runtime.
- Demo mode is selected explicitly with `VITE_APP_MODE=demo`.
- Production without Supabase configuration fails closed with a setup/error screen.
- Production never loads seed users, rides, bookings, or other demo records.
- Production never silently falls back to `localStorage`.
- Zustand persistence is limited to the explicitly selected demo runtime.
- Demo actions remain visibly labelled as local demonstration behavior.

### Supabase Auth and production data

- Added `@supabase/supabase-js` and a public-anon-key-only client.
- Supabase Auth owns production credentials and sessions.
- Added production implementations for signup, login, logout, password reset, profile updates, language changes, and session restoration.
- Added a complete production cloud store covering passenger, driver, messaging, notification, review, safety, admin, moderation, appeal, city, and announcement operations.
- Production mutations report backend/connection errors instead of pretending data was saved.
- Phone login requests a real OTP through the configured provider. Missing SMS configuration is stated explicitly; the app does not claim a code was sent.

### Private driver documents

- Added the private `driver-documents` Storage bucket.
- Storage paths are owner-prefixed and restricted to the active owner.
- Direct client document INSERT/DELETE paths were removed in favor of controlled RPCs.
- Document metadata is soft-superseded rather than deleted, preserving immutable access-audit references.
- Submission and approval require exactly one active document of every required kind and verify that the Storage object exists.
- Dossier creation and locking are serialized through `rpc_lock_driver_dossier`.
- Document reads use the server-side `document-url` Edge Function, caller authorization, an access-audit write, and a 60-second signed URL.
- No public identity-document URL is exposed.

### PostgreSQL security and data integrity

- Added staff roles: `super_admin`, `admin`, `moderator`, and `read_only`.
- Staff authorization is based on `staff_members`; the frontend `users.role` value is not the security boundary.
- Added RLS, `SECURITY DEFINER` RPCs, explicit grants/revokes, ownership checks, and server-side validation for privileged transitions.
- Booking capacity is serialized on the ride row and protected against duplicate active bookings and negative seat capacity.
- Users cannot change their own verification state or assign themselves staff roles.
- Drivers manage only their own rides; passengers manage only their own bookings.
- Private/sensitive tables were removed from the Realtime publication.
- Private state refreshes after mutations, every 30 seconds while visible, and on focus/visibility changes.

### Admin and moderation

- Added a desktop-first collapsible admin shell, topbar, dashboard cards/charts, filters, pagination, and responsive mobile tables.
- Admin areas include users, verifications, reports, moderation queue/history, appeals, staff, rides, reservations, reviews, cities, and announcements.
- Added warnings, temporary timeouts, permanent bans, authorized reversals, and appeal decisions.
- Warnings do not suspend accounts.
- Timeouts and bans are separate restriction types.
- Restricted users remain authenticated and can view their own public restriction history and submit appeals.
- Internal moderator notes, evidence, and decision notes are restricted to authorized staff.
- Historical moderation actions are immutable through the application.
- Appeal grants can reverse a restriction only when performed by an independent authorized administrator.
- The super-admin staff screen can promote an existing user to a staff role or deactivate staff access.

### Desktop, mobile, localization, and PWA

- Public, driver, and admin layouts were improved for desktop while retaining mobile/tablet behavior.
- Added responsive admin tables that become labeled cards on small screens.
- French, English, and Arabic dictionaries were updated for all new admin, moderation, appeal, runtime, and integration text.
- Arabic RTL behavior and horizontal-overflow checks were completed.
- Existing PWA installation and service-worker behavior were preserved.
- Production popular destinations now resolve production UUID city IDs or wilaya codes correctly.
- A new repeatable migration seeds all 58 wilayas.

### Browser-discovered defects corrected

- Trusted-contact delete controls no longer render inside another button.
- The restricted-account screen no longer crashes from unstable Zustand filtered snapshots.
- The staff screen can now add staff roles instead of only editing existing staff rows.
- Non-staff users are no longer displayed as active read-only staff.
- The account-access banner now reflects the effective restriction state after reversal instead of showing a stale ban message.
- Missing admin labels for departure, price, and rating were added in FR/EN/AR.

### Dependencies and documentation

- Upgraded React Router to `7.18.6` and Zod to `4.6.7`.
- Added Supabase JS `2.119.2`.
- Updated `package.json`, `package-lock.json`, and `requirements.txt`.
- Added `.env.example` with placeholders only.
- Updated `README.md` with production/demo separation, migration order, first-admin setup, Edge Function deployment, security model, and validation limitations.
- Marked `supabase/schema.sql` as a legacy manual bootstrap that must not be rerun after hardening migrations.

---

## 3. Migration inventory

Apply these files in lexical order. The baseline makes a fresh migrations-only deployment self-contained.

| Order | File | Purpose |
| --- | --- | --- |
| 1 | `20261123999900_base_schema.sql` | Standalone baseline schema for fresh databases |
| 2 | `20261124000000_staff_moderation.sql` | Staff roles, restrictions, appeals, and moderation records |
| 3 | `20261124000100_hardened_rls.sql` | Hardened RLS, helper-function ordering, ownership and staff checks |
| 4 | `20261124000200_backend_rpcs.sql` | Server-side application RPCs and validated transitions |
| 5 | `20261124000300_private_storage.sql` | Private document bucket and owner-scoped Storage policies |
| 6 | `20261124000400_private_access_and_contracts.sql` | Private access, document supersession, dossier locking, safe views |
| 7 | `20261124000500_security_races_and_privacy.sql` | Race protection, active-document validation, privacy and Realtime hardening |
| 8 | `20261124000600_ride_and_conversation_parity.sql` | Ride-edit parity, recurrence rebuilding, conversation rules, date-aware matching |
| 9 | `20261124000700_seed_cities.sql` | Repeatable seed of all 58 wilayas |

`supabase/schema.sql` is retained only as a legacy manual bootstrap reference. Do not execute it after the hardening migrations because it contains superseded grants and policies.

---

## 4. Integration status

| Integration | Implementation | Live status |
| --- | --- | --- |
| Supabase Auth | Complete client and production flows | Not connected; requires project configuration |
| PostgreSQL schema | Nine ordered migrations supplied | Not executed against a live project |
| RLS and RPC security | Implemented and statically reviewed | Requires live multi-user verification |
| Private Storage | Private bucket, owner policies, controlled upload/removal | Not deployed/tested live |
| Document URL Edge Function | Implemented with audit and 60-second signed URLs | Not deployed/tested live |
| Realtime | Public mutable data only; private tables excluded | Not tested against live Supabase |
| SMS OTP | Real-provider request path and configuration warnings | Provider not configured; no SMS claimed or delivered |
| Mapbox | Optional schematic-map enhancement | Token not configured |
| Web push | Optional VAPID configuration | Keys not configured |
| Wasmer hosting | Existing deployment inspected | Not redeployed by this delivery |

No service-role key is present in frontend code. The Edge Function reads `SUPABASE_SERVICE_ROLE_KEY` only from its server runtime. Frontend configuration uses the public anon key.

---

## 5. Validation results

### Final local checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| `npm audit --omit=dev` | Passed; 0 vulnerabilities |
| `git diff --check` | Passed |
| Backup SHA-256 | Matches the recorded hash |
| Backup archive entries | 276 |
| Secret-pattern review | Only documentation, type names, and server-side environment-variable references; no credential values found |

Final production build output:

- 2,152 modules transformed
- CSS: 35.11 kB, gzip 7.84 kB
- Main JavaScript: 884.98 kB, gzip 239.40 kB
- Build completed successfully in approximately 5.28 seconds
- Vite emitted a non-blocking warning that the main chunk exceeds 500 kB

### Browser checks completed

- Demo passenger, driver, and admin route sweeps.
- Mobile-width route checks without horizontal overflow.
- Desktop admin shell and dashboard verification.
- French, English, and Arabic rendering, including RTL.
- Admin-tab raw-translation-key sweep.
- Production-without-Supabase fail-closed screen with empty local storage.
- Safety screen nested-control regression check.
- Timeout issuance through the admin UI.
- Redirect of a timed-out user to `/account/restrictions`.
- Restriction history and public message visibility.
- Internal moderation reason/note hidden from the restricted user.
- Appeal submission by the restricted user.
- Independent administrator appeal grant.
- Restriction reversal and restored account access.
- Public appeal response visible to the user.
- Internal appeal decision note hidden from the user.
- Correct active-account banner after reversal.
- Super-admin promotion of an existing user to administrator.
- Administrator staff-management tab hidden as expected.
- Final restricted-account/appeals reload with no browser console errors or warnings.

### Static backend review

Static SQL review covered function ordering, fresh migration bootstrap, grants, policy replacement risks, document lifecycle, active-document completeness, Storage object checks, moderation row locking, private Realtime exposure, route validation, and date-aware ride matching. Identified issues were corrected before delivery.

### Not executed against a live backend

No Supabase credentials, PostgreSQL instance, Docker, Supabase CLI, or Deno runtime were available locally. The following remain launch-gate tests:

- Migration execution on a fresh Supabase database.
- Migration execution against an existing target database.
- Real email signup/login/reset and session behavior.
- Real SMS OTP delivery and verification.
- Multi-user RLS tests using separate authenticated sessions.
- Attempted cross-user document, ride, booking, profile, and staff-role access.
- Private Storage upload/read/delete behavior.
- Edge Function deployment, origin checks, audit writes, and signed-URL expiry.
- Live Realtime delivery and privacy behavior.
- Concurrent booking/capacity race tests.
- Live timeout, ban, reversal, and appeal transitions through RPCs.
- Production hosting environment and redirect configuration.

The project does not yet include an automated test runner. Browser and static checks are recorded here rather than represented as an automated suite.

---

## 6. Deployment procedure

### 1. Prepare the target environment

1. Create a PostgreSQL 15 Supabase project.
2. Take a database backup or snapshot before modifying an existing database.
3. Enable email authentication.
4. Configure the production Site URL and allowed redirect URLs.
5. Configure a real SMS provider before enabling phone OTP.
6. Keep the `driver-documents` bucket private.

### 2. Configure frontend environment variables

Copy `.env.example` to `.env.local` for local work, or configure the equivalent variables in the hosting provider:

```dotenv
VITE_APP_MODE=production
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_MAPBOX_TOKEN=
VITE_VAPID_PUBLIC_KEY=
```

Only public values belong in `VITE_*` variables. Never add a service-role key, database password, SMS secret, or private credential to frontend configuration.

### 3. Apply migrations

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Alternatively, execute each migration top-to-bottom in the Supabase SQL editor in the order listed in section 3. Review the plan before applying migrations to an existing database. Do not rerun `supabase/schema.sql` after hardening.

### 4. Assign the first administrator

Create the administrator through normal signup, then run this one-time operation in the Supabase SQL editor using the privileged dashboard context:

```sql
insert into public.staff_members (user_id, role, active, created_by)
select id, 'super_admin', true, null
from public.users
where email = 'administrator@example.com'
on conflict (user_id) do update
set role = 'super_admin', active = true, updated_at = now();
```

Do not perform this operation from browser code and do not expose the service-role key to the client.

### 5. Deploy the document URL function

```bash
supabase functions deploy document-url
supabase secrets set ALLOWED_ORIGINS=https://your-domain.example
```

`ALLOWED_ORIGINS` must contain exact comma-separated frontend origins. Supabase provides the function runtime credentials server-side.

### 6. Build and deploy the frontend

```bash
npm install
npm run typecheck
npm run build
npm audit --omit=dev
```

Deploy `dist/` to the production host and configure the production environment variables there. Updating the existing Wasmer deployment requires deploying the new output and setting the Supabase variables; the current public demo URL is not automatically converted into a production backend.

### 7. Complete launch-gate verification

Before announcing production readiness:

- Create separate passenger, driver, moderator, admin, and super-admin accounts.
- Verify signup, login, logout, reset, and OTP with real delivery.
- Attempt cross-user reads and writes and confirm RLS denial.
- Upload private documents as an owner and confirm another user cannot access them.
- Confirm staff document access is audited and signed URLs expire.
- Run concurrent booking attempts and confirm capacity cannot be exceeded.
- Test timeout, appeal, independent reversal, and access restoration.
- Confirm warnings do not suspend accounts.
- Confirm Realtime does not deliver private-row events.
- Verify FR/EN/AR and RTL on the deployed domain.
- Verify production errors are visible and never trigger demo fallback.

---

## 7. Remaining limitations

- Live Supabase integration is implemented but unverified because no project credentials were supplied.
- SMS, Mapbox, and push are not configured and are not represented as connected.
- The existing Wasmer site has not been redeployed.
- No automated test suite exists yet.
- The main JavaScript bundle exceeds Vite’s 500 kB warning threshold; code splitting is a recommended performance follow-up, not a correctness blocker.
- This delivery does not certify legal, privacy-policy, retention, or regulatory compliance for production identity-document processing. Obtain appropriate legal review before collecting real identity documents.
- Demo test mutations were confined to the browser’s local demo store; they were not written to a production database.

---

## 8. Working-tree state

The upgrade is present in the working tree and has not been committed or pushed. `main` still points to the original commit `8ff8b41d120264a85bfeabba00f869df7205c244`; the backup branch preserves that same source state. Review the final diff and create a new commit only when requested.
