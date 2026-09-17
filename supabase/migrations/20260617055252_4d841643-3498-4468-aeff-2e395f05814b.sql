CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS content_fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(category, '') || ' ' || coalesce(meta_description, '') || ' ' || left(coalesce(content, ''), 250000))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_articles_content_fts ON public.articles USING gin (content_fts);
CREATE INDEX IF NOT EXISTS idx_articles_published_updated ON public.articles (published, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_articles_category_trgm ON public.articles USING gin (category extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_articles_title_trgm ON public.articles USING gin (title extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_articles_tags_gin ON public.articles USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_mcq_sets_published_updated ON public.mcq_sets (published, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mcq_sets_title_trgm ON public.mcq_sets USING gin (title extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_mcq_sets_category_trgm ON public.mcq_sets USING gin (category extensions.gin_trgm_ops);