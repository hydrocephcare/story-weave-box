-- Admin switches that readers can see. The answers payment pop-up lives here and is off until an admin turns it on at /admin/paywall.
create table if not exists public.site_flags (key text primary key, value jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
alter table public.site_flags enable row level security;
drop policy if exists "flags readable" on public.site_flags;
create policy "flags readable" on public.site_flags for select using (true);
drop policy if exists "flags admin write" on public.site_flags;
create policy "flags admin write" on public.site_flags for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
insert into public.site_flags (key, value) values ('answers_paywall', '{"enabled": false, "price": "", "message": "Unlock model answers for every past paper.", "payLink": "", "code": ""}') on conflict (key) do nothing;
