-- Harden role and entitlement RPCs while preserving public RLS evaluation.
-- Public SELECT policies call auth.uid() and has_role(); anonymous callers must
-- be able to execute these helpers, but has_role returns false when auth.uid()
-- is NULL and never reveals another user's role to an anonymous caller.
GRANT USAGE ON SCHEMA auth TO anonymous, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anonymous, authenticated, service_role;
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

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anonymous, authenticated, service_role;

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

-- Internal admission helper: only trusted SECURITY DEFINER wrappers/triggers
-- should call this. Direct RPC access would let callers verify arbitrary IDs.
REVOKE ALL ON FUNCTION public._process_admission(uuid, text, text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public._process_admission(uuid, text, text) TO service_role;

-- Contest scoring must be limited to the attempt owner, an administrator,
-- or the trusted service role. Prevent callers from finalizing another
-- student's active attempt by guessing its UUID.
CREATE OR REPLACE FUNCTION public.score_contest_attempt(p_attempt_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  result numeric;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') <> 'service_role' THEN
    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.contest_attempts ca
      WHERE ca.id = p_attempt_id
        AND (ca.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    ) THEN
      RAISE EXCEPTION 'attempt_not_owned';
    END IF;
  END IF;

  SELECT CASE WHEN count(q.id) = 0 THEN 0 ELSE greatest(0, round(100.0 * (
    count(*) FILTER (WHERE a.selected_index = k.correct_index) * r.marks_correct
    + count(*) FILTER (WHERE a.selected_index IS NOT NULL AND a.selected_index <> k.correct_index) * r.marks_incorrect
  ) / (count(q.id) * r.marks_correct), 2)) END
  INTO result
  FROM public.contest_attempts ca
  JOIN public.contest_rounds r ON r.id = ca.round_id
  JOIN public.contest_questions q ON q.round_id = ca.round_id
  LEFT JOIN public.contest_answers a ON a.attempt_id = ca.id AND a.question_id = q.id
  JOIN private.contest_answer_keys k ON k.question_id = q.id
  WHERE ca.id = p_attempt_id
  GROUP BY r.marks_correct, r.marks_incorrect;

  UPDATE public.contest_attempts
  SET status = 'submitted', submitted_at = now(), score = coalesce(result, 0)
  WHERE id = p_attempt_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt is not active'; END IF;
  RETURN coalesce(result, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.score_contest_attempt(uuid) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.score_contest_attempt(uuid) TO authenticated, service_role;

-- Maintenance-only functions should not be invokable through anonymous RPC.
REVOKE ALL ON FUNCTION public.cleanup_lite_health_data() FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_lite_health_data() TO service_role;
REVOKE ALL ON FUNCTION public.zone_close_stale() FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.zone_close_stale() TO service_role;

-- Candidate-selection RPCs are internal maintenance helpers. The API's
-- privileged database connection invokes them directly; they are not
-- intended to be exposed through anonymous/authenticated PostgREST RPC.
REVOKE ALL ON FUNCTION public.essay_pending_candidates(integer) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.essay_pending_candidates(integer) TO service_role;
REVOKE ALL ON FUNCTION public.note_essay_candidates(integer) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.note_essay_candidates(integer) TO service_role;
REVOKE ALL ON FUNCTION public.note_flashcard_candidates(integer) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.note_flashcard_candidates(integer) TO service_role;
REVOKE ALL ON FUNCTION public.note_mcq_candidates(integer) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.note_mcq_candidates(integer) TO service_role;
REVOKE ALL ON FUNCTION public.note_mcq_topup_candidates(integer) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.note_mcq_topup_candidates(integer) TO service_role;

-- These room lifecycle helpers are called by token-checked SECURITY DEFINER
-- wrappers (zone_state, zone_end, zone_close_mine) and maintenance code. Direct
-- RPC access would let a caller end arbitrary rooms or rewrite player lives.
REVOKE ALL ON FUNCTION public.zone_finish_room(uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.zone_finish_room(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.zone_sync_lives(public.zone_rooms, integer) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.zone_sync_lives(public.zone_rooms, integer) TO service_role;

-- Pin remaining SECURITY DEFINER maintenance helpers to pg_catalog. Their
-- application objects are explicitly schema-qualified in their definitions.
ALTER FUNCTION public._process_admission(uuid, text, text) SET search_path = pg_catalog;
ALTER FUNCTION public.cleanup_lite_health_data() SET search_path = pg_catalog;
ALTER FUNCTION public.zone_close_stale() SET search_path = pg_catalog;
ALTER FUNCTION public.essay_pending_candidates(integer) SET search_path = pg_catalog;
ALTER FUNCTION public.note_essay_candidates(integer) SET search_path = pg_catalog;
ALTER FUNCTION public.note_flashcard_candidates(integer) SET search_path = pg_catalog;
ALTER FUNCTION public.note_mcq_candidates(integer) SET search_path = pg_catalog;
ALTER FUNCTION public.note_mcq_topup_candidates(integer) SET search_path = pg_catalog;
ALTER FUNCTION public.zone_finish_room(uuid) SET search_path = pg_catalog;
ALTER FUNCTION public.zone_sync_lives(public.zone_rooms, integer) SET search_path = pg_catalog;

-- Deep-note persistence must never report success when ON CONFLICT skipped an
-- insert (for example, when a slug is already in a non-published state).
CREATE OR REPLACE FUNCTION public.save_topic_deep(p_slug text, p_name text, p_category text, p_base jsonb, p_deep jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  existing public.topic_pages%rowtype;
  affected_rows integer;
BEGIN
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(p_slug) > 80 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slug');
  END IF;
  IF p_deep IS NULL OR jsonb_typeof(p_deep) <> 'object' OR pg_column_size(p_deep) > 90000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'size');
  END IF;
  IF length(coalesce(p_deep->>'checked', '')) < 8
     OR p_deep->>'reviewStatus' IS DISTINCT FROM 'passed'
     OR length(coalesce(p_deep->>'reviewModel', '')) = 0
     OR length(coalesce(p_deep->>'reviewedAt', '')) < 8
     OR jsonb_typeof(p_deep->'sections') IS DISTINCT FROM 'array'
     OR (CASE WHEN jsonb_typeof(p_deep->'sections') = 'array'
              THEN jsonb_array_length(p_deep->'sections') ELSE 0 END) NOT BETWEEN 7 AND 14
     OR NOT (
       (CASE WHEN jsonb_typeof(p_deep->'vivas') = 'array'
             THEN jsonb_array_length(p_deep->'vivas') ELSE 0 END) BETWEEN 12 AND 20
       OR
       (CASE WHEN jsonb_typeof(p_deep->'exam') = 'array'
             THEN jsonb_array_length(p_deep->'exam') ELSE 0 END) BETWEEN 12 AND 14
     )
     OR (CASE WHEN jsonb_typeof(p_deep->'mcqs') = 'array'
              THEN jsonb_array_length(p_deep->'mcqs') ELSE 0 END) NOT BETWEEN 6 AND 10
     OR (CASE WHEN jsonb_typeof(p_deep->'cases') = 'array'
              THEN jsonb_array_length(p_deep->'cases') ELSE 0 END) NOT BETWEEN 2 AND 3
     OR (CASE WHEN jsonb_typeof(p_deep->'facts') = 'array'
              THEN jsonb_array_length(p_deep->'facts') ELSE 0 END) NOT BETWEEN 6 AND 12
     OR (CASE WHEN jsonb_typeof(p_deep->'mistakes') = 'array'
              THEN jsonb_array_length(p_deep->'mistakes') ELSE 0 END) NOT BETWEEN 5 AND 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'shape');
  END IF;
  IF p_deep::text ~* '(https?:|www\\.|<[a-z/!]|javascript:|onerror\\s*=|data:text)' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unsafe');
  END IF;

  -- Deep notes enrich an existing published topic only. This RPC must never
  -- create a new public topic or accept caller-supplied base content as a page.
  SELECT * INTO existing
  FROM public.topic_pages
  WHERE slug = p_slug AND status = 'published'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing');
  END IF;

  IF existing.content IS NULL OR jsonb_typeof(existing.content) <> 'object'
     OR jsonb_typeof(existing.content->'sections') IS DISTINCT FROM 'array'
     OR (CASE WHEN jsonb_typeof(existing.content->'sections') = 'array'
              THEN jsonb_array_length(existing.content->'sections') ELSE 0 END) < 3
     OR length(coalesce(existing.content->>'summary', '')) < 40 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'base');
  END IF;

  IF existing.content ? 'deep'
     AND existing.content->'deep'->>'reviewStatus' = 'passed'
     AND length(coalesce(existing.content->'deep'->>'reviewModel', '')) > 0
     AND length(coalesce(existing.content->'deep'->>'reviewedAt', '')) >= 8
     AND (existing.content->'deep') ? 'vivas' THEN
    RETURN jsonb_build_object('ok', true, 'existing', true);
  END IF;

  UPDATE public.topic_pages
  SET content = (coalesce(existing.content, '{}'::jsonb) - 'deep') || jsonb_build_object('deep', p_deep),
      updated_at = now()
  WHERE slug = p_slug AND status = 'published';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slug_conflict');
  END IF;
  RETURN jsonb_build_object('ok', true, 'saved', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_topic_deep(text, text, text, jsonb, jsonb) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.save_topic_deep(text, text, text, jsonb, jsonb) TO service_role;

-- Topic publication uses only schema-qualified application objects; pin its
-- SECURITY DEFINER search_path as well, while preserving authenticated execution.
REVOKE ALL ON FUNCTION public.publish_topic_page(text, text, text, jsonb, text) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.publish_topic_page(text, text, text, jsonb, text) TO authenticated, service_role;
ALTER FUNCTION public.publish_topic_page(text, text, text, jsonb, text) SET search_path = pg_catalog;

-- RLS helper for the administrator-managed blog-polish key. The function
-- must remain callable by app roles because the topic_pages UPDATE policy
-- invokes it, but it reads only the secret table through a qualified name.
REVOKE ALL ON FUNCTION public.polish_write_ok() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.polish_write_ok() TO anonymous, authenticated, service_role;
ALTER FUNCTION public.polish_write_ok() SET search_path = pg_catalog;

-- These legacy trigger-returning helpers are not attached to any trigger on
-- this database and must not be exposed as public RPCs.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_admission() FROM PUBLIC, anonymous, authenticated;
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog;
ALTER FUNCTION public.handle_new_user_admission() SET search_path = pg_catalog;

-- A Neon-authenticated caller may only migrate the identity represented by
-- their own verified JWT. Without this check, any signed-in user could pass
-- another user's ID and email and trigger SECURITY DEFINER identity remapping.
CREATE OR REPLACE FUNCTION public.ensure_neon_user(_user_id uuid, _email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_verified boolean := false;
  v_found boolean := false;
  v_legacy_present boolean := false;
  v_legacy uuid;
  v_ref record;
  v_rows integer := 0;
  v_migrated integer := 0;
  v_skipped text[] := ARRAY[]::text[];
BEGIN
  IF _user_id IS NULL OR coalesce(trim(_email),'') = '' THEN
    RAISE EXCEPTION 'A Neon Auth user ID and email are required';
  END IF;

  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'The authenticated user does not match the requested Neon user';
  END IF;

  SELECT coalesce(u."emailVerified",false), true
    INTO v_verified, v_found
  FROM neon_auth."user" u
  WHERE u.id = _user_id AND lower(u.email) = lower(_email)
  LIMIT 1;

  IF NOT coalesce(v_found,false) THEN
    RAISE EXCEPTION 'Neon Auth user not found';
  END IF;

  INSERT INTO auth.users(id,email)
  VALUES(_user_id,NULL)
  ON CONFLICT(id) DO NOTHING;

  SELECT EXISTS(
    SELECT 1 FROM auth.users a
    WHERE lower(a.email)=lower(_email) AND a.id<>_user_id
  ) INTO v_legacy_present;

  IF v_verified THEN
    FOR v_legacy IN
      SELECT a.id
      FROM auth.users a
      WHERE lower(a.email) = lower(_email) AND a.id <> _user_id
    LOOP
      FOR v_ref IN
        SELECT DISTINCT refs.table_name, refs.column_name
        FROM (
          SELECT c.oid::regclass AS table_name, a.attname AS column_name
          FROM pg_constraint fk
          JOIN pg_class c ON c.oid = fk.conrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN unnest(fk.conkey) k(attnum) ON true
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
          WHERE fk.contype = 'f'
            AND fk.confrelid = 'auth.users'::regclass
            AND n.nspname = 'public'
          UNION
          SELECT c.oid::regclass AS table_name, a.attname AS column_name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_attribute a ON a.attrelid = c.oid
          WHERE n.nspname = 'public'
            AND c.relkind IN ('r','p')
            AND a.attnum > 0
            AND NOT a.attisdropped
            AND a.atttypid = 'uuid'::regtype
            AND a.attname IN ('user_id','owner_id','created_by','updated_by','reviewed_by','actor_id','decided_by')
        ) refs
        ORDER BY refs.table_name, refs.column_name
      LOOP
        BEGIN
          EXECUTE format(
            'UPDATE %s SET %I = $1 WHERE %I = $2',
            v_ref.table_name, v_ref.column_name, v_ref.column_name
          ) USING _user_id, v_legacy;
          GET DIAGNOSTICS v_rows = ROW_COUNT;
          v_migrated := v_migrated + v_rows;
        EXCEPTION WHEN unique_violation THEN
          v_skipped := array_append(v_skipped, v_ref.table_name::text || '.' || v_ref.column_name);
        END;
      END LOOP;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'user_id', _user_id,
    'email_verified', v_verified,
    'migration_pending', (NOT v_verified AND v_legacy_present),
    'migrated_rows', v_migrated,
    'skipped', to_jsonb(v_skipped)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_neon_user(uuid, text) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.ensure_neon_user(uuid, text) TO authenticated, service_role;

-- Keep application roles from creating objects in public and make pg_temp
-- explicit and last for every SECURITY DEFINER function in public. PostgreSQL
-- otherwise searches an implicit temporary schema before ordinary schemas.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anonymous, authenticated;

DO $harden_security_definer_search_paths$
DECLARE
  f record;
  existing_path text;
  schema_name text;
  safe_path text;
BEGIN
  FOR f IN
    SELECT p.oid, p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    existing_path := NULL;
    IF f.proconfig IS NOT NULL THEN
      SELECT regexp_replace(item, '^search_path=', '')
        INTO existing_path
      FROM unnest(f.proconfig) AS x(item)
      WHERE item LIKE 'search_path=%'
      LIMIT 1;
    END IF;

    safe_path := 'pg_catalog';
    IF existing_path IS NOT NULL THEN
      FOREACH schema_name IN ARRAY string_to_array(replace(existing_path, '"', ''), ',')
      LOOP
        schema_name := btrim(schema_name);
        IF schema_name <> '' AND schema_name NOT IN ('pg_catalog', 'pg_temp') THEN
          safe_path := safe_path || ', ' || quote_ident(schema_name);
        END IF;
      END LOOP;
    END IF;
    safe_path := safe_path || ', pg_temp';
    EXECUTE format('ALTER FUNCTION %s SET search_path = %s', f.oid::regprocedure, safe_path);
  END LOOP;
END;
$harden_security_definer_search_paths$;
