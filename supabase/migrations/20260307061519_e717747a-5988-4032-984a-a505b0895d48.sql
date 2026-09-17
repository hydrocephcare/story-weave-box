
-- Exam results table to store per-user exam submissions
CREATE TABLE public.exam_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL,
  exam_title text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'General',
  student_name text NOT NULL DEFAULT '',
  university text NOT NULL DEFAULT '',
  course text NOT NULL DEFAULT '',
  mcq_score integer NOT NULL DEFAULT 0,
  mcq_total integer NOT NULL DEFAULT 0,
  saq_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  laq_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  time_taken_seconds integer NOT NULL DEFAULT 0,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert exam results" ON public.exam_results FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read exam results" ON public.exam_results FOR SELECT USING (true);
CREATE POLICY "Service can manage exam results" ON public.exam_results FOR ALL USING (true) WITH CHECK (true);

-- Soft delete support: add deleted_at to content tables
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;
ALTER TABLE public.flashcard_sets ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;
ALTER TABLE public.mcq_sets ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;
ALTER TABLE public.essays ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;

-- Award setting default
INSERT INTO public.app_settings (key, value) VALUES ('exam_award', '1000') ON CONFLICT DO NOTHING;
