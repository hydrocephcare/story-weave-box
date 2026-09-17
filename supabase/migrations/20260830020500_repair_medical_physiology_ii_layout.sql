-- Repair the legacy WordPress/PDF transcription where question stems, choices,
-- answers and explanations were concatenated on the same physical line.
UPDATE public.articles
SET
  content = regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          content,
          '([^[:space:]])([A-E][.)])[[:space:]]+',
          E'\\1\n\n\\2 ',
          'g'
        ),
        '[[:space:]]*\\*\\*Answer[[:space:]]*:',
        E'\n\n**Answer:',
        'gi'
      ),
      '\\*\\*\\*\\(([^\n]+)\\)\\*',
      E'\n\n*\\1*',
      'g'
    ),
    '\n{3,}',
    E'\n\n',
    'g'
  ),
  content_type = 'MCQ Bank',
  updated_at = now()
WHERE id = 'dbcf7da0-af6f-4667-8f38-e2493b4770be';

