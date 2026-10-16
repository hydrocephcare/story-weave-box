-- Search-result tidy: titles that Google cuts off (over 65 characters), repeated words in practice-bank descriptions, and thin or missing descriptions.
create table if not exists public.seo_backup_oct16 as
  select 'articles'::text as tbl, id, meta_title, meta_description from public.articles
  union all select 'mcq_sets', id, meta_title, meta_description from public.mcq_sets;

create or replace function private.short_seo_title(t text) returns text language plpgsql immutable as $$
declare seg text; cut text;
begin
  if t is null or length(t) <= 65 then return t; end if;
  foreach seg in array regexp_split_to_array(t, '\s+[—–|]\s+|:\s+') loop
    if length(seg) between 25 and 65 then return seg; end if;
    exit;   -- only the first segment is a candidate
  end loop;
  cut := left(t, 62);
  return regexp_replace(cut, '\s+\S*$', '');
end $$;

update public.articles set meta_title = private.short_seo_title(meta_title) where published and deleted_at is null and length(meta_title) > 65;
update public.articles set meta_title = left(title, 62) where published and deleted_at is null and coalesce(length(meta_title), 0) = 0;
update public.articles set meta_description = left(title, 90) || ' — clear notes, key points and exam-style questions for medical students.'
  where published and deleted_at is null and coalesce(length(meta_description), 0) < 70;

update public.mcq_sets set meta_description = regexp_replace(regexp_replace(meta_description, '(MCQs?)\s+MCQs?', '\1', 'gi'), '\s{2,}', ' ', 'g') where meta_description ~* '(MCQs MCQs|MCQ MCQ|\s{2,})';
update public.mcq_sets set meta_title = left(title, 62) where published and deleted_at is null and coalesce(length(meta_title), 0) = 0;
update public.mcq_sets set meta_description = left(title, 90) || ' — practice questions with answers and explanations for medical students.'
  where published and deleted_at is null and coalesce(length(meta_description), 0) < 70;
