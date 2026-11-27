-- Neon Data API compatibility for policies imported from Supabase.
-- Add Neon Auth's native API roles while retaining the legacy roles for rollback.
-- This migration changes policy role targets only; USING and WITH CHECK expressions
-- are left byte-for-byte unchanged.
DO $migration$
DECLARE
  policy_row record;
  policy_roles text[];
  role_sql text;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname, roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        roles @> ARRAY['supabase_authenticated_legacy']::name[]
        OR roles @> ARRAY['supabase_anon_legacy']::name[]
      )
  LOOP
    SELECT array_agg(DISTINCT role_name ORDER BY role_name)
      INTO policy_roles
    FROM unnest(policy_row.roles::text[]) AS role_name;

    IF policy_row.roles @> ARRAY['supabase_authenticated_legacy']::name[]
       AND NOT ('authenticated' = ANY(policy_roles)) THEN
      policy_roles := array_append(policy_roles, 'authenticated');
    END IF;

    IF policy_row.roles @> ARRAY['supabase_anon_legacy']::name[]
       AND NOT ('anonymous' = ANY(policy_roles)) THEN
      policy_roles := array_append(policy_roles, 'anonymous');
    END IF;

    SELECT string_agg(quote_ident(role_name), ', ' ORDER BY role_name)
      INTO role_sql
    FROM unnest(policy_roles) AS role_name;

    EXECUTE format(
      'ALTER POLICY %I ON %I.%I TO %s',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename,
      role_sql
    );
  END LOOP;
END
$migration$;
