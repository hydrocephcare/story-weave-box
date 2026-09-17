ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payments_user_id_idx ON public.payments (user_id);
CREATE INDEX IF NOT EXISTS payments_buyer_email_idx ON public.payments (lower(buyer_email));

DROP POLICY IF EXISTS "Admins can view payments" ON public.payments;
CREATE POLICY "Subscribers can view own payments"
ON public.payments FOR SELECT TO authenticated
USING (user_id = auth.uid() OR lower(buyer_email) = lower(coalesce(auth.jwt() ->> 'email', '')) OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.access_grants
  DROP COLUMN IF EXISTS devices,
  DROP COLUMN IF EXISTS device_limit;