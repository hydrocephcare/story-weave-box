-- Student exam results: allow submissions, but do not allow anonymous/public reading or destructive access.
REVOKE SELECT, UPDATE, DELETE ON public.exam_results FROM anon;
REVOKE SELECT, UPDATE, DELETE ON public.exam_results FROM public;
GRANT INSERT ON public.exam_results TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.exam_results TO authenticated;
GRANT ALL ON public.exam_results TO service_role;

DROP POLICY IF EXISTS "Anyone can read exam results" ON public.exam_results;
DROP POLICY IF EXISTS "Anyone can insert exam results" ON public.exam_results;
DROP POLICY IF EXISTS "Service can manage exam results" ON public.exam_results;
DROP POLICY IF EXISTS "Authenticated users can read exam results" ON public.exam_results;
DROP POLICY IF EXISTS "Visitors can submit exam results" ON public.exam_results;
DROP POLICY IF EXISTS "Authenticated users can manage exam results" ON public.exam_results;
DROP POLICY IF EXISTS "Authenticated users can delete exam results" ON public.exam_results;

CREATE POLICY "Visitors can submit exam results"
ON public.exam_results
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can read exam results"
ON public.exam_results
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can update exam results"
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

-- Essays: published essays remain public-readable, but public visitors can no longer modify/delete essay banks.
REVOKE INSERT, UPDATE, DELETE ON public.essays FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.essays FROM public;
GRANT SELECT ON public.essays TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.essays TO authenticated;
GRANT ALL ON public.essays TO service_role;

DROP POLICY IF EXISTS "Service can manage essays" ON public.essays;
CREATE POLICY "Authenticated users can manage essays"
ON public.essays
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);