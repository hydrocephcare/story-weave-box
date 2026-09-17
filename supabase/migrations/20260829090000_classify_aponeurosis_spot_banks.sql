-- Aponeurosis is a visual identification/spot-question collection, not MCQs.
-- Keep the articles canonical in Year 1; the UI deliberately shares them with
-- Year 2 rather than duplicating rows and splitting progress/bookmarks.
update public.articles
set content_kind = 'image_spot_bank',
    tags = (
      select array_agg(distinct tag)
      from unnest(coalesce(tags, '{}'::text[]) || array['Anatomy Spot Bank', 'Aponeurosis', 'Year 1', 'Year 2']) tag
    ),
    updated_at = now()
where deleted_at is null
  and (title ilike '%aponeurosis%' or category ilike '%aponeurosis%');
