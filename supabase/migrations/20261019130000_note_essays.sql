-- Essays with model answers for every study note, and missing ("pending") model answers filled in. Made by the "note-essays" function on a schedule.
create or replace function public.essay_pending_candidates(n int default 1)
returns table(id uuid)
language sql stable security definer set search_path = public as $$
  select e.id from public.essays e
  where e.published and e.deleted_at is null
    and exists (
      select 1 from jsonb_array_elements(coalesce(e.short_answer_questions, '[]'::jsonb) || coalesce(e.long_answer_questions, '[]'::jsonb)) q
      where coalesce(q->>'answer', q->>'model_answer', '') ~* '^\s*(model answer pending|pending|tbd)?\s*$'
    )
  order by e.created_at asc
  limit greatest(n, 1);
$$;
revoke all on function public.essay_pending_candidates(int) from public, anon, authenticated;
grant execute on function public.essay_pending_candidates(int) to service_role;

create or replace function public.note_essay_candidates(n int default 1)
returns table(id uuid)
language sql stable security definer set search_path = public as $$
  select a.id
  from public.articles a
  where a.published
    and a.category ~ '^Year [0-9]'
    and length(a.content) between 2500 and 150000
    and a.title !~* '(mcq|question|exam|paper|quiz|bank|saq|osce|past)'
    and a.content !~* '(multiple choice|short answer questions)'
    and not exists (select 1 from public.essays e where e.article_id = a.id and e.deleted_at is null)
  order by a.updated_at desc
  limit greatest(n, 1);
$$;
revoke all on function public.note_essay_candidates(int) from public, anon, authenticated;
grant execute on function public.note_essay_candidates(int) to service_role;
