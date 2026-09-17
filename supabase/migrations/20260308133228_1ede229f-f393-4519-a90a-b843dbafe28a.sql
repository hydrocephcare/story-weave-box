
ALTER TABLE public.articles 
ADD COLUMN IF NOT EXISTS meta_title text DEFAULT '',
ADD COLUMN IF NOT EXISTS meta_description text DEFAULT '',
ADD COLUMN IF NOT EXISTS og_image_url text DEFAULT '',
ADD COLUMN IF NOT EXISTS slug text DEFAULT '';
