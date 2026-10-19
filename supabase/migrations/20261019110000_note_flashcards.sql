-- Flashcards written from the notes students read: every study note gets a deck (made by the "note-flashcards" function on a schedule).
create or replace function public.note_flashcard_candidates(n int default 1)
returns table(id uuid)
language sql stable security definer set search_path = public as $$
  select a.id
  from public.articles a
  where a.published
    and a.category ~ '^Year [0-9]'
    and length(a.content) between 2500 and 150000
    and a.title !~* '(mcq|question|exam|paper|quiz|bank|saq|osce|past)'
    and a.content !~* '(multiple choice|short answer questions)'
    and not exists (select 1 from public.flashcard_sets f where f.source_reference = a.id::text and f.deleted_at is null)
    and not exists (select 1 from public.flashcard_sets f where f.deleted_at is null and f.published and f.category = a.category and f.title = left(a.title, 80) || ': Flashcards')
  order by a.updated_at desc
  limit greatest(n, 1);
$$;
revoke all on function public.note_flashcard_candidates(int) from public, anon, authenticated;
grant execute on function public.note_flashcard_candidates(int) to service_role;
