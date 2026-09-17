-- Restore a live-source column that Lovable added outside the checked-in history.
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS is_raw boolean;
