
-- Articles table
CREATE TABLE public.articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  published BOOLEAN NOT NULL DEFAULT false,
  original_notes TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Uncategorized'
);

-- Flashcard sets table
CREATE TABLE public.flashcard_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  cards JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  published BOOLEAN NOT NULL DEFAULT false,
  original_notes TEXT NOT NULL DEFAULT ''
);

-- RLS enabled but allow public read for published content, and all access for now (Davis auth is session-based)
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_sets ENABLE ROW LEVEL SECURITY;

-- Public can read published articles
CREATE POLICY "Anyone can read published articles"
ON public.articles FOR SELECT
USING (published = true);

-- Allow all operations for authenticated or anon (admin uses session password)
CREATE POLICY "Allow all operations for managing articles"
ON public.articles FOR ALL
USING (true)
WITH CHECK (true);

-- Public can read published flashcard sets
CREATE POLICY "Anyone can read published flashcard_sets"
ON public.flashcard_sets FOR SELECT
USING (published = true);

-- Allow all operations for managing flashcard sets
CREATE POLICY "Allow all operations for managing flashcard_sets"
ON public.flashcard_sets FOR ALL
USING (true)
WITH CHECK (true);
