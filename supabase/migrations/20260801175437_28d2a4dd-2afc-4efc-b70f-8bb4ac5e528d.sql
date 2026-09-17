DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='payments' LOOP
    EXECUTE format('DROP POLICY %I ON public.payments', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payments FROM anon;
REVOKE ALL ON public.payments FROM authenticated;
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

CREATE POLICY "Admins can view payments"
ON public.payments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));