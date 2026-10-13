-- Lets the site's server save polished blogs without the Supabase service key (which the owner cannot reach on Lovable).
-- The server sends a private key in a request header; the database checks it against a key only the admin can see and set.
-- Everyone can still only READ finished polishes; nobody can write without the key.

alter table public.blog_polish add column if not exists image_query text;

create table if not exists public.polish_secret (
  id int primary key default 1 check (id = 1),
  secret text not null check (length(secret) >= 24),
  updated_at timestamptz not null default now()
);
alter table public.polish_secret enable row level security;

drop policy if exists "admin manages polish key" on public.polish_secret;
create policy "admin manages polish key" on public.polish_secret for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- true only when the request carries the right key in the x-polish-key header
create or replace function public.polish_write_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.polish_secret s
    where s.secret = coalesce((nullif(current_setting('request.headers', true), '')::json) ->> 'x-polish-key', '')
  );
$$;
revoke all on function public.polish_write_ok() from public;
grant execute on function public.polish_write_ok() to anon, authenticated;

drop policy if exists "server adds polish" on public.blog_polish;
create policy "server adds polish" on public.blog_polish for insert to anon, authenticated with check (public.polish_write_ok());

drop policy if exists "server changes polish" on public.blog_polish;
create policy "server changes polish" on public.blog_polish for update to anon, authenticated using (public.polish_write_ok()) with check (public.polish_write_ok());

drop policy if exists "server reads polish state" on public.blog_polish;
create policy "server reads polish state" on public.blog_polish for select to anon, authenticated using (public.polish_write_ok());
