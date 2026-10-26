-- Errors that visitors hit in the browser are sent here automatically so the admin can see and fix them. Only the admin can read them.
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (char_length(source) between 1 and 80),
  message text not null check (char_length(message) between 1 and 600),
  url text check (url is null or char_length(url) <= 300),
  user_id uuid,
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  extra jsonb,
  seen boolean not null default false
);
alter table public.client_errors enable row level security;
drop policy if exists "anyone can report an error" on public.client_errors;
create policy "anyone can report an error" on public.client_errors for insert to anon, authenticated with check (seen = false);
drop policy if exists "admins read errors" on public.client_errors;
create policy "admins read errors" on public.client_errors for select to authenticated using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "admins update errors" on public.client_errors;
create policy "admins update errors" on public.client_errors for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "admins delete errors" on public.client_errors;
create policy "admins delete errors" on public.client_errors for delete to authenticated using (public.has_role(auth.uid(), 'admin'));
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);
