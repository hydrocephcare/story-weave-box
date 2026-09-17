ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS university text,
  ADD COLUMN IF NOT EXISTS course text,
  ADD COLUMN IF NOT EXISTS study_year int CHECK (study_year BETWEEN 1 AND 6),
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.article_answer_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  question_key text NOT NULL,
  question_text text NOT NULL DEFAULT '',
  topic_label text,
  category text,
  selected_answer text NOT NULL,
  correct_answer text NOT NULL,
  is_correct boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.article_answer_attempts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.article_answer_attempts TO authenticated;
GRANT ALL ON public.article_answer_attempts TO service_role;
CREATE POLICY "Users read own article attempts" ON public.article_answer_attempts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own article attempts" ON public.article_answer_attempts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_article_attempts_user_result
  ON public.article_answer_attempts(user_id, is_correct, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_attempts_article_question
  ON public.article_answer_attempts(article_id, question_key);
