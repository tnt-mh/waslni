-- Staff roles, account restrictions, moderation audit and operational history.
-- Builds on supabase/schema.sql; no profile or booking columns are duplicated.

DO $$ BEGIN
  ALTER TYPE public.report_status ADD VALUE IF NOT EXISTS 'in_review';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'moderation';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'appeal_update';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.staff_role AS ENUM ('super_admin', 'admin', 'moderator', 'read_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.restriction_kind AS ENUM ('warning', 'timeout', 'ban');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.moderation_action_type AS ENUM (
    'warning', 'timeout', 'ban', 'unban', 'reverse_ban', 'hide_review',
    'restore_review', 'resolve_report', 'dismiss_report', 'assign_report', 'verify_driver',
    'reject_driver', 'staff_role_change'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE public.moderation_action_type ADD VALUE IF NOT EXISTS 'assign_report';

DO $$ BEGIN
  CREATE TYPE public.moderation_appeal_status AS ENUM ('open', 'under_review', 'granted', 'denied');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Newly added enum labels are deliberately not used until later migrations.

CREATE TABLE IF NOT EXISTS public.staff_members (
  user_id     uuid PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  role        public.staff_role NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.account_restrictions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  kind            public.restriction_kind NOT NULL,
  starts_at       timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz,
  reason          text NOT NULL DEFAULT '',
  public_message  text,
  internal_note   text,
  active          boolean NOT NULL DEFAULT true,
  reversed_at     timestamptz,
  reversed_by     uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_by      uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_restrictions_reason_length CHECK (char_length(reason) BETWEEN 1 AND 2000),
  CONSTRAINT account_restrictions_public_message_length CHECK (
    public_message IS NULL OR char_length(public_message) <= 1000
  ),
  CONSTRAINT account_restrictions_internal_note_length CHECK (
    internal_note IS NULL OR char_length(internal_note) <= 5000
  ),
  -- A warning is a historical notice, never a suspension mechanism.
  CONSTRAINT account_restrictions_warning_not_suspending CHECK (
    kind <> 'warning' OR (expires_at IS NULL AND active)
  ),
  CONSTRAINT account_restrictions_time_range CHECK (
    expires_at IS NULL OR expires_at > starts_at
  ),
  CONSTRAINT account_restrictions_suspension_window CHECK (
    kind = 'warning' OR kind = 'ban' OR expires_at IS NOT NULL
  ),
  CONSTRAINT account_restrictions_reversal_consistent CHECK (
    (reversed_at IS NULL) = (reversed_by IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS account_restrictions_effective_idx
  ON public.account_restrictions (user_id, kind, starts_at, expires_at)
  WHERE active;

-- Preserve legacy administrator bootstrap without trusting users.role in any
-- authorization helper. Explicit staff assignments always win on re-runs.
INSERT INTO public.staff_members (user_id, role, active, created_by)
SELECT u.id, 'admin'::public.staff_role, true, NULL
FROM public.users u
WHERE u.role = 'admin'
  AND u.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.account_restrictions r
    WHERE r.user_id = u.id
      AND r.active
      AND r.kind IN ('timeout','ban')
      AND r.starts_at <= now()
      AND (r.expires_at IS NULL OR r.expires_at > now())
  )
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action         public.moderation_action_type NOT NULL,
  actor_id       uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES public.users (id) ON DELETE RESTRICT,
  restriction_id uuid REFERENCES public.account_restrictions (id) ON DELETE RESTRICT,
  report_id      uuid REFERENCES public.reports (id) ON DELETE RESTRICT,
  review_id      uuid REFERENCES public.reviews (id) ON DELETE RESTRICT,
  verification_user_id uuid REFERENCES public.users (id) ON DELETE RESTRICT,
  reason         text NOT NULL DEFAULT '',
  internal_note text,
  evidence       jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(evidence) = 'object'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moderation_actions_reason_length CHECK (char_length(reason) BETWEEN 1 AND 2000),
  CONSTRAINT moderation_actions_internal_note_length CHECK (
    internal_note IS NULL OR char_length(internal_note) <= 5000
  )
);

CREATE INDEX IF NOT EXISTS moderation_actions_target_created_idx
  ON public.moderation_actions (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_actions_actor_created_idx
  ON public.moderation_actions (actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.moderation_appeals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id        uuid NOT NULL REFERENCES public.moderation_actions (id) ON DELETE RESTRICT,
  user_id          uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  status           public.moderation_appeal_status NOT NULL DEFAULT 'open',
  statement        text NOT NULL,
  decision_note    text,
  internal_note    text,
  staff_only       boolean NOT NULL DEFAULT false,
  reviewed_by      uuid REFERENCES public.users (id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moderation_appeals_statement_length CHECK (char_length(statement) BETWEEN 1 AND 3000),
  CONSTRAINT moderation_appeals_decision_length CHECK (
    decision_note IS NULL OR char_length(decision_note) <= 2000
  ),
  CONSTRAINT moderation_appeals_internal_note_length CHECK (
    internal_note IS NULL OR char_length(internal_note) <= 5000
  ),
  CONSTRAINT moderation_appeals_staff_only_note CHECK (
    staff_only OR internal_note IS NULL
  ),
  -- Appeals are review requests, not an automatic stay or reversal.
  CONSTRAINT moderation_appeals_review_consistent CHECK (
    (status IN ('granted','denied')) =
    (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND decision_note IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS moderation_appeals_one_open_per_action
  ON public.moderation_appeals (action_id, user_id)
  WHERE status IN ('open','under_review');
CREATE INDEX IF NOT EXISTS moderation_appeals_user_created_idx
  ON public.moderation_appeals (user_id, created_at DESC);

-- Keep the safe, staff-only view from exposing notes/evidence even if its owner
-- bypasses RLS. Users see only their own appeals; staff policies grant access
-- to the underlying table in the RLS migration.
CREATE OR REPLACE VIEW public.my_moderation_appeals
WITH (security_invoker = true) AS
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
    ma.created_at AS action_at
  FROM public.moderation_appeals a
  JOIN public.moderation_actions ma ON ma.id = a.action_id
  WHERE a.user_id = auth.uid();

ALTER VIEW public.my_moderation_appeals OWNER TO postgres;
REVOKE ALL ON public.my_moderation_appeals FROM PUBLIC, anon;
GRANT SELECT ON public.my_moderation_appeals TO authenticated;

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS reports_assigned_status_idx
  ON public.reports (assigned_to, status);
CREATE INDEX IF NOT EXISTS reports_target_idx
  ON public.reports (target_type, target_id);

CREATE TABLE IF NOT EXISTS public.recent_searches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  from_city_id  uuid NOT NULL REFERENCES public.cities (id) ON DELETE RESTRICT,
  to_city_id    uuid NOT NULL REFERENCES public.cities (id) ON DELETE RESTRICT,
  date          date NOT NULL,
  seats         integer NOT NULL DEFAULT 1 CHECK (seats > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recent_searches_distinct_cities CHECK (from_city_id <> to_city_id)
);

CREATE INDEX IF NOT EXISTS recent_searches_user_created_idx
  ON public.recent_searches (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.document_access_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES public.driver_documents (id) ON DELETE RESTRICT,
  actor_id       uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  user_id        uuid REFERENCES public.users (id) ON DELETE SET NULL,
  accessed_at    timestamptz NOT NULL DEFAULT now(),
  reason         text NOT NULL DEFAULT '',
  CONSTRAINT document_access_log_reason_length CHECK (char_length(reason) <= 1000)
);

CREATE INDEX IF NOT EXISTS document_access_log_document_accessed_idx
  ON public.document_access_log (document_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS document_access_log_actor_accessed_idx
  ON public.document_access_log (actor_id, accessed_at DESC);

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  token          text NOT NULL UNIQUE,
  device_id      text,
  platform       text NOT NULL CHECK (platform IN ('web','ios','android')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_tokens_token_length CHECK (char_length(token) BETWEEN 10 AND 4096)
);

CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON public.push_tokens (user_id);

CREATE TABLE IF NOT EXISTS public.ride_occurrences (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id           uuid NOT NULL REFERENCES public.rides (id) ON DELETE CASCADE,
  occurrence_date   date NOT NULL,
  departure_at      timestamptz NOT NULL,
  arrival_at        timestamptz NOT NULL,
  status            public.ride_status NOT NULL DEFAULT 'published',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ride_occurrences_ride_date_unique UNIQUE (ride_id, occurrence_date),
  CONSTRAINT ride_occurrences_time_order CHECK (arrival_at > departure_at)
);

CREATE INDEX IF NOT EXISTS ride_occurrences_search_idx
  ON public.ride_occurrences (departure_at) WHERE status = 'published';

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS params jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(params) = 'object');

-- Legacy server inserts supplied localized title/body values. New RPCs use
-- neutral technical keys and put localized rendering data in params.
ALTER TABLE public.notifications ALTER COLUMN title DROP NOT NULL;

DROP TRIGGER IF EXISTS reports_set_updated_at ON public.reports;
CREATE TRIGGER reports_set_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS staff_members_set_updated_at ON public.staff_members;
CREATE TRIGGER staff_members_set_updated_at
  BEFORE UPDATE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS account_restrictions_set_updated_at ON public.account_restrictions;
CREATE TRIGGER account_restrictions_set_updated_at
  BEFORE UPDATE ON public.account_restrictions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS moderation_appeals_set_updated_at ON public.moderation_appeals;
CREATE TRIGGER moderation_appeals_set_updated_at
  BEFORE UPDATE ON public.moderation_appeals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS push_tokens_set_updated_at ON public.push_tokens;
CREATE TRIGGER push_tokens_set_updated_at
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS ride_occurrences_set_updated_at ON public.ride_occurrences;
CREATE TRIGGER ride_occurrences_set_updated_at
  BEFORE UPDATE ON public.ride_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Directional blocks must exist before the compatibility trigger can read
-- them, so migration 000 is coherent when applied without migration 001.
CREATE TABLE IF NOT EXISTS public.conversation_blocks (
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

DROP FUNCTION IF EXISTS public.enforce_conversation_block_participant() CASCADE;
CREATE FUNCTION public.enforce_conversation_block_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = NEW.conversation_id
      AND NEW.user_id IN (c.participant_a, c.participant_b)
  ) THEN
    RAISE EXCEPTION 'Conversation blocks require a conversation participant';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER conversation_blocks_require_participant
  BEFORE INSERT OR UPDATE ON public.conversation_blocks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_conversation_block_participant();

-- One conversation cannot have two incompatible block representations.
DROP TRIGGER IF EXISTS conversations_block_compatibility ON public.conversations;
DROP FUNCTION IF EXISTS public.enforce_conversation_block_compatibility() CASCADE;
CREATE FUNCTION public.enforce_conversation_block_compatibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.blocked_by IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.conversation_blocks b
       WHERE b.conversation_id = NEW.id AND b.user_id = NEW.blocked_by
     ) THEN
    RAISE EXCEPTION 'Legacy blocked_by must match a directional conversation block';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER conversations_block_compatibility
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_conversation_block_compatibility();
