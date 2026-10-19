-- Spaced repetition for flashcards: how well each reader knows each card and when it is due again. Own rows only.
create table if not exists public.flashcard_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  set_id uuid not null,
  card_idx int not null,
  ef real not null default 2.5,
  iv real not null default 0,
  reps int not null default 0,
  lapses int not null default 0,
  due timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, set_id, card_idx)
);
alter table public.flashcard_reviews enable row level security;
drop policy if exists "own reviews" on public.flashcard_reviews;
create policy "own reviews" on public.flashcard_reviews for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists flashcard_reviews_due on public.flashcard_reviews (user_id, due);
