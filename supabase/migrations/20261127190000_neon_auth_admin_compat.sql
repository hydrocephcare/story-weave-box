-- Neon Auth compatibility for the migrated Supabase-era application.
-- Neon Auth user UUIDs may differ from the legacy auth.users UUIDs used by
-- profiles, payments, access_grants, student_access and feature_usage.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _user_id AND r.role = _role
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles r
    JOIN auth.users legacy_user ON legacy_user.id = r.user_id
    JOIN neon_auth."user" neon_user
      ON lower(neon_user.email) = lower(legacy_user.email)
     AND neon_user."emailVerified" = true
    WHERE neon_user.id = _user_id AND r.role = _role
  );
$function$;

CREATE OR REPLACE FUNCTION public.consume_feature(p_feature text, p_units integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_auth_user uuid := auth.uid();
  v_user uuid;
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
  IF v_auth_user IS NULL THEN
    RETURN jsonb_build_object('allowed',false,'reason','login_required','remaining',0);
  END IF;
  IF p_units IS NULL OR p_units < 1 OR p_units > 100 THEN
    RETURN jsonb_build_object('allowed',false,'reason','invalid_units','remaining',0);
  END IF;

  IF v_email <> '' THEN
    SELECT id INTO v_user FROM auth.users WHERE lower(email)=v_email LIMIT 1;
  END IF;
  IF v_user IS NULL THEN
    v_user := v_auth_user;
    INSERT INTO auth.users(id,email) VALUES(v_user,NULLIF(v_email,''))
    ON CONFLICT(id) DO UPDATE SET email=COALESCE(auth.users.email,EXCLUDED.email);
  END IF;

  SELECT public.has_role(v_auth_user,'admin'::public.app_role) INTO v_admin;
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
  IF v_period_type='week' THEN v_period := date_trunc('week', current_date)::date; END IF;

  INSERT INTO public.feature_usage(user_id,feature,period_start,used,updated_at)
  VALUES(v_user,p_feature,v_period,p_units,now())
  ON CONFLICT(user_id,feature,period_start) DO UPDATE
    SET used=public.feature_usage.used+excluded.used,updated_at=now()
    WHERE public.feature_usage.used+excluded.used<=v_limit
  RETURNING used INTO v_used;

  IF v_used IS NULL THEN
    SELECT used INTO v_used FROM public.feature_usage
    WHERE user_id=v_user AND feature=p_feature AND period_start=v_period;
    RETURN jsonb_build_object('allowed',false,'reason','quota_exhausted','used',coalesce(v_used,0),'limit',v_limit,'remaining',0,'period',v_period_type);
  END IF;
  RETURN jsonb_build_object('allowed',true,'reason','free_allowance','used',v_used,'limit',v_limit,'remaining',greatest(0,v_limit-v_used),'period',v_period_type);
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_mku_student(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
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
  IF v_email <> '' THEN
    SELECT id INTO v_legacy FROM auth.users WHERE lower(email)=v_email LIMIT 1;
    IF v_legacy IS NULL THEN
      INSERT INTO auth.users(id,email) VALUES(v_auth_user,v_email)
      ON CONFLICT(id) DO UPDATE SET email=COALESCE(auth.users.email,EXCLUDED.email);
      v_legacy := v_auth_user;
    END IF;
  END IF;
  RETURN EXISTS(
    SELECT 1 FROM public.student_access s
    WHERE s.user_id IN (v_user,coalesce(v_legacy,v_user)) AND s.status='verified'
  ) OR public.has_role(v_auth_user,'admin'::public.app_role);
END;
$function$;
