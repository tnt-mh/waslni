-- ============================================================================
-- Waslni — production schema for Supabase (PostgreSQL 15)
-- Carpooling for Algeria: drivers publish rides, passengers book seats,
-- cash cost-sharing payments, admin moderation.
--
-- LEGACY MANUAL BOOTSTRAP. For new installations, run the files in
-- supabase/migrations in lexical order instead. Never rerun this file after
-- the hardening migrations: its original grants and policies are intentionally
-- superseded by those migrations.
--
-- The base schema is idempotent-friendly for first-time manual setup:
--   * CREATE TABLE IF NOT EXISTS
--   * DO blocks for enums, DROP POLICY IF EXISTS before CREATE POLICY
--   * CREATE OR REPLACE FUNCTION / VIEW, DROP TRIGGER IF EXISTS
-- No seed data, no secrets. Field names mirror src/lib/types.ts (snake_case).
-- Demo-only fields (isDemo) and passwordHash/salt are intentionally omitted:
-- Supabase Auth (auth.users) owns credentials.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enums (mirror types.ts unions exactly)
-- ----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.verification_status AS ENUM ('not_submitted','pending','verified','rejected','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ride_status AS ENUM ('published','in_progress','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.booking_status AS ENUM ('pending','confirmed','rejected','cancelled','completed','no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.document_kind AS ENUM ('id_card','license','registration','selfie');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.report_status AS ENUM ('open','resolved','dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_type AS ENUM (
    'booking_request','booking_accepted','booking_rejected','ride_reminder',
    'message','ride_cancelled','verification_update','ride_match',
    'announcement','payment','review_request'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('user','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_status AS ENUM ('active','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_gender AS ENUM ('female','male','unspecified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_language AS ENUM ('fr','ar','en');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_mode AS ENUM ('passenger','driver');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.report_reason AS ENUM (
    'suspicious_profile','behavior','wrong_vehicle','wrong_driver',
    'unsafe_driving','harassment','fraud','no_show','abusive_review'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.report_target_type AS ENUM ('user','ride','review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.review_status AS ENUM ('visible','removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ride_request_status AS ENUM ('open','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.recurring_frequency AS ENUM ('daily','weekly','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 2. updated_at trigger helper
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Tables (FK dependency order)
-- ----------------------------------------------------------------------------

-- Public profile extension of auth.users. Credentials live in auth.users only.
CREATE TABLE IF NOT EXISTS public.users (
  id              uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name       text NOT NULL DEFAULT '',
  email           text,
  phone           text,
  photo_url       text,
  avatar_hue      integer NOT NULL DEFAULT 210 CHECK (avatar_hue BETWEEN 0 AND 360),
  date_of_birth   date,
  gender          public.user_gender NOT NULL DEFAULT 'unspecified',
  language        public.user_language NOT NULL DEFAULT 'fr',
  bio             text NOT NULL DEFAULT '',
  role            public.user_role NOT NULL DEFAULT 'user',
  mode            public.user_mode NOT NULL DEFAULT 'passenger',
  status          public.user_status NOT NULL DEFAULT 'active',
  phone_verified  boolean NOT NULL DEFAULT false,
  email_verified  boolean NOT NULL DEFAULT false,
  atmosphere      text[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Algerian wilayas (codes 1..58). Reference data, admin-managed.
CREATE TABLE IF NOT EXISTS public.cities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        integer NOT NULL UNIQUE CHECK (code BETWEEN 1 AND 58),
  name_fr     text NOT NULL,
  name_ar     text NOT NULL,
  lat         double precision NOT NULL,
  lon         double precision NOT NULL,
  popular     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- KYC documents. Only the private-storage path is stored here, never image bytes.
-- Storage note: create a PRIVATE bucket 'driver-documents' (public = false).
-- Suggested storage.objects policies:
--   * authenticated INSERT/SELECT/UPDATE/DELETE when
--     (storage.foldername(name))[1] = auth.uid()::text  (owner-prefixed paths)
--   * admins (public.is_admin()) SELECT/DELETE for moderation.
-- Documents are never publicly readable; signed URLs are minted server-side.
CREATE TABLE IF NOT EXISTS public.driver_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  kind          public.document_kind NOT NULL,
  storage_path  text NOT NULL,
  file_name     text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One verification dossier per user; admins transition status.
CREATE TABLE IF NOT EXISTS public.driver_verifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES public.users (id) ON DELETE CASCADE,
  status        public.verification_status NOT NULL DEFAULT 'not_submitted',
  document_ids  uuid[] NOT NULL DEFAULT '{}',
  submitted_at  timestamptz,
  reviewed_at   timestamptz,
  reviewed_by   uuid REFERENCES public.users (id) ON DELETE SET NULL,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  brand       text NOT NULL,
  model       text NOT NULL,
  color       text NOT NULL DEFAULT '',
  plate       text NOT NULL UNIQUE,
  year        integer NOT NULL CHECK (year BETWEEN 1950 AND 2100),
  seats       integer NOT NULL CHECK (seats > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Cost-sharing only: price floor 50 DZD. Capacity is enforced by the bookings
-- trigger (see enforce_booking_capacity), never by client-side counts.
CREATE TABLE IF NOT EXISTS public.rides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  vehicle_id      uuid NOT NULL REFERENCES public.vehicles (id) ON DELETE RESTRICT,
  from_city_id    uuid NOT NULL REFERENCES public.cities (id) ON DELETE RESTRICT,
  to_city_id      uuid NOT NULL REFERENCES public.cities (id) ON DELETE RESTRICT,
  departure_at    timestamptz NOT NULL,
  arrival_at      timestamptz NOT NULL,
  seats_total     integer NOT NULL CHECK (seats_total > 0),
  price_per_seat  integer NOT NULL CHECK (price_per_seat >= 50),
  pickup_point    text NOT NULL DEFAULT '',
  dropoff_point   text NOT NULL DEFAULT '',
  preferences     jsonb NOT NULL DEFAULT '{}',
  women_only      boolean NOT NULL DEFAULT false,
  status          public.ride_status NOT NULL DEFAULT 'published',
  notes           text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rides_distinct_cities CHECK (from_city_id <> to_city_id),
  CONSTRAINT rides_time_order CHECK (arrival_at > departure_at)
);

-- Ordered intermediate stops (mirrors Ride.stops; position preserves order).
CREATE TABLE IF NOT EXISTS public.ride_stops (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id     uuid NOT NULL REFERENCES public.rides (id) ON DELETE CASCADE,
  city_id     uuid NOT NULL REFERENCES public.cities (id) ON DELETE RESTRICT,
  label       text NOT NULL DEFAULT '',
  position    integer NOT NULL CHECK (position >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ride_stops_order_unique UNIQUE (ride_id, position)
);

-- Mirrors Ride.recurring (RecurringRule) as a 1:1 child table.
CREATE TABLE IF NOT EXISTS public.recurring_ride_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id       uuid NOT NULL UNIQUE REFERENCES public.rides (id) ON DELETE CASCADE,
  frequency     public.recurring_frequency NOT NULL,
  days_of_week  integer[] NOT NULL DEFAULT '{}' CHECK (days_of_week <@ ARRAY[0,1,2,3,4,5,6]),
  until_date    date,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Seat inventory. PIN is NULL until confirmed, then exactly 4 digits
-- (generated by enforce_booking_capacity); cleared again after boarding flow.
CREATE TABLE IF NOT EXISTS public.bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id         uuid NOT NULL REFERENCES public.rides (id) ON DELETE CASCADE,
  passenger_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  seats           integer NOT NULL CHECK (seats > 0),
  status          public.booking_status NOT NULL DEFAULT 'pending',
  pin             char(4),
  decided_at      timestamptz,
  boarded_at      timestamptz,
  completed_at    timestamptz,
  passenger_paid  boolean NOT NULL DEFAULT false,
  driver_received boolean NOT NULL DEFAULT false,
  paid_at         timestamptz,
  received_at     timestamptz,
  cancelled_by    uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_pin_consistency CHECK (
    (status = 'confirmed') = (pin IS NOT NULL)
    AND (pin IS NULL OR pin ~ '^[0-9]{4}$')
  )
);

-- Passenger demand posts ("I need a ride"), browsable by drivers while open.
CREATE TABLE IF NOT EXISTS public.ride_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  from_city_id    uuid NOT NULL REFERENCES public.cities (id) ON DELETE RESTRICT,
  to_city_id      uuid NOT NULL REFERENCES public.cities (id) ON DELETE RESTRICT,
  date            date NOT NULL,
  time_preference text NOT NULL DEFAULT '',
  seats           integer NOT NULL CHECK (seats > 0),
  max_budget      integer NOT NULL CHECK (max_budget >= 0),
  women_only      boolean NOT NULL DEFAULT false,
  status          public.ride_request_status NOT NULL DEFAULT 'open',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ride_requests_distinct_cities CHECK (from_city_id <> to_city_id)
);

-- Two FK columns instead of the TS tuple so participant integrity is enforced.
-- Canonical ordering (a < b) + UNIQUE prevents duplicate threads for a pair.
CREATE TABLE IF NOT EXISTS public.conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  participant_b uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  ride_id       uuid REFERENCES public.rides (id) ON DELETE SET NULL,
  booking_id    uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  blocked_by    uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_distinct_participants CHECK (participant_a < participant_b),
  CONSTRAINT conversations_pair_unique UNIQUE (participant_a, participant_b)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  text            text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  read_by         uuid[] NOT NULL DEFAULT '{}',
  auto_reply      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Reviews are only writable by participants of a completed booking (RLS).
CREATE TABLE IF NOT EXISTS public.reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  ride_id     uuid NOT NULL REFERENCES public.rides (id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  target_id   uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  stars       integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  categories  jsonb,
  text        text NOT NULL DEFAULT '',
  status      public.review_status NOT NULL DEFAULT 'visible',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_not_self CHECK (author_id <> target_id),
  CONSTRAINT reviews_one_per_author_booking UNIQUE (author_id, booking_id)
);

-- Polymorphic target (user/ride/review): no FK on target_id by design.
CREATE TABLE IF NOT EXISTS public.reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  target_type   public.report_target_type NOT NULL,
  target_id     uuid NOT NULL,
  reason        public.report_reason NOT NULL,
  details       text NOT NULL DEFAULT '',
  status        public.report_status NOT NULL DEFAULT 'open',
  action        text,
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  type        public.notification_type NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  route       text,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trusted_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  name        text NOT NULL,
  phone       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trusted_contacts_unique_phone UNIQUE (user_id, phone)
);

-- Immutable audit trail of cash cost-sharing confirmations (one per side).
-- Boolean flags on bookings remain the fast read model; this is the evidence.
CREATE TABLE IF NOT EXISTS public.payment_confirmations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  side          public.user_mode NOT NULL,
  confirmed_by  uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  amount_dzd    integer NOT NULL CHECK (amount_dzd >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_confirmations_one_per_side UNIQUE (booking_id, side)
);

-- Natural composite PK mirrors SavedDriver in types.ts (no surrogate id).
CREATE TABLE IF NOT EXISTS public.saved_drivers (
  user_id     uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  driver_id   uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, driver_id),
  CONSTRAINT saved_drivers_not_self CHECK (user_id <> driver_id)
);

CREATE TABLE IF NOT EXISTS public.announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text NOT NULL,
  created_by  uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. Helper functions (SECURITY DEFINER to avoid RLS recursion in policies)
-- ----------------------------------------------------------------------------

-- Admin check. SECURITY DEFINER + STABLE so it bypasses users RLS safely and
-- can be inlined into policies without recursive evaluation.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  );
$$;

-- True when the current user drives the given ride (bypasses rides RLS).
CREATE OR REPLACE FUNCTION public.is_ride_driver(p_ride_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rides r
    WHERE r.id = p_ride_id AND r.driver_id = auth.uid()
  );
$$;

-- Remaining confirmed-seat inventory; NULL when the ride does not exist.
CREATE OR REPLACE FUNCTION public.ride_available_seats(p_ride_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.seats_total - COALESCE((
    SELECT SUM(b.seats) FROM public.bookings b
    WHERE b.ride_id = p_ride_id AND b.status = 'confirmed'
  ), 0)
  FROM public.rides r
  WHERE r.id = p_ride_id;
$$;

-- ----------------------------------------------------------------------------
-- 5. Overbooking prevention + PIN lifecycle
-- ----------------------------------------------------------------------------

-- BEFORE INSERT OR UPDATE on bookings:
--   * Locks the parent ride row (SELECT ... FOR UPDATE) so concurrent
--     confirmations serialize and cannot overbook.
--   * For status 'confirmed': confirmed seats (excluding this row) + NEW.seats
--     must be <= rides.seats_total.
--   * Generates the 4-digit boarding PIN on confirmation; clears it otherwise.
-- Duplicate active bookings are blocked separately by the partial unique
-- index bookings_one_active_per_passenger.
CREATE OR REPLACE FUNCTION public.enforce_booking_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seats_total integer;
  v_ride_status public.ride_status;
  v_confirmed   integer;
BEGIN
  IF NEW.status = 'confirmed' THEN
    -- Serialize all seat decisions for this ride.
    SELECT r.seats_total, r.status
      INTO v_seats_total, v_ride_status
    FROM public.rides r
    WHERE r.id = NEW.ride_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ride % does not exist', NEW.ride_id;
    END IF;

    IF v_ride_status = 'cancelled' THEN
      RAISE EXCEPTION 'Cannot confirm a booking on a cancelled ride';
    END IF;

    SELECT COALESCE(SUM(b.seats), 0)
      INTO v_confirmed
    FROM public.bookings b
    WHERE b.ride_id = NEW.ride_id
      AND b.status = 'confirmed'
      AND b.id <> NEW.id;

    IF v_confirmed + NEW.seats > v_seats_total THEN
      RAISE EXCEPTION 'Overbooking prevented: % seat(s) requested, only % available',
        NEW.seats, v_seats_total - v_confirmed;
    END IF;

    IF NEW.pin IS NULL THEN
      NEW.pin := lpad((floor(random() * 10000))::integer::text, 4, '0');
    END IF;
    IF NEW.decided_at IS NULL THEN
      NEW.decided_at := now();
    END IF;
  ELSE
    -- PIN only exists while the booking is confirmed.
    NEW.pin := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_enforce_capacity ON public.bookings;
CREATE TRIGGER bookings_enforce_capacity
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_capacity();

-- ----------------------------------------------------------------------------
-- 6. updated_at triggers
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS users_set_updated_at ON public.users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS driver_verifications_set_updated_at ON public.driver_verifications;
CREATE TRIGGER driver_verifications_set_updated_at
  BEFORE UPDATE ON public.driver_verifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS vehicles_set_updated_at ON public.vehicles;
CREATE TRIGGER vehicles_set_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS rides_set_updated_at ON public.rides;
CREATE TRIGGER rides_set_updated_at
  BEFORE UPDATE ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS bookings_set_updated_at ON public.bookings;
CREATE TRIGGER bookings_set_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS ride_requests_set_updated_at ON public.ride_requests;
CREATE TRIGGER ride_requests_set_updated_at
  BEFORE UPDATE ON public.ride_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 7. Auto-provision profile + verification dossier on signup
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email, phone, photo_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email,
    NEW.phone,
    NEW.raw_user_meta_data ->> 'photo_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.driver_verifications (user_id, status)
  VALUES (NEW.id, 'not_submitted')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 8. Indexes
-- ----------------------------------------------------------------------------

-- Primary search path: city pair + departure, published rides only.
CREATE INDEX IF NOT EXISTS rides_search_idx
  ON public.rides (from_city_id, to_city_id, departure_at)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS rides_driver_idx ON public.rides (driver_id);

CREATE INDEX IF NOT EXISTS bookings_ride_idx ON public.bookings (ride_id);
CREATE INDEX IF NOT EXISTS bookings_passenger_idx ON public.bookings (passenger_id);

-- One active booking per passenger per ride (pending or confirmed).
CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_active_per_passenger
  ON public.bookings (ride_id, passenger_id)
  WHERE status IN ('pending','confirmed');

CREATE INDEX IF NOT EXISTS ride_requests_search_idx
  ON public.ride_requests (from_city_id, to_city_id, date)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON public.messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS notifications_user_read_idx
  ON public.notifications (user_id, read);

CREATE INDEX IF NOT EXISTS reviews_target_visible_idx
  ON public.reviews (target_id)
  WHERE status = 'visible';

CREATE INDEX IF NOT EXISTS driver_documents_user_idx ON public.driver_documents (user_id);
CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports (status);

-- ----------------------------------------------------------------------------
-- 9. Row Level Security
-- ----------------------------------------------------------------------------

ALTER TABLE public.users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_verifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_stops            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_ride_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trusted_contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_drivers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements         ENABLE ROW LEVEL SECURITY;

-- users: own row only for direct reads (sensitive columns); public reads go
-- through the public_profiles view. Inserts happen via handle_new_user only.
DROP POLICY IF EXISTS users_select_own_or_admin ON public.users;
CREATE POLICY users_select_own_or_admin ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

-- Own-row updates; non-admins cannot change their role (no self-promotion).
DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND (
      public.is_admin()
      OR role = (SELECT u.role FROM public.users u WHERE u.id = auth.uid())
    )
  );

DROP POLICY IF EXISTS users_admin_update ON public.users;
CREATE POLICY users_admin_update ON public.users
  FOR UPDATE TO authenticated
  USING (public.is_admin());

-- driver_documents: private KYC material. Owner + admins only, never public.
DROP POLICY IF EXISTS driver_documents_insert_own ON public.driver_documents;
CREATE POLICY driver_documents_insert_own ON public.driver_documents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS driver_documents_select_own ON public.driver_documents;
CREATE POLICY driver_documents_select_own ON public.driver_documents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS driver_documents_admin_select ON public.driver_documents;
CREATE POLICY driver_documents_admin_select ON public.driver_documents
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS driver_documents_admin_delete ON public.driver_documents;
CREATE POLICY driver_documents_admin_delete ON public.driver_documents
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- driver_verifications: users may submit (pending) but never self-verify.
DROP POLICY IF EXISTS driver_verifications_select_own_or_admin ON public.driver_verifications;
CREATE POLICY driver_verifications_select_own_or_admin ON public.driver_verifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS driver_verifications_insert_own ON public.driver_verifications;
CREATE POLICY driver_verifications_insert_own ON public.driver_verifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status IN ('not_submitted','pending'));

DROP POLICY IF EXISTS driver_verifications_update_own ON public.driver_verifications;
CREATE POLICY driver_verifications_update_own ON public.driver_verifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND status IN ('not_submitted','pending'));

DROP POLICY IF EXISTS driver_verifications_admin_update ON public.driver_verifications;
CREATE POLICY driver_verifications_admin_update ON public.driver_verifications
  FOR UPDATE TO authenticated
  USING (public.is_admin());

-- vehicles: shown on ride cards, so authenticated users may read; owners write.
DROP POLICY IF EXISTS vehicles_select_authenticated ON public.vehicles;
CREATE POLICY vehicles_select_authenticated ON public.vehicles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS vehicles_insert_own ON public.vehicles;
CREATE POLICY vehicles_insert_own ON public.vehicles
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS vehicles_update_own ON public.vehicles;
CREATE POLICY vehicles_update_own ON public.vehicles
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS vehicles_delete_own ON public.vehicles;
CREATE POLICY vehicles_delete_own ON public.vehicles
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS vehicles_admin_delete ON public.vehicles;
CREATE POLICY vehicles_admin_delete ON public.vehicles
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- rides: published rides are browsable; drivers see/manage their own; riders
-- with a booking keep visibility after the ride leaves 'published'.
DROP POLICY IF EXISTS rides_select ON public.rides;
CREATE POLICY rides_select ON public.rides
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    OR driver_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.ride_id = rides.id AND b.passenger_id = auth.uid()
    )
  );

-- Only verified drivers may publish or modify (incl. cancel) their own rides.
DROP POLICY IF EXISTS rides_insert_verified_driver ON public.rides;
CREATE POLICY rides_insert_verified_driver ON public.rides
  FOR INSERT TO authenticated
  WITH CHECK (
    driver_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.driver_verifications dv
      WHERE dv.user_id = auth.uid() AND dv.status = 'verified'
    )
  );

DROP POLICY IF EXISTS rides_update_verified_driver ON public.rides;
CREATE POLICY rides_update_verified_driver ON public.rides
  FOR UPDATE TO authenticated
  USING (
    driver_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.driver_verifications dv
      WHERE dv.user_id = auth.uid() AND dv.status = 'verified'
    )
  )
  WITH CHECK (
    driver_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.driver_verifications dv
      WHERE dv.user_id = auth.uid() AND dv.status = 'verified'
    )
  );

DROP POLICY IF EXISTS rides_admin_all ON public.rides;
CREATE POLICY rides_admin_all ON public.rides
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ride_stops / recurring rules: route metadata is readable; ride owner writes.
DROP POLICY IF EXISTS ride_stops_select_authenticated ON public.ride_stops;
CREATE POLICY ride_stops_select_authenticated ON public.ride_stops
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS ride_stops_write_owner ON public.ride_stops;
CREATE POLICY ride_stops_write_owner ON public.ride_stops
  FOR ALL TO authenticated
  USING (public.is_ride_driver(ride_id))
  WITH CHECK (public.is_ride_driver(ride_id));

DROP POLICY IF EXISTS recurring_ride_rules_select_authenticated ON public.recurring_ride_rules;
CREATE POLICY recurring_ride_rules_select_authenticated ON public.recurring_ride_rules
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS recurring_ride_rules_write_owner ON public.recurring_ride_rules;
CREATE POLICY recurring_ride_rules_write_owner ON public.recurring_ride_rules
  FOR ALL TO authenticated
  USING (public.is_ride_driver(ride_id))
  WITH CHECK (public.is_ride_driver(ride_id));

-- bookings: passengers see/create/cancel their own; drivers see and decide on
-- bookings on their rides. Capacity + PIN are enforced by the trigger.
DROP POLICY IF EXISTS bookings_select_passenger ON public.bookings;
CREATE POLICY bookings_select_passenger ON public.bookings
  FOR SELECT TO authenticated
  USING (passenger_id = auth.uid());

DROP POLICY IF EXISTS bookings_select_driver ON public.bookings;
CREATE POLICY bookings_select_driver ON public.bookings
  FOR SELECT TO authenticated
  USING (public.is_ride_driver(ride_id));

DROP POLICY IF EXISTS bookings_select_admin ON public.bookings;
CREATE POLICY bookings_select_admin ON public.bookings
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Insert: own pending request, published future ride, not your own ride,
-- seats within remaining inventory, women-only rides require female profile.
DROP POLICY IF EXISTS bookings_insert_passenger ON public.bookings;
CREATE POLICY bookings_insert_passenger ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    passenger_id = auth.uid()
    AND status = 'pending'
    AND seats <= public.ride_available_seats(ride_id)
    AND EXISTS (
      SELECT 1 FROM public.rides r
      WHERE r.id = ride_id
        AND r.status = 'published'
        AND r.departure_at > now()
        AND r.driver_id <> auth.uid()
        AND (
          NOT r.women_only
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.gender = 'female'
          )
        )
    )
  );

-- Passengers may only cancel their own active bookings.
DROP POLICY IF EXISTS bookings_update_passenger_cancel ON public.bookings;
CREATE POLICY bookings_update_passenger_cancel ON public.bookings
  FOR UPDATE TO authenticated
  USING (passenger_id = auth.uid() AND status IN ('pending','confirmed'))
  WITH CHECK (passenger_id = auth.uid() AND status = 'cancelled');

-- Drivers accept/reject pending requests and board/complete/no-show confirmed
-- ones on their own rides.
DROP POLICY IF EXISTS bookings_update_driver ON public.bookings;
CREATE POLICY bookings_update_driver ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.is_ride_driver(ride_id) AND status IN ('pending','confirmed'))
  WITH CHECK (public.is_ride_driver(ride_id) AND status IN ('confirmed','rejected','completed','no_show'));

DROP POLICY IF EXISTS bookings_admin_update ON public.bookings;
CREATE POLICY bookings_admin_update ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.is_admin());

-- ride_requests: open demand is browsable; owners manage their own.
DROP POLICY IF EXISTS ride_requests_select ON public.ride_requests;
CREATE POLICY ride_requests_select ON public.ride_requests
  FOR SELECT TO authenticated
  USING (status = 'open' OR passenger_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS ride_requests_insert_own ON public.ride_requests;
CREATE POLICY ride_requests_insert_own ON public.ride_requests
  FOR INSERT TO authenticated
  WITH CHECK (passenger_id = auth.uid() AND status = 'open');

DROP POLICY IF EXISTS ride_requests_update_own ON public.ride_requests;
CREATE POLICY ride_requests_update_own ON public.ride_requests
  FOR UPDATE TO authenticated
  USING (passenger_id = auth.uid())
  WITH CHECK (passenger_id = auth.uid() AND status IN ('open','closed'));

DROP POLICY IF EXISTS ride_requests_admin_update ON public.ride_requests;
CREATE POLICY ride_requests_admin_update ON public.ride_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin());

-- conversations: participants only.
DROP POLICY IF EXISTS conversations_select_participants ON public.conversations;
CREATE POLICY conversations_select_participants ON public.conversations
  FOR SELECT TO authenticated
  USING (auth.uid() IN (participant_a, participant_b));

DROP POLICY IF EXISTS conversations_select_admin ON public.conversations;
CREATE POLICY conversations_select_admin ON public.conversations
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS conversations_insert_participant ON public.conversations;
CREATE POLICY conversations_insert_participant ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (participant_a, participant_b));

-- Updates cover blocking; only the blocker themselves may set blocked_by.
DROP POLICY IF EXISTS conversations_update_participants ON public.conversations;
CREATE POLICY conversations_update_participants ON public.conversations
  FOR UPDATE TO authenticated
  USING (auth.uid() IN (participant_a, participant_b))
  WITH CHECK (
    auth.uid() IN (participant_a, participant_b)
    AND (blocked_by IS NULL OR blocked_by = auth.uid())
  );

-- messages: participants of the parent conversation only.
DROP POLICY IF EXISTS messages_select_participants ON public.messages;
CREATE POLICY messages_select_participants ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND auth.uid() IN (c.participant_a, c.participant_b)
    )
  );

DROP POLICY IF EXISTS messages_insert_participant_sender ON public.messages;
CREATE POLICY messages_insert_participant_sender ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND auth.uid() IN (c.participant_a, c.participant_b)
    )
  );

-- Read receipts (read_by) are participant updates.
DROP POLICY IF EXISTS messages_update_participants ON public.messages;
CREATE POLICY messages_update_participants ON public.messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND auth.uid() IN (c.participant_a, c.participant_b)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND auth.uid() IN (c.participant_a, c.participant_b)
    )
  );

-- reviews: visible reviews are readable; only participants of a COMPLETED
-- booking may author one, and only about the other party of that booking.
DROP POLICY IF EXISTS reviews_select_visible ON public.reviews;
CREATE POLICY reviews_select_visible ON public.reviews
  FOR SELECT TO authenticated
  USING (status = 'visible' OR author_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS reviews_insert_completed_participant ON public.reviews;
CREATE POLICY reviews_insert_completed_participant ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND ride_id = (SELECT b.ride_id FROM public.bookings b WHERE b.id = booking_id)
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.rides r ON r.id = b.ride_id
      WHERE b.id = booking_id
        AND b.status = 'completed'
        AND (
          (b.passenger_id = auth.uid() AND r.driver_id = target_id)
          OR (r.driver_id = auth.uid() AND b.passenger_id = target_id)
        )
    )
  );

DROP POLICY IF EXISTS reviews_admin_update ON public.reviews;
CREATE POLICY reviews_admin_update ON public.reviews
  FOR UPDATE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS reviews_admin_delete ON public.reviews;
CREATE POLICY reviews_admin_delete ON public.reviews
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- reports: any authenticated user may report; only reporter/admin may read;
-- admins resolve/dismiss.
DROP POLICY IF EXISTS reports_insert_authenticated ON public.reports;
CREATE POLICY reports_insert_authenticated ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS reports_select_own_or_admin ON public.reports;
CREATE POLICY reports_select_own_or_admin ON public.reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS reports_admin_update ON public.reports;
CREATE POLICY reports_admin_update ON public.reports
  FOR UPDATE TO authenticated
  USING (public.is_admin());

-- notifications: strictly own rows. Cross-user system notifications are
-- emitted by trusted server code (service role / SECURITY DEFINER RPCs).
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_insert_own_or_admin ON public.notifications;
CREATE POLICY notifications_insert_own_or_admin ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- trusted_contacts: private safety data, owner only.
DROP POLICY IF EXISTS trusted_contacts_owner_all ON public.trusted_contacts;
CREATE POLICY trusted_contacts_owner_all ON public.trusted_contacts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- payment_confirmations: booking parties may read/append; rows are immutable.
DROP POLICY IF EXISTS payment_confirmations_select_parties ON public.payment_confirmations;
CREATE POLICY payment_confirmations_select_parties ON public.payment_confirmations
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (b.passenger_id = auth.uid() OR public.is_ride_driver(b.ride_id))
    )
  );

DROP POLICY IF EXISTS payment_confirmations_insert_party ON public.payment_confirmations;
CREATE POLICY payment_confirmations_insert_party ON public.payment_confirmations
  FOR INSERT TO authenticated
  WITH CHECK (
    confirmed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (
          (side = 'passenger' AND b.passenger_id = auth.uid())
          OR (side = 'driver' AND public.is_ride_driver(b.ride_id))
        )
    )
  );

-- saved_drivers: private favorites, owner only.
DROP POLICY IF EXISTS saved_drivers_owner_all ON public.saved_drivers;
CREATE POLICY saved_drivers_owner_all ON public.saved_drivers
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- cities / announcements: reference content, authenticated read, admin write.
DROP POLICY IF EXISTS cities_select_authenticated ON public.cities;
CREATE POLICY cities_select_authenticated ON public.cities
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS cities_admin_all ON public.cities;
CREATE POLICY cities_admin_all ON public.cities
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS announcements_select_authenticated ON public.announcements;
CREATE POLICY announcements_select_authenticated ON public.announcements
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS announcements_admin_all ON public.announcements;
CREATE POLICY announcements_admin_all ON public.announcements
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 10. Public profile view (safe columns only)
-- ----------------------------------------------------------------------------

-- security_invoker = false (PG15): the view runs as its owner and deliberately
-- bypasses users RLS, exposing ONLY non-sensitive columns. phone, email,
-- date_of_birth and gender are never exposed here.
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
  SELECT
    u.id,
    u.full_name,
    u.photo_url,
    u.avatar_hue,
    u.bio,
    u.atmosphere,
    u.language,
    u.mode,
    u.created_at
  FROM public.users u
  WHERE u.status = 'active';

-- ----------------------------------------------------------------------------
-- 11. Grants (RLS remains the gate; no secrets involved)
-- ----------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 12. Design comments
-- ----------------------------------------------------------------------------

COMMENT ON TABLE public.users IS
  'Profile extension of auth.users; credentials stay in Supabase Auth. Sensitive columns are hidden behind public_profiles.';
COMMENT ON TABLE public.driver_documents IS
  'Private KYC files; only storage paths are stored. Bucket driver-documents must be private (see storage note above).';
COMMENT ON TABLE public.driver_verifications IS
  'One dossier per user; only admins can set verified/rejected/expired.';
COMMENT ON COLUMN public.driver_verifications.document_ids IS
  'Mirrors types.ts documentIds; referential integrity is app-enforced (array of driver_documents ids).';
COMMENT ON TABLE public.rides IS
  'Cost-sharing rides only: price_per_seat >= 50 DZD; seats_total > 0; capacity enforced by bookings trigger.';
COMMENT ON COLUMN public.rides.preferences IS
  'JSON mirroring RidePreferences (chatty, quiet, music, luggage, smokingAllowed, petsAllowed, ac).';
COMMENT ON TABLE public.recurring_ride_rules IS
  'Mirrors Ride.recurring (RecurringRule); 1:1 with a ride, cascade-deleted with it.';
COMMENT ON TABLE public.bookings IS
  'Seat inventory ledger. Overbooking prevented by enforce_booking_capacity (ride row lock) + partial unique active-booking index.';
COMMENT ON COLUMN public.bookings.pin IS
  '4-digit boarding PIN: NULL unless confirmed; generated by trigger, cleared when leaving confirmed.';
COMMENT ON CONSTRAINT bookings_pin_consistency ON public.bookings IS
  'PIN exists exactly while status is confirmed and must match ^[0-9]{4}$.';
COMMENT ON INDEX public.bookings_one_active_per_passenger IS
  'Prevents duplicate active (pending/confirmed) bookings per passenger per ride.';
COMMENT ON TABLE public.conversations IS
  'Participant tuple normalized to two FK columns with canonical ordering; one thread per user pair.';
COMMENT ON TABLE public.reviews IS
  'Only participants of a completed booking may review each other; one review per author per booking; admins moderate via status.';
COMMENT ON COLUMN public.reviews.categories IS
  'JSON mirroring ReviewCategories (driving, punctuality, communication, respect, vehicle), each 1..5.';
COMMENT ON TABLE public.reports IS
  'Polymorphic moderation reports (target_type + target_id, no FK); admins resolve or dismiss.';
COMMENT ON TABLE public.notifications IS
  'Own-row access only; cross-user system notifications are written by trusted server code.';
COMMENT ON TABLE public.payment_confirmations IS
  'Immutable cash cost-sharing audit trail, one confirmation per booking side; mirrors booking paid/received flags.';
COMMENT ON TABLE public.saved_drivers IS
  'Composite PK (user_id, driver_id) mirrors SavedDriver in types.ts.';
COMMENT ON TABLE public.cities IS
  'Algerian wilayas (code 1..58); admin-managed reference data.';
COMMENT ON VIEW public.public_profiles IS
  'Public-safe projection of users: excludes phone, email, date_of_birth, gender; active users only.';

-- ============================================================================
-- End of schema. Post-install checklist (outside this file):
--   * Create private storage bucket 'driver-documents' + storage policies.
--   * Assign the first administrator in staff_members via service-role SQL.
--   * Populate cities (wilayas) through the admin UI or a migration.
-- ============================================================================