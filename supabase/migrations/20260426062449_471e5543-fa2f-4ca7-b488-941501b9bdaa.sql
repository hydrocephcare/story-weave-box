
-- Backfill missing slugs for mcq_sets and flashcard_sets so URLs can be slug-only.
-- Strategy: lower-case title, strip non-alphanumeric, collapse spaces to hyphens.
-- For collisions, append last 6 chars of id.

CREATE OR REPLACE FUNCTION public._slugify(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' from
           regexp_replace(
             regexp_replace(
               regexp_replace(lower(coalesce(input,'')), '&', ' and ', 'g'),
               '[^a-z0-9\s-]', '', 'g'),
             '\s+', '-', 'g')
         );
$$;

-- MCQ sets
UPDATE public.mcq_sets
SET slug = public._slugify(title) || '-' || substring(id::text, 1, 6)
WHERE (slug IS NULL OR slug = '') AND title IS NOT NULL AND title <> '';

-- Flashcard sets
UPDATE public.flashcard_sets
SET slug = public._slugify(title) || '-' || substring(id::text, 1, 6)
WHERE (slug IS NULL OR slug = '') AND title IS NOT NULL AND title <> '';

-- Indexes for fast slug lookup
CREATE INDEX IF NOT EXISTS idx_mcq_sets_slug ON public.mcq_sets (slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_flashcard_sets_slug ON public.flashcard_sets (slug) WHERE slug IS NOT NULL;
