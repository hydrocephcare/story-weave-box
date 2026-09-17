-- Fix domain mismatch: sitemap, canonicals and robots.txt all must use www.ompathstudy.com.
-- Google rejects sitemap entries whose hostname differs from the sitemap's hostname.
UPDATE public.app_settings
   SET value = 'https://www.ompathstudy.com'
 WHERE key = 'site_url';

INSERT INTO public.app_settings (key, value)
SELECT 'site_url', 'https://www.ompathstudy.com'
 WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'site_url');
