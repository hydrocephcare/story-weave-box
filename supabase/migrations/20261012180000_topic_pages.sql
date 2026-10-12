-- Topic pages written by AI on demand (api/topic-ai.js). One row per topic: once it is published, nobody has to wait for it again.
-- Readers can read published pages with the public key; only the server (service key) and admins can write.
create table if not exists public.topic_pages (
  slug        text primary key,
  name        text not null,
  category    text,
  status      text not null default 'generating' check (status in ('generating', 'published', 'rejected', 'failed')),
  content     jsonb,
  model       text,
  reviewed    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.topic_pages enable row level security;

drop policy if exists "Public reads published topic pages" on public.topic_pages;
create policy "Public reads published topic pages" on public.topic_pages for select to anon, authenticated using (status = 'published');

drop policy if exists "Admins manage topic pages" on public.topic_pages;
create policy "Admins manage topic pages" on public.topic_pages for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

revoke insert, update, delete on public.topic_pages from anon;
create index if not exists topic_pages_created_idx on public.topic_pages (created_at desc);
