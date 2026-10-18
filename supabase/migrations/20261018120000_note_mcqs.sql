-- MCQs written from the notes students read: every study note gets its own short question bank (made by the "note-mcqs" function on a schedule).
-- The question doctor (review-questions) then checks each new bank like every other one.
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
  order by coalesce(py.c, 0) asc, a.updated_at desc
  limit greatest(n, 1);
$$;
revoke all on function public.note_mcq_candidates(int) from public, anon, authenticated;
grant execute on function public.note_mcq_candidates(int) to service_role;
