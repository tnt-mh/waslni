-- Final access contracts: owner-safe moderation views, auditable document URLs,
-- one dossier per document kind and Realtime publication.

ALTER TABLE public.moderation_actions
  ADD COLUMN IF NOT EXISTS public_message text,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.moderation_actions
  DROP CONSTRAINT IF EXISTS moderation_actions_duration_nonnegative;
ALTER TABLE public.moderation_actions
  ADD CONSTRAINT moderation_actions_duration_nonnegative
  CHECK (duration_minutes IS NULL OR duration_minutes >= 0);
ALTER TABLE public.moderation_appeals
  ADD COLUMN IF NOT EXISTS public_message text;

ALTER TABLE public.driver_documents
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

WITH ranked_documents AS (
  SELECT d.id,
    row_number() OVER (
      PARTITION BY d.user_id, d.kind
      ORDER BY (d.id = ANY(COALESCE(v.document_ids, ARRAY[]::uuid[]))) DESC,
               d.created_at DESC, d.id DESC
    ) AS position
  FROM public.driver_documents d
  LEFT JOIN public.driver_verifications v ON v.user_id = d.user_id
  WHERE d.superseded_at IS NULL
)
UPDATE public.driver_documents d
SET superseded_at = now()
FROM ranked_documents ranked
WHERE d.id = ranked.id AND ranked.position > 1;

DROP INDEX IF EXISTS public.driver_documents_one_per_user_kind;
CREATE UNIQUE INDEX driver_documents_one_per_user_kind
  ON public.driver_documents (user_id, kind)
  WHERE superseded_at IS NULL;

DROP POLICY IF EXISTS users_select_own_or_admin ON public.users;
CREATE POLICY users_select_own_or_admin ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS account_restrictions_select_admin ON public.account_restrictions;
CREATE POLICY account_restrictions_select_owner_or_admin ON public.account_restrictions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_staff_permission('view_admin'));

REVOKE ALL ON public.account_restrictions FROM authenticated;
GRANT SELECT (id, user_id, kind, starts_at, expires_at, public_message, active,
  reversed_at, created_by, created_at, updated_at) ON public.account_restrictions TO authenticated;
REVOKE ALL ON public.moderation_actions FROM authenticated;
GRANT SELECT (id, action, actor_id, target_user_id, restriction_id, report_id,
  review_id, verification_user_id, reason, public_message, duration_minutes,
  expires_at, created_at) ON public.moderation_actions TO authenticated;
REVOKE ALL ON public.moderation_appeals FROM authenticated;
GRANT SELECT (id, action_id, user_id, status, statement, decision_note,
  public_message, staff_only, reviewed_by, reviewed_at, created_at, updated_at)
  ON public.moderation_appeals TO authenticated;

CREATE OR REPLACE VIEW public.staff_restriction_details
WITH (security_invoker = false) AS
  SELECT id, reason, internal_note
  FROM public.account_restrictions
  WHERE public.has_staff_permission('moderate_content');
ALTER VIEW public.staff_restriction_details OWNER TO postgres;
REVOKE ALL ON public.staff_restriction_details FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_restriction_details TO authenticated;

CREATE OR REPLACE VIEW public.my_moderation_actions
WITH (security_invoker = false) AS
  SELECT id, action, actor_id, target_user_id, restriction_id, report_id,
    review_id, verification_user_id, reason, public_message, duration_minutes,
    expires_at, created_at
  FROM public.moderation_actions
  WHERE target_user_id = auth.uid()
     OR verification_user_id = auth.uid();
ALTER VIEW public.my_moderation_actions OWNER TO postgres;
REVOKE ALL ON public.my_moderation_actions FROM PUBLIC, anon;
GRANT SELECT ON public.my_moderation_actions TO authenticated;

CREATE OR REPLACE VIEW public.staff_moderation_action_details
WITH (security_invoker = false) AS
  SELECT id, action, actor_id, target_user_id, restriction_id, report_id,
    review_id, verification_user_id, reason, internal_note, evidence, created_at,
    public_message, duration_minutes, expires_at
  FROM public.moderation_actions
  WHERE public.has_staff_permission('moderate_content');
ALTER VIEW public.staff_moderation_action_details OWNER TO postgres;
REVOKE ALL ON public.staff_moderation_action_details FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_moderation_action_details TO authenticated;

CREATE OR REPLACE VIEW public.staff_moderation_appeal_details
WITH (security_invoker = false) AS
  SELECT id, action_id, user_id, status, statement, decision_note,
    public_message, internal_note, staff_only, reviewed_by, reviewed_at,
    created_at, updated_at
  FROM public.moderation_appeals
  WHERE public.is_admin() AND public.has_staff_permission('manage_reports');
ALTER VIEW public.staff_moderation_appeal_details OWNER TO postgres;
REVOKE ALL ON public.staff_moderation_appeal_details FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_moderation_appeal_details TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_require_authenticated()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.submit_appeal(uuid, text);
CREATE FUNCTION public.submit_appeal(p_action_id uuid, p_statement text)
RETURNS public.moderation_appeals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.moderation_actions;
  v_restriction public.account_restrictions;
  v_result public.moderation_appeals;
BEGIN
  PERFORM public.rpc_require_authenticated();
  PERFORM public.rpc_require_text(p_statement, 'statement', 3000, 1);
  SELECT * INTO v_action FROM public.moderation_actions WHERE id = p_action_id FOR SHARE;
  IF v_action.id IS NULL OR v_action.target_user_id IS DISTINCT FROM auth.uid()
     OR v_action.action NOT IN ('timeout','ban') THEN
    RAISE EXCEPTION 'Only active timeout and ban actions may be appealed';
  END IF;
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
  INSERT INTO public.moderation_appeals (action_id, user_id, statement)
  VALUES (p_action_id, auth.uid(), p_statement)
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS public.review_appeal(uuid, text, boolean, text, text, text);
CREATE FUNCTION public.review_appeal(
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
     OR v_action.action NOT IN ('timeout','ban') THEN
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
        action, actor_id, target_user_id, restriction_id, reason, public_message, evidence
      ) VALUES (
        v_reversal_action, auth.uid(), v_appeal.user_id, v_restriction.id, p_decision_note,
        COALESCE(p_public_message, v_restriction.public_message),
        jsonb_build_object('appeal_id',p_appeal_id)
      );
    END IF;
    UPDATE public.moderation_appeals SET status = v_status, reviewed_by = auth.uid(),
      reviewed_at = now(), decision_note = p_decision_note,
      public_message = p_public_message,
      internal_note = COALESCE(p_internal_note, internal_note),
      staff_only = (staff_only OR p_internal_note IS NOT NULL)
    WHERE id = p_appeal_id;
  END IF;
  PERFORM public.rpc_enqueue_notification(v_appeal.user_id, 'appeal_update',
    jsonb_build_object('appeal_id',p_appeal_id,'status',v_status,'granted',p_grant,
      'decision_note',p_decision_note,'public_message',p_public_message), '/appeals');
END;
$$;

DROP FUNCTION IF EXISTS public.resolve_report(uuid, text);
CREATE FUNCTION public.resolve_report(
  p_report_id uuid, p_action text DEFAULT NULL, p_internal_note text DEFAULT NULL
)
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
  IF p_internal_note IS NOT NULL THEN PERFORM public.rpc_require_text(p_internal_note, 'internal_note', 5000); END IF;
  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id FOR UPDATE;
  IF v_report.id IS NULL OR v_report.status NOT IN ('open','in_review') THEN
    RAISE EXCEPTION 'Report is not open';
  END IF;
  UPDATE public.reports SET status = 'resolved', action = p_action,
    resolved_at = now(), resolved_by = auth.uid() WHERE id = p_report_id;
  INSERT INTO public.moderation_actions (
    action, actor_id, report_id, reason, internal_note, evidence
  ) VALUES ('resolve_report', auth.uid(), p_report_id,
    COALESCE(NULLIF(p_action,''), 'Report resolved'), p_internal_note,
    jsonb_build_object('target_type',v_report.target_type,'target_id',v_report.target_id));
  PERFORM public.rpc_enqueue_notification(v_report.reporter_id, 'moderation',
    jsonb_build_object('report_id',p_report_id,'status','resolved'), '/reports');
END;
$$;

DROP FUNCTION IF EXISTS public.reverse_restriction(uuid, text, text);
CREATE FUNCTION public.reverse_restriction(
  p_restriction_id uuid, p_reason text, p_public_message text DEFAULT NULL,
  p_internal_note text DEFAULT NULL
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
  IF p_internal_note IS NOT NULL THEN PERFORM public.rpc_require_text(p_internal_note, 'internal_note', 5000); END IF;
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
  INSERT INTO public.moderation_actions (
    action, actor_id, target_user_id, restriction_id, reason, public_message, internal_note, evidence
  ) VALUES (v_action, auth.uid(), v_restriction.user_id, p_restriction_id, p_reason,
    COALESCE(p_public_message, v_restriction.public_message), p_internal_note,
    jsonb_build_object('reversed_at',now()));
  PERFORM public.rpc_enqueue_notification(v_restriction.user_id, 'moderation',
    jsonb_build_object('action',v_action,'restriction_id',p_restriction_id,
      'public_message',COALESCE(p_public_message,v_restriction.public_message)), '/account/restrictions');
END;
$$;

DROP FUNCTION IF EXISTS public.apply_moderation(uuid, text, integer, text, text, text, jsonb);
CREATE FUNCTION public.apply_moderation(
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

CREATE OR REPLACE FUNCTION public.rpc_document_dossier_is_locked(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.driver_verifications
    WHERE user_id = p_user_id AND status IN ('pending','verified')
  );
$$;

CREATE OR REPLACE FUNCTION public.rpc_lock_driver_dossier(p_user_id uuid)
RETURNS public.driver_verifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.driver_verifications;
BEGIN
  PERFORM public.rpc_require_active();
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the document owner may lock a dossier';
  END IF;
  INSERT INTO public.driver_verifications (user_id, status)
  VALUES (p_user_id, 'not_submitted')
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_result FROM public.driver_verifications
    WHERE user_id = p_user_id FOR UPDATE;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_driver_document(
  p_kind public.document_kind, p_storage_path text, p_file_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_document public.driver_documents;
  v_previous_paths text[] := ARRAY[]::text[];
BEGIN
  PERFORM public.rpc_require_active();
  IF p_kind IS NULL OR p_storage_path IS NULL OR p_file_name IS NULL THEN
    RAISE EXCEPTION 'Document metadata is required';
  END IF;
  PERFORM public.rpc_require_text(p_file_name, 'file_name', 120, 1);
  IF p_storage_path NOT LIKE auth.uid()::text || '/%'
     OR cardinality(storage.filename(p_storage_path)) <> 1 THEN
    RAISE EXCEPTION 'Invalid document storage path';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'driver-documents' AND name = p_storage_path
  ) THEN
    RAISE EXCEPTION 'The uploaded document is unavailable';
  END IF;
  PERFORM public.rpc_lock_driver_dossier(auth.uid());
  IF public.rpc_document_dossier_is_locked(auth.uid()) THEN
    RAISE EXCEPTION 'A pending or verified dossier cannot be replaced';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.driver_documents
    WHERE user_id = auth.uid() AND storage_path = p_storage_path AND superseded_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This document is already registered';
  END IF;
  SELECT array_agg(storage_path) INTO v_previous_paths
  FROM public.driver_documents
  WHERE user_id = auth.uid() AND kind = p_kind AND superseded_at IS NULL;
  UPDATE public.driver_documents SET superseded_at = now()
  WHERE user_id = auth.uid() AND kind = p_kind AND superseded_at IS NULL;
  INSERT INTO public.driver_documents (user_id, kind, storage_path, file_name)
  VALUES (auth.uid(), p_kind, p_storage_path, p_file_name)
  RETURNING * INTO v_document;
  RETURN jsonb_build_object(
    'id',v_document.id,
    'previous_paths',to_jsonb(COALESCE(v_previous_paths, ARRAY[]::text[]))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_driver_document(p_document_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_document public.driver_documents;
BEGIN
  PERFORM public.rpc_require_active();
  IF p_document_id IS NULL THEN RAISE EXCEPTION 'Document is required'; END IF;
  PERFORM public.rpc_lock_driver_dossier(auth.uid());
  IF public.rpc_document_dossier_is_locked(auth.uid()) THEN
    RAISE EXCEPTION 'A pending or verified dossier cannot be replaced';
  END IF;
  SELECT * INTO v_document FROM public.driver_documents
    WHERE id = p_document_id AND user_id = auth.uid() AND superseded_at IS NULL
    FOR UPDATE;
  IF v_document.id IS NULL THEN RAISE EXCEPTION 'Document is unavailable'; END IF;
  UPDATE public.driver_documents SET superseded_at = now()
  WHERE id = p_document_id AND user_id = auth.uid() AND superseded_at IS NULL;
  RETURN v_document.storage_path;
END;
$$;

DROP POLICY IF EXISTS driver_documents_owner_select ON storage.objects;
DROP POLICY IF EXISTS driver_documents_staff_select ON storage.objects;
DROP POLICY IF EXISTS driver_documents_staff_delete ON storage.objects;

DROP POLICY IF EXISTS driver_documents_owner_insert ON storage.objects;
CREATE POLICY driver_documents_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'driver-documents'
    AND public.user_is_active(auth.uid())
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND cardinality(storage.filename(name)) = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.driver_verifications v
      WHERE v.user_id = auth.uid() AND v.status IN ('pending','verified')
    )
  );

DROP POLICY IF EXISTS driver_documents_owner_delete ON storage.objects;
CREATE POLICY driver_documents_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND public.user_is_active(auth.uid())
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND cardinality(storage.filename(name)) = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.driver_verifications v
      WHERE v.user_id = auth.uid() AND v.status IN ('pending','verified')
    )
  );

DROP POLICY IF EXISTS driver_documents_insert_own ON public.driver_documents;
DROP POLICY IF EXISTS driver_documents_delete_authorized ON public.driver_documents;
REVOKE INSERT (user_id, kind, storage_path, file_name), DELETE
  ON public.driver_documents FROM authenticated;

REVOKE ALL ON FUNCTION public.rpc_require_authenticated() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_document_dossier_is_locked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_lock_driver_dossier(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_appeal(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_appeal(uuid, text, boolean, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_report(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_restriction(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_moderation(uuid, text, integer, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_driver_document(public.document_kind, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_driver_document(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_appeal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_appeal(uuid, text, boolean, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_report(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_restriction(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_moderation(uuid, text, integer, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_driver_document(public.document_kind, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_driver_document(uuid) TO authenticated;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users','driver_verifications','driver_documents','vehicles','rides','ride_stops',
    'recurring_ride_rules','ride_occurrences','bookings','ride_requests','conversations',
    'conversation_blocks','messages','reviews','reports','notifications','trusted_contacts',
    'saved_drivers','announcements','recent_searches','staff_members','account_restrictions',
    'moderation_actions','moderation_appeals','cities'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;
