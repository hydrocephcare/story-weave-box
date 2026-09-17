-- Physiology is taught in Years 1 and 2. These imported Level I papers were
-- incorrectly placed under Year 3 General Pathology by a broad OCR classifier.
UPDATE public.articles
SET category = 'Year 1: Physiology', updated_at = now()
WHERE id IN (
  '79d0f62d-8fbd-48e6-9f8b-7e993fb09b9f',
  'b364c03d-05fb-40f9-b5a8-9eae9cc5bbc3',
  'f23c5ab1-3acd-44b6-a512-ad7ca1317d38'
);

-- This record contains only a transcription placeholder, not study content.
-- Keep it in the correct year but do not expose it as a usable paper yet.
UPDATE public.articles
SET category = 'Year 1: Physiology', published = false, updated_at = now()
WHERE id = '81a9c54f-1aa1-4360-bf32-079f37c7fd12';

