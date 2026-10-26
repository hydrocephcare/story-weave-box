-- Story reactions, comments and read counts. Readers react and comment while signed in; counts are public.
create table if not exists public.story_reactions (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('love','helpful','relatable','inspiring')),
  created_at timestamptz not null default now(),
  primary key (story_id, user_id, kind)
);
alter table public.story_reactions enable row level security;
drop policy if exists "story reactions are public" on public.story_reactions;
create policy "story reactions are public" on public.story_reactions for select using (true);
drop policy if exists "people add their own reactions" on public.story_reactions;
create policy "people add their own reactions" on public.story_reactions for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "people remove their own reactions" on public.story_reactions;
create policy "people remove their own reactions" on public.story_reactions for delete to authenticated using (auth.uid() = user_id);
create index if not exists story_reactions_story_idx on public.story_reactions (story_id);

create table if not exists public.story_comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  body text not null check (char_length(body) between 2 and 800),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.story_comments enable row level security;
drop policy if exists "story comments are public" on public.story_comments;
create policy "story comments are public" on public.story_comments for select using (deleted_at is null);
drop policy if exists "people add their own comments" on public.story_comments;
create policy "people add their own comments" on public.story_comments for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "people remove their own comments" on public.story_comments;
create policy "people remove their own comments" on public.story_comments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists story_comments_story_idx on public.story_comments (story_id, created_at);

create table if not exists public.story_stats (
  story_id uuid primary key references public.stories(id) on delete cascade,
  views bigint not null default 0
);
alter table public.story_stats enable row level security;
drop policy if exists "story stats are public" on public.story_stats;
create policy "story stats are public" on public.story_stats for select using (true);

create or replace function public.bump_story_view(p_story uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into public.story_stats (story_id, views) values (p_story, 1)
  on conflict (story_id) do update set views = public.story_stats.views + 1
  returning views into v;
  return v;
end $$;
grant execute on function public.bump_story_view(uuid) to anon, authenticated;
