-- The polished copy of each Year 1 to 3 blog: a clear title and search description, tidier text, and a verdict for the admin.
-- The stored article is never changed. The page shows this copy when it exists, for everyone, so a blog is polished once.
-- Written by the server only (SUPABASE_SERVICE_ROLE_KEY); anyone can read finished rows; the admin can see everything and remove a row to redo it.

create table if not exists public.blog_polish (
  article_id uuid primary key references public.articles(id) on delete cascade,
  status text not null default 'working' check (status in ('working', 'partial', 'done', 'failed')),
  title text,
  description text,
  content text,
  verdict text check (verdict in ('keep', 'review', 'irrelevant')),
  reason text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_polish_verdict_idx on public.blog_polish (verdict) where verdict <> 'keep';
create index if not exists blog_polish_created_idx on public.blog_polish (created_at);

alter table public.blog_polish enable row level security;

drop policy if exists "finished polish is public" on public.blog_polish;
create policy "finished polish is public" on public.blog_polish for select using (status in ('done', 'partial'));

drop policy if exists "admin manages polish" on public.blog_polish;
create policy "admin manages polish" on public.blog_polish for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
