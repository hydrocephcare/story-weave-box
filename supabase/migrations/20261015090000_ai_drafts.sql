-- Notes that Ompath AI wrote for a search the site had nothing for. They wait here until the admin approves them (nothing is published automatically).
-- The server adds drafts with the same private key as the blog polish; only the admin can read, approve or delete them.

create table if not exists public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  query_key text not null unique,
  title text not null,
  content text not null,
  year int check (year between 1 and 6),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  asked int not null default 1,
  article_id uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.ai_drafts enable row level security;

drop policy if exists "server adds drafts" on public.ai_drafts;
create policy "server adds drafts" on public.ai_drafts for insert to anon, authenticated with check (public.polish_write_ok());

drop policy if exists "server counts drafts" on public.ai_drafts;
create policy "server counts drafts" on public.ai_drafts for select to anon, authenticated using (public.polish_write_ok());

drop policy if exists "server raises asked" on public.ai_drafts;
create policy "server raises asked" on public.ai_drafts for update to anon, authenticated using (public.polish_write_ok() and status = 'pending') with check (public.polish_write_ok());

drop policy if exists "admin manages drafts" on public.ai_drafts;
create policy "admin manages drafts" on public.ai_drafts for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
