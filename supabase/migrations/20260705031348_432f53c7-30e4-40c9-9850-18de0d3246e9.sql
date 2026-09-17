-- Remove leaked/sensitive settings from the public settings table.
DELETE FROM public.app_settings
WHERE key IN ('gemini_api_key', 'gemini_api_keys', 'exam_password');

-- Ensure API roles have only the table privileges needed by the new policies.
REVOKE ALL ON public.app_settings FROM anon, authenticated;
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

REVOKE ALL ON public.article_categories FROM anon, authenticated;
GRANT SELECT ON public.article_categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.article_categories TO authenticated;
GRANT ALL ON public.article_categories TO service_role;

REVOKE ALL ON public.articles FROM anon, authenticated;
GRANT SELECT ON public.articles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.articles TO authenticated;
GRANT ALL ON public.articles TO service_role;

-- Replace overly broad public policies.
DROP POLICY IF EXISTS "Allow all operations for managing app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow all operations on app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow all operations on article_categories" ON public.article_categories;
DROP POLICY IF EXISTS "Allow all operations for managing articles" ON public.articles;

-- Settings: visitors can only read safe non-secret configuration.
CREATE POLICY "Public can read safe settings only"
ON public.app_settings
FOR SELECT
TO anon, authenticated
USING (key IN ('site_url', 'exam_price', 'exam_award', 'mcq_free_limit', 'mcq_price'));

CREATE POLICY "Admins can manage app settings"
ON public.app_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Categories: public read, admin write.
CREATE POLICY "Public can read article categories"
ON public.article_categories
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Admins can manage article categories"
ON public.article_categories
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Articles: public can read published/non-deleted rows only; admins manage all rows.
DROP POLICY IF EXISTS "Anyone can read published articles" ON public.articles;
CREATE POLICY "Anyone can read published articles"
ON public.articles
FOR SELECT
TO anon, authenticated
USING (published = true AND deleted_at IS NULL);

CREATE POLICY "Admins can manage articles"
ON public.articles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
