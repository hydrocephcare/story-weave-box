
-- Add category column to flashcard_sets and mcq_sets
ALTER TABLE public.flashcard_sets ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Uncategorized';
ALTER TABLE public.mcq_sets ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Uncategorized';
