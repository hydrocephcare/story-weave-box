-- 1. Slug backfill helper
CREATE OR REPLACE FUNCTION public.slugify_title(t text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT trim(both '-' from regexp_replace(regexp_replace(regexp_replace(lower(coalesce(t,'')), '&', ' and ', 'g'), '[^a-z0-9\s-]', '', 'g'), '[\s-]+', '-', 'g'))
$$;

DO $$
DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['articles','mcq_sets','flashcard_sets','stories'] LOOP
    EXECUTE format($f$
      WITH cand AS (
        SELECT id, public.slugify_title(title) AS base,
               row_number() OVER (PARTITION BY public.slugify_title(title) ORDER BY created_at) AS rn
        FROM public.%1$I WHERE coalesce(slug,'') = '' AND coalesce(public.slugify_title(title),'') <> ''
      )
      UPDATE public.%1$I t SET slug = CASE WHEN c.rn = 1 THEN c.base ELSE c.base || '-' || c.rn END
      FROM cand c WHERE t.id = c.id
    $f$, tbl);
  END LOOP;
END $$;

-- 2. Homepage "recently added" summary (no heavy content columns transferred)
CREATE OR REPLACE FUNCTION public.home_recent(limit_n int DEFAULT 40)
RETURNS TABLE (id uuid, title text, category text, created_at timestamptz, slug text, kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM (
    (SELECT a.id, a.title, a.category, a.created_at, a.slug, 'article'::text
       FROM public.articles a
      WHERE a.published AND a.deleted_at IS NULL
        AND length(regexp_replace(coalesce(a.content,''), '!\[[^\]]*\]\([^)]*\)', '', 'g')) >= 200
      ORDER BY a.created_at DESC LIMIT limit_n)
    UNION ALL
    (SELECT m.id, m.title, m.category, m.created_at, m.slug, 'mcq'::text
       FROM public.mcq_sets m
      WHERE m.published AND m.deleted_at IS NULL
        AND jsonb_array_length(coalesce(m.questions, '[]'::jsonb)) >= 3
      ORDER BY m.created_at DESC LIMIT limit_n)
    UNION ALL
    (SELECT f.id, f.title, f.category, f.created_at, f.slug, 'flashcard'::text
       FROM public.flashcard_sets f
      WHERE f.published AND f.deleted_at IS NULL
        AND jsonb_array_length(coalesce(f.cards, '[]'::jsonb)) >= 3
      ORDER BY f.created_at DESC LIMIT limit_n)
    UNION ALL
    (SELECT s.id, s.title, s.category, s.created_at, s.slug, 'story'::text
       FROM public.stories s
      WHERE s.published AND s.deleted_at IS NULL
        AND length(coalesce(s.content,'')) >= 200
      ORDER BY s.created_at DESC LIMIT limit_n)
  ) q ORDER BY q.created_at DESC LIMIT limit_n;
$$;

-- 3. Category counts aggregated in the database instead of the browser
CREATE OR REPLACE FUNCTION public.category_counts()
RETURNS TABLE (name text, articles bigint, flashcards bigint, mcqs bigint, latest timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH rows AS (
    SELECT coalesce(category,'Uncategorized') AS name, 'a'::text AS k, coalesce(updated_at, created_at) AS ts
      FROM public.articles WHERE published AND deleted_at IS NULL
    UNION ALL
    SELECT coalesce(category,'Uncategorized'), 'f', coalesce(updated_at, created_at)
      FROM public.flashcard_sets WHERE published AND deleted_at IS NULL
    UNION ALL
    SELECT coalesce(category,'Uncategorized'), 'm', coalesce(updated_at, created_at)
      FROM public.mcq_sets WHERE published AND deleted_at IS NULL
  )
  SELECT name,
         count(*) FILTER (WHERE k='a'),
         count(*) FILTER (WHERE k='f'),
         count(*) FILTER (WHERE k='m'),
         max(ts)
  FROM rows WHERE name <> 'Uncategorized'
  GROUP BY name ORDER BY max(ts) DESC NULLS LAST, name;
$$;

GRANT EXECUTE ON FUNCTION public.home_recent(int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.category_counts() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.slugify_title(text) TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS articles_pub_created_idx ON public.articles (published, created_at DESC);
CREATE INDEX IF NOT EXISTS mcq_sets_pub_created_idx ON public.mcq_sets (published, created_at DESC);
CREATE INDEX IF NOT EXISTS flashcard_sets_pub_created_idx ON public.flashcard_sets (published, created_at DESC);
CREATE INDEX IF NOT EXISTS stories_pub_created_idx ON public.stories (published, created_at DESC);
CREATE INDEX IF NOT EXISTS articles_slug_idx ON public.articles (slug);
CREATE INDEX IF NOT EXISTS mcq_sets_slug_idx ON public.mcq_sets (slug);