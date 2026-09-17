CREATE INDEX IF NOT EXISTS idx_articles_live_slug ON public.articles (slug) WHERE published = true AND deleted_at IS NULL AND slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_articles_live_updated ON public.articles (updated_at DESC, created_at DESC) WHERE published = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_articles_live_category_updated ON public.articles (category, updated_at DESC) WHERE published = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mcq_sets_live_slug ON public.mcq_sets (slug) WHERE published = true AND deleted_at IS NULL AND slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mcq_sets_live_updated ON public.mcq_sets (updated_at DESC, created_at DESC) WHERE published = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mcq_sets_live_category_updated ON public.mcq_sets (category, updated_at DESC) WHERE published = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_flashcard_sets_live_slug ON public.flashcard_sets (slug) WHERE published = true AND deleted_at IS NULL AND slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_flashcard_sets_live_updated ON public.flashcard_sets (updated_at DESC, created_at DESC) WHERE published = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stories_live_slug ON public.stories (slug) WHERE published = true AND deleted_at IS NULL AND slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stories_live_created ON public.stories (created_at DESC) WHERE published = true AND deleted_at IS NULL;