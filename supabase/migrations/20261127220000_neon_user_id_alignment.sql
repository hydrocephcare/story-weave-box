CREATE OR REPLACE FUNCTION public.ensure_neon_user(_user_id uuid, _email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'neon_auth', 'pg_catalog'
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

REVOKE ALL ON FUNCTION public.ensure_neon_user(uuid,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.consume_feature(p_feature text, p_units integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_admin boolean := false;
  v_subs boolean := false;
  v_paid boolean := false;
  v_limit integer := 0;
  v_period date := current_date;
  v_period_type text := 'day';
  v_key text;
  v_used integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('allowed',false,'reason','login_required','remaining',0);
  END IF;
  IF p_units IS NULL OR p_units < 1 OR p_units > 100 THEN
    RETURN jsonb_build_object('allowed',false,'reason','invalid_units','remaining',0);
  END IF;

  INSERT INTO auth.users(id,email) VALUES(v_user,NULL) ON CONFLICT(id) DO NOTHING;

  SELECT public.has_role(v_user,'admin'::public.app_role) INTO v_admin;
  IF coalesce(v_admin,false) THEN
    RETURN jsonb_build_object('allowed',true,'reason','admin','unlimited',true);
  END IF;

  SELECT coalesce((SELECT value='true' FROM public.app_settings WHERE key='subscriptions_enabled' LIMIT 1),false)
    INTO v_subs;
  IF NOT v_subs THEN
    RETURN jsonb_build_object('allowed',true,'reason','subscriptions_disabled','unlimited',true);
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.access_grants g
    WHERE (g.user_id = v_user OR (v_email <> '' AND lower(coalesce(g.email,''))=v_email))
      AND (g.expires_at IS NULL OR g.expires_at > now())
      AND coalesce(g.scope,'all') IN ('all','premium','content')
  ) INTO v_paid;
  IF v_paid THEN
    RETURN jsonb_build_object('allowed',true,'reason','active_plan','unlimited',true);
  END IF;

  CASE p_feature
    WHEN 'ompath_ai_questions' THEN v_key:='free_ompath_ai_daily'; v_period_type:='day';
    WHEN 'ai_note_generation' THEN v_key:='free_ai_note_generation_weekly'; v_period_type:='week';
    WHEN 'ai_flashcard_generation' THEN v_key:='free_ai_flashcard_generation_weekly'; v_period_type:='week';
    WHEN 'ai_mcq_generation' THEN v_key:='free_ai_mcq_generation_weekly'; v_period_type:='week';
    WHEN 'ai_picture_questions' THEN v_key:='free_ai_picture_questions_daily'; v_period_type:='day';
    WHEN 'topic_page_generation' THEN v_key:='free_topic_page_generation_weekly'; v_period_type:='week';
    ELSE RETURN jsonb_build_object('allowed',false,'reason','unknown_feature','remaining',0);
  END CASE;

  SELECT greatest(0,coalesce(nullif(value,'')::integer,0))
    INTO v_limit FROM public.app_settings WHERE key=v_key;
  IF NOT FOUND THEN
    v_limit := CASE v_key
      WHEN 'free_ompath_ai_daily' THEN 8
      WHEN 'free_ai_note_generation_weekly' THEN 2
      WHEN 'free_ai_flashcard_generation_weekly' THEN 2
      WHEN 'free_ai_mcq_generation_weekly' THEN 2
      WHEN 'free_ai_picture_questions_daily' THEN 15
      WHEN 'free_topic_page_generation_weekly' THEN 1
      ELSE 0 END;
  END IF;

  IF v_limit = 0 THEN
    RETURN jsonb_build_object('allowed',false,'reason','upgrade_required','remaining',0,'limit',v_limit);
  END IF;

  IF v_period_type='week' THEN
    v_period := date_trunc('week', current_date)::date;
  END IF;

  INSERT INTO public.feature_usage(user_id,feature,period_start,used,updated_at)
  VALUES(v_user,p_feature,v_period,p_units,now())
  ON CONFLICT(user_id,feature,period_start) DO UPDATE
    SET used = public.feature_usage.used + excluded.used, updated_at=now()
    WHERE public.feature_usage.used + excluded.used <= v_limit
  RETURNING used INTO v_used;

  IF v_used IS NULL THEN
    SELECT used INTO v_used FROM public.feature_usage
    WHERE user_id=v_user AND feature=p_feature AND period_start=v_period;
    RETURN jsonb_build_object('allowed',false,'reason','quota_exhausted','used',coalesce(v_used,0),'limit',v_limit,'remaining',0,'period',v_period_type);
  END IF;

  RETURN jsonb_build_object('allowed',true,'reason','free_allowance','used',v_used,'limit',v_limit,'remaining',greatest(0,v_limit-v_used),'period',v_period_type);
END;
$function$


CREATE OR REPLACE FUNCTION public.is_mku_student(_uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_auth_user uuid := auth.uid();
  v_user uuid := coalesce(_uid,auth.uid());
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_legacy uuid;
BEGIN
  IF v_user IS NULL OR v_auth_user IS NULL THEN RETURN false; END IF;
  IF v_user <> v_auth_user AND NOT public.has_role(v_auth_user,'admin'::public.app_role) THEN RETURN false; END IF;

  INSERT INTO auth.users(id,email) VALUES(v_auth_user,NULL) ON CONFLICT(id) DO NOTHING;

  IF v_email <> '' THEN
    SELECT id INTO v_legacy FROM auth.users WHERE lower(email)=v_email AND id<>v_auth_user LIMIT 1;
  END IF;

  RETURN EXISTS(
    SELECT 1 FROM public.student_access s
    WHERE s.user_id IN (v_user, v_legacy) AND s.status='verified'
  ) OR public.has_role(v_auth_user,'admin'::public.app_role);
END;
$function$

