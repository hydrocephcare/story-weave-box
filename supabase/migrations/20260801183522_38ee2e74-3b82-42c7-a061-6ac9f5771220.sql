ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS provider_txn_id TEXT;
CREATE INDEX IF NOT EXISTS payments_provider_txn_id_idx ON public.payments (provider_txn_id);