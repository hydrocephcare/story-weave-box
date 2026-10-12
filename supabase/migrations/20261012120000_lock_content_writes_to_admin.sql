-- Notes, categories and site settings could be changed by anyone holding the public key (an old "allow all" policy from when the admin
-- gate lived in the browser). The admin now signs in with a real account, so only that role may write; everyone can still read what
-- the site shows. Safe to run more than once.

-- 1) Remove every existing policy on these three tables, so no old permissive one is left behind.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('articles', 'article_categories', 'app_settings') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 2) Articles: the public reads published, not-deleted notes. Admins read and change everything.
CREATE POLICY "Public reads published articles" ON public.articles FOR SELECT TO anon, authenticated
  USING (published = true AND deleted_at IS NULL);
CREATE POLICY "Admins manage articles" ON public.articles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) Categories and settings: readable by everyone (the site needs them), writable by admins only.
CREATE POLICY "Public reads categories" ON public.article_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage categories" ON public.article_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public reads settings" ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage settings" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4) Take the write grants away from the public key as well.
REVOKE INSERT, UPDATE, DELETE ON public.articles, public.article_categories, public.app_settings FROM anon;
