ALTER TABLE public.moderation_appeals
  ADD COLUMN IF NOT EXISTS public_message text;
ALTER TABLE public.moderation_appeals
  DROP CONSTRAINT IF EXISTS moderation_appeals_public_message_length;
ALTER TABLE public.moderation_appeals
  ADD CONSTRAINT moderation_appeals_public_message_length
  CHECK (public_message IS NULL OR char_length(public_message) <= 1000);

CREATE OR REPLACE VIEW public.my_moderation_appeals
WITH (security_invoker = false) AS
  SELECT
    a.id,
    a.action_id,
    a.user_id,
    a.status,
    a.statement,
    a.decision_note,
    a.reviewed_at,
    a.created_at,
    a.updated_at,
    ma.action,
    ma.reason,
    ma.created_at AS action_at,
    a.public_message
  FROM public.moderation_appeals a
  JOIN public.moderation_actions ma ON ma.id = a.action_id
  WHERE a.user_id = auth.uid();
ALTER VIEW public.my_moderation_appeals OWNER TO postgres;
REVOKE ALL ON public.my_moderation_appeals FROM PUBLIC, anon;
GRANT SELECT ON public.my_moderation_appeals TO authenticated;

DROP POLICY IF EXISTS driver_documents_select_authorized ON public.driver_documents;
CREATE POLICY driver_documents_select_authorized ON public.driver_documents
  FOR SELECT TO authenticated
  USING (
    superseded_at IS NULL
    AND (
      (user_id = auth.uid() AND public.user_is_active(auth.uid()))
      OR public.has_staff_permission('review_verification')
    )
  );

CREATE OR REPLACE FUNCTION public.rpc_driver_dossier_is_complete(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT required.kind
    FROM unnest(enum_range(NULL::public.document_kind)) AS required(kind)
    LEFT JOIN LATERAL (
      SELECT d.id, d.storage_path
      FROM public.driver_documents d
      WHERE d.user_id = p_user_id
        AND d.kind = required.kind
        AND d.superseded_at IS NULL
      ORDER BY d.created_at DESC, d.id DESC
      LIMIT 1
    ) active_document ON true
    WHERE active_document.id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'driver-documents'
          AND o.name = active_document.storage_path
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.submit_verification(p_document_ids uuid[])
RETURNS public.driver_verifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dossier public.driver_verifications;
  v_required_count integer;
  v_result public.driver_verifications;
BEGIN
  PERFORM public.rpc_require_active();
  v_dossier := public.rpc_lock_driver_dossier(auth.uid());
  IF v_dossier.status IN ('pending','verified') THEN
    RAISE EXCEPTION 'A pending or verified dossier cannot be replaced';
  END IF;
  SELECT cardinality(enum_range(NULL::public.document_kind)) INTO v_required_count;
  IF p_document_ids IS NULL
     OR cardinality(p_document_ids) <> v_required_count
     OR cardinality(p_document_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(p_document_ids))) THEN
    RAISE EXCEPTION 'Provide exactly one document of every required kind';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_document_ids) requested(id)
    LEFT JOIN public.driver_documents d ON d.id = requested.id
    WHERE d.id IS NULL
       OR d.user_id <> auth.uid()
       OR d.superseded_at IS NOT NULL
       OR d.storage_path NOT LIKE auth.uid()::text || '/%'
       OR cardinality(storage.filename(d.storage_path)) <> 1
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects o
         WHERE o.bucket_id = 'driver-documents' AND o.name = d.storage_path
       )
  ) THEN
    RAISE EXCEPTION 'Every required document must be an available upload owned by the caller';
  END IF;
  IF NOT public.rpc_driver_dossier_is_complete(auth.uid()) THEN
    RAISE EXCEPTION 'Every required document kind must have an available upload';
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
  IF v_status = 'verified' AND NOT public.rpc_driver_dossier_is_complete(p_user_id) THEN
    RAISE EXCEPTION 'The required document set is incomplete or unavailable';
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
    '/driver/verification'
  );
  RETURN v_result;
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
  SELECT * INTO v_document FROM public.driver_documents
    WHERE id = p_document_id AND superseded_at IS NULL;
  IF v_document.id IS NULL THEN RAISE EXCEPTION 'Document does not exist'; END IF;
  IF NOT (v_document.user_id = auth.uid() OR public.has_staff_permission('review_verification')) THEN
    RAISE EXCEPTION 'Document access is not authorized';
  END IF;
  INSERT INTO public.document_access_log (document_id, actor_id, user_id, reason)
  VALUES (p_document_id, auth.uid(), v_document.user_id, COALESCE(p_reason,''));
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
  UPDATE public.reports SET status = 'dismissed', action = NULL,
    resolved_at = now(), resolved_by = auth.uid() WHERE id = p_report_id;
  INSERT INTO public.moderation_actions (
    action, actor_id, report_id, reason, internal_note, evidence
  ) VALUES ('dismiss_report', auth.uid(), p_report_id, v_reason, v_reason,
    jsonb_build_object('target_type',v_report.target_type,'target_id',v_report.target_id));
  PERFORM public.rpc_enqueue_notification(v_report.reporter_id, 'moderation',
    jsonb_build_object('report_id',p_report_id,'status','dismissed'), '/reports');
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
  v_target public.users;
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
  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'User does not exist'; END IF;
  IF public.rpc_is_effective_admin(p_user_id) THEN
    RAISE EXCEPTION 'Active admins cannot be moderated by this caller';
  END IF;
  IF v_kind = 'warning' THEN
    IF p_duration_minutes IS NULL THEN p_duration_minutes := 0; END IF;
    IF p_duration_minutes <> 0 THEN RAISE EXCEPTION 'Warnings never suspend and cannot have a duration'; END IF;
  ELSIF p_duration_minutes IS NULL OR p_duration_minutes < 0 OR p_duration_minutes > 525600 THEN
    RAISE EXCEPTION 'Timeout must be positive; ban duration must be zero';
  END IF;
  IF v_kind = 'ban' AND p_duration_minutes <> 0 THEN RAISE EXCEPTION 'Use zero for an indefinite ban'; END IF;
  IF v_kind = 'timeout' AND p_duration_minutes <= 0 THEN RAISE EXCEPTION 'Timeout must be positive'; END IF;
  PERFORM public.rpc_require_text(p_reason, 'reason', 2000, 1);
  IF p_public_message IS NOT NULL THEN PERFORM public.rpc_require_text(p_public_message, 'public_message', 1000); END IF;
  IF p_internal_note IS NOT NULL THEN PERFORM public.rpc_require_text(p_internal_note, 'internal_note', 5000); END IF;
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'object' THEN RAISE EXCEPTION 'Evidence must be a JSON object'; END IF;
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
    action, actor_id, target_user_id, restriction_id, reason, public_message,
    duration_minutes, expires_at, internal_note, evidence
  ) VALUES (v_action, auth.uid(), p_user_id, v_restriction_id, p_reason, p_public_message,
    p_duration_minutes, v_expires_at, p_internal_note, p_evidence);
  PERFORM public.rpc_enqueue_notification(p_user_id, 'moderation',
    jsonb_build_object('action',v_action,'restriction_id',v_restriction_id,
      'starts_at',v_starts_at,'expires_at',v_expires_at,
      'public_message',p_public_message), '/account/restrictions');
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users','driver_verifications','driver_documents','vehicles','bookings',
    'ride_requests','conversations','conversation_blocks','messages','reviews','reports',
    'notifications','trusted_contacts','saved_drivers','recent_searches','staff_members',
    'account_restrictions','moderation_actions','moderation_appeals','push_tokens'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.rpc_driver_dossier_is_complete(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_verification(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_verification(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_document_access(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dismiss_report(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_moderation(uuid, text, integer, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_verification(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_verification(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_document_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_report(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_moderation(uuid, text, integer, text, text, text, jsonb) TO authenticated;
