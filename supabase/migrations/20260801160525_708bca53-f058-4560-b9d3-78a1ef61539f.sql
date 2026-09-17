DROP POLICY IF EXISTS "Authenticated users can read exam results" ON public.exam_results;
DROP POLICY IF EXISTS "Authenticated users can update exam results" ON public.exam_results;
DROP POLICY IF EXISTS "Authenticated users can delete exam results" ON public.exam_results;

CREATE POLICY "Admins can read exam results" ON public.exam_results FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update exam results" ON public.exam_results FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete exam results" ON public.exam_results FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_results TO authenticated;
GRANT INSERT ON public.exam_results TO anon;
GRANT ALL ON public.exam_results TO service_role;