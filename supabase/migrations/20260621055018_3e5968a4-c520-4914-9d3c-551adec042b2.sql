
-- 1) Soft-delete junk/broken articles
UPDATE public.articles SET deleted_at = now(), published = false
WHERE id IN (
  '2b9e918f-78ad-47e0-b5c7-c95a117157b0', -- Unseen Battles of Silence (1.3MB base64)
  '62e5cca4-6a84-428a-ba92-08f642205de5', -- ANATOMY LAQs and SAQs (1.3MB junk)
  '1a6757cb-b228-413e-8c77-be6fdd64f2ad', -- Limbic System Examination (1.1MB junk)
  '0cc97ebe-0517-4b7b-b74b-7b133ef8b6b0', -- Lower Limb and Knee MCQs article (1k chars, stub)
  '8b919855-fb40-43e9-a2b1-17ee5ff63678', -- "Here we go:" stub
  '57962445-7f05-415f-a5ec-7f6beb26da3e', -- "Leishmania:" stub
  '7c20c329-0306-4e11-8a63-93d0fec5fea6'  -- "Lung Tumours Conti..." stub
);

-- 2) Normalize odd category labels
UPDATE public.articles SET category = 'Year 3: Basic Pharmacology III'           WHERE category = 'Year 3 : Basic Pharmacology III';
UPDATE public.articles SET category = 'Year 3: Hematopathology'                  WHERE category = 'Year 3 : Hematopathology';
UPDATE public.articles SET category = 'Year 3: Spot/Practical Examination'       WHERE category = 'Year 3 : Spot/Practical Examination';
UPDATE public.articles SET category = 'Year 3: Exam Timetable'                   WHERE category IN ('YEAR 3: EXAM TIMETABLE', 'Year 3: EXAM TIMETABLE..');
UPDATE public.articles SET category = 'Year 3: Exam General and Systemic Pathology' WHERE category = 'Year 3: EXAM: General & Systemic Pathology';
UPDATE public.articles SET category = 'Year 3: Exam Medical Microbiology III'    WHERE category = 'Year 3: EXAM: MEDICAL MICROBIOLOGY III';
UPDATE public.articles SET category = 'Year 3: Must Know Virology'               WHERE category = 'Year 3: Must Know VIrology';
UPDATE public.articles SET category = 'Year 3: Junior Clerkship - General Pathology I' WHERE category = 'Year 3: Junior Clerkship/Practicals in General Pathology I';

UPDATE public.mcq_sets SET category = 'Year 3: Basic Pharmacology III'           WHERE category = 'Year 3 : Basic Pharmacology III';
UPDATE public.mcq_sets SET category = 'Year 3: Hematopathology'                  WHERE category = 'Year 3 : Hematopathology';
UPDATE public.mcq_sets SET category = 'Year 3: Spot/Practical Examination'       WHERE category = 'Year 3 : Spot/Practical Examination';
UPDATE public.mcq_sets SET category = 'Year 3: Must Know Virology'               WHERE category = 'Year 3: Must Know VIrology';

-- 3) Re-categorize mislabeled articles (Year 5: ENT dumping ground + Y4 + Uncategorized + Pathology/Pharmacology bare)
-- ---- Year 2 mappings ----
UPDATE public.articles SET category = 'Year 2: Physiology' WHERE id IN (
  'bf3a96fc-6f33-4709-ae02-d3866bf1ba87', -- Sleep Physiology Examination Paper
  '21757872-1519-4abd-9557-12415d8f2b78', -- Medical Physiology II (Paper 2)
  '76950035-f777-44c2-a486-4eaeae5731c8', -- Medical Physiology Pp2 Year 2
  '279d912d-09ef-4b4b-8a1e-7694ce93918c', -- MBMP2300: Medical Physiology II
  '4901fe8e-f704-4e0e-8721-883fa1e78e40', -- LECTURE 7: GI Tract Hormones
  'c2a47ac1-ab7e-476e-976a-f7ac2c1768e9', -- Thyroid Hormone
  '5754bfe9-f0a2-4d3b-afa1-e0f636af0d6f'  -- Medical Physiology GIT MCQs
);
UPDATE public.articles SET category = 'Year 2: Molecular Biology' WHERE id IN (
  '20154185-e78a-4b26-b91c-416422cf2b6e', -- PCR
  '390fc357-de99-45ad-90e1-187cdac2f944', -- DNA Replication
  '70ec5251-42b2-44cf-adea-79db494ba86e'  -- Historical Milestones in DNA Discovery
);
UPDATE public.articles SET category = 'Year 2: Molecular Genetics and Cytogenetics' WHERE id IN (
  'c2317981-2708-41f6-b81b-35a0638ec892', -- Types of Polymorphism
  '210d084c-e57f-4059-abf9-4cbc21c59810', -- Genetic Disorders SAQs Exam
  '9873bd6b-ab5a-45bd-aaa0-7abc567b51bf'  -- Genetic and Autoimmune Causes
);
UPDATE public.articles SET category = 'Year 2: Human Communication Skills' WHERE id IN (
  'b553ad05-6bc9-4166-845a-5b7a9ef4beac', -- Human Communication Skills Exam
  '5f6e10b3-b53f-4b4d-8843-afecb76a889e', -- Essential Human Communication Skills
  '6450c3e4-09c0-4840-afeb-153cefaed2e5'  -- Human Communication and Medical Ethics
);
UPDATE public.articles SET category = 'Year 2: Epidemiology and Statistics' WHERE id IN (
  'ffa29ec5-8f85-49f5-bc35-ea4c3130fcac', -- Research Methodology & Intro to Research
  '06f74de5-e31e-4fdd-b3b9-38c5cb025d91'  -- Basics of Biosafety
);
UPDATE public.articles SET category = 'Year 2: Parasitology' WHERE id IN (
  '3fa1428a-3dfa-4bf2-a7be-38929897012a', -- Filarial Worms
  '2892a866-90e8-4e71-86ae-43ef416e8a88', -- Strongyloides stercoralis
  '3a1a1302-3edf-4003-94a8-3f2b8b44805f'  -- Hookworms
);
UPDATE public.articles SET category = 'Year 2: Clinical Biochemistry' WHERE id IN (
  'f642b4f4-e29a-40b8-a55f-4a2134f71b85', -- Clinical Biochemistry
  '144ba525-ce25-455f-8328-a4c94059022b', -- Clinical Biochemistry and Lab Testing
  '6c632a06-4849-43b4-99af-d4574f4e9906', -- Clinical Biochemistry - Study Notes
  'fcbaf433-b991-4f9e-9024-5d70f94c4e4c', -- Sample Testing in Clinical Biochemistry
  '2106bc52-eadf-4919-8141-14e307600d09', -- Blood Metabolites Measurement
  '673c4d69-da9c-45ae-aa51-3d326f1b45a2', -- Biochemistry Course Outline
  'a30e6240-7508-4820-8f3b-1921575972d0'  -- Brown and White Adipose Tissue
);

-- ---- Year 3 mappings ----
UPDATE public.articles SET category = 'Year 3: Endocrine and Metabolic Pathology' WHERE id IN (
  '1ce71419-51e8-4bd9-8079-9923c892a19c', -- Adrenal Neoplasms
  'c44bf6c3-130e-4f6c-9126-84513ba24eb4', -- Adrenal Neoplasms dup
  '324543fa-1375-425f-9a6d-9b55f0cf6a2b', -- Endocrine & Renal Pathology
  '2e0c9564-762b-4369-a0fe-3139660d9c83', -- Endocrine & Renal Pathology - Must Know
  '12d71bf7-98e0-40ba-9a80-92519ec7512f', -- Endocrine and Metabolic Pathology Course Outline
  'aa80da6c-f516-42b2-a9e2-196682594bc8'  -- Oncopathology And Genetic Disorders End Sem Cat
);
UPDATE public.articles SET category = 'Year 3: General Pathology' WHERE id IN (
  '1fdb0622-5e2f-4f88-81d3-9f0abef8d359', -- Inflammation and Tissue Repair MCQs
  'bf553699-2614-44ec-a209-80dbfdedcd13', -- Vascular Pathology
  'e9981bb9-6fe6-492d-b5f1-dd73553fac9a'  -- Department of Pathology
);
UPDATE public.articles SET category = 'Year 3: Hematopathology' WHERE id IN (
  '13eb910f-247b-422f-810a-8dc6b04333c8', -- White Cell Disorders
  '43093875-63a2-4e93-9217-af5d525d29f3'  -- Hematologic Malignancies & Bleeding Disorders
);
UPDATE public.articles SET category = 'Year 3: Blood Transfusion' WHERE id = 'd6381565-892e-40c3-8cde-093f6542df0d';
UPDATE public.articles SET category = 'Year 3: Male Reproductive and Urinary System Pathology' WHERE id = 'cde01fca-fec6-49de-9b4e-7726a4d38e7b';
UPDATE public.articles SET category = 'Year 3: Bone and Soft Tissue Pathology' WHERE id IN (
  '27f16853-5416-4b75-aca1-ba875ef90076', -- Liver Tumors (benign/primary/secondary)
  '66ca2809-8db2-484f-a77a-8865020d5a36', -- Liver Tumors: Benign and Malignant
  '1bb6bd21-a4e2-4115-9962-92dc457b7cac', -- Tumours of GI Tract
  'e5fddead-3212-46e0-8726-8cf3344641de', -- GI Neoplasms High-Yield
  '6928f654-7580-444e-8aa6-ce5c383b45cc', -- GI Pathology Part 2
  '953933e9-3757-4d65-bc83-b898d01ba82c'  -- Gastropathology Pathology
);
UPDATE public.articles SET category = 'Year 3: Chemical Pathology' WHERE id IN (
  '47daa53a-f9b3-4a73-a34d-186b4f8fcb1e', -- Chemical Path LAQ/SAQ
  '8f6e9f23-1e3c-4e2a-b49e-d4fb01bfa3a9', -- Chemical Pathology Sem 1
  'c7befa18-3168-4fa5-b65f-b0739206e4de'  -- Clinical Enzymology and Biomarkers
);
UPDATE public.articles SET category = 'Year 3: Neuropathology' WHERE id IN (
  '63f95076-bb93-47b5-ae30-5492a1a59363', -- Congenital Hydrocephalus
  'f15a1c6c-6b26-41ef-baae-044b27623061', -- Prefrontal Association Areas
  '41afcd44-2890-40ac-b716-56da501d2e81'  -- Clinical Anatomy of Cerebral Cortex
);
UPDATE public.articles SET category = 'Year 3: Respiratory System Pathology' WHERE id = '16936379-5541-46a7-9138-7089393c06a3';
UPDATE public.articles SET category = 'Year 3: Community Health' WHERE id IN (
  '44fc681f-a206-4dd3-a5ba-22b7b1a38919', -- Nutrition and Dietetics Exam
  'ba67f4bc-480e-40d1-90dc-f91bc27d0cfb'  -- Chest X-ray Interpretation
);
UPDATE public.articles SET category = 'Year 3: Medical Virology' WHERE id = '4f9386c9-9fe1-411b-8a70-f423ce1433fb';
UPDATE public.articles SET category = 'Year 3: General Pathology'
  WHERE category IN ('Pathology','Pharmacology','Endocrine and Metabolic Pathology') AND deleted_at IS NULL;

-- 4) Delete duplicate MCQ sets - keep oldest id only
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY title, category ORDER BY created_at ASC, id ASC) AS rn
  FROM public.mcq_sets
  WHERE published = true AND deleted_at IS NULL
)
UPDATE public.mcq_sets SET deleted_at = now(), published = false
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 5) Clear placeholder/base64 thumbnails so frontend fallback renders
UPDATE public.articles SET og_image_url = NULL
WHERE og_image_url IS NOT NULL
  AND (og_image_url LIKE 'data:image/%' OR og_image_url LIKE '%og-default%' OR length(og_image_url) > 2000 OR trim(og_image_url) = '');
UPDATE public.mcq_sets SET og_image_url = NULL
WHERE og_image_url IS NOT NULL
  AND (og_image_url LIKE 'data:image/%' OR og_image_url LIKE '%og-default%' OR length(og_image_url) > 2000 OR trim(og_image_url) = '');

-- 6) Backfill meta_title from title where missing
UPDATE public.articles SET meta_title = left(title, 80)
WHERE (meta_title IS NULL OR length(trim(meta_title)) < 5)
  AND title IS NOT NULL AND deleted_at IS NULL;
UPDATE public.mcq_sets SET meta_title = left(title, 80)
WHERE (meta_title IS NULL OR length(trim(meta_title)) < 5)
  AND title IS NOT NULL AND deleted_at IS NULL;

-- 7) Backfill meta_description from content/title where missing
UPDATE public.articles
SET meta_description = left(
  regexp_replace(
    regexp_replace(
      regexp_replace(coalesce(content,''), '!\[[^\]]*\]\([^)]*\)', ' ', 'g'),
      '[#*_`>|]+', ' ', 'g'),
    '\s+', ' ', 'g'),
  158)
WHERE (meta_description IS NULL OR length(meta_description) < 50)
  AND deleted_at IS NULL
  AND content IS NOT NULL
  AND length(content) > 100
  AND content NOT LIKE 'data:image/%';

UPDATE public.articles
SET meta_description = left(title || ' — clinical study notes for medical students on ' || regexp_replace(coalesce(category,''), '^Year\s*\d+:\s*', '', 'i') || '.', 158)
WHERE (meta_description IS NULL OR length(meta_description) < 50)
  AND deleted_at IS NULL;

UPDATE public.mcq_sets
SET meta_description = left(coalesce(title,'MCQ Practice') || ' — clinical MCQs in ' || regexp_replace(coalesce(category,''), '^Year\s*\d+:\s*', '', 'i') || ' for medical students.', 158)
WHERE (meta_description IS NULL OR length(meta_description) < 50)
  AND deleted_at IS NULL;
