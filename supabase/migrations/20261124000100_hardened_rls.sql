-- Least-privilege grants, RLS, immutable audits and passenger-only PIN access.

CREATE OR REPLACE FUNCTION public.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are immutable';
END;
$$;

CREATE OR REPLACE FUNCTION public.effective_user_status(p_user_id uuid)
RETURNS public.user_status
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN u.id IS NULL THEN NULL::public.user_status
    WHEN u.status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.account_restrictions r
        WHERE r.user_id = u.id
          AND r.active
          AND r.kind IN ('timeout','ban')
          AND r.starts_at <= now()
          AND (r.expires_at IS NULL OR r.expires_at > now())
      ) THEN 'suspended'::public.user_status
    ELSE u.status
  END
  FROM public.users u
  WHERE u.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.user_is_active(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.effective_user_status(p_user_id) = 'active', false);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_members s
    WHERE s.user_id = auth.uid()
      AND s.active
      AND s.role IN ('super_admin','admin')
      AND public.user_is_active(s.user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_staff_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_members s
    WHERE s.user_id = auth.uid()
      AND s.active
      AND public.user_is_active(s.user_id)
      AND (
        s.role IN ('super_admin','admin')
        OR (s.role = 'moderator' AND p_permission = ANY (
          ARRAY['view_admin','moderate_content','manage_reports','review_verification']::text[]
        ))
        OR (s.role = 'read_only' AND p_permission = 'view_admin')
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_staff_permission(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.effective_user_status(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_is_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_staff_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.effective_user_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_ride_driver(uuid) TO authenticated, service_role;

-- Payment evidence must survive parent cleanup attempts. The base schema used
-- CASCADE for both references; immutable audit rows make those deletes unsafe.
ALTER TABLE public.payment_confirmations
  DROP CONSTRAINT IF EXISTS payment_confirmations_booking_id_fkey,
  DROP CONSTRAINT IF EXISTS payment_confirmations_confirmed_by_fkey;
ALTER TABLE public.payment_confirmations
  ADD CONSTRAINT payment_confirmations_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES public.bookings (id) ON DELETE RESTRICT,
  ADD CONSTRAINT payment_confirmations_confirmed_by_fkey
    FOREIGN KEY (confirmed_by) REFERENCES public.users (id) ON DELETE RESTRICT;

-- The legacy flag remains a readable compatibility projection: the most recent
-- blocker wins. Only set_conversation_block may change it.
UPDATE public.conversations c
SET blocked_by = b.user_id
FROM public.conversation_blocks b
WHERE b.conversation_id = c.id
  AND b.created_at = (
    SELECT max(b2.created_at) FROM public.conversation_blocks b2
    WHERE b2.conversation_id = c.id
  );

UPDATE public.conversations c
SET blocked_by = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.conversation_blocks b WHERE b.conversation_id = c.id
);

CREATE OR REPLACE VIEW public.passenger_booking_pins
WITH (security_invoker = false) AS
  SELECT b.id AS booking_id, b.ride_id, b.passenger_id, b.pin
  FROM public.bookings b
  WHERE b.status = 'confirmed'
    AND b.passenger_id = auth.uid();

ALTER VIEW public.passenger_booking_pins OWNER TO postgres;
REVOKE ALL ON public.passenger_booking_pins FROM PUBLIC, anon;
GRANT SELECT ON public.passenger_booking_pins TO authenticated;

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
  SELECT
    u.id, u.full_name, u.photo_url, u.avatar_hue, u.bio,
    u.atmosphere, u.language, u.mode, u.created_at
  FROM public.users u
  WHERE public.user_is_active(u.id);

ALTER VIEW public.public_profiles OWNER TO postgres;
REVOKE ALL ON public.public_profiles FROM PUBLIC;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Remove legacy write paths. Policies alone are not a privilege boundary:
-- PostgREST needs table/column privileges as well as a matching RLS policy.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT SELECT ON public.passenger_booking_pins, public.my_moderation_appeals TO authenticated;

GRANT SELECT (id, full_name, email, phone, photo_url, avatar_hue, date_of_birth,
  gender, language, bio, role, mode, status, phone_verified, email_verified,
  atmosphere, created_at, updated_at) ON public.users TO authenticated;
GRANT UPDATE (full_name, phone, photo_url, avatar_hue, date_of_birth, gender, language, bio, atmosphere)
  ON public.users TO authenticated;

GRANT SELECT ON public.driver_documents TO authenticated;
GRANT SELECT (id, user_id, status, document_ids, submitted_at, reviewed_at, reviewed_by,
  reason, created_at, updated_at) ON public.driver_verifications TO authenticated;
GRANT INSERT (user_id, kind, storage_path, file_name) ON public.driver_documents TO authenticated;
GRANT DELETE ON public.driver_documents TO authenticated;

GRANT SELECT ON public.vehicles TO authenticated;
GRANT INSERT (owner_id, brand, model, color, plate, year, seats) ON public.vehicles TO authenticated;
GRANT UPDATE (brand, model, color, plate, year, seats) ON public.vehicles TO authenticated;
GRANT DELETE ON public.vehicles TO authenticated;

GRANT SELECT ON public.rides, public.ride_stops, public.recurring_ride_rules,
  public.ride_requests, public.conversations, public.messages,
  public.reviews, public.notifications, public.payment_confirmations,
  public.announcements, public.cities, public.ride_occurrences TO authenticated;
GRANT SELECT (id, ride_id, passenger_id, seats, status, decided_at, boarded_at,
  completed_at, passenger_paid, driver_received, paid_at, received_at,
  cancelled_by, created_at, updated_at) ON public.bookings TO authenticated;
GRANT SELECT (id, reporter_id, target_type, target_id, reason, details, status,
  action, resolved_at, assigned_to, resolved_by, created_at, updated_at)
  ON public.reports TO authenticated;
GRANT INSERT (passenger_id, from_city_id, to_city_id, date, time_preference, seats, max_budget, women_only)
  ON public.ride_requests TO authenticated;
GRANT UPDATE (status) ON public.ride_requests TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trusted_contacts, public.saved_drivers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recent_searches, public.push_tokens TO authenticated;
GRANT UPDATE (read) ON public.notifications TO authenticated;
GRANT DELETE ON public.notifications TO authenticated;

-- Audit/history tables have no direct client write privilege, even for staff.
REVOKE ALL ON public.staff_members, public.account_restrictions, public.moderation_actions,
  public.moderation_appeals, public.document_access_log, public.conversation_blocks
  FROM authenticated;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'users','driver_documents','driver_verifications','vehicles','rides','ride_stops',
    'recurring_ride_rules','bookings','ride_requests','conversations','messages',
    'reviews','reports','notifications','trusted_contacts','payment_confirmations',
    'saved_drivers','cities','announcements','staff_members','account_restrictions',
    'moderation_actions','moderation_appeals','recent_searches','document_access_log',
    'push_tokens','ride_occurrences','conversation_blocks'
  ]::text[]) AS name
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t.name);
  END LOOP;
END $$;

DROP POLICY IF EXISTS users_select_own_or_admin ON public.users;
CREATE POLICY users_select_own_or_admin ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_staff_permission('view_admin'));

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid() AND public.user_is_active(auth.uid()))
  WITH CHECK (
    id = auth.uid()
    AND role = 'user'
    AND status = 'active'
    AND NOT phone_verified
    AND NOT email_verified
  );

DROP POLICY IF EXISTS driver_documents_insert_own ON public.driver_documents;
CREATE POLICY driver_documents_insert_own ON public.driver_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_is_active(auth.uid())
    AND storage_path LIKE auth.uid()::text || '/%'
  );

DROP POLICY IF EXISTS driver_documents_select_authorized ON public.driver_documents;
CREATE POLICY driver_documents_select_authorized ON public.driver_documents
  FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid() AND public.user_is_active(auth.uid()))
    OR public.has_staff_permission('review_verification')
  );

DROP POLICY IF EXISTS driver_documents_delete_authorized ON public.driver_documents;
CREATE POLICY driver_documents_delete_authorized ON public.driver_documents
  FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND public.user_is_active(auth.uid()))
    OR public.has_staff_permission('review_verification')
  );

DROP POLICY IF EXISTS driver_verifications_select_authorized ON public.driver_verifications;
CREATE POLICY driver_verifications_select_authorized ON public.driver_verifications
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_staff_permission('review_verification')
    OR public.has_staff_permission('view_admin')
  );

DROP POLICY IF EXISTS vehicles_select_authenticated ON public.vehicles;
CREATE POLICY vehicles_select_authenticated ON public.vehicles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS vehicles_insert_own ON public.vehicles;
CREATE POLICY vehicles_insert_own ON public.vehicles
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND public.user_is_active(auth.uid()));

DROP POLICY IF EXISTS vehicles_update_own ON public.vehicles;
CREATE POLICY vehicles_update_own ON public.vehicles
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    AND public.user_is_active(auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.rides r WHERE r.vehicle_id = vehicles.id)
  )
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS vehicles_delete_own ON public.vehicles;
CREATE POLICY vehicles_delete_own ON public.vehicles
  FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    AND public.user_is_active(auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.rides r WHERE r.vehicle_id = vehicles.id)
  );

DROP POLICY IF EXISTS rides_select ON public.rides;
CREATE POLICY rides_select ON public.rides
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    OR driver_id = auth.uid()
    OR public.has_staff_permission('view_admin')
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.ride_id = rides.id AND b.passenger_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ride_stops_select_authenticated ON public.ride_stops;
CREATE POLICY ride_stops_select_authenticated ON public.ride_stops
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS recurring_ride_rules_select_authenticated ON public.recurring_ride_rules;
CREATE POLICY recurring_ride_rules_select_authenticated ON public.recurring_ride_rules
  FOR SELECT TO authenticated USING (true);

-- Column privilege omits pin. Drivers can see the rest of their booking rows,
-- but only the passenger_booking_pins view returns the boarding secret.
DROP POLICY IF EXISTS bookings_select_parties_or_staff ON public.bookings;
CREATE POLICY bookings_select_parties_or_staff ON public.bookings
  FOR SELECT TO authenticated
  USING (
    passenger_id = auth.uid()
    OR public.is_ride_driver(ride_id)
    OR public.has_staff_permission('view_admin')
  );

DROP POLICY IF EXISTS ride_requests_select ON public.ride_requests;
CREATE POLICY ride_requests_select ON public.ride_requests
  FOR SELECT TO authenticated
  USING (status = 'open' OR passenger_id = auth.uid() OR public.has_staff_permission('view_admin'));

DROP POLICY IF EXISTS ride_requests_insert_own ON public.ride_requests;
CREATE POLICY ride_requests_insert_own ON public.ride_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    passenger_id = auth.uid()
    AND status = 'open'
    AND public.user_is_active(auth.uid())
  );

DROP POLICY IF EXISTS ride_requests_update_own ON public.ride_requests;
CREATE POLICY ride_requests_update_own ON public.ride_requests
  FOR UPDATE TO authenticated
  USING (passenger_id = auth.uid() AND public.user_is_active(auth.uid()))
  WITH CHECK (passenger_id = auth.uid() AND status IN ('open','closed'));

DROP POLICY IF EXISTS conversations_select_participants_or_staff ON public.conversations;
CREATE POLICY conversations_select_participants_or_staff ON public.conversations
  FOR SELECT TO authenticated
  USING (auth.uid() IN (participant_a, participant_b) OR public.has_staff_permission('view_admin'));

DROP POLICY IF EXISTS messages_select_participants_or_staff ON public.messages;
CREATE POLICY messages_select_participants_or_staff ON public.messages
  FOR SELECT TO authenticated
  USING (
    public.has_staff_permission('view_admin')
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND auth.uid() IN (c.participant_a, c.participant_b)
        AND c.blocked_by IS DISTINCT FROM auth.uid()
    )
  );

DROP POLICY IF EXISTS reviews_select_visible ON public.reviews;
CREATE POLICY reviews_select_visible ON public.reviews
  FOR SELECT TO authenticated
  USING (
    status = 'visible'
    OR author_id = auth.uid()
    OR public.has_staff_permission('moderate_content')
    OR public.has_staff_permission('view_admin')
  );

DROP POLICY IF EXISTS reports_select_reporter_or_staff ON public.reports;
CREATE POLICY reports_select_reporter_or_staff ON public.reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_staff_permission('view_admin'));

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS trusted_contacts_owner_all ON public.trusted_contacts;
CREATE POLICY trusted_contacts_owner_all ON public.trusted_contacts
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.user_is_active(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.user_is_active(auth.uid()));

DROP POLICY IF EXISTS saved_drivers_owner_all ON public.saved_drivers;
CREATE POLICY saved_drivers_owner_all ON public.saved_drivers
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.user_is_active(auth.uid()))
  WITH CHECK (
    user_id = auth.uid()
    AND driver_id <> auth.uid()
    AND public.user_is_active(auth.uid())
  );

DROP POLICY IF EXISTS cities_select_authenticated ON public.cities;
CREATE POLICY cities_select_authenticated ON public.cities
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS announcements_select_authenticated ON public.announcements;
CREATE POLICY announcements_select_authenticated ON public.announcements
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS recent_searches_owner_all ON public.recent_searches;
CREATE POLICY recent_searches_owner_all ON public.recent_searches
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.user_is_active(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.user_is_active(auth.uid()));

DROP POLICY IF EXISTS push_tokens_owner_all ON public.push_tokens;
CREATE POLICY push_tokens_owner_all ON public.push_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.user_is_active(auth.uid()))
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_is_active(auth.uid())
    AND (platform = 'web' OR device_id IS NOT NULL)
    AND token LIKE '%:%'
  );

DROP POLICY IF EXISTS ride_occurrences_select ON public.ride_occurrences;
CREATE POLICY ride_occurrences_select ON public.ride_occurrences
  FOR SELECT TO authenticated
  USING (
    public.has_staff_permission('view_admin')
    OR EXISTS (
      SELECT 1 FROM public.rides r
      WHERE r.id = ride_occurrences.ride_id
        AND (
          r.driver_id = auth.uid()
          OR (r.status = 'published' AND ride_occurrences.status = 'published')
          OR EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.ride_id = r.id AND b.passenger_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS payment_confirmations_select_parties_or_staff ON public.payment_confirmations;
CREATE POLICY payment_confirmations_select_parties_or_staff ON public.payment_confirmations
  FOR SELECT TO authenticated
  USING (
    public.has_staff_permission('view_admin')
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (b.passenger_id = auth.uid() OR public.is_ride_driver(b.ride_id))
    )
  );

-- Base client projections never expose moderation internal_note or evidence;
-- the permissioned staff view below is the only private-detail read path.
-- No UPDATE/DELETE policies exist on any moderation or audit table.
GRANT SELECT (user_id, role, active, created_by, created_at, updated_at)
  ON public.staff_members TO authenticated;
GRANT SELECT ON public.staff_members TO authenticated;
DROP POLICY IF EXISTS staff_members_select_admin ON public.staff_members;
CREATE POLICY staff_members_select_admin ON public.staff_members
  FOR SELECT TO authenticated USING (public.has_staff_permission('view_admin'));

GRANT SELECT (id, user_id, kind, starts_at, expires_at, public_message, active,
  reversed_at, created_by, created_at, updated_at) ON public.account_restrictions TO authenticated;
DROP POLICY IF EXISTS account_restrictions_select_admin ON public.account_restrictions;
CREATE POLICY account_restrictions_select_admin ON public.account_restrictions
  FOR SELECT TO authenticated USING (public.has_staff_permission('view_admin'));

-- Ordinary staff reads use only the safe projection. Private notes/evidence are
-- available through a definer-owned view whose predicate excludes read-only staff.
GRANT SELECT (id, action, actor_id, target_user_id, restriction_id, report_id,
  review_id, verification_user_id, reason, created_at)
  ON public.moderation_actions TO authenticated;
DROP POLICY IF EXISTS moderation_actions_select_admin ON public.moderation_actions;
CREATE POLICY moderation_actions_select_admin ON public.moderation_actions
  FOR SELECT TO authenticated USING (public.has_staff_permission('view_admin'));

CREATE OR REPLACE VIEW public.staff_moderation_action_details
WITH (security_invoker = false) AS
  SELECT id, action, actor_id, target_user_id, restriction_id, report_id,
    review_id, verification_user_id, reason, internal_note, evidence, created_at
  FROM public.moderation_actions
  WHERE public.has_staff_permission('moderate_content');
ALTER VIEW public.staff_moderation_action_details OWNER TO postgres;
REVOKE ALL ON public.staff_moderation_action_details FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_moderation_action_details TO authenticated;

GRANT SELECT (id, action_id, user_id, status, statement, decision_note, staff_only,
  reviewed_by, reviewed_at, created_at, updated_at) ON public.moderation_appeals TO authenticated;
DROP POLICY IF EXISTS moderation_appeals_select_own_or_admin ON public.moderation_appeals;
CREATE POLICY moderation_appeals_select_own_or_admin ON public.moderation_appeals
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_staff_permission('view_admin'));

GRANT SELECT ON public.document_access_log TO authenticated;
DROP POLICY IF EXISTS document_access_log_select_admin ON public.document_access_log;
CREATE POLICY document_access_log_select_admin ON public.document_access_log
  FOR SELECT TO authenticated
  USING (public.has_staff_permission('view_admin') OR user_id = auth.uid());

-- No UPDATE/DELETE privileges or policies exist for the audit tables. FORCE
-- RLS also protects against accidental owner/superuser-like API credentials.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payment_confirmations','moderation_actions','document_access_log'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_immutable', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_audit_mutation()',
      t || '_immutable', t
    );
  END LOOP;
END $$;

-- Definer RPCs need the explicit grants below; revoke the schema-wide grant
-- inherited from the original schema. anon and ordinary clients get none.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.signature);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_staff_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.effective_user_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_ride_driver(uuid) TO authenticated, service_role;
