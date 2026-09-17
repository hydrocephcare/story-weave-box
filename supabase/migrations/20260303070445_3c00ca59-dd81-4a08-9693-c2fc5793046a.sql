
-- Add access_password column to mcq_sets for password-protected answer viewing
ALTER TABLE public.mcq_sets ADD COLUMN access_password text NOT NULL DEFAULT '';
