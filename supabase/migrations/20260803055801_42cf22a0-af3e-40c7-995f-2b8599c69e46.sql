CREATE TABLE public.slide_corrections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  slide_number TEXT NOT NULL,
  slide_prompt TEXT,
  suggestion TEXT NOT NULL,
  submitter_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT slide_corrections_status_check CHECK (status IN ('pending','approved','rejected')),
  CONSTRAINT slide_corrections_suggestion_len CHECK (char_length(suggestion) BETWEEN 3 AND 2000)
);

GRANT SELECT, INSERT ON public.slide_corrections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.slide_corrections TO authenticated;
GRANT ALL ON public.slide_corrections TO service_role;

ALTER TABLE public.slide_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can suggest a correction"
  ON public.slide_corrections FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending');

CREATE POLICY "Approved corrections are public"
  ON public.slide_corrections FOR SELECT TO anon, authenticated
  USING (status = 'approved');

CREATE POLICY "Admins can read all corrections"
  ON public.slide_corrections FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update corrections"
  ON public.slide_corrections FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete corrections"
  ON public.slide_corrections FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX slide_corrections_article_idx ON public.slide_corrections (article_id, status);

CREATE OR REPLACE FUNCTION public.set_slide_corrections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_slide_corrections_updated_at
  BEFORE UPDATE ON public.slide_corrections
  FOR EACH ROW EXECUTE FUNCTION public.set_slide_corrections_updated_at();