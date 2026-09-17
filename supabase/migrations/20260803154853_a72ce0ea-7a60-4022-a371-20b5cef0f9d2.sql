ALTER TABLE public.access_grants
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email text;

CREATE INDEX IF NOT EXISTS access_grants_user_id_idx ON public.access_grants (user_id);
CREATE INDEX IF NOT EXISTS access_grants_email_idx ON public.access_grants (lower(email));