CREATE TABLE IF NOT EXISTS public.article_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.article_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on article_categories"
  ON public.article_categories FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);