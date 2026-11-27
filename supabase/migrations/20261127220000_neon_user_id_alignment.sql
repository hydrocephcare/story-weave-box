CREATE OR REPLACE FUNCTION public.ensure_neon_user(_user_id uuid, _email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'neon_auth', 'pg_catalog'
AS $function$
DECLARE
  v_verified boolean := false;
  v_legacy uuid;
  v_ref record;
  v_rows integer := 0;
  v_migrated integer := 0;
  v_skipped text[] := ARRAY[]::text[];
BEGIN
  IF _user_id IS NULL OR coalesce(trim(_email),'') = '' THEN
    RAISE EXCEPTION 'A verified Neon Auth user ID and email are required';
  END IF;

  SELECT coalesce(u."emailVerified",false)
    INTO v_verified
  FROM neon_auth."user" u
  WHERE u.id = _user_id AND lower(u.email) = lower(_email)
  LIMIT 1;

  IF NOT coalesce(v_verified,false) THEN
    RAISE EXCEPTION 'Neon Auth user is missing or email is not verified';
  END IF;

  INSERT INTO auth.users(id,email)
  VALUES(_user_id,NULL)
  ON CONFLICT(id) DO NOTHING;

  FOR v_legacy IN
    SELECT a.id
    FROM auth.users a
    WHERE lower(a.email) = lower(_email) AND a.id <> _user_id
  LOOP
    FOR v_ref IN
      SELECT c.oid::regclass AS table_name, a.attname AS column_name
      FROM pg_constraint fk
      JOIN pg_class c ON c.oid = fk.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN unnest(fk.conkey) k(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
      WHERE fk.contype = 'f'
        AND fk.confrelid = 'auth.users'::regclass
        AND n.nspname = 'public'
      ORDER BY c.relname, a.attname
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

  RETURN jsonb_build_object(
    'user_id', _user_id,
    'migrated_rows', v_migrated,
    'skipped', to_jsonb(v_skipped)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.ensure_neon_user(uuid,text) FROM PUBLIC;
