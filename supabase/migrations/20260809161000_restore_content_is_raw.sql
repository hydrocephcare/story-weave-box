-- Restore remaining live-source columns added outside Lovable's migration history.
ALTER TABLE public.flashcard_sets
  ADD COLUMN IF NOT EXISTS is_raw boolean;

ALTER TABLE public.mcq_sets
  ADD COLUMN IF NOT EXISTS is_raw boolean;
