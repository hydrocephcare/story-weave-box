
-- Payments table for M-Pesa via PayHero
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  transaction_id text UNIQUE,
  mpesa_code text,
  buyer_name text,
  buyer_email text,
  package_type text DEFAULT 'exam',
  project_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read own payments by phone" ON public.payments FOR SELECT USING (true);
CREATE POLICY "Service can manage payments" ON public.payments FOR ALL USING (true) WITH CHECK (true);

-- Essays table for SAQ/LAQ
CREATE TABLE public.essays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid REFERENCES public.articles(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'Uncategorized',
  short_answer_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  long_answer_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.essays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published essays" ON public.essays FOR SELECT USING (published = true);
CREATE POLICY "Service can manage essays" ON public.essays FOR ALL USING (true) WITH CHECK (true);
