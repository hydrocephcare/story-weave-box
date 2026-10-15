-- "Was this page helpful?" on topic pages. One vote per visitor per page (changing it replaces it). Only admins can read the votes.
create table if not exists public.topic_votes (
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  visitor text not null check (length(visitor) between 8 and 64),
  vote smallint not null check (vote in (-1, 1)),
  at timestamptz not null default now(),
  primary key (slug, visitor)
);
alter table public.topic_votes enable row level security;
drop policy if exists "Admins read topic votes" on public.topic_votes;
create policy "Admins read topic votes" on public.topic_votes for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create or replace function public.vote_topic(p_slug text, p_visitor text, p_vote int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) > 80 then return; end if;
  if p_visitor is null or length(p_visitor) < 8 or length(p_visitor) > 64 or p_vote not in (-1, 1) then return; end if;
  insert into public.topic_votes (slug, visitor, vote) values (p_slug, p_visitor, p_vote)
  on conflict (slug, visitor) do update set vote = excluded.vote, at = now();
end;
$$;
revoke all on function public.vote_topic(text, text, int) from public;
grant execute on function public.vote_topic(text, text, int) to anon, authenticated;
