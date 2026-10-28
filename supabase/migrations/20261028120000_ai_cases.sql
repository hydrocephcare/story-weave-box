-- Clinical cases written by the AI from the notes (one per note), read by the simulator in the same shape as the built-in cases.
create table if not exists public.ai_cases (
  id text primary key,
  rotation text not null,
  title text not null,
  level int not null default 2,
  def jsonb not null,
  source_article_id uuid,
  status text not null default 'published',
  created_at timestamptz not null default now()
);
create unique index if not exists ai_cases_source_article_idx on public.ai_cases (source_article_id) where source_article_id is not null;
alter table public.ai_cases enable row level security;
drop policy if exists "Published AI cases are public" on public.ai_cases;
create policy "Published AI cases are public" on public.ai_cases for select using (status = 'published');
