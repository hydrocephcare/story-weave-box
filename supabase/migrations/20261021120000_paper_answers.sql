-- Model answers for the dental past papers: one row per question, filled in by the paper-answers function in batches.
create table if not exists public.paper_answers (
  slug text not null,
  qkey text not null,
  idx int not null,
  unit text not null default '',
  marks int,
  question text not null,
  answer text,
  tries int not null default 0,
  answered_at timestamptz,
  primary key (slug, qkey)
);
alter table public.paper_answers enable row level security;
drop policy if exists "answers are public once written" on public.paper_answers;
create policy "answers are public once written" on public.paper_answers for select using (answer is not null);
grant select on public.paper_answers to anon, authenticated;

create or replace function public.paper_answer_miss(_slug text, _qkey text) returns void language sql security definer set search_path = public as $$
  update public.paper_answers set tries = tries + 1 where slug = _slug and qkey = _qkey and answer is null;
$$;
revoke all on function public.paper_answer_miss(text, text) from public, anon, authenticated;

alter table public.paper_answers add column if not exists seen_at timestamptz;

-- AI-written search snippets for each paper (description, keywords, topics), filled in by the same function
create table if not exists public.paper_seo (
  slug text primary key,
  description text not null,
  keywords text[] not null default '{}',
  topics text[] not null default '{}',
  tries int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.paper_seo enable row level security;
drop policy if exists "seo is public" on public.paper_seo;
create policy "seo is public" on public.paper_seo for select using (true);
grant select on public.paper_seo to anon, authenticated;
