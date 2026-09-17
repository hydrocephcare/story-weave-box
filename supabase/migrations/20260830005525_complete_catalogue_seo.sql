-- Complete SEO metadata for content tables that are intentionally not writable
-- by the anonymous client. Stable slugs are preserved to avoid breaking indexed URLs.
WITH prepared AS (
  SELECT id,
    trim(regexp_replace(regexp_replace(title, '\mBchem\M', 'Biochemistry', 'gi'), '\s+', ' ', 'g')) AS clean_title,
    regexp_replace(category, '^(?:Weekly Exam:\s*)?Year\s*[1-6]\s*:\s*', '', 'i') AS unit_name,
    row_number() OVER (PARTITION BY lower(trim(title)) ORDER BY created_at, id) AS duplicate_number
  FROM public.essays WHERE published = true
)
UPDATE public.essays e SET
  title = CASE WHEN p.clean_title ~* '(essay|short.?answer|long.?answer|saq|laq)' THEN p.clean_title ELSE p.clean_title || ' — Essay Questions' END,
  meta_title = left(CASE WHEN p.duplicate_number > 1 THEN 'Practice Set ' || p.duplicate_number || ': ' ELSE '' END || p.unit_name || ': ' || p.clean_title, 68),
  meta_description = left(p.clean_title || ' provides short- and long-answer practice for medical students studying ' || p.unit_name || '. Review structured questions and model answers.', 160),
  updated_at = now()
FROM prepared p WHERE e.id = p.id;

WITH prepared AS (
  SELECT id, trim(regexp_replace(title, '\s+', ' ', 'g')) AS clean_title,
    row_number() OVER (PARTITION BY lower(trim(title)) ORDER BY created_at, id) AS duplicate_number
  FROM public.stories WHERE published = true
)
UPDATE public.stories s SET
  title = p.clean_title,
  meta_title = left(CASE WHEN p.duplicate_number > 1 THEN 'Story ' || p.duplicate_number || ': ' ELSE '' END || p.clean_title, 68),
  meta_description = CASE
    WHEN length(coalesce(s.meta_description, '')) BETWEEN 90 AND 165 THEN s.meta_description
    ELSE left(p.clean_title || ' is an Ompath Study narrative exploring student life, personal growth and the human experiences surrounding medical education.', 160)
  END
FROM prepared p WHERE s.id = p.id;
