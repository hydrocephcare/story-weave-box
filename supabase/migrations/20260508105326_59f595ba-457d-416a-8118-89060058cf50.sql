-- Backfill missing slugs so homepage links resolve
UPDATE public.mcq_sets       SET slug = public._slugify(title) WHERE (slug IS NULL OR btrim(slug) = '') AND title IS NOT NULL;
UPDATE public.flashcard_sets SET slug = public._slugify(title) WHERE (slug IS NULL OR btrim(slug) = '') AND title IS NOT NULL;
UPDATE public.articles       SET slug = public._slugify(title) WHERE (slug IS NULL OR btrim(slug) = '') AND title IS NOT NULL;
UPDATE public.stories        SET slug = public._slugify(title) WHERE (slug IS NULL OR btrim(slug) = '') AND title IS NOT NULL;
UPDATE public.essays         SET slug = public._slugify(title) WHERE (slug IS NULL OR btrim(slug) = '') AND title IS NOT NULL;

-- Indexes for fast slug lookup
CREATE INDEX IF NOT EXISTS idx_mcq_sets_slug       ON public.mcq_sets (slug);
CREATE INDEX IF NOT EXISTS idx_flashcard_sets_slug ON public.flashcard_sets (slug);
CREATE INDEX IF NOT EXISTS idx_articles_slug       ON public.articles (slug);
CREATE INDEX IF NOT EXISTS idx_stories_slug        ON public.stories (slug);

-- Article comments table
CREATE TABLE IF NOT EXISTS public.article_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  uuid NOT NULL,
  author_name text NOT NULL DEFAULT 'Anonymous',
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_article_comments_article_id ON public.article_comments (article_id, created_at DESC);
ALTER TABLE public.article_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read comments" ON public.article_comments;
CREATE POLICY "Anyone can read comments"
  ON public.article_comments FOR SELECT
  USING (true);
DROP POLICY IF EXISTS "Anyone can post comments" ON public.article_comments;
CREATE POLICY "Anyone can post comments"
  ON public.article_comments FOR INSERT
  WITH CHECK (length(btrim(body)) > 0 AND length(body) <= 2000);
