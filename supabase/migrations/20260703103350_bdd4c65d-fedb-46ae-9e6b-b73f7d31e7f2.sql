
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS university text,
  ADD COLUMN IF NOT EXISTS school text,
  ADD COLUMN IF NOT EXISTS lecturer text,
  ADD COLUMN IF NOT EXISTS exam_type text,
  ADD COLUMN IF NOT EXISTS exam_year text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS content_kind text;

ALTER TABLE public.mcq_sets
  ADD COLUMN IF NOT EXISTS university text,
  ADD COLUMN IF NOT EXISTS school text,
  ADD COLUMN IF NOT EXISTS lecturer text,
  ADD COLUMN IF NOT EXISTS exam_type text,
  ADD COLUMN IF NOT EXISTS exam_year text,
  ADD COLUMN IF NOT EXISTS unit text;

CREATE INDEX IF NOT EXISTS idx_articles_exam_type ON public.articles (exam_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_articles_university ON public.articles (university) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_articles_tags_gin ON public.articles USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_mcq_sets_exam_type ON public.mcq_sets (exam_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mcq_sets_university ON public.mcq_sets (university) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mcq_sets_tags_gin ON public.mcq_sets USING gin (tags);

-- Backfill tags heuristically so past-paper origin badges show up immediately.
UPDATE public.articles SET tags = COALESCE(tags, ARRAY[]::text[]) || ARRAY['Mount Kenya University']::text[]
  WHERE deleted_at IS NULL
    AND (tags IS NULL OR NOT ('Mount Kenya University' = ANY(tags)))
    AND (content ILIKE '%mount kenya university%' OR content ILIKE '%mku%' OR title ILIKE '%mku%');
UPDATE public.articles SET tags = COALESCE(tags, ARRAY[]::text[]) || ARRAY['University of Nairobi']::text[]
  WHERE deleted_at IS NULL
    AND (tags IS NULL OR NOT ('University of Nairobi' = ANY(tags)))
    AND (content ILIKE '%university of nairobi%' OR content ~* '\muon\M');
UPDATE public.articles SET tags = COALESCE(tags, ARRAY[]::text[]) || ARRAY['Kenyatta University']::text[]
  WHERE deleted_at IS NULL
    AND (tags IS NULL OR NOT ('Kenyatta University' = ANY(tags)))
    AND (content ILIKE '%kenyatta university%');
UPDATE public.articles SET tags = COALESCE(tags, ARRAY[]::text[]) || ARRAY['JKUAT']::text[]
  WHERE deleted_at IS NULL
    AND (tags IS NULL OR NOT ('JKUAT' = ANY(tags)))
    AND (content ILIKE '%jkuat%' OR content ILIKE '%jomo kenyatta university%');
UPDATE public.articles SET tags = COALESCE(tags, ARRAY[]::text[]) || ARRAY['Moi University']::text[]
  WHERE deleted_at IS NULL
    AND (tags IS NULL OR NOT ('Moi University' = ANY(tags)))
    AND (content ILIKE '%moi university%');

-- Mark exam-related articles so we can group them into an "Exams" category surface.
UPDATE public.articles SET exam_type = 'CAT'
  WHERE deleted_at IS NULL AND exam_type IS NULL
    AND (title ~* '\mcat\M' OR title ILIKE '%continuous assessment%');
UPDATE public.articles SET exam_type = 'Past Paper'
  WHERE deleted_at IS NULL AND exam_type IS NULL
    AND (title ILIKE '%past paper%' OR title ILIKE '%mock exam%' OR title ILIKE '%end of semester%' OR title ILIKE '%end sem%');

-- Auto content_kind flag for articles whose body is dominated by MCQs so the UI can offer to promote them.
UPDATE public.articles SET content_kind = 'mcq_article'
  WHERE deleted_at IS NULL
    AND content_kind IS NULL
    AND (
      (length(content) - length(replace(lower(content), 'answer:', ''))) / 7 >= 5
    );
