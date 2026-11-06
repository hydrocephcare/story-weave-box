-- Keep the homepage recent feed focused on readable study resources.
-- MCQs have their own dedicated practice surfaces and should not displace new notes.
CREATE OR REPLACE FUNCTION public.home_recent(limit_n int DEFAULT 40)
RETURNS TABLE (id uuid, title text, category text, created_at timestamptz, slug text, kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM (
    (SELECT a.id, a.title, a.category, a.created_at, a.slug, 'article'::text AS kind
       FROM public.articles a
      WHERE a.published = true AND a.deleted_at IS NULL
        AND (a.scheduled_at IS NULL OR a.scheduled_at <= now())
        AND length(coalesce(a.content,'')) >= 200
      ORDER BY a.created_at DESC LIMIT limit_n)
    UNION ALL
    (SELECT f.id, f.title, f.category, f.created_at, f.slug, 'flashcard'::text AS kind
       FROM public.flashcard_sets f
      WHERE f.published = true AND f.deleted_at IS NULL
        AND jsonb_array_length(coalesce(f.cards, '[]'::jsonb)) >= 3
      ORDER BY f.created_at DESC LIMIT limit_n)
    UNION ALL
    (SELECT s.id, s.title, s.category, s.created_at, s.slug, 'story'::text AS kind
       FROM public.stories s
      WHERE s.published = true AND s.deleted_at IS NULL
        AND length(coalesce(s.content,'')) >= 200
      ORDER BY s.created_at DESC LIMIT limit_n)
  ) q ORDER BY q.created_at DESC LIMIT limit_n;
$$;

GRANT EXECUTE ON FUNCTION public.home_recent(int) TO anon, authenticated, service_role;
