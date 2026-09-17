
-- MCQ sets table
CREATE TABLE public.mcq_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  published BOOLEAN NOT NULL DEFAULT false,
  original_notes TEXT NOT NULL DEFAULT ''
);

ALTER TABLE public.mcq_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for managing mcq_sets" ON public.mcq_sets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can read published mcq_sets" ON public.mcq_sets FOR SELECT USING (published = true);

-- Settings table for API keys etc
CREATE TABLE public.app_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for managing app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);
