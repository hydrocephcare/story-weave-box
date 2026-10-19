-- A light list of the published flashcard decks (no cards), with the card count, so the Flashcards page does not download every card.
create or replace function public.flashcard_catalog() returns table(id uuid, title text, slug text, category text, created_at timestamptz, card_count int, source_reference text)
language sql stable set search_path = public as $$
  select f.id, f.title, f.slug, coalesce(f.category, 'Uncategorized'), f.created_at, case when jsonb_typeof(f.cards) = 'array' then jsonb_array_length(f.cards) else 0 end, f.source_reference
  from public.flashcard_sets f where f.published and f.deleted_at is null order by f.created_at desc
$$;
grant execute on function public.flashcard_catalog() to anon, authenticated;
