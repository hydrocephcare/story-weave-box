-- Comments under the study notes, and each student's progress in the notes (so ticks and "continue reading" follow them from phone to laptop).
-- Safe to run more than once. Nothing here changes existing tables.

-- 1. Comments ---------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.note_comments (
  id uuid primary key default gen_random_uuid(),
  note_slug text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  author text not null default 'Student' check (char_length(author) <= 60),
  body text not null check (char_length(body) between 2 and 1500),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists note_comments_slug_created_idx on public.note_comments (note_slug, created_at desc);
alter table public.note_comments enable row level security;

drop policy if exists "anyone reads visible comments" on public.note_comments;
create policy "anyone reads visible comments" on public.note_comments for select to anon, authenticated using (hidden = false or public.has_role(auth.uid(), 'admin'));

drop policy if exists "students post as themselves" on public.note_comments;
create policy "students post as themselves" on public.note_comments for insert to authenticated with check (auth.uid() = user_id and hidden = false);

drop policy if exists "owner or admin deletes" on public.note_comments;
create policy "owner or admin deletes" on public.note_comments for delete to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

drop policy if exists "admin moderates" on public.note_comments;
create policy "admin moderates" on public.note_comments for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- 2. Progress in the notes ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.note_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  note_slug text not null,
  progress int not null default 0 check (progress between 0 and 100),
  finished boolean not null default false,
  review_stage int not null default 0,
  review_due timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, note_slug)
);
alter table public.note_progress enable row level security;

drop policy if exists "own progress" on public.note_progress;
create policy "own progress" on public.note_progress for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
