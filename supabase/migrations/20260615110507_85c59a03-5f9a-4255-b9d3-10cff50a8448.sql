
-- Helper macro: add the same columns to each content table
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['articles','mcq_sets','flashcard_sets','stories'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS countdown jsonb', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS html_embed jsonb', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS password_protected boolean NOT NULL DEFAULT false', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS access_password text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS scheduled_at timestamptz', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT ''{}''::text[]', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS featured_image text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS reading_time_minutes integer', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS toc_enabled boolean NOT NULL DEFAULT false', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS comments_enabled boolean NOT NULL DEFAULT true', t);
  END LOOP;
END $$;
