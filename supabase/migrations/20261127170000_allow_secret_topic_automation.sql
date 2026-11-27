-- GitHub topic-maintenance automation uses Neon Auth's anonymous JWT plus a
-- server-only x-polish-key header. The database function verifies that header against
-- public.polish_secret; no browser bundle contains this key.
GRANT UPDATE ON public.topic_pages TO anonymous;

ALTER POLICY "server updates reviewed topics" ON public.topic_pages
  TO anonymous, authenticated, supabase_anon_legacy, supabase_authenticated_legacy;
