-- MCQ banks from notes: aim for about 30 questions, every bank gets a working address, one bank per note title, and short banks are topped up.

-- one bank per note title (two notes with the same name no longer produce two banks)
create or replace function public.note_mcq_candidates(n int default 1)
returns table(id uuid)
language sql stable security definer set search_path = public as $$
  with per_year as (
    select substring(coalesce(m.category, '') from 'Year ([0-9])') y, count(*) c
    from public.mcq_sets m where m.published and m.deleted_at is null group by 1
  )
  select a.id
  from public.articles a
  left join per_year py on py.y = substring(coalesce(a.category, '') from 'Year ([0-9])')
  where a.published
    and a.category ~ '^Year [0-9]'
    and length(a.content) between 2500 and 150000
    and a.title !~* '(mcq|question|exam|paper|quiz|bank|saq|osce|past)'
    and a.content !~* '(multiple choice|short answer questions)'
    and not exists (select 1 from public.mcq_sets m where m.source_reference = a.id::text and m.deleted_at is null)
    and not exists (select 1 from public.mcq_sets m where m.source_type = 'note_generated' and m.deleted_at is null and m.published and m.category = a.category and m.title = left(a.title, 80) || ': MCQs')
  order by coalesce(py.c, 0) asc, a.updated_at desc
  limit greatest(n, 1);
$$;
revoke all on function public.note_mcq_candidates(int) from public, anon, authenticated;
grant execute on function public.note_mcq_candidates(int) to service_role;

-- banks written from a note that hold fewer than 24 questions and have not been topped up yet
create or replace function public.note_mcq_topup_candidates(n int default 1)
returns table(id uuid)
language sql stable security definer set search_path = public as $$
  select m.id from public.mcq_sets m
  where m.source_type = 'note_generated' and m.published and m.deleted_at is null
    and jsonb_typeof(m.questions) = 'array' and jsonb_array_length(m.questions) < 24
    and coalesce(m.original_notes, '') not like '%"topped"%'
  order by m.created_at asc
  limit greatest(n, 1);
$$;
revoke all on function public.note_mcq_topup_candidates(int) from public, anon, authenticated;
grant execute on function public.note_mcq_topup_candidates(int) to service_role;

-- every bank has a slug (the address of its page)
update public.mcq_sets
set slug = left(coalesce(nullif(regexp_replace(regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'), ''), 'quiz'), 70) || '-' || substr(replace(id::text, '-', ''), 1, 8)
where slug is null or slug = '';

-- two published banks with the same title in the same unit: keep the larger one
with ranked as (
  select id, row_number() over (partition by category, title order by jsonb_array_length(questions) desc, created_at asc) rn
  from public.mcq_sets where source_type = 'note_generated' and published and deleted_at is null
)
update public.mcq_sets m set published = false from ranked r where r.id = m.id and r.rn > 1;
