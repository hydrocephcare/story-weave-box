
-- Add SEO fields to MCQ Sets
ALTER TABLE public.mcq_sets 
ADD COLUMN IF NOT EXISTS meta_title text DEFAULT '',
ADD COLUMN IF NOT EXISTS meta_description text DEFAULT '',
ADD COLUMN IF NOT EXISTS og_image_url text DEFAULT '',
ADD COLUMN IF NOT EXISTS slug text DEFAULT '';

-- Add SEO fields to Flashcard Sets
ALTER TABLE public.flashcard_sets 
ADD COLUMN IF NOT EXISTS meta_title text DEFAULT '',
ADD COLUMN IF NOT EXISTS meta_description text DEFAULT '',
ADD COLUMN IF NOT EXISTS og_image_url text DEFAULT '',
ADD COLUMN IF NOT EXISTS slug text DEFAULT '';

-- Add SEO fields to Stories
ALTER TABLE public.stories 
ADD COLUMN IF NOT EXISTS meta_title text DEFAULT '',
ADD COLUMN IF NOT EXISTS meta_description text DEFAULT '',
ADD COLUMN IF NOT EXISTS og_image_url text DEFAULT '',
ADD COLUMN IF NOT EXISTS slug text DEFAULT '';

-- Add SEO fields to Essays
ALTER TABLE public.essays 
ADD COLUMN IF NOT EXISTS meta_title text DEFAULT '',
ADD COLUMN IF NOT EXISTS meta_description text DEFAULT '',
ADD COLUMN IF NOT EXISTS og_image_url text DEFAULT '',
ADD COLUMN IF NOT EXISTS slug text DEFAULT '';
