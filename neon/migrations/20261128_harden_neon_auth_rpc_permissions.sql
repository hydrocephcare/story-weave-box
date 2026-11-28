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
