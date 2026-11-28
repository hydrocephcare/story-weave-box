-- Restrict role and entitlement RPCs to authenticated callers.
-- has_role is a SECURITY DEFINER function: anonymous callers must not be able to
-- enumerate another user's role membership by supplying arbitrary UUIDs.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_admin boolean := false;
BEGIN
  IF v_caller IS NULL OR _user_id IS NULL THEN
    RETURN false;
  END IF;

  -- A non-admin may inspect only their own role. Preserve the legacy-email
  -- identity bridge for admin callers whose Neon and legacy UUIDs differ.
  IF _user_id <> v_caller THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = v_caller AND r.role = 'admin'::public.app_role
    ) OR EXISTS (
      SELECT 1
      FROM public.user_roles r
      JOIN auth.users legacy_user ON legacy_user.id = r.user_id
      JOIN neon_auth."user" neon_user
        ON lower(neon_user.email) = lower(legacy_user.email)
       AND neon_user."emailVerified" = true
      WHERE neon_user.id = v_caller AND r.role = 'admin'::public.app_role
    ) INTO v_admin;

    IF NOT coalesce(v_admin, false) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _user_id AND r.role = _role
  ) OR EXISTS (
    SELECT 1
    FROM public.user_roles r
    JOIN auth.users legacy_user ON legacy_user.id = r.user_id
    JOIN neon_auth."user" neon_user
      ON lower(neon_user.email) = lower(legacy_user.email)
     AND neon_user."emailVerified" = true
    WHERE neon_user.id = _user_id AND r.role = _role
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- consume_feature checks auth.uid() internally, but it must not be callable
-- without authentication; keep the same authenticated/server grants as the
-- freemium entitlement migration.
REVOKE ALL ON FUNCTION public.consume_feature(text, integer) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.consume_feature(text, integer) TO authenticated, service_role;

-- All objects referenced by consume_feature are schema-qualified; pin its
-- SECURITY DEFINER search_path to pg_catalog to prevent object shadowing.
ALTER FUNCTION public.consume_feature(text, integer) SET search_path = pg_catalog;

-- This SECURITY DEFINER RPC replaces contest questions. It must never be
-- callable by anonymous users or authenticated non-administrators.
CREATE OR REPLACE FUNCTION public.admin_replace_contest_questions(p_round_id uuid, p_questions jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  item jsonb;
  question_id uuid;
  item_count integer := 0;
  option_count integer;
  answer_index integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  IF jsonb_typeof(p_questions) <> 'array' OR jsonb_array_length(p_questions) < 1 OR jsonb_array_length(p_questions) > 200 THEN
    RAISE EXCEPTION 'Question bank must contain between 1 and 200 questions';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contest_rounds WHERE id = p_round_id AND status = 'scheduled' AND locked_at IS NULL) THEN
    RAISE EXCEPTION 'Only an unlocked scheduled round can be edited';
  END IF;

  DELETE FROM public.contest_questions WHERE round_id = p_round_id;
  FOR item IN SELECT value FROM jsonb_array_elements(p_questions)
  LOOP
    option_count := jsonb_array_length(item->'options');
    answer_index := (item->>'correctIndex')::integer;
    IF length(trim(item->>'stem')) < 5 OR jsonb_typeof(item->'options') <> 'array' OR option_count < 2 OR option_count > 8
      OR answer_index < 0 OR answer_index >= option_count THEN
      RAISE EXCEPTION 'Invalid question at position %', item_count + 1;
    END IF;
    question_id := gen_random_uuid();
    INSERT INTO public.contest_questions (id, round_id, position, stem, options, snapshot_hash)
    VALUES (question_id, p_round_id, item_count + 1, trim(item->>'stem'), item->'options',
      encode(extensions.digest(convert_to((jsonb_build_object('stem', trim(item->>'stem'), 'options', item->'options'))::text, 'UTF8'), 'sha256'), 'hex'));
    INSERT INTO private.contest_answer_keys (question_id, correct_index, explanation)
    VALUES (question_id, answer_index, nullif(trim(item->>'explanation'), ''));
    item_count := item_count + 1;
  END LOOP;
  UPDATE public.contest_rounds SET question_count = item_count, updated_at = now() WHERE id = p_round_id;
  RETURN item_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_replace_contest_questions(uuid, jsonb) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.admin_replace_contest_questions(uuid, jsonb) TO authenticated, service_role;
