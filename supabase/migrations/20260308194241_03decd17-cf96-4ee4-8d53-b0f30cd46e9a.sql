
-- Add updated_at column to all content tables, defaulting to created_at
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.flashcard_sets ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.mcq_sets ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.essays ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill updated_at with created_at for existing rows
UPDATE public.articles SET updated_at = created_at WHERE updated_at = now();
UPDATE public.flashcard_sets SET updated_at = created_at WHERE updated_at = now();
UPDATE public.mcq_sets SET updated_at = created_at WHERE updated_at = now();
UPDATE public.essays SET updated_at = created_at WHERE updated_at = now();

-- Create a reusable trigger function to auto-set updated_at on UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Attach trigger to each table
CREATE TRIGGER trg_articles_updated_at BEFORE UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_flashcard_sets_updated_at BEFORE UPDATE ON public.flashcard_sets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_mcq_sets_updated_at BEFORE UPDATE ON public.mcq_sets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_essays_updated_at BEFORE UPDATE ON public.essays FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
