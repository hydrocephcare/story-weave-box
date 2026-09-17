CREATE TABLE IF NOT EXISTS public.access_grants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'day',
  scope TEXT NOT NULL DEFAULT 'all',
  expires_at TIMESTAMPTZ NOT NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  phone_number TEXT,
  amount NUMERIC DEFAULT 0,
  allow_download BOOLEAN NOT NULL DEFAULT true,
  redeem_count INTEGER NOT NULL DEFAULT 0,
  last_redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.access_grants TO service_role;
ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS access_grants_payment_idx ON public.access_grants(payment_id);

INSERT INTO public.app_settings (key, value)
SELECT * FROM (VALUES
  ('access_price_kes', '0'),
  ('paywall_free_ratio', '0.25'),
  ('pdf_download_enabled', 'true'),
  ('access_plans', '[{"id":"day","label":"24-hour pass","price":10,"days":1,"download":false},{"id":"week","label":"1-week pass","price":50,"days":7,"download":true},{"id":"semester","label":"Semester pass","price":300,"days":120,"download":true}]')
) AS v(key, value)
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings s WHERE s.key = v.key);