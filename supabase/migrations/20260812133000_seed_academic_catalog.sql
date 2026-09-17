-- Populate the canonical study catalogue from the existing, reviewed category
-- taxonomy. This is additive and remains compatible with legacy category URLs.
INSERT INTO public.academic_years (year_number, title, description, display_order, published)
SELECT y, 'Year ' || y,
       'Medical study notes, CATs, past papers, MCQ banks, flashcards and revision guides for Year ' || y || '.',
       y, true
FROM generate_series(1, 6) AS y
ON CONFLICT (year_number) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, published = true;

INSERT INTO public.semesters (academic_year_id, semester_number, title, display_order)
SELECT ay.id, s, 'Semester ' || s, s
FROM public.academic_years ay CROSS JOIN generate_series(1, 2) AS s
ON CONFLICT (academic_year_id, semester_number) DO NOTHING;

WITH categories AS (
  SELECT DISTINCT category
  FROM (
    SELECT category FROM public.articles WHERE deleted_at IS NULL AND published = true
    UNION SELECT category FROM public.mcq_sets WHERE deleted_at IS NULL AND published = true
    UNION SELECT category FROM public.flashcard_sets WHERE deleted_at IS NULL AND published = true
  ) r
  WHERE category ~ '^Year [1-6]:'
), parsed AS (
  SELECT category,
         substring(category from '^Year ([1-6]):')::int AS year_number,
         trim(regexp_replace(category, '^Year [1-6]:\s*', '')) AS unit_name
  FROM categories
), ranked AS (
  SELECT p.*, row_number() OVER (PARTITION BY year_number ORDER BY unit_name) AS position
  FROM parsed p
)
INSERT INTO public.units
  (academic_year_id, name, slug, short_name, course_code, description, legacy_category, display_order, published)
SELECT ay.id, r.unit_name,
       trim(both '-' from regexp_replace(lower(regexp_replace(r.unit_name, '&', ' and ', 'g')), '[^a-z0-9]+', '-', 'g')),
       CASE WHEN length(r.unit_name) <= 24 THEN r.unit_name ELSE NULL END,
       CASE r.category
         WHEN 'Year 3: Bacteriology' THEN 'MBMM3311'
         WHEN 'Year 3: Medical Virology' THEN 'MBMM3333'
         WHEN 'Year 3: Parasitology' THEN 'MBMM3300'
         WHEN 'Year 2: Medical Biochemistry II' THEN 'MBMB2200'
         ELSE NULL
       END,
       r.unit_name || ' resources for Year ' || r.year_number || ', organized into notes, assessments and revision activities.',
       r.category, r.position, true
FROM ranked r JOIN public.academic_years ay USING (year_number)
ON CONFLICT (academic_year_id, slug) DO UPDATE
SET name = EXCLUDED.name, legacy_category = EXCLUDED.legacy_category,
    course_code = COALESCE(public.units.course_code, EXCLUDED.course_code), published = true;

UPDATE public.articles a SET unit_id = u.id
FROM public.units u WHERE a.category = u.legacy_category AND a.unit_id IS DISTINCT FROM u.id;
UPDATE public.mcq_sets m SET unit_id = u.id
FROM public.units u WHERE m.category = u.legacy_category AND m.unit_id IS DISTINCT FROM u.id;
UPDATE public.flashcard_sets f SET unit_id = u.id
FROM public.units u WHERE f.category = u.legacy_category AND f.unit_id IS DISTINCT FROM u.id;

UPDATE public.articles SET content_type = COALESCE(NULLIF(exam_type, ''),
  CASE
    WHEN title ~* 'course outline' THEN 'Course Outline'
    WHEN title ~* '(^|[^a-z])cat([^a-z]|$)|continuous assessment' THEN 'CAT'
    WHEN title ~* 'past paper|end.of.year|main exam|supplementary' THEN 'Past Paper'
    WHEN title ~* 'mcq|multiple.choice|question bank|q&a' THEN 'MCQ Bank'
    WHEN title ~* 'revision guide|revision outline' THEN 'Revision Guide'
    ELSE 'Notes'
  END)
WHERE content_type IS NULL;
UPDATE public.mcq_sets SET content_type = 'MCQ Bank' WHERE content_type IS NULL;
UPDATE public.flashcard_sets SET content_type = 'Flashcards' WHERE content_type IS NULL;

INSERT INTO public.search_aliases (canonical_term, alias, priority, approved) VALUES
('tuberculosis','tb',100,true), ('human immunodeficiency virus','hiv',100,true),
('acute glomerulonephritis','agn',90,true), ('Staphylococcus','staph',80,true),
('Streptococcus','strep',80,true), ('haematology','hematology',90,true),
('haematology','hema',60,true), ('microbiology','micro',50,true),
('medical biochemistry','biochem',70,true), ('pharmacology','pharm',70,true),
('gastrointestinal tract','git',70,true), ('multiple choice questions','mcq',100,true),
('continuous assessment test','cat',100,true)
ON CONFLICT (alias, canonical_term) DO NOTHING;
