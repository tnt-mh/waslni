CREATE OR REPLACE FUNCTION public.update_ride(p_ride_id uuid, p_patch jsonb)
RETURNS public.rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride public.rides;
  v_vehicle public.vehicles;
  v_vehicle_id uuid;
  v_recurring public.recurring_ride_rules;
  v_frequency public.recurring_frequency;
  v_days integer[];
  v_until date;
  v_has_confirmed boolean;
  v_result public.rides;
BEGIN
  PERFORM public.rpc_require_active();
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Ride patch must be a JSON object';
  END IF;
  IF p_patch ?| ARRAY['id','driver_id','status','created_at','updated_at'] THEN
    RAISE EXCEPTION 'Use the dedicated transition for immutable fields';
  END IF;
  SELECT * INTO v_ride FROM public.rides WHERE id = p_ride_id FOR UPDATE;
  IF v_ride.id IS NULL OR v_ride.driver_id <> auth.uid() THEN
    RAISE EXCEPTION 'Ride is not owned by the caller';
  END IF;
  IF v_ride.status <> 'published' THEN
    RAISE EXCEPTION 'Only published rides can be edited';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE ride_id = p_ride_id AND status = 'confirmed'
  ) INTO v_has_confirmed;
  IF v_has_confirmed AND p_patch ?| ARRAY[
    'vehicle_id','from_city_id','to_city_id','departure_at','arrival_at',
    'seats_total','price_per_seat','pickup_point','dropoff_point','women_only',
    'stops','recurring'
  ] THEN
    RAISE EXCEPTION 'Booked rides cannot be edited; cancel and republish instead';
  END IF;

  v_vehicle_id := COALESCE((p_patch ->> 'vehicle_id')::uuid, v_ride.vehicle_id);
  SELECT * INTO v_vehicle FROM public.vehicles WHERE id = v_vehicle_id FOR UPDATE;
  IF v_vehicle.id IS NULL OR v_vehicle.owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Vehicle is not owned by the caller';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.driver_verifications WHERE user_id = auth.uid() AND status = 'verified'
  ) THEN RAISE EXCEPTION 'Driver verification is required'; END IF;

  IF p_patch ? 'notes' THEN PERFORM public.rpc_require_text(p_patch ->> 'notes', 'notes', 2000); END IF;
  IF p_patch ? 'pickup_point' THEN PERFORM public.rpc_require_text(p_patch ->> 'pickup_point', 'pickup_point', 300); END IF;
  IF p_patch ? 'dropoff_point' THEN PERFORM public.rpc_require_text(p_patch ->> 'dropoff_point', 'dropoff_point', 300); END IF;
  IF p_patch ? 'preferences' AND jsonb_typeof(p_patch -> 'preferences') <> 'object' THEN
    RAISE EXCEPTION 'preferences must be an object';
  END IF;
  IF p_patch ? 'stops' THEN
    IF jsonb_typeof(p_patch -> 'stops') <> 'array' OR jsonb_array_length(p_patch -> 'stops') > 10
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_patch -> 'stops') s
         WHERE jsonb_typeof(s) <> 'object'
            OR char_length(COALESCE(s ->> 'label','')) > 200
       ) THEN
      RAISE EXCEPTION 'Stops must be an array of at most ten valid entries';
    END IF;
  END IF;

  UPDATE public.rides
  SET vehicle_id = v_vehicle_id,
      departure_at = CASE WHEN p_patch ? 'departure_at' THEN (p_patch ->> 'departure_at')::timestamptz ELSE departure_at END,
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

  IF v_result.departure_at <= now() OR v_result.arrival_at <= v_result.departure_at
     OR v_result.seats_total > v_vehicle.seats THEN
    RAISE EXCEPTION 'Ride must depart in the future within vehicle capacity';
  END IF;
  IF v_result.women_only
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND gender = 'female') THEN
    RAISE EXCEPTION 'Only female drivers may publish women-only rides';
  END IF;

  IF p_patch ? 'stops' THEN
    DELETE FROM public.ride_stops WHERE ride_id = p_ride_id;
    INSERT INTO public.ride_stops (ride_id, city_id, label, position)
    SELECT p_ride_id, (s ->> 'city_id')::uuid, COALESCE(s ->> 'label',''), (ord - 1)::integer
    FROM jsonb_array_elements(p_patch -> 'stops') WITH ORDINALITY AS x(s, ord);
  END IF;

  SELECT * INTO v_recurring FROM public.recurring_ride_rules WHERE ride_id = p_ride_id;
  IF p_patch ? 'recurring' THEN
    IF p_patch -> 'recurring' = 'null'::jsonb THEN
      DELETE FROM public.recurring_ride_rules WHERE ride_id = p_ride_id;
      DELETE FROM public.ride_occurrences WHERE ride_id = p_ride_id AND departure_at > now();
    ELSE
      IF jsonb_typeof(p_patch -> 'recurring') <> 'object' THEN
        RAISE EXCEPTION 'recurring must be an object or null';
      END IF;
      v_frequency := (p_patch -> 'recurring' ->> 'frequency')::public.recurring_frequency;
      IF v_frequency IS NULL OR v_frequency = 'custom' THEN
        RAISE EXCEPTION 'Unsupported recurring frequency';
      END IF;
      SELECT COALESCE(array_agg(d.value::integer ORDER BY d.ordinality), ARRAY[]::integer[])
        INTO v_days
      FROM jsonb_array_elements_text(COALESCE(p_patch -> 'recurring' -> 'days_of_week','[]'::jsonb))
        WITH ORDINALITY AS d(value, ordinality);
      v_until := (p_patch -> 'recurring' ->> 'until_date')::date;
      INSERT INTO public.recurring_ride_rules (ride_id, frequency, days_of_week, until_date)
      VALUES (p_ride_id, v_frequency, v_days, v_until)
      ON CONFLICT (ride_id) DO UPDATE
        SET frequency = EXCLUDED.frequency, days_of_week = EXCLUDED.days_of_week,
            until_date = EXCLUDED.until_date;
      DELETE FROM public.ride_occurrences WHERE ride_id = p_ride_id AND departure_at > now();
      PERFORM public.rpc_build_occurrences(
        p_ride_id, v_result.departure_at, v_result.arrival_at, v_frequency, v_days, v_until
      );
    END IF;
  ELSIF v_recurring.id IS NOT NULL
        AND (p_patch ? 'departure_at' OR p_patch ? 'arrival_at') THEN
    DELETE FROM public.ride_occurrences WHERE ride_id = p_ride_id AND departure_at > now();
    PERFORM public.rpc_build_occurrences(
      p_ride_id, v_result.departure_at, v_result.arrival_at,
      v_recurring.frequency, v_recurring.days_of_week, v_recurring.until_date
    );
  END IF;
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
    LEFT JOIN public.bookings b ON b.ride_id = r.id AND b.id = p_booking_id
    WHERE r.id = p_ride_id
      AND p_user_id = auth.uid()
      AND p_other_user_id IS NOT NULL
      AND (
        (p_booking_id IS NOT NULL AND b.id IS NOT NULL
          AND p_other_user_id IN (b.passenger_id, r.driver_id)
          AND (p_user_id = b.passenger_id OR p_user_id = r.driver_id))
        OR (p_booking_id IS NULL AND r.status = 'published' AND r.departure_at > now()
          AND (
            (p_user_id = r.driver_id AND EXISTS (
              SELECT 1 FROM public.bookings rb
              WHERE rb.ride_id = r.id AND rb.passenger_id = p_other_user_id
                AND rb.status IN ('pending','confirmed','completed')
            ))
            OR (p_user_id <> r.driver_id AND p_other_user_id = r.driver_id)
          ))
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
  IF v_other IS NULL OR v_other = auth.uid() OR NOT public.user_is_active(v_other) THEN
    RAISE EXCEPTION 'Counterpart is unavailable';
  END IF;
  IF p_ride_id IS NULL AND p_booking_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.conversation_blocks b
      JOIN public.conversations c ON c.id = b.conversation_id
      WHERE auth.uid() IN (c.participant_a,c.participant_b)
        AND b.user_id IN (c.participant_a,c.participant_b)
    ) THEN RAISE EXCEPTION 'Conversation is blocked'; END IF;
    v_a := least(auth.uid(), v_other);
    v_b := greatest(auth.uid(), v_other);
    INSERT INTO public.conversations (participant_a, participant_b)
    VALUES (v_a, v_b)
    ON CONFLICT (participant_a, participant_b) DO UPDATE
      SET blocked_by = public.conversations.blocked_by
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  SELECT * INTO v_ride FROM public.rides WHERE id = p_ride_id;
  IF p_booking_id IS NOT NULL THEN
    SELECT b.* INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id FOR UPDATE;
    IF v_booking.id IS NULL OR (p_ride_id IS NOT NULL AND v_booking.ride_id <> p_ride_id) THEN
      RAISE EXCEPTION 'Invalid ride booking context';
    END IF;
    SELECT * INTO v_ride FROM public.rides WHERE id = v_booking.ride_id FOR UPDATE;
    IF v_booking.passenger_id <> auth.uid() AND v_ride.driver_id <> auth.uid() THEN
      RAISE EXCEPTION 'Caller is not a party to this booking';
    END IF;
    IF auth.uid() = v_booking.passenger_id AND v_other IS NULL THEN v_other := v_ride.driver_id;
    ELSIF auth.uid() = v_ride.driver_id AND v_other IS NULL THEN v_other := v_booking.passenger_id;
    END IF;
    IF v_other IS DISTINCT FROM v_booking.passenger_id AND v_other IS DISTINCT FROM v_ride.driver_id THEN
      RAISE EXCEPTION 'Counterpart is not a participant in this booking';
    END IF;
  ELSE
    IF v_ride.id IS NULL OR NOT public.user_is_active(v_ride.driver_id) THEN
      RAISE EXCEPTION 'Conversation ride is unavailable';
    END IF;
    IF NOT public.rpc_has_ride_conversation_access(v_ride.id, NULL, auth.uid(), v_other) THEN
      RAISE EXCEPTION 'Caller has no ride relationship';
    END IF;
  END IF;
  IF v_ride.id IS NULL OR NOT public.user_is_active(v_ride.driver_id) THEN
    RAISE EXCEPTION 'Conversation ride is unavailable';
  END IF;
  IF NOT public.rpc_has_ride_conversation_access(
    v_ride.id, v_booking.id, auth.uid(), v_other
  ) THEN RAISE EXCEPTION 'Counterpart is not authorized for this booking'; END IF;
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
    SET ride_id = COALESCE(EXCLUDED.ride_id, public.conversations.ride_id),
        booking_id = COALESCE(EXCLUDED.booking_id, public.conversations.booking_id),
        blocked_by = public.conversations.blocked_by
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_ride_match_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, params, route)
  SELECT DISTINCT ON (req.passenger_id)
    req.passenger_id, 'ride_match', '', '',
    jsonb_build_object('ride_id',NEW.id,'from_city_id',NEW.from_city_id,'to_city_id',NEW.to_city_id),
    '/ride/' || NEW.id::text
  FROM public.ride_requests req
  WHERE req.status = 'open'
    AND req.passenger_id <> NEW.driver_id
    AND req.from_city_id = NEW.from_city_id
    AND req.to_city_id = NEW.to_city_id
    AND req.date = (NEW.departure_at AT TIME ZONE 'Africa/Algiers')::date
  ORDER BY req.passenger_id, req.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rides_notify_matching_requests ON public.rides;
CREATE TRIGGER rides_notify_matching_requests
  AFTER INSERT ON public.rides
  FOR EACH ROW WHEN (NEW.status = 'published' AND NEW.departure_at > now())
  EXECUTE FUNCTION public.notify_ride_match_requests();

CREATE OR REPLACE FUNCTION public.notify_ride_matches_for_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, params, route)
  SELECT DISTINCT ON (r.driver_id)
    r.driver_id, 'ride_match', '', '',
    jsonb_build_object('request_id',NEW.id,'from_city_id',NEW.from_city_id,
      'to_city_id',NEW.to_city_id,'date',NEW.date),
    '/driver/ride/' || r.id::text
  FROM public.rides r
  WHERE r.status = 'published'
    AND r.departure_at > now()
    AND r.driver_id <> NEW.passenger_id
    AND r.from_city_id = NEW.from_city_id
    AND r.to_city_id = NEW.to_city_id
    AND (r.departure_at AT TIME ZONE 'Africa/Algiers')::date = NEW.date
  ORDER BY r.driver_id, r.departure_at;

  INSERT INTO public.notifications (user_id, type, title, body, params, route)
  SELECT NEW.passenger_id, 'ride_match', '', '',
    jsonb_build_object('ride_id',r.id,'from_city_id',r.from_city_id,'to_city_id',r.to_city_id),
    '/ride/' || r.id::text
  FROM public.rides r
  WHERE r.status = 'published'
    AND r.departure_at > now()
    AND r.driver_id <> NEW.passenger_id
    AND r.from_city_id = NEW.from_city_id
    AND r.to_city_id = NEW.to_city_id
    AND (r.departure_at AT TIME ZONE 'Africa/Algiers')::date = NEW.date
  ORDER BY r.departure_at
  LIMIT 3;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ride_requests_notify_matches ON public.ride_requests;
CREATE TRIGGER ride_requests_notify_matches
  AFTER INSERT ON public.ride_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_ride_matches_for_request();

REVOKE ALL ON FUNCTION public.update_ride(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_has_ride_conversation_access(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_conversation(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_ride_match_requests() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_ride_matches_for_request() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_ride(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_conversation(uuid, uuid, uuid) TO authenticated;
