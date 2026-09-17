REVOKE INSERT, UPDATE, DELETE ON public.payments FROM anon, authenticated;
GRANT ALL ON public.payments TO service_role;

DROP POLICY IF EXISTS "No client inserts on payments" ON public.payments;
CREATE POLICY "No client inserts on payments" ON public.payments FOR INSERT TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No client updates on payments" ON public.payments;
CREATE POLICY "No client updates on payments" ON public.payments FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "No client deletes on payments" ON public.payments;
CREATE POLICY "No client deletes on payments" ON public.payments FOR DELETE TO anon, authenticated USING (false);