-- Restore Data API permissions that are required for the client editor to save content.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO anon, authenticated;
GRANT ALL ON public.articles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_categories TO anon, authenticated;
GRANT ALL ON public.article_categories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO anon, authenticated;
GRANT ALL ON public.stories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcq_sets TO anon, authenticated;
GRANT ALL ON public.mcq_sets TO service_role;

GRANT SELECT ON public.essays TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.essays TO anon, authenticated;
GRANT ALL ON public.essays TO service_role;

-- Exam result privacy: public visitors may submit exam results, but cannot browse all student results.
GRANT INSERT ON public.exam_results TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.exam_results TO authenticated;
GRANT ALL ON public.exam_results TO service_role;

DROP POLICY IF EXISTS "Anyone can read exam results" ON public.exam_results;
CREATE POLICY "Authenticated users can read exam results"
ON public.exam_results
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Anyone can insert exam results" ON public.exam_results;
CREATE POLICY "Visitors can submit exam results"
ON public.exam_results
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Service can manage exam results" ON public.exam_results;
CREATE POLICY "Authenticated users can manage exam results"
ON public.exam_results
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete exam results"
ON public.exam_results
FOR DELETE
TO authenticated
USING (true);