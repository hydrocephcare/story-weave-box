-- 1. Article duplicates of published stories: keep the story, hide the article copy.
UPDATE public.articles a
SET published = false, updated_at = now()
WHERE a.published = true
  AND a.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.stories s
    WHERE s.published = true
      AND s.deleted_at IS NULL
      AND lower(btrim(s.title)) = lower(btrim(a.title))
  );

-- 2. Same-title article duplicates: keep the longest / most recently updated copy.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY lower(btrim(title))
           ORDER BY length(coalesce(content, '')) DESC,
                    coalesce(updated_at, created_at) DESC,
                    created_at DESC
         ) AS rn
  FROM public.articles
  WHERE published = true AND deleted_at IS NULL
)
UPDATE public.articles a
SET published = false, updated_at = now()
FROM ranked r
WHERE a.id = r.id AND r.rn > 1;