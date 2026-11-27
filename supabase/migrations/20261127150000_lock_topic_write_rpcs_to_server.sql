-- Topic publication must only be performed by trusted server-side database credentials.
-- The browser now calls /api/topic-write; that route validates Neon Auth and consumes
-- the relevant entitlement before writing through the privileged DATABASE_URL.
REVOKE ALL ON FUNCTION public.publish_topic_page(text, text, text, jsonb, text)
  FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.save_topic_deep(text, text, text, jsonb, jsonb)
  FROM PUBLIC, anonymous, authenticated;

-- Keep execution available to the privileged backend role and database owner only.
GRANT EXECUTE ON FUNCTION public.publish_topic_page(text, text, text, jsonb, text) TO service_role;
DO $
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.publish_topic_page(text, text, text, jsonb, text) TO neondb_owner';
  END IF;
END
$;
GRANT EXECUTE ON FUNCTION public.save_topic_deep(text, text, text, jsonb, jsonb) TO service_role;
DO $
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_topic_deep(text, text, text, jsonb, jsonb) TO neondb_owner';
  END IF;
END
$;
