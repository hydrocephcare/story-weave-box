-- Written papers (SAQ / LAQ / essay style notes): the AI "paper doctor" proposes a tidier version of each one; nothing changes until an admin approves it.
create table if not exists public.paper_fixes (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null unique references public.articles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'clean', 'skipped')),
  issues jsonb not null default '[]'::jsonb,
  old_title text,
  new_title text,
  new_description text,
  new_category text,
  old_content text,
  new_content text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.paper_fixes enable row level security;
drop policy if exists "Admins manage paper fixes" on public.paper_fixes;
create policy "Admins manage paper fixes" on public.paper_fixes for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Published articles that look like written papers and have not been looked at yet (ids only, so nothing heavy is read).
create or replace function public.paper_candidates(n int default 1) returns setof uuid language sql stable as $$
  select a.id from public.articles a
  where a.published and a.deleted_at is null and a.category !~* '^stories'
    and length(a.content) between 800 and 16000
    and (a.content ~* '\(\s*\d+\s*marks?\s*\)' or a.content ~ '(?m)^\s*(\*\*)?(Model )?answer\s*:' or a.title ~* '(saq|laq|essay|short answer|long answer)')
    and not exists (select 1 from public.paper_fixes f where f.article_id = a.id)
  order by a.created_at desc limit n
$$;
revoke all on function public.paper_candidates(int) from public, anon, authenticated;

-- Long papers are checked a section at a time, one section per scheduled call.
alter table public.paper_fixes add column if not exists seg int not null default 0;
alter table public.paper_fixes add column if not exists changed boolean not null default false;
alter table public.paper_fixes drop constraint if exists paper_fixes_status_check;
alter table public.paper_fixes add constraint paper_fixes_status_check check (status in ('pending', 'approved', 'rejected', 'clean', 'skipped', 'working'));
create or replace function public.paper_candidates(n int default 1) returns setof uuid language sql stable as $$
  select id from (
    select a.id, (f.status = 'working') as resume, a.created_at
    from public.articles a left join public.paper_fixes f on f.article_id = a.id
    where a.published and a.deleted_at is null and a.category !~* '^stories'
      and length(a.content) between 800 and 90000
      and (f.article_id is null or f.status = 'working')
      and (a.content ~* '\(\s*\d+\s*marks?\s*\)' or a.content ~ '(?m)^\s*(\*\*)?(Model )?answer\s*:' or a.title ~* '(saq|laq|essay|short answer|long answer)')
  ) x order by resume desc nulls last, created_at desc limit n
$$;
revoke all on function public.paper_candidates(int) from public, anon, authenticated;
