-- 1. Security: essays manageable by admins only
DROP POLICY IF EXISTS "Authenticated users can manage essays" ON public.essays;
CREATE POLICY "Admins can manage essays" ON public.essays
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Security: institution moderation restricted to admins
-- Lovable originally created this table outside the checked-in migration history.
-- Define it here so a clean Supabase project can reproduce the application schema.
CREATE TABLE IF NOT EXISTS public.pending_institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('university', 'course')),
  value text NOT NULL,
  submitted_by text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  CONSTRAINT pending_institutions_type_value_key UNIQUE (type, value)
);

ALTER TABLE public.pending_institutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read approved institutions" ON public.pending_institutions
  FOR SELECT TO anon, authenticated
  USING (status = 'approved' OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can submit institutions" ON public.pending_institutions
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending' AND reviewed_at IS NULL);

DROP POLICY IF EXISTS "Admin can manage all institutions" ON public.pending_institutions;
CREATE POLICY "Admins can manage all institutions" ON public.pending_institutions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Hide empty / non-functional question sets
UPDATE public.mcq_sets
SET published = false
WHERE published = true
  AND deleted_at IS NULL
  AND COALESCE(jsonb_array_length(questions), 0) < 3;

UPDATE public.articles
SET published = false
WHERE published = true
  AND deleted_at IS NULL
  AND length(regexp_replace(COALESCE(content, ''), '\s', '', 'g')) < 200;

-- 4. Year 3 subcategorisation by content kind
UPDATE public.articles a
SET content_kind = CASE
    WHEN (a.content ~* '(^|\n)\s*\*{0,2}\s*[A-E]\s*[.)]\s' OR a.content ~* 'multiple choice|\bMCQs?\b')
     AND (a.content ~* 'essay|short answer|long answer|section\s+b|section\s+c|discuss |describe ') THEN 'mcq_essay'
    WHEN (a.content ~* '(^|\n)\s*\*{0,2}\s*[A-E]\s*[.)]\s' OR a.content ~* 'multiple choice|\bMCQs?\b') THEN 'mcq'
    WHEN a.content ~* 'essay|short answer|long answer|section\s+b|section\s+c' THEN 'essay'
    ELSE 'notes'
  END
WHERE a.deleted_at IS NULL
  AND a.category ILIKE 'Year 3%';
