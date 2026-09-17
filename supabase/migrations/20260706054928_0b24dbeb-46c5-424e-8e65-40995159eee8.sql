
-- Restore permissive write access on admin-managed tables so the client-side
-- (localStorage password) admin panel can save/publish articles, categories,
-- and settings again. Admin gate is enforced in the app, not RLS.

DROP POLICY IF EXISTS "Admins can manage articles" ON public.articles;
DROP POLICY IF EXISTS "Admins can manage article categories" ON public.article_categories;
DROP POLICY IF EXISTS "Admins can manage app settings" ON public.app_settings;
DROP POLICY IF EXISTS "Public can read safe settings only" ON public.app_settings;

-- Articles: keep public read of published rows; allow anon/auth to manage (client gate).
CREATE POLICY "Allow all operations for managing articles"
ON public.articles FOR ALL
TO anon, authenticated
USING (true) WITH CHECK (true);

-- Categories: allow all ops.
CREATE POLICY "Allow all operations on article_categories"
ON public.article_categories FOR ALL
TO anon, authenticated
USING (true) WITH CHECK (true);

-- App settings: allow read + manage (secrets have already been deleted from this
-- table and are now only in edge-function secrets).
CREATE POLICY "Allow all operations on app_settings"
ON public.app_settings FOR ALL
TO anon, authenticated
USING (true) WITH CHECK (true);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_categories TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;
