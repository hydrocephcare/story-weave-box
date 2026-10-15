-- ONE file to run: topic page depth rule (7+ sections, 8+ examiner questions) and the helpful vote. Safe to run more than once.

-- A topic page that is thin (fewer than 7 sections or 8 examiner questions) can be replaced ONCE by a deep one. A deep page is final: this function
-- refuses to touch it, so nobody can overwrite good content, and the AI credits for a topic are spent at most one more time.
create or replace function public.upgrade_topic_page(p_slug text, p_content jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.topic_pages%rowtype;
  old_sections int;
  old_exam int;
  as_text text;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) > 80 then return jsonb_build_object('ok', false, 'reason', 'slug'); end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' or pg_column_size(p_content) > 90000 then return jsonb_build_object('ok', false, 'reason', 'size'); end if;
  if jsonb_typeof(p_content->'sections') <> 'array' or jsonb_typeof(p_content->'exam') <> 'array' then return jsonb_build_object('ok', false, 'reason', 'shape'); end if;
  if jsonb_array_length(p_content->'sections') < 7 or jsonb_array_length(p_content->'sections') > 16 or jsonb_array_length(p_content->'exam') < 8
     or length(coalesce(p_content->>'summary', '')) < 40 then return jsonb_build_object('ok', false, 'reason', 'not deep'); end if;
  as_text := p_content::text;
  if as_text ~* '(https?:|www\.|<[a-z/!]|javascript:|onerror\s*=|data:text)' then return jsonb_build_object('ok', false, 'reason', 'unsafe'); end if;

  select * into existing from public.topic_pages where slug = p_slug and status = 'published';
  if not found then return jsonb_build_object('ok', false, 'reason', 'missing'); end if;
  old_sections := case when jsonb_typeof(existing.content->'sections') = 'array' then jsonb_array_length(existing.content->'sections') else 0 end;
  old_exam := case when jsonb_typeof(existing.content->'exam') = 'array' then jsonb_array_length(existing.content->'exam') else 0 end;
  if old_sections >= 7 and old_exam >= 8 then return jsonb_build_object('ok', true, 'existing', true); end if;

  update public.topic_pages set content = p_content, reviewed = false, updated_at = now() where slug = p_slug;
  return jsonb_build_object('ok', true, 'upgraded', true);
end;
$$;
revoke all on function public.upgrade_topic_page(text, jsonb) from public;
grant execute on function public.upgrade_topic_page(text, jsonb) to anon, authenticated;

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
