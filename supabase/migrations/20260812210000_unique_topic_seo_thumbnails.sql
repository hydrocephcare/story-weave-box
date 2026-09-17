-- Every published article and MCQ receives its own stable SEO image URL.
-- The edge endpoint resolves the resource title/category to a relevant,
-- freely licensed Wikimedia Commons image and caches the redirect.
UPDATE public.articles
SET og_image_url = 'https://dekyjrfwvavtoivqivno.supabase.co/functions/v1/topic-thumbnail?type=article&id=' || id::text,
    featured_image = 'https://dekyjrfwvavtoivqivno.supabase.co/functions/v1/topic-thumbnail?type=article&id=' || id::text,
    updated_at = now()
WHERE published = true AND deleted_at IS NULL;

UPDATE public.mcq_sets
SET og_image_url = 'https://dekyjrfwvavtoivqivno.supabase.co/functions/v1/topic-thumbnail?type=mcq&id=' || id::text,
    featured_image = 'https://dekyjrfwvavtoivqivno.supabase.co/functions/v1/topic-thumbnail?type=mcq&id=' || id::text,
    updated_at = now()
WHERE published = true AND deleted_at IS NULL;
