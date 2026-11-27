-- Preserve the existing administrator role when a Neon Auth user has a different UUID
-- from the migrated legacy auth.users row. Only a verified matching email is accepted.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles r
    WHERE r.user_id = _user_id
      AND r.role = _role
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles r
    JOIN auth.users legacy_user
      ON legacy_user.id = r.user_id
    JOIN neon_auth."user" neon_user
      ON lower(neon_user.email) = lower(legacy_user.email)
     AND neon_user."emailVerified" = true
    WHERE neon_user.id = _user_id
      AND r.role = _role
  );
$function$;
