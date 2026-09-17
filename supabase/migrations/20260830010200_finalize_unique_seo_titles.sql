UPDATE public.articles SET
  title = 'Medical Virology Semester 3 Crash Revision — Notes',
  meta_title = 'Medical Virology Semester 3 Crash Revision — Notes',
  meta_description = 'Review core Semester 3 medical virology concepts, viral classification, replication, diagnosis, prevention and treatment for focused exam preparation.'
WHERE id = '596613ad-c9dd-465b-a916-36a9ad9ab9d3';

UPDATE public.essays SET
  title = 'Lung Tumours — Essay Questions',
  meta_description = 'Practise structured respiratory pathology essay questions on lung tumours, classification, risk factors, morphology, clinical features and diagnosis.'
WHERE id = 'a91b2e56-1608-40cb-bb87-81a94793b647';

UPDATE public.essays SET
  title = 'Lung Tumours and Thoracic Oncology — Essay Questions',
  meta_description = 'Practise structured thoracic oncology essay questions covering lung tumours, clinical presentation, pathological classification and diagnostic assessment.'
WHERE id = 'd25b0b80-6709-4731-a3d7-c2607d88714b';

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['articles','mcq_sets','flashcard_sets','essays','stories'] LOOP
    EXECUTE format($sql$
      WITH ranked AS (
        SELECT id, title, meta_title,
          row_number() OVER (PARTITION BY lower(meta_title) ORDER BY title, id) AS n,
          count(*) OVER (PARTITION BY lower(meta_title)) AS total
        FROM public.%I WHERE published = true AND meta_title IS NOT NULL
      )
      UPDATE public.%I target
      SET meta_title = left('Practice Set ' || ranked.n || ': ' || ranked.title, 68)
      FROM ranked WHERE target.id = ranked.id AND ranked.total > 1
    $sql$, table_name, table_name);
  END LOOP;
END $$;
