-- Trusted transitions. Every definer function fixes search_path, checks the
-- authenticated caller and grants execution explicitly; table write privileges
-- remain revoked after the preceding migration.

CREATE OR REPLACE FUNCTION public.rpc_require_active()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF NOT public.user_is_active(auth.uid()) THEN
    RAISE EXCEPTION 'Account is not active' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_require_staff(p_permission text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.rpc_require_active();
  IF NOT public.has_staff_permission(p_permission) THEN
    RAISE EXCEPTION 'Missing staff permission: %', p_permission USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_require_text(
  p_value text, p_name text, p_max integer, p_min integer DEFAULT 0
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_value IS NULL OR char_length(p_value) < p_min OR char_length(p_value) > p_max THEN
    RAISE EXCEPTION '% has invalid length', p_name USING ERRCODE = '22023';
  END IF;
  RETURN p_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_require_route(p_route text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_route IS NULL OR left(p_route, 1) <> '/'
    OR strpos(p_route, chr(92)) > 0
    OR strpos(p_route, chr(10)) > 0
    OR strpos(p_route, chr(13)) > 0 THEN
    RAISE EXCEPTION 'route must be an absolute application path';
  END IF;
  RETURN p_route;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_enqueue_notification(
  p_user_id uuid, p_type public.notification_type,
  p_params jsonb, p_route text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_params IS NULL OR jsonb_typeof(p_params) <> 'object' THEN
    RAISE EXCEPTION 'Notification params must be a JSON object';
  END IF;
  IF p_route IS NOT NULL THEN
    PERFORM public.rpc_require_route(p_route);
  END IF;
  INSERT INTO public.notifications (user_id, type, title, body, params, route)
  VALUES (p_user_id, p_type, '', '', p_params, p_route)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Uses normalized stops and the parent ride's rules. App clients remain
-- responsible for presenting repeat choices; all times are checked server-side.
CREATE OR REPLACE FUNCTION public.rpc_build_occurrences(
  p_ride_id uuid, p_departure_at timestamptz, p_arrival_at timestamptz,
  p_frequency public.recurring_frequency, p_days_of_week integer[], p_until_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_departure timestamptz;
  v_arrival timestamptz;
  v_duration interval;
  v_day integer;
  v_candidate_date date;
  v_departure_day integer;
BEGIN
  IF p_frequency IS NULL OR p_frequency = 'custom'
     OR p_days_of_week IS NULL OR cardinality(p_days_of_week) = 0 THEN
    RAISE EXCEPTION 'A supported frequency and at least one weekday are required';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_days_of_week) d WHERE d NOT BETWEEN 0 AND 6) THEN
    RAISE EXCEPTION 'Weekdays must be between 0 and 6';
  END IF;
  IF p_until_date IS NOT NULL AND p_until_date < p_departure_at::date THEN
    RAISE EXCEPTION 'Recurring end date precedes departure';
  END IF;
  IF p_until_date IS NOT NULL AND p_until_date > (p_departure_at::date + 730) THEN
    RAISE EXCEPTION 'Recurring range is limited to two years';
  END IF;

  v_departure := p_departure_at;
  v_arrival := p_arrival_at;
  v_duration := p_arrival_at - p_departure_at;
  v_departure_day := extract(isodow FROM p_departure_at)::integer - 1;

  IF NOT (v_departure_day = ANY (p_days_of_week)) THEN
    v_day := 0;
    LOOP
      EXIT WHEN ((v_departure_day + v_day) % 7) = ANY (p_days_of_week);
      v_day := v_day + 1;
      IF v_day > 7 THEN RAISE EXCEPTION 'Invalid recurrence'; END IF;
    END LOOP;
    v_departure := v_departure + v_day;
    v_arrival := v_departure + v_duration;
  END IF;

  WHILE (p_until_date IS NULL OR v_departure::date <= p_until_date)
        AND v_departure < p_departure_at + interval '731 days' LOOP
    IF v_departure > now() THEN
      INSERT INTO public.ride_occurrences (ride_id, occurrence_date, departure_at, arrival_at)
      VALUES (p_ride_id, v_departure::date, v_departure, v_arrival)
      ON CONFLICT (ride_id, occurrence_date) DO UPDATE
        SET departure_at = EXCLUDED.departure_at,
            arrival_at = EXCLUDED.arrival_at,
            status = CASE
              WHEN public.ride_occurrences.status = 'cancelled' THEN 'cancelled'::public.ride_status
              ELSE public.ride_occurrences.status
            END,
            updated_at = now();
    END IF;

    IF p_frequency = 'daily' THEN
      v_departure := v_departure + interval '1 day';
    ELSE
      v_day := 1;
      LOOP
        EXIT WHEN ((extract(isodow FROM v_departure)::integer - 1 + v_day) % 7)
                   = ANY (p_days_of_week);
        v_day := v_day + 1;
        IF v_day > 7 THEN RAISE EXCEPTION 'Invalid weekly recurrence'; END IF;
      END LOOP;
      v_departure := v_departure + v_day;
    END IF;
    v_arrival := v_departure + v_duration;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_profile(p_patch jsonb)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed text[] := ARRAY[
    'full_name','phone','photo_url','avatar_hue','date_of_birth','gender','language','bio','atmosphere'
  ];
  v_key text;
  v_current public.users;
  v_result public.users;
BEGIN
  PERFORM public.rpc_require_active();
  SELECT * INTO v_current FROM public.users WHERE id = auth.uid() FOR UPDATE;
  IF v_current.id IS NULL THEN RAISE EXCEPTION 'Profile does not exist'; END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Profile patch must be a JSON object';
  END IF;
  IF p_patch ? 'phone' AND v_current.phone_verified
     AND p_patch ->> 'phone' IS DISTINCT FROM v_current.phone THEN
    RAISE EXCEPTION 'A verified phone number cannot be replaced';
  END IF;
  IF p_patch ?| ARRAY['id','role','status','mode','phone_verified','email_verified','created_at','updated_at'] THEN
    RAISE EXCEPTION 'Account, role and verification fields cannot be changed here';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Profile field % is not editable', v_key;
    END IF;
  END LOOP;
  IF p_patch ? 'full_name' AND char_length(p_patch ->> 'full_name') > 120 THEN
    RAISE EXCEPTION 'full_name is too long';
  END IF;
  IF p_patch ? 'phone' AND char_length(COALESCE(p_patch ->> 'phone','')) > 32 THEN
    RAISE EXCEPTION 'phone is too long';
  END IF;
  IF p_patch ? 'photo_url' AND char_length(COALESCE(p_patch ->> 'photo_url','')) > 2048 THEN
    RAISE EXCEPTION 'photo_url is too long';
  END IF;
  IF p_patch ? 'bio' AND char_length(COALESCE(p_patch ->> 'bio','')) > 1000 THEN
    RAISE EXCEPTION 'bio is too long';
  END IF;
  IF p_patch ? 'atmosphere' THEN
    IF jsonb_typeof(p_patch -> 'atmosphere') <> 'array'
       OR COALESCE(jsonb_array_length(p_patch -> 'atmosphere'),0) > 12 THEN
      RAISE EXCEPTION 'atmosphere must be an array of at most 12 values';
    END IF;
  END IF;

  UPDATE public.users u
  SET full_name = CASE WHEN p_patch ? 'full_name' THEN p_patch ->> 'full_name' ELSE u.full_name END,
      phone = CASE WHEN p_patch ? 'phone' THEN p_patch ->> 'phone' ELSE u.phone END,
      photo_url = CASE WHEN p_patch ? 'photo_url' THEN p_patch ->> 'photo_url' ELSE u.photo_url END,
      avatar_hue = CASE WHEN p_patch ? 'avatar_hue' THEN (p_patch ->> 'avatar_hue')::integer ELSE u.avatar_hue END,
      date_of_birth = CASE WHEN p_patch ? 'date_of_birth' THEN (p_patch ->> 'date_of_birth')::date ELSE u.date_of_birth END,
      gender = CASE WHEN p_patch ? 'gender' THEN (p_patch ->> 'gender')::public.user_gender ELSE u.gender END,
      language = CASE WHEN p_patch ? 'language' THEN (p_patch ->> 'language')::public.user_language ELSE u.language END,
      bio = CASE WHEN p_patch ? 'bio' THEN p_patch ->> 'bio' ELSE u.bio END,
      atmosphere = CASE WHEN p_patch ? 'atmosphere'
        THEN ARRAY(SELECT jsonb_array_elements_text(p_patch -> 'atmosphere')) ELSE u.atmosphere END
  WHERE u.id = auth.uid()
  RETURNING u.* INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_mode(p_mode public.user_mode)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.users;
BEGIN
  PERFORM public.rpc_require_active();
  IF p_mode IS NULL THEN RAISE EXCEPTION 'Mode is required'; END IF;
  UPDATE public.users SET mode = p_mode WHERE id = auth.uid() RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_verification(p_document_ids uuid[])
RETURNS public.driver_verifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.verification_status;
  v_expected integer;
  v_result public.driver_verifications;
BEGIN
  PERFORM public.rpc_require_active();
  SELECT status INTO v_status FROM public.driver_verifications
    WHERE user_id = auth.uid() FOR UPDATE;
  IF v_status IN ('pending','verified') THEN
    RAISE EXCEPTION 'A pending or verified dossier cannot be replaced';
  END IF;
  IF v_status IS NULL THEN
    INSERT INTO public.driver_verifications (user_id, status)
    VALUES (auth.uid(), 'not_submitted')
    ON CONFLICT (user_id) DO NOTHING;
    SELECT status INTO v_status FROM public.driver_verifications
      WHERE user_id = auth.uid() FOR UPDATE;
  END IF;
  IF p_document_ids IS NULL OR cardinality(p_document_ids) = 0
     OR cardinality(p_document_ids) > 4
     OR cardinality(p_document_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(p_document_ids))) THEN
    RAISE EXCEPTION 'Provide one to four distinct documents';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_document_ids) d(id)
    LEFT JOIN public.driver_documents dd ON dd.id = d.id
    WHERE dd.id IS NULL OR dd.user_id <> auth.uid()
       OR dd.storage_path NOT LIKE auth.uid()::text || '/%'
  ) THEN
    RAISE EXCEPTION 'Every document must belong to the caller';
  END IF;
  SELECT count(*) INTO v_expected FROM public.driver_documents
    WHERE user_id = auth.uid() AND id = ANY(p_document_ids);
  IF v_expected <> cardinality(p_document_ids) THEN
    RAISE EXCEPTION 'Document set is no longer available';
  END IF;

  UPDATE public.driver_verifications
  SET status = 'pending', document_ids = p_document_ids,
      submitted_at = now(), reviewed_at = NULL, reviewed_by = NULL, reason = NULL
  WHERE user_id = auth.uid()
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_verification(
  p_user_id uuid, p_decision text, p_reason text DEFAULT NULL
)
RETURNS public.driver_verifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.verification_status;
  v_status public.verification_status;
  v_action public.moderation_action_type;
  v_result public.driver_verifications;
BEGIN
  v_status := p_decision::public.verification_status;
  IF p_user_id IS NULL OR p_decision IS NULL OR v_status NOT IN ('verified','rejected','expired') THEN
    RAISE EXCEPTION 'A user and final verification status are required';
  END IF;
  PERFORM public.rpc_require_staff('review_verification');
  IF p_reason IS NOT NULL THEN
    PERFORM public.rpc_require_text(p_reason, 'reason', 2000);
  END IF;
  SELECT status INTO v_old FROM public.driver_verifications
    WHERE user_id = p_user_id FOR UPDATE;
  IF v_old IS NULL OR v_old NOT IN ('pending','verified') THEN
    RAISE EXCEPTION 'Dossier is not awaiting review';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Staff cannot review their own dossier';
  END IF;

  UPDATE public.driver_verifications
  SET status = v_status, reviewed_at = now(), reviewed_by = auth.uid(), reason = p_reason
  WHERE user_id = p_user_id RETURNING * INTO v_result;

  v_action := CASE WHEN v_status = 'verified' THEN 'verify_driver'::public.moderation_action_type
                   ELSE 'reject_driver'::public.moderation_action_type END;
  INSERT INTO public.moderation_actions (
    action, actor_id, target_user_id, verification_user_id, reason, evidence
  ) VALUES (
    v_action, auth.uid(), p_user_id, p_user_id,
    COALESCE(NULLIF(p_reason,''), 'Verification decision'),
    jsonb_build_object('previous_status',v_old,'status',v_status)
  );
  PERFORM public.rpc_enqueue_notification(
    p_user_id, 'verification_update',
    jsonb_build_object('status',v_status,'reason',p_reason),
    '/verification'
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_ride(
  p_ride jsonb, p_stops jsonb DEFAULT '[]'::jsonb, p_recurring jsonb DEFAULT NULL
)
RETURNS public.rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride public.rides;
  v_vehicle public.vehicles;
  v_verified boolean;
  v_frequency public.recurring_frequency;
  v_days integer[];
  v_until date;
BEGIN
  PERFORM public.rpc_require_active();
  IF p_ride IS NULL OR jsonb_typeof(p_ride) <> 'object' THEN
    RAISE EXCEPTION 'Ride payload must be a JSON object';
  END IF;
  IF p_stops IS NULL OR jsonb_typeof(p_stops) <> 'array'
     OR jsonb_array_length(p_stops) > 10 THEN
    RAISE EXCEPTION 'Stops must be an array of at most ten entries';
  END IF;
  IF p_recurring IS NOT NULL AND p_recurring <> 'null'::jsonb
     AND jsonb_typeof(p_recurring) <> 'object' THEN
    RAISE EXCEPTION 'Invalid recurring rule';
  END IF;
  SELECT * INTO v_vehicle FROM public.vehicles
    WHERE id = (p_ride ->> 'vehicle_id')::uuid FOR UPDATE;
  IF v_vehicle.id IS NULL OR v_vehicle.owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Vehicle is not owned by the caller';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.driver_verifications dv WHERE dv.user_id = auth.uid() AND dv.status = 'verified'
  ) INTO v_verified;
  IF NOT v_verified THEN RAISE EXCEPTION 'Driver verification is required'; END IF;

  IF p_recurring IS NOT NULL AND p_recurring <> 'null'::jsonb THEN
    IF jsonb_typeof(p_recurring) <> 'object' THEN RAISE EXCEPTION 'Invalid recurring rule'; END IF;
    v_frequency := (p_recurring ->> 'frequency')::public.recurring_frequency;
    IF v_frequency IS NULL OR v_frequency = 'custom' THEN
      RAISE EXCEPTION 'Unsupported recurring frequency';
    END IF;
    SELECT COALESCE(array_agg(d.value::integer ORDER BY d.ordinality), ARRAY[]::integer[])
      INTO v_days
      FROM jsonb_array_elements_text(COALESCE(p_recurring -> 'days_of_week','[]'::jsonb))
        WITH ORDINALITY AS d(value, ordinality);
    v_until := (p_recurring ->> 'until_date')::date;
  END IF;

  INSERT INTO public.rides (
    driver_id, vehicle_id, from_city_id, to_city_id, departure_at, arrival_at,
    seats_total, price_per_seat, pickup_point, dropoff_point, preferences,
    women_only, notes
  ) VALUES (
    auth.uid(), v_vehicle.id, (p_ride ->> 'from_city_id')::uuid, (p_ride ->> 'to_city_id')::uuid,
    (p_ride ->> 'departure_at')::timestamptz, (p_ride ->> 'arrival_at')::timestamptz,
    (p_ride ->> 'seats_total')::integer, (p_ride ->> 'price_per_seat')::integer,
    COALESCE(p_ride ->> 'pickup_point',''), COALESCE(p_ride ->> 'dropoff_point',''),
    COALESCE(p_ride -> 'preferences','{}'::jsonb), COALESCE((p_ride ->> 'women_only')::boolean,false),
    COALESCE(p_ride ->> 'notes','')
  ) RETURNING * INTO v_ride;

  IF v_ride.seats_total > v_vehicle.seats THEN
    RAISE EXCEPTION 'Ride seats exceed vehicle capacity';
  END IF;
  IF v_ride.departure_at <= now() THEN
    RAISE EXCEPTION 'Departure must be in the future';
  END IF;
  IF v_ride.women_only
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND gender = 'female') THEN
    RAISE EXCEPTION 'Only female drivers may publish women-only rides';
  END IF;
  PERFORM public.rpc_require_text(v_ride.pickup_point, 'pickup_point', 300);
  PERFORM public.rpc_require_text(v_ride.dropoff_point, 'dropoff_point', 300);
  PERFORM public.rpc_require_text(v_ride.notes, 'notes', 2000);

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_stops) s
    WHERE jsonb_typeof(s) <> 'object'
  ) THEN RAISE EXCEPTION 'Invalid stop'; END IF;

  INSERT INTO public.ride_stops (ride_id, city_id, label, position)
  SELECT v_ride.id, (s ->> 'city_id')::uuid, COALESCE(s ->> 'label',''), (ord - 1)::integer
  FROM jsonb_array_elements(p_stops) WITH ORDINALITY AS x(s, ord);
  IF EXISTS (SELECT 1 FROM public.ride_stops WHERE ride_id = v_ride.id AND char_length(label) > 200) THEN
    RAISE EXCEPTION 'Stop label is too long';
  END IF;

  IF v_frequency IS NOT NULL THEN
    INSERT INTO public.recurring_ride_rules (ride_id, frequency, days_of_week, until_date)
    VALUES (v_ride.id, v_frequency, v_days, v_until);
    PERFORM public.rpc_build_occurrences(
      v_ride.id, v_ride.departure_at, v_ride.arrival_at, v_frequency, v_days, v_until
    );
  END IF;
  RETURN v_ride;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_ride(p_ride_id uuid, p_patch jsonb)
RETURNS public.rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride public.rides;
  v_vehicle public.vehicles;
  v_days integer[];
  v_frequency public.recurring_frequency;
  v_until date;
  v_result public.rides;
BEGIN
  PERFORM public.rpc_require_active();
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Ride patch must be a JSON object';
  END IF;
  IF p_patch ?| ARRAY['id','driver_id','vehicle_id','status','created_at','updated_at'] THEN
    RAISE EXCEPTION 'Use the dedicated transition or republish for immutable fields';
  END IF;
  SELECT * INTO v_ride FROM public.rides WHERE id = p_ride_id FOR UPDATE;
  IF v_ride.id IS NULL OR v_ride.driver_id <> auth.uid() THEN
    RAISE EXCEPTION 'Ride is not owned by the caller';
  END IF;
  IF v_ride.status <> 'published' THEN
    RAISE EXCEPTION 'Only published rides can be edited';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE ride_id = p_ride_id) THEN
    RAISE EXCEPTION 'Booked rides cannot be edited; cancel and republish instead';
  END IF;
  SELECT * INTO v_vehicle FROM public.vehicles WHERE id = v_ride.vehicle_id FOR UPDATE;
  IF v_vehicle.owner_id <> auth.uid() THEN RAISE EXCEPTION 'Vehicle is no longer owned'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.driver_verifications WHERE user_id = auth.uid() AND status = 'verified'
  ) THEN RAISE EXCEPTION 'Driver verification is required'; END IF;

  IF p_patch ? 'notes' THEN PERFORM public.rpc_require_text(p_patch ->> 'notes', 'notes', 2000); END IF;
  IF p_patch ? 'pickup_point' THEN PERFORM public.rpc_require_text(p_patch ->> 'pickup_point', 'pickup_point', 300); END IF;
  IF p_patch ? 'dropoff_point' THEN PERFORM public.rpc_require_text(p_patch ->> 'dropoff_point', 'dropoff_point', 300); END IF;
  IF p_patch ? 'preferences' AND jsonb_typeof(p_patch -> 'preferences') <> 'object' THEN
    RAISE EXCEPTION 'preferences must be an object';
  END IF;

  UPDATE public.rides
  SET departure_at = CASE WHEN p_patch ? 'departure_at' THEN (p_patch ->> 'departure_at')::timestamptz ELSE departure_at END,
      arrival_at = CASE WHEN p_patch ? 'arrival_at' THEN (p_patch ->> 'arrival_at')::timestamptz ELSE arrival_at END,
      seats_total = CASE WHEN p_patch ? 'seats_total' THEN (p_patch ->> 'seats_total')::integer ELSE seats_total END,
      price_per_seat = CASE WHEN p_patch ? 'price_per_seat' THEN (p_patch ->> 'price_per_seat')::integer ELSE price_per_seat END,
      from_city_id = CASE WHEN p_patch ? 'from_city_id' THEN (p_patch ->> 'from_city_id')::uuid ELSE from_city_id END,
      to_city_id = CASE WHEN p_patch ? 'to_city_id' THEN (p_patch ->> 'to_city_id')::uuid ELSE to_city_id END,
      pickup_point = CASE WHEN p_patch ? 'pickup_point' THEN p_patch ->> 'pickup_point' ELSE pickup_point END,
      dropoff_point = CASE WHEN p_patch ? 'dropoff_point' THEN p_patch ->> 'dropoff_point' ELSE dropoff_point END,
      preferences = CASE WHEN p_patch ? 'preferences' THEN p_patch -> 'preferences' ELSE preferences END,
      women_only = CASE WHEN p_patch ? 'women_only' THEN (p_patch ->> 'women_only')::boolean ELSE women_only END,
      notes = CASE WHEN p_patch ? 'notes' THEN p_patch ->> 'notes' ELSE notes END
  WHERE id = p_ride_id RETURNING * INTO v_result;

  IF v_result.departure_at <= now() OR v_result.seats_total > v_vehicle.seats THEN
    RAISE EXCEPTION 'Ride must depart in the future within vehicle capacity';
  END IF;
  IF v_result.women_only
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND gender = 'female') THEN
    RAISE EXCEPTION 'Only female drivers may publish women-only rides';
  END IF;

  UPDATE public.recurring_ride_rules rr
  SET frequency = CASE WHEN p_patch ? 'frequency' THEN (p_patch ->> 'frequency')::public.recurring_frequency ELSE rr.frequency END,
      until_date = CASE WHEN p_patch ? 'until_date' THEN (p_patch ->> 'until_date')::date ELSE rr.until_date END,
      days_of_week = CASE WHEN p_patch ? 'days_of_week' THEN ARRAY(
        SELECT d.value::integer
        FROM jsonb_array_elements_text(p_patch -> 'days_of_week')
          WITH ORDINALITY AS d(value, ordinality)
        ORDER BY d.ordinality
      ) ELSE rr.days_of_week END
  WHERE rr.ride_id = p_ride_id
  RETURNING frequency, days_of_week, until_date INTO v_frequency, v_days, v_until;
  IF FOUND THEN
    IF v_frequency IS NULL OR v_frequency = 'custom' THEN
      RAISE EXCEPTION 'Unsupported recurring frequency';
    END IF;
    PERFORM public.rpc_build_occurrences(
      p_ride_id, v_result.departure_at, v_result.arrival_at,
      v_frequency, v_days, v_until
    );
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_ride(p_ride_id uuid)
RETURNS public.rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride public.rides;
  v_result public.rides;
BEGIN
  PERFORM public.rpc_require_active();
  SELECT * INTO v_ride FROM public.rides WHERE id = p_ride_id FOR UPDATE;
  IF v_ride.id IS NULL OR v_ride.driver_id <> auth.uid() THEN
    RAISE EXCEPTION 'Ride is not owned by the caller';
  END IF;
  IF v_ride.status <> 'published' THEN RAISE EXCEPTION 'Only published rides can be cancelled'; END IF;
  UPDATE public.rides SET status = 'cancelled' WHERE id = p_ride_id RETURNING * INTO v_result;
  UPDATE public.ride_occurrences SET status = 'cancelled' WHERE ride_id = p_ride_id;
  UPDATE public.bookings SET status = 'cancelled', cancelled_by = auth.uid()
    WHERE ride_id = p_ride_id AND status IN ('pending','confirmed');
  INSERT INTO public.notifications (user_id, type, title, body, params, route)
  SELECT b.passenger_id, 'ride_cancelled', '', '',
         jsonb_build_object('ride_id',p_ride_id), '/bookings'
  FROM public.bookings b
  WHERE b.ride_id = p_ride_id AND b.status = 'cancelled';
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_ride(p_ride_id uuid)
RETURNS public.rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride public.rides;
  v_result public.rides;
BEGIN
  PERFORM public.rpc_require_active();
  IF NOT EXISTS (SELECT 1 FROM public.driver_verifications WHERE user_id = auth.uid() AND status = 'verified') THEN
    RAISE EXCEPTION 'Driver verification is required';
  END IF;
  SELECT * INTO v_ride FROM public.rides WHERE id = p_ride_id FOR UPDATE;
  IF v_ride.id IS NULL OR v_ride.driver_id <> auth.uid() OR v_ride.status <> 'published'
     OR v_ride.departure_at > now() THEN
    RAISE EXCEPTION 'Ride cannot be started';
  END IF;
  UPDATE public.rides SET status = 'in_progress'
  WHERE id = p_ride_id AND driver_id = auth.uid() AND status = 'published'
  RETURNING * INTO v_result;
  IF v_result.id IS NULL THEN RAISE EXCEPTION 'Ride cannot be started'; END IF;
  UPDATE public.ride_occurrences SET status = 'in_progress'
    WHERE ride_id = p_ride_id AND departure_at <= now() AND departure_at > now() - interval '7 days';
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_ride(p_ride_id uuid)
RETURNS public.rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride public.rides;
  v_result public.rides;
BEGIN
  PERFORM public.rpc_require_active();
  SELECT * INTO v_ride FROM public.rides WHERE id = p_ride_id FOR UPDATE;
  IF v_ride.id IS NULL OR v_ride.driver_id <> auth.uid() OR v_ride.status <> 'in_progress'
     OR v_ride.arrival_at > now() THEN
    RAISE EXCEPTION 'Ride cannot be completed before arrival';
  END IF;
  UPDATE public.rides SET status = 'completed'
  WHERE id = p_ride_id AND driver_id = auth.uid() AND status = 'in_progress'
  RETURNING * INTO v_result;
  IF v_result.id IS NULL THEN RAISE EXCEPTION 'Ride cannot be completed before arrival'; END IF;
  UPDATE public.ride_occurrences SET status = 'completed'
    WHERE ride_id = p_ride_id AND departure_at <= now() AND departure_at > now() - interval '7 days';
  UPDATE public.bookings
  SET status = CASE WHEN boarded_at IS NULL THEN 'no_show' ELSE 'completed' END,
      completed_at = CASE WHEN boarded_at IS NOT NULL THEN now() ELSE NULL END
  WHERE ride_id = p_ride_id AND status = 'confirmed';
  INSERT INTO public.notifications (user_id, type, title, body, params, route)
  SELECT b.passenger_id, 'review_request', '', '', jsonb_build_object('booking_id',b.id), '/reviews'
  FROM public.bookings b
  WHERE b.ride_id = p_ride_id AND b.status = 'completed'
    AND NOT EXISTS (SELECT 1 FROM public.reviews rv WHERE rv.booking_id = b.id AND rv.author_id = b.passenger_id);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_booking(p_ride_id uuid, p_seats integer)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride public.rides;
  v_used integer;
  v_result public.bookings;
BEGIN
  PERFORM public.rpc_require_active();
  IF p_seats IS NULL OR p_seats < 1 THEN RAISE EXCEPTION 'Seats must be positive'; END IF;
  SELECT * INTO v_ride FROM public.rides WHERE id = p_ride_id FOR UPDATE;
  IF v_ride.id IS NULL OR v_ride.status <> 'published' OR v_ride.departure_at <= now() THEN
    RAISE EXCEPTION 'Ride is not bookable';
  END IF;
  IF NOT public.user_is_active(v_ride.driver_id) THEN RAISE EXCEPTION 'Driver is not active'; END IF;
  IF v_ride.driver_id = auth.uid() THEN RAISE EXCEPTION 'Drivers cannot book their own ride'; END IF;
  IF v_ride.women_only AND NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND gender = 'female'
  ) THEN RAISE EXCEPTION 'This ride is women-only'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.bookings WHERE ride_id = p_ride_id AND passenger_id = auth.uid()
      AND status IN ('pending','confirmed')
  ) THEN RAISE EXCEPTION 'An active booking already exists'; END IF;

  SELECT COALESCE(sum(seats),0) INTO v_used FROM public.bookings
    WHERE ride_id = p_ride_id AND status = 'confirmed';
  IF v_used + p_seats > v_ride.seats_total THEN
    RAISE EXCEPTION 'Not enough seats available';
  END IF;

  INSERT INTO public.bookings (ride_id, passenger_id, seats, status)
  VALUES (p_ride_id, auth.uid(), p_seats, 'pending') RETURNING * INTO v_result;
  PERFORM public.rpc_enqueue_notification(
    v_ride.driver_id, 'booking_request',
    jsonb_build_object('booking_id',v_result.id,'ride_id',p_ride_id,'seats',p_seats),
    '/bookings'
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_booking(p_booking_id uuid, p_accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_ride public.rides;
  v_used integer;
  v_status public.booking_status;
BEGIN
  PERFORM public.rpc_require_active();
  SELECT b.* INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL OR v_booking.status <> 'pending' THEN
    RAISE EXCEPTION 'Booking is not awaiting a decision';
  END IF;
  SELECT * INTO v_ride FROM public.rides WHERE id = v_booking.ride_id FOR UPDATE;
  IF v_ride.id IS NULL OR v_ride.driver_id <> auth.uid() OR v_ride.status <> 'published'
     OR v_ride.departure_at <= now() THEN
    RAISE EXCEPTION 'Booking cannot be decided';
  END IF;
  IF NOT public.user_is_active(v_booking.passenger_id) THEN
    RAISE EXCEPTION 'Passenger is not active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.driver_verifications WHERE user_id = auth.uid() AND status = 'verified') THEN
    RAISE EXCEPTION 'Driver verification is required';
  END IF;
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Decision is required'; END IF;
  v_status := CASE WHEN p_accept THEN 'confirmed'::public.booking_status ELSE 'rejected'::public.booking_status END;
  IF p_accept THEN
    SELECT COALESCE(sum(seats),0) INTO v_used FROM public.bookings
      WHERE ride_id = v_ride.id AND status = 'confirmed';
    IF v_used + v_booking.seats > v_ride.seats_total THEN
      RAISE EXCEPTION 'Not enough seats available';
    END IF;
  END IF;
  UPDATE public.bookings SET status = v_status WHERE id = p_booking_id;
  PERFORM public.rpc_enqueue_notification(
    v_booking.passenger_id,
    CASE WHEN p_accept THEN 'booking_accepted'::public.notification_type ELSE 'booking_rejected'::public.notification_type END,
    jsonb_build_object('booking_id',p_booking_id,'ride_id',v_ride.id),
    '/bookings'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_ride public.rides;
  v_result public.bookings;
BEGIN
  PERFORM public.rpc_require_active();
  SELECT b.* INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL OR v_booking.status NOT IN ('pending','confirmed') THEN
    RAISE EXCEPTION 'Booking is not cancellable';
  END IF;
  SELECT * INTO v_ride FROM public.rides WHERE id = v_booking.ride_id FOR UPDATE;
  IF v_booking.passenger_id <> auth.uid() AND v_ride.driver_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only booking parties may cancel';
  END IF;
  IF v_ride.status <> 'published' OR v_ride.departure_at <= now() THEN
    RAISE EXCEPTION 'Ride is no longer open for cancellation';
  END IF;
  UPDATE public.bookings SET status = 'cancelled', cancelled_by = auth.uid()
    WHERE id = p_booking_id RETURNING * INTO v_result;
  PERFORM public.rpc_enqueue_notification(
    CASE WHEN auth.uid() = v_booking.passenger_id THEN v_ride.driver_id ELSE v_booking.passenger_id END,
    'booking_rejected', jsonb_build_object('booking_id',p_booking_id,'cancelled',true), '/bookings'
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.board_booking_with_pin(p_booking_id uuid, p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_ride public.rides;
BEGIN
  PERFORM public.rpc_require_active();
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'Invalid PIN'; END IF;
  SELECT b.* INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL OR v_booking.status <> 'confirmed' OR v_booking.pin IS DISTINCT FROM p_pin THEN
    RAISE EXCEPTION 'Invalid booking PIN';
  END IF;
  SELECT * INTO v_ride FROM public.rides WHERE id = v_booking.ride_id FOR UPDATE;
  IF v_ride.driver_id <> auth.uid() OR v_ride.status <> 'in_progress'
     OR v_booking.boarded_at IS NOT NULL THEN
    RAISE EXCEPTION 'Booking cannot be boarded';
  END IF;
  UPDATE public.bookings SET boarded_at = now() WHERE id = p_booking_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_booking_no_show(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_ride public.rides;
BEGIN
  PERFORM public.rpc_require_active();
  SELECT b.* INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL OR v_booking.status <> 'confirmed' OR v_booking.boarded_at IS NOT NULL THEN
    RAISE EXCEPTION 'Booking is not eligible for no-show';
  END IF;
  SELECT * INTO v_ride FROM public.rides WHERE id = v_booking.ride_id FOR UPDATE;
  IF v_ride.driver_id <> auth.uid() OR v_ride.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Only the ride driver may mark no-show';
  END IF;
  UPDATE public.bookings SET status = 'no_show', completed_at = now()
    WHERE id = p_booking_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_payment(p_booking_id uuid)
RETURNS public.payment_confirmations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_ride public.rides;
  v_side public.user_mode;
  v_amount integer;
  v_result public.payment_confirmations;
BEGIN
  PERFORM public.rpc_require_active();
  SELECT b.* INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL OR v_booking.status <> 'completed' THEN
    RAISE EXCEPTION 'Payments require a completed booking';
  END IF;
  SELECT * INTO v_ride FROM public.rides WHERE id = v_booking.ride_id FOR UPDATE;
  IF v_booking.passenger_id = auth.uid() THEN
    v_side := 'passenger';
    IF v_booking.passenger_paid THEN RAISE EXCEPTION 'Payment is already confirmed'; END IF;
  ELSIF v_ride.driver_id = auth.uid() THEN
    v_side := 'driver';
    IF v_booking.driver_received THEN RAISE EXCEPTION 'Receipt is already confirmed'; END IF;
  ELSE
    RAISE EXCEPTION 'Only booking parties may confirm payment';
  END IF;
  v_amount := v_booking.seats * v_ride.price_per_seat;
  INSERT INTO public.payment_confirmations (booking_id, side, confirmed_by, amount_dzd)
  VALUES (p_booking_id, v_side, auth.uid(), v_amount)
  ON CONFLICT (booking_id, side) DO NOTHING
  RETURNING * INTO v_result;
  IF v_result.id IS NULL THEN RAISE EXCEPTION 'Payment is already confirmed'; END IF;
  IF v_side = 'passenger' THEN
    UPDATE public.bookings SET passenger_paid = true, paid_at = now() WHERE id = p_booking_id;
  ELSE
    UPDATE public.bookings SET driver_received = true, received_at = now() WHERE id = p_booking_id;
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_review(
  p_booking_id uuid, p_stars integer, p_categories jsonb DEFAULT NULL, p_text text DEFAULT ''
)
RETURNS public.reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_ride public.rides;
  v_target uuid;
  v_result public.reviews;
BEGIN
  PERFORM public.rpc_require_active();
  SELECT b.* INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL OR v_booking.status <> 'completed' THEN
    RAISE EXCEPTION 'Reviews require a completed booking';
  END IF;
  SELECT * INTO v_ride FROM public.rides WHERE id = v_booking.ride_id FOR UPDATE;
  IF v_booking.passenger_id = auth.uid() THEN
    v_target := v_ride.driver_id;
  ELSIF v_ride.driver_id = auth.uid() THEN
    v_target := v_booking.passenger_id;
  ELSE
    RAISE EXCEPTION 'Only booking parties may review';
  END IF;
  IF p_stars IS NULL OR p_stars NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Stars must be between 1 and 5'; END IF;
  PERFORM public.rpc_require_text(COALESCE(p_text,''), 'review', 2000);
  IF p_categories IS NOT NULL AND jsonb_typeof(p_categories) <> 'object' THEN
    RAISE EXCEPTION 'Review categories must be an object';
  END IF;
  IF p_categories IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_each(p_categories) c
    WHERE c.key NOT IN ('driving','punctuality','communication','respect','vehicle')
       OR jsonb_typeof(c.value) <> 'number'
       OR (c.value #>> '{}')::numeric NOT BETWEEN 1 AND 5
  ) THEN RAISE EXCEPTION 'Invalid review category'; END IF;

  INSERT INTO public.reviews (booking_id, ride_id, author_id, target_id, stars, categories, text)
  VALUES (p_booking_id, v_ride.id, auth.uid(), v_target, p_stars, p_categories, COALESCE(p_text,''))
  RETURNING * INTO v_result;
  PERFORM public.rpc_enqueue_notification(v_target, 'review_request',
    jsonb_build_object('review_id',v_result.id,'booking_id',p_booking_id), '/reviews');
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_ride_request(p_request jsonb)
RETURNS public.ride_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.ride_requests;
BEGIN
  PERFORM public.rpc_require_active();
  IF p_request IS NULL OR jsonb_typeof(p_request) <> 'object' THEN
    RAISE EXCEPTION 'Ride request must be an object';
  END IF;
  INSERT INTO public.ride_requests (
    passenger_id, from_city_id, to_city_id, date, time_preference, seats, max_budget, women_only, status
  ) VALUES (
    auth.uid(), (p_request ->> 'from_city_id')::uuid, (p_request ->> 'to_city_id')::uuid,
    (p_request ->> 'date')::date, COALESCE(p_request ->> 'time_preference',''),
    (p_request ->> 'seats')::integer, (p_request ->> 'max_budget')::integer,
    COALESCE((p_request ->> 'women_only')::boolean,false), 'open'
  ) RETURNING * INTO v_result;
  IF v_result.date < current_date THEN RAISE EXCEPTION 'Ride request date cannot be in the past'; END IF;
  IF char_length(v_result.time_preference) > 100 THEN RAISE EXCEPTION 'Time preference is too long'; END IF;
  IF v_result.women_only AND NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND gender = 'female'
  ) THEN RAISE EXCEPTION 'This request is women-only'; END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_ride_request(p_request_id uuid)
RETURNS public.ride_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.ride_requests;
BEGIN
  PERFORM public.rpc_require_active();
  UPDATE public.ride_requests SET status = 'closed'
  WHERE id = p_request_id AND passenger_id = auth.uid() AND status = 'open'
  RETURNING * INTO v_result;
  IF v_result.id IS NULL THEN RAISE EXCEPTION 'Ride request cannot be closed'; END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_has_ride_conversation_access(
  p_ride_id uuid, p_booking_id uuid, p_user_id uuid, p_other_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rides r
    JOIN public.bookings b ON b.ride_id = r.id AND b.id = p_booking_id
    WHERE r.id = p_ride_id
      AND b.status IN ('pending','confirmed','completed')
      AND p_user_id = auth.uid()
      AND p_other_user_id IS NOT NULL
      AND (
        (p_user_id = b.passenger_id AND p_other_user_id = r.driver_id)
        OR (p_user_id = r.driver_id AND p_other_user_id = b.passenger_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.ensure_conversation(
  p_ride_id uuid, p_booking_id uuid, p_other_user_id uuid
)
RETURNS public.conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride public.rides;
  v_booking public.bookings;
  v_other uuid := p_other_user_id;
  v_a uuid;
  v_b uuid;
  v_result public.conversations;
BEGIN
  PERFORM public.rpc_require_active();
  IF p_ride_id IS NULL AND p_booking_id IS NULL THEN RAISE EXCEPTION 'Ride context is required'; END IF;
  SELECT * INTO v_ride FROM public.rides WHERE id = p_ride_id;
  IF p_booking_id IS NOT NULL THEN
    SELECT b.* INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id FOR UPDATE;
    IF v_booking.id IS NULL OR (p_ride_id IS NOT NULL AND v_booking.ride_id <> p_ride_id) THEN
      RAISE EXCEPTION 'Invalid ride booking context';
    END IF;
    IF v_booking.passenger_id <> auth.uid() AND v_ride.driver_id <> auth.uid() THEN
      RAISE EXCEPTION 'Caller is not a party to this booking';
    END IF;
    SELECT * INTO v_ride FROM public.rides WHERE id = v_booking.ride_id FOR UPDATE;
  END IF;
  IF v_ride.id IS NULL OR NOT public.user_is_active(v_ride.driver_id) THEN
    RAISE EXCEPTION 'Conversation ride is unavailable';
  END IF;
  IF v_booking.id IS NOT NULL THEN
    IF v_booking.status NOT IN ('pending','confirmed') OR v_booking.passenger_id = v_ride.driver_id THEN
      RAISE EXCEPTION 'Booking does not permit a conversation';
    END IF;
    IF auth.uid() = v_booking.passenger_id AND v_other IS NULL THEN v_other := v_ride.driver_id;
    ELSIF auth.uid() = v_ride.driver_id AND v_other IS NULL THEN v_other := v_booking.passenger_id;
    END IF;
    IF v_other IS DISTINCT FROM v_booking.passenger_id AND v_other IS DISTINCT FROM v_ride.driver_id THEN
      RAISE EXCEPTION 'Counterpart is not a participant in this booking';
    END IF;
  ELSE
    IF auth.uid() <> v_ride.driver_id AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.ride_id = v_ride.id AND b.passenger_id = auth.uid()
        AND b.status IN ('pending','confirmed')
    ) THEN RAISE EXCEPTION 'Caller has no ride relationship'; END IF;
    IF v_other IS NULL THEN
      RAISE EXCEPTION 'A booking ID or counterpart is required before booking';
    END IF;
    IF auth.uid() = v_ride.driver_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.ride_id = v_ride.id AND b.passenger_id = v_other AND b.status IN ('pending','confirmed')
      ) THEN RAISE EXCEPTION 'Counterpart has no active booking'; END IF;
    ELSIF v_other IS DISTINCT FROM v_ride.driver_id THEN
      RAISE EXCEPTION 'Passengers may only message their driver';
    END IF;
  END IF;
  IF NOT public.rpc_has_ride_conversation_access(
    v_ride.id, v_booking.id, auth.uid(), v_other
  ) THEN RAISE EXCEPTION 'Counterpart is not authorized for this booking'; END IF;
  IF v_other IS NULL OR v_other = auth.uid() OR NOT public.user_is_active(v_other) THEN
    RAISE EXCEPTION 'Counterpart is unavailable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.conversation_blocks b
    JOIN public.conversations c ON c.id = b.conversation_id
    WHERE auth.uid() IN (c.participant_a,c.participant_b)
      AND b.user_id IN (c.participant_a,c.participant_b)
  ) THEN RAISE EXCEPTION 'Conversation is blocked'; END IF;

  v_a := least(auth.uid(), v_other);
  v_b := greatest(auth.uid(), v_other);
  INSERT INTO public.conversations (participant_a, participant_b, ride_id, booking_id)
  VALUES (v_a, v_b, v_ride.id, v_booking.id)
  ON CONFLICT (participant_a, participant_b) DO UPDATE
    SET blocked_by = public.conversations.blocked_by
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_appeal(
  p_action_id uuid, p_statement text
)
RETURNS public.moderation_appeals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.moderation_actions;
  v_restriction public.account_restrictions;
  v_review public.reviews;
  v_result public.moderation_appeals;
BEGIN
  PERFORM public.rpc_require_active();
  PERFORM public.rpc_require_text(p_statement, 'statement', 3000, 1);
  SELECT * INTO v_action FROM public.moderation_actions WHERE id = p_action_id FOR SHARE;
  IF v_action.id IS NULL OR v_action.target_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the moderated user may appeal this action';
  END IF;
  IF v_action.action IN ('timeout','ban') THEN
    SELECT * INTO v_restriction FROM public.account_restrictions
      WHERE id = v_action.restriction_id FOR SHARE;
    IF v_restriction.id IS NULL
       OR v_restriction.user_id <> auth.uid()
       OR v_restriction.kind::text <> v_action.action::text
       OR NOT v_restriction.active
       OR v_restriction.reversed_at IS NOT NULL
       OR v_restriction.starts_at > now()
       OR (v_restriction.expires_at IS NOT NULL AND v_restriction.expires_at <= now()) THEN
      RAISE EXCEPTION 'This restriction is not currently appealable';
    END IF;
  ELSIF v_action.action = 'hide_review' THEN
    SELECT * INTO v_review FROM public.reviews WHERE id = v_action.review_id FOR SHARE;
    IF v_review.id IS NULL OR v_review.author_id <> auth.uid() OR v_review.status <> 'removed' THEN
      RAISE EXCEPTION 'This review hiding is not currently appealable';
    END IF;
  ELSE
    RAISE EXCEPTION 'Only restrictions and review hiding may be appealed';
  END IF;
  INSERT INTO public.moderation_appeals (action_id, user_id, statement)
  VALUES (p_action_id, auth.uid(), p_statement)
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_message(p_conversation_id uuid, p_text text)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation public.conversations;
  v_other uuid;
  v_result public.messages;
BEGIN
  PERFORM public.rpc_require_active();
  PERFORM public.rpc_require_text(p_text, 'message', 2000, 1);
  SELECT * INTO v_conversation FROM public.conversations
    WHERE id = p_conversation_id FOR UPDATE;
  IF v_conversation.id IS NULL OR auth.uid() NOT IN (v_conversation.participant_a,v_conversation.participant_b) THEN
    RAISE EXCEPTION 'Conversation is unavailable';
  END IF;
  v_other := CASE WHEN auth.uid() = v_conversation.participant_a
                  THEN v_conversation.participant_b ELSE v_conversation.participant_a END;
  IF v_conversation.ride_id IS NOT NULL THEN
    IF NOT public.rpc_has_ride_conversation_access(
      v_conversation.ride_id, v_conversation.booking_id, auth.uid(), v_other
    ) THEN RAISE EXCEPTION 'Ride relationship no longer permits messaging'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.conversation_blocks WHERE conversation_id = p_conversation_id) THEN
    RAISE EXCEPTION 'Conversation is blocked';
  END IF;
  IF v_conversation.blocked_by = auth.uid() THEN
    RAISE EXCEPTION 'The blocker cannot send messages until unblocking';
  END IF;
  IF NOT public.user_is_active(v_other) THEN
    RAISE EXCEPTION 'Counterpart is inactive';
  END IF;
  INSERT INTO public.messages (conversation_id, sender_id, text)
  VALUES (p_conversation_id, auth.uid(), p_text) RETURNING * INTO v_result;
  PERFORM public.rpc_enqueue_notification(v_other, 'message',
    jsonb_build_object('conversation_id',p_conversation_id,'message_id',v_result.id), '/messages');
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM public.rpc_require_active();
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c WHERE c.id = p_conversation_id
      AND auth.uid() IN (c.participant_a,c.participant_b) AND c.blocked_by IS DISTINCT FROM auth.uid()
  ) THEN RAISE EXCEPTION 'Conversation is unavailable'; END IF;
  UPDATE public.messages m
  SET read_by = CASE WHEN auth.uid() = ANY(m.read_by) THEN m.read_by
                     ELSE array_append(m.read_by, auth.uid()) END
  WHERE m.conversation_id = p_conversation_id AND m.sender_id <> auth.uid()
    AND NOT (auth.uid() = ANY(m.read_by));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_conversation_block(
  p_conversation_id uuid, p_blocked boolean
)
RETURNS public.conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation public.conversations;
  v_blocker uuid;
  v_result public.conversations;
BEGIN
  PERFORM public.rpc_require_active();
  IF p_blocked IS NULL THEN RAISE EXCEPTION 'Block decision is required'; END IF;
  SELECT * INTO v_conversation FROM public.conversations
    WHERE id = p_conversation_id FOR UPDATE;
  IF v_conversation.id IS NULL OR auth.uid() NOT IN (v_conversation.participant_a,v_conversation.participant_b) THEN
    RAISE EXCEPTION 'Conversation is unavailable';
  END IF;
  IF p_blocked THEN
    INSERT INTO public.conversation_blocks (conversation_id, user_id)
    VALUES (p_conversation_id, auth.uid())
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.conversation_blocks WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
  END IF;
  -- Rebuild the legacy projection without ever clearing the other user's block.
  UPDATE public.conversations c SET blocked_by = b.user_id
  FROM public.conversation_blocks b
  WHERE c.id = p_conversation_id
    AND b.created_at = (SELECT max(b2.created_at) FROM public.conversation_blocks b2
                        WHERE b2.conversation_id = p_conversation_id);
  IF NOT EXISTS (SELECT 1 FROM public.conversation_blocks WHERE conversation_id = p_conversation_id) THEN
    UPDATE public.conversations SET blocked_by = NULL WHERE id = p_conversation_id;
  END IF;
  SELECT * INTO v_result FROM public.conversations WHERE id = p_conversation_id;
  IF NOT v_result.blocked_by = auth.uid() THEN
    RETURN NULL;
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_validate_report_target(p_type public.report_target_type, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_id IS NULL OR p_type IS NULL THEN RAISE EXCEPTION 'Report target is required'; END IF;
  IF p_type = 'user' THEN
    IF p_id = auth.uid() OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_id) THEN
      RAISE EXCEPTION 'Invalid user report target';
    END IF;
  ELSIF p_type = 'ride' THEN
    IF NOT EXISTS (SELECT 1 FROM public.rides WHERE id = p_id) THEN
      RAISE EXCEPTION 'Invalid ride report target';
    END IF;
  ELSIF p_type = 'review' THEN
    IF NOT EXISTS (SELECT 1 FROM public.reviews WHERE id = p_id AND author_id <> auth.uid()) THEN
      RAISE EXCEPTION 'Invalid review report target';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid report target type';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_report(
  p_target_type public.report_target_type, p_target_id uuid,
  p_reason public.report_reason, p_details text DEFAULT ''
)
RETURNS public.reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.reports;
BEGIN
  IF p_reason IS NULL THEN RAISE EXCEPTION 'Report reason is required'; END IF;
  PERFORM public.rpc_require_active();
  PERFORM public.rpc_require_text(COALESCE(p_details,''), 'details', 3000);
  PERFORM public.rpc_validate_report_target(p_target_type, p_target_id);
  IF EXISTS (
    SELECT 1 FROM public.reports
    WHERE reporter_id = auth.uid() AND target_type = p_target_type AND target_id = p_target_id
      AND status IN ('open','in_review')
  ) THEN RAISE EXCEPTION 'An open report already exists for this target'; END IF;
  INSERT INTO public.reports (reporter_id, target_type, target_id, reason, details, status)
  VALUES (auth.uid(), p_target_type, p_target_id, p_reason, COALESCE(p_details,''), 'open')
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;












-- Staff transitions return void: returning an updated row from a definer
-- function would bypass the safe-column projections on moderation tables.











CREATE OR REPLACE FUNCTION public.rpc_is_effective_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_members s
    WHERE s.user_id = p_user_id AND s.active
      AND s.role IN ('super_admin','admin')
      AND public.user_is_active(s.user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.resolve_report(p_report_id uuid, p_action text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.reports;
BEGIN
  IF p_report_id IS NULL THEN RAISE EXCEPTION 'Report is required'; END IF;
  PERFORM public.rpc_require_staff('manage_reports');
  IF p_action IS NOT NULL THEN PERFORM public.rpc_require_text(p_action, 'action', 500); END IF;
  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id FOR UPDATE;
  IF v_report.id IS NULL OR v_report.status NOT IN ('open','in_review') THEN
    RAISE EXCEPTION 'Report is not open';
  END IF;
  UPDATE public.reports SET status = 'resolved', action = p_action,
    resolved_at = now(), resolved_by = auth.uid() WHERE id = p_report_id;
  INSERT INTO public.moderation_actions (action, actor_id, report_id, reason, evidence)
  VALUES ('resolve_report', auth.uid(), p_report_id,
    COALESCE(NULLIF(p_action,''), 'Report resolved'),
    jsonb_build_object('target_type',v_report.target_type,'target_id',v_report.target_id));
  PERFORM public.rpc_enqueue_notification(v_report.reporter_id, 'moderation',
    jsonb_build_object('report_id',p_report_id,'status','resolved'), '/reports');
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_report(p_report_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.reports;
  v_reason text;
BEGIN
  IF p_report_id IS NULL THEN RAISE EXCEPTION 'Report is required'; END IF;
  PERFORM public.rpc_require_staff('manage_reports');
  v_reason := COALESCE(NULLIF(p_reason,''),'Report dismissed');
  PERFORM public.rpc_require_text(v_reason, 'reason', 2000);
  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id FOR UPDATE;
  IF v_report.id IS NULL OR v_report.status NOT IN ('open','in_review') THEN
    RAISE EXCEPTION 'Report is not open';
  END IF;
  UPDATE public.reports SET status = 'dismissed', action = v_reason,
    resolved_at = now(), resolved_by = auth.uid() WHERE id = p_report_id;
  INSERT INTO public.moderation_actions (action, actor_id, report_id, reason, evidence)
  VALUES ('dismiss_report', auth.uid(), p_report_id, v_reason,
    jsonb_build_object('target_type',v_report.target_type,'target_id',v_report.target_id));
  PERFORM public.rpc_enqueue_notification(v_report.reporter_id, 'moderation',
    jsonb_build_object('report_id',p_report_id,'status','dismissed'), '/reports');
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_report(p_report_id uuid, p_staff_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.reports;
  v_assignee public.staff_members;
BEGIN
  IF p_report_id IS NULL OR p_staff_user_id IS NULL THEN
    RAISE EXCEPTION 'A report and active staff assignee are required';
  END IF;
  PERFORM public.rpc_require_staff('manage_reports');
  SELECT * INTO v_assignee FROM public.staff_members s
    WHERE s.user_id = p_staff_user_id
      AND s.active
      AND s.role IN ('super_admin','admin','moderator')
      AND public.user_is_active(s.user_id)
    FOR UPDATE OF s;
  IF v_assignee.user_id IS NULL THEN RAISE EXCEPTION 'Assignee is not active report staff'; END IF;
  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id FOR UPDATE;
  IF v_report.id IS NULL OR v_report.status NOT IN ('open','in_review') THEN
    RAISE EXCEPTION 'Report cannot be assigned';
  END IF;
  UPDATE public.reports SET assigned_to = p_staff_user_id, status = 'in_review'
    WHERE id = p_report_id;
  INSERT INTO public.moderation_actions (action, actor_id, report_id, reason, evidence)
  VALUES ('assign_report', auth.uid(), p_report_id, 'Report assigned for review',
    jsonb_build_object('assigned_to',p_staff_user_id,'previous_assigned_to',v_report.assigned_to));
END;
$$;

CREATE OR REPLACE FUNCTION public.moderate_review(
  p_review_id uuid, p_action text, p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.reviews;
  v_action public.moderation_action_type;
  v_status public.review_status;
BEGIN
  IF p_review_id IS NULL OR p_action IS NULL OR p_action NOT IN ('hide_review','restore_review') THEN
    RAISE EXCEPTION 'A valid review action is required';
  END IF;
  PERFORM public.rpc_require_staff('moderate_content');
  PERFORM public.rpc_require_text(p_reason, 'reason', 2000, 1);
  SELECT * INTO v_review FROM public.reviews WHERE id = p_review_id FOR UPDATE;
  IF v_review.id IS NULL THEN RAISE EXCEPTION 'Review does not exist'; END IF;
  v_action := p_action::public.moderation_action_type;
  v_status := CASE WHEN v_action = 'hide_review' THEN 'removed'::public.review_status
                   ELSE 'visible'::public.review_status END;
  IF v_review.status = v_status THEN RAISE EXCEPTION 'Review is already in that state'; END IF;
  UPDATE public.reviews SET status = v_status WHERE id = p_review_id;
  INSERT INTO public.moderation_actions (action, actor_id, target_user_id, review_id, reason)
  VALUES (v_action, auth.uid(), v_review.author_id, p_review_id, p_reason);
  PERFORM public.rpc_enqueue_notification(v_review.author_id, 'moderation',
    jsonb_build_object('review_id',p_review_id,'status',v_status,'reason',p_reason), '/reviews');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_staff_role(
  p_user_id uuid, p_role text, p_active boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.staff_role;
  v_old public.staff_members;
BEGIN
  v_role := p_role::public.staff_role;
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE user_id = auth.uid() AND role = 'super_admin' AND active
      AND public.user_is_active(user_id)
  ) THEN RAISE EXCEPTION 'Only an active super admin may change staff roles' USING ERRCODE = '42501'; END IF;
  IF p_user_id IS NULL OR p_role IS NULL OR v_role NOT IN ('super_admin','admin','moderator','read_only')
     OR p_active IS NULL THEN
    RAISE EXCEPTION 'Staff assignment is required';
  END IF;
  IF NOT public.user_is_active(p_user_id) THEN RAISE EXCEPTION 'User is not active'; END IF;
  IF p_user_id = auth.uid() AND (v_role <> 'super_admin' OR NOT p_active) THEN
    RAISE EXCEPTION 'Super admins cannot demote or deactivate themselves';
  END IF;
  SELECT * INTO v_old FROM public.staff_members WHERE user_id = p_user_id FOR UPDATE;
  INSERT INTO public.staff_members (user_id, role, active, created_by)
  VALUES (p_user_id, v_role, p_active, auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, active = EXCLUDED.active;
  INSERT INTO public.moderation_actions (action, actor_id, target_user_id, reason, evidence)
  VALUES ('staff_role_change', auth.uid(), p_user_id, 'Staff role changed',
    jsonb_build_object('previous_role',v_old.role,'previous_active',v_old.active,'role',v_role,'active',p_active));
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_moderation(
  p_user_id uuid, p_kind text, p_duration_minutes integer,
  p_reason text, p_public_message text DEFAULT NULL, p_internal_note text DEFAULT NULL,
  p_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind public.restriction_kind;
  v_permission text;
  v_restriction_id uuid;
  v_starts_at timestamptz;
  v_expires_at timestamptz;
  v_action public.moderation_action_type;
BEGIN
  v_kind := p_kind::public.restriction_kind;
  IF p_kind IS NULL OR v_kind NOT IN ('warning','timeout','ban') THEN
    RAISE EXCEPTION 'Invalid restriction kind';
  END IF;
  PERFORM public.rpc_require_active();
  IF v_kind = 'warning' THEN
    v_permission := 'moderate_content';
  ELSE
    v_permission := 'manage_reports';
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins may timeout or ban accounts'; END IF;
  END IF;
  PERFORM public.rpc_require_staff(v_permission);
  IF p_user_id IS NULL OR p_user_id = auth.uid() THEN RAISE EXCEPTION 'Invalid moderation target'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN RAISE EXCEPTION 'User does not exist'; END IF;
  IF public.rpc_is_effective_admin(p_user_id) THEN
    RAISE EXCEPTION 'Active admins cannot be moderated by this caller';
  END IF;
  IF v_kind = 'warning' THEN
    IF p_duration_minutes IS NULL THEN p_duration_minutes := 0; END IF;
    IF p_duration_minutes <> 0 THEN RAISE EXCEPTION 'Warnings never suspend and cannot have a duration'; END IF;
  ELSIF p_duration_minutes IS NULL OR p_duration_minutes < 0 OR p_duration_minutes > 525600 THEN
    RAISE EXCEPTION 'Timeout must be positive; ban duration must be zero';
  END IF;
  IF v_kind = 'ban' AND p_duration_minutes <> 0 THEN
    RAISE EXCEPTION 'Use zero for an indefinite ban';
  END IF;
  IF v_kind = 'timeout' AND p_duration_minutes <= 0 THEN
    RAISE EXCEPTION 'Timeout must be positive';
  END IF;
  PERFORM public.rpc_require_text(p_reason, 'reason', 2000, 1);
  IF p_public_message IS NOT NULL THEN PERFORM public.rpc_require_text(p_public_message, 'public_message', 1000); END IF;
  IF p_internal_note IS NOT NULL THEN PERFORM public.rpc_require_text(p_internal_note, 'internal_note', 5000); END IF;
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'object' THEN
    RAISE EXCEPTION 'Evidence must be a JSON object';
  END IF;
  IF v_kind IN ('timeout','ban') AND EXISTS (
    SELECT 1 FROM public.account_restrictions r
    WHERE r.user_id = p_user_id AND r.active AND r.kind IN ('timeout','ban')
      AND r.starts_at <= now() AND (r.expires_at IS NULL OR r.expires_at > now())
  ) THEN RAISE EXCEPTION 'Account already has an active suspension'; END IF;

  INSERT INTO public.account_restrictions (
    user_id, kind, starts_at, expires_at, reason, public_message, internal_note, created_by
  ) VALUES (
    p_user_id, v_kind, now(),
    CASE WHEN v_kind = 'timeout' THEN now() + make_interval(mins => p_duration_minutes) ELSE NULL END,
    p_reason, p_public_message, p_internal_note, auth.uid()
  ) RETURNING id, starts_at, expires_at INTO v_restriction_id, v_starts_at, v_expires_at;
  v_action := CASE v_kind WHEN 'warning' THEN 'warning'::public.moderation_action_type
                         WHEN 'timeout' THEN 'timeout'::public.moderation_action_type
                         ELSE 'ban'::public.moderation_action_type END;
  INSERT INTO public.moderation_actions (
    action, actor_id, target_user_id, restriction_id, reason, internal_note, evidence
  ) VALUES (v_action, auth.uid(), p_user_id, v_restriction_id, p_reason, p_internal_note, p_evidence);
  PERFORM public.rpc_enqueue_notification(p_user_id, 'moderation',
    jsonb_build_object('action',v_action,'restriction_id',v_restriction_id,
      'starts_at',v_starts_at,'expires_at',v_expires_at,
      'public_message',p_public_message), '/account/restrictions');
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_restriction(
  p_restriction_id uuid, p_reason text, p_public_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restriction public.account_restrictions;
  v_action public.moderation_action_type;
BEGIN
  PERFORM public.rpc_require_staff('manage_reports');
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins may reverse restrictions'; END IF;
  IF p_restriction_id IS NULL THEN RAISE EXCEPTION 'Invalid restriction'; END IF;
  PERFORM public.rpc_require_text(p_reason, 'reason', 2000, 1);
  IF p_public_message IS NOT NULL THEN PERFORM public.rpc_require_text(p_public_message, 'public_message', 1000); END IF;
  SELECT * INTO v_restriction FROM public.account_restrictions WHERE id = p_restriction_id FOR UPDATE;
  IF v_restriction.id IS NULL OR v_restriction.kind NOT IN ('timeout','ban')
     OR v_restriction.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Restriction cannot be reversed';
  END IF;
  IF v_restriction.created_by = auth.uid() THEN
    RAISE EXCEPTION 'Staff cannot reverse their own restriction';
  END IF;
  IF public.rpc_is_effective_admin(v_restriction.user_id) THEN
    RAISE EXCEPTION 'Active admin restrictions cannot be reversed by this caller';
  END IF;
  UPDATE public.account_restrictions
    SET active = false, reversed_at = now(), reversed_by = auth.uid(),
        public_message = COALESCE(p_public_message, public_message)
  WHERE id = p_restriction_id;
  v_action := CASE WHEN v_restriction.kind = 'ban' THEN 'reverse_ban'::public.moderation_action_type
                   ELSE 'unban'::public.moderation_action_type END;
  INSERT INTO public.moderation_actions (action, actor_id, target_user_id, restriction_id, reason, evidence)
  VALUES (v_action, auth.uid(), v_restriction.user_id, p_restriction_id, p_reason,
    jsonb_build_object('public_message',p_public_message));
  PERFORM public.rpc_enqueue_notification(v_restriction.user_id, 'moderation',
    jsonb_build_object('action',v_action,'restriction_id',p_restriction_id,
      'public_message',p_public_message), '/account/restrictions');
END;
$$;

CREATE OR REPLACE FUNCTION public.review_appeal(
  p_appeal_id uuid, p_status text, p_grant boolean,
  p_decision_note text, p_public_message text DEFAULT NULL, p_internal_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.moderation_appeal_status;
  v_appeal public.moderation_appeals;
  v_action public.moderation_actions;
  v_restriction public.account_restrictions;
  v_review public.reviews;
  v_reversal_action public.moderation_action_type;
  v_updated integer;
BEGIN
  v_status := p_status::public.moderation_appeal_status;
  IF p_appeal_id IS NULL OR p_status IS NULL OR v_status NOT IN ('under_review','granted','denied') THEN
    RAISE EXCEPTION 'A valid appeal decision is required';
  END IF;
  PERFORM public.rpc_require_staff('manage_reports');
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins may decide appeals'; END IF;
  IF (v_status = 'under_review' AND p_grant IS NOT NULL)
     OR (v_status <> 'under_review' AND p_grant IS NULL)
     OR (v_status = 'granted' AND NOT p_grant)
     OR (v_status = 'denied' AND p_grant) THEN
    RAISE EXCEPTION 'The grant decision must match the final appeal status';
  END IF;
  IF v_status <> 'under_review' THEN
    PERFORM public.rpc_require_text(p_decision_note, 'decision_note', 2000, 1);
  ELSIF p_decision_note IS NOT NULL THEN
    PERFORM public.rpc_require_text(p_decision_note, 'decision_note', 2000);
  END IF;
  IF p_public_message IS NOT NULL THEN PERFORM public.rpc_require_text(p_public_message, 'public_message', 1000); END IF;
  IF p_internal_note IS NOT NULL THEN PERFORM public.rpc_require_text(p_internal_note, 'internal_note', 5000); END IF;
  SELECT * INTO v_appeal FROM public.moderation_appeals WHERE id = p_appeal_id FOR UPDATE;
  IF v_appeal.id IS NULL OR v_appeal.status NOT IN ('open','under_review') THEN
    RAISE EXCEPTION 'Appeal is not awaiting review';
  END IF;
  SELECT * INTO v_action FROM public.moderation_actions WHERE id = v_appeal.action_id FOR SHARE;
  IF v_action.id IS NULL OR v_action.target_user_id IS DISTINCT FROM v_appeal.user_id
     OR v_action.action NOT IN ('timeout','ban','hide_review') THEN
    RAISE EXCEPTION 'Appeal action is not eligible for review';
  END IF;
  IF v_status = 'under_review' THEN
    UPDATE public.moderation_appeals SET status = 'under_review', reviewed_by = auth.uid(),
      internal_note = COALESCE(p_internal_note, internal_note),
      staff_only = (staff_only OR p_internal_note IS NOT NULL)
    WHERE id = p_appeal_id;
  ELSE
    IF v_appeal.user_id = auth.uid() THEN RAISE EXCEPTION 'Staff cannot decide their own appeal'; END IF;
    IF p_grant THEN
      IF v_action.actor_id = auth.uid() THEN
        RAISE EXCEPTION 'Staff cannot grant an appeal against their own action';
      END IF;
      IF v_action.action IN ('timeout','ban') THEN
        SELECT * INTO v_restriction FROM public.account_restrictions
          WHERE id = v_action.restriction_id FOR UPDATE;
        IF v_restriction.id IS NULL OR v_restriction.user_id <> v_appeal.user_id
           OR v_restriction.kind::text <> v_action.action::text
           OR NOT v_restriction.active OR v_restriction.reversed_at IS NOT NULL
           OR v_restriction.starts_at > now()
           OR (v_restriction.expires_at IS NOT NULL AND v_restriction.expires_at <= now()) THEN
          RAISE EXCEPTION 'Restriction is no longer active and cannot be reversed';
        END IF;
        IF v_restriction.created_by = auth.uid() THEN
          RAISE EXCEPTION 'Staff cannot reverse their own restriction through an appeal';
        END IF;
        UPDATE public.account_restrictions
          SET active = false, reversed_at = now(), reversed_by = auth.uid(),
              public_message = COALESCE(p_public_message, public_message)
          WHERE id = v_restriction.id AND active AND reversed_at IS NULL;
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated <> 1 THEN RAISE EXCEPTION 'Restriction could not be reversed'; END IF;
        v_reversal_action := CASE WHEN v_restriction.kind = 'ban'
          THEN 'reverse_ban'::public.moderation_action_type
          ELSE 'unban'::public.moderation_action_type END;
        INSERT INTO public.moderation_actions (
          action, actor_id, target_user_id, restriction_id, reason, evidence
        ) VALUES (
          v_reversal_action, auth.uid(), v_appeal.user_id, v_restriction.id, p_decision_note,
          jsonb_build_object('appeal_id',p_appeal_id,'public_message',
            COALESCE(p_public_message,v_restriction.public_message))
        );
      ELSIF v_action.action = 'hide_review' THEN
        SELECT * INTO v_review FROM public.reviews WHERE id = v_action.review_id FOR UPDATE;
        IF v_review.id IS NULL OR v_review.author_id <> v_appeal.user_id
           OR v_review.status <> 'removed' THEN
          RAISE EXCEPTION 'Review is no longer hidden and cannot be restored';
        END IF;
        UPDATE public.reviews SET status = 'visible'
          WHERE id = v_review.id AND status = 'removed';
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated <> 1 THEN RAISE EXCEPTION 'Review could not be restored'; END IF;
        INSERT INTO public.moderation_actions (
          action, actor_id, target_user_id, review_id, reason, evidence
        ) VALUES (
          'restore_review', auth.uid(), v_appeal.user_id, v_review.id, p_decision_note,
          jsonb_build_object('appeal_id',p_appeal_id,'public_message',p_public_message)
        );
      ELSE
        RAISE EXCEPTION 'Appeal action cannot be granted';
      END IF;
    END IF;
    UPDATE public.moderation_appeals SET status = v_status, reviewed_by = auth.uid(),
      reviewed_at = now(), decision_note = p_decision_note,
      internal_note = COALESCE(p_internal_note, internal_note),
      staff_only = (staff_only OR p_internal_note IS NOT NULL)
    WHERE id = p_appeal_id;
  END IF;
  PERFORM public.rpc_enqueue_notification(v_appeal.user_id, 'appeal_update',
    jsonb_build_object('appeal_id',p_appeal_id,'status',v_status,'granted',p_grant,
      'decision_note',p_decision_note,'public_message',p_public_message), '/appeals');
END;
$$;

CREATE OR REPLACE FUNCTION public.add_city(p_code integer, p_name_fr text, p_name_ar text,
  p_lat double precision, p_lon double precision, p_popular boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.rpc_require_staff('view_admin');
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins may add cities'; END IF;
  IF p_code IS NULL OR p_lat IS NULL OR p_lon IS NULL THEN RAISE EXCEPTION 'City coordinates are required'; END IF;
  PERFORM public.rpc_require_text(p_name_fr, 'name_fr', 120, 1);
  PERFORM public.rpc_require_text(p_name_ar, 'name_ar', 120, 1);
  INSERT INTO public.cities (code, name_fr, name_ar, lat, lon, popular)
  VALUES (p_code, p_name_fr, p_name_ar, p_lat, p_lon, COALESCE(p_popular,false));
END;
$$;

CREATE OR REPLACE FUNCTION public.send_announcement(
  p_title_key text, p_body_key text, p_params jsonb DEFAULT '{}'::jsonb, p_route text DEFAULT '/announcements'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_announcement_id uuid;
  v_count integer;
BEGIN
  PERFORM public.rpc_require_staff('view_admin');
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins may send announcements'; END IF;
  PERFORM public.rpc_require_text(p_title_key, 'title_key', 120, 1);
  PERFORM public.rpc_require_text(p_body_key, 'body_key', 120, 1);
  IF p_params IS NULL OR jsonb_typeof(p_params) <> 'object' THEN RAISE EXCEPTION 'params must be an object'; END IF;
  INSERT INTO public.announcements (title, body, created_by)
  VALUES (p_title_key, p_body_key, auth.uid()) RETURNING id INTO v_announcement_id;
  WITH inserted AS (
    INSERT INTO public.notifications (user_id, type, title, body, params, route)
    SELECT u.id, 'announcement', '', '', p_params || jsonb_build_object(
      'announcement_id',v_announcement_id,'title_key',p_title_key,'body_key',p_body_key
    ), '/announcements'
    FROM public.users u WHERE public.user_is_active(u.id)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_document_access(
  p_document_id uuid, p_reason text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_document public.driver_documents;
BEGIN
  PERFORM public.rpc_require_active();
  IF p_document_id IS NULL THEN RAISE EXCEPTION 'Document is required'; END IF;
  PERFORM public.rpc_require_text(COALESCE(p_reason,''), 'reason', 1000);
  SELECT * INTO v_document FROM public.driver_documents WHERE id = p_document_id;
  IF v_document.id IS NULL THEN RAISE EXCEPTION 'Document does not exist'; END IF;
  IF NOT (v_document.user_id = auth.uid() OR public.has_staff_permission('review_verification')) THEN
    RAISE EXCEPTION 'Document access is not authorized';
  END IF;
  INSERT INTO public.document_access_log (document_id, actor_id, user_id, reason)
  VALUES (p_document_id, auth.uid(), v_document.user_id, COALESCE(p_reason,''));
END;
$$;

-- Final ACL pass: every function defined by this migration first loses the
-- default PUBLIC grant, then only the intended client entry points are restored.
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

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_staff_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.effective_user_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_ride_driver(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_my_profile(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_mode(public.user_mode) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_verification(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_verification(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_ride(jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ride(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_ride(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_ride(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ride(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_booking(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_booking(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.board_booking_with_pin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_booking_no_show(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_review(uuid, integer, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_ride_request(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_ride_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_conversation(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_conversation_block(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_report(public.report_target_type, uuid, public.report_reason, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_report(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_report(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_report(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_review(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_role(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_moderation(uuid, text, integer, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_restriction(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_appeal(uuid, text, boolean, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_appeal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_city(integer, text, text, double precision, double precision, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_announcement(text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_document_access(uuid, text) TO authenticated;
