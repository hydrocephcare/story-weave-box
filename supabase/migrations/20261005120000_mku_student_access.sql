-- MKU student access.
-- Books, timetables, course outlines, the library and past papers are for Mount Kenya University
-- students only. A student is verified when the admission number they give matches the MKU format;
-- anything else becomes a pending request the admin approves or denies.
-- The format is checked here, on the server, so it cannot be bypassed from the browser and is not
-- shipped in the site's JavaScript.
-- Safe to run more than once.

create table if not exists public.student_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  admission_no text,                 -- normalised, e.g. BMS/2023/60482; null when the text could not be read
  entered_text text,                 -- exactly what the student typed, for the admin to judge
  status text not null default 'pending' check (status in ('verified', 'pending', 'denied')),
  method text not null default 'format' check (method in ('format', 'admin')),
  note text,
  admin_seen boolean not null default false,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

-- One verified account per admission number.
create unique index if not exists student_access_admission_verified
  on public.student_access (admission_no) where status = 'verified';
create index if not exists student_access_status_idx on public.student_access (status, created_at desc);

alter table public.student_access enable row level security;

drop policy if exists "students read own access" on public.student_access;
create policy "students read own access" on public.student_access
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "admins read student access" on public.student_access;
create policy "admins read student access" on public.student_access
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- All writes go through the functions below; nobody writes this table directly.
revoke all on public.student_access from anon, authenticated;
grant select on public.student_access to authenticated;

-- "BMS/2023/60482" in any common typing: bms 2023 60482, BMS-2023-60482, bms/2023/60482 ...
create or replace function public.normalize_admission(raw text)
returns text language sql immutable as $$
  select case
    when upper(btrim(coalesce(raw, ''))) ~ '^BMS[[:space:]/\-_.]*[0-9]{4}[[:space:]/\-_.]*[0-9]{3,6}$'
    then regexp_replace(
      upper(btrim(raw)),
      '^BMS[[:space:]/\-_.]*([0-9]{4})[[:space:]/\-_.]*([0-9]{3,6})$',
      'BMS/\1/\2')
    else null
  end
$$;

create or replace function public.is_mku_student(_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select _uid is not null and (
    exists (select 1 from public.student_access s where s.user_id = _uid and s.status = 'verified')
    or public.has_role(_uid, 'admin')
  )
$$;

create or replace function public.my_student_status()
returns text language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then 'none'
    when public.has_role(auth.uid(), 'admin') then 'verified'
    else coalesce((select s.status from public.student_access s where s.user_id = auth.uid()), 'none')
  end
$$;

-- Shared by the sign-up trigger and the "enter your admission number" form (Google sign-in).
create or replace function public._process_admission(_uid uuid, _email text, _entered text)
returns text language plpgsql security definer set search_path = public as $$
declare
  norm text := public.normalize_admission(_entered);
  taken boolean;
  result text;
  existing text;
begin
  select status into existing from public.student_access where user_id = _uid;
  if existing = 'verified' then return 'verified'; end if;

  if norm is not null then
    select exists (select 1 from public.student_access s where s.admission_no = norm and s.status = 'verified' and s.user_id <> _uid) into taken;
  else
    taken := false;
  end if;

  if norm is not null and not taken then
    result := 'verified';
  else
    result := 'pending';
  end if;

  insert into public.student_access (user_id, email, admission_no, entered_text, status, method, note, admin_seen, reviewed_at)
  values (
    _uid, _email, norm, left(btrim(coalesce(_entered, '')), 60), result, 'format',
    case when taken then 'That admission number is already verified on another account.'
         when norm is null then 'The admission number did not match the expected format.' end,
    result = 'verified',
    case when result = 'verified' then now() end
  )
  on conflict (user_id) do update set
    email = excluded.email,
    admission_no = excluded.admission_no,
    entered_text = excluded.entered_text,
    status = excluded.status,
    note = excluded.note,
    admin_seen = excluded.admin_seen,
    reviewed_at = excluded.reviewed_at
  where public.student_access.status = 'pending';  -- verified stays verified; denied stays denied until the admin decides

  select status into result from public.student_access where user_id = _uid;
  return result;
end $$;

-- A signed-in user (typically one who came in with Google) enters their admission number once.
create or replace function public.submit_admission(_entered text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); mail text;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  select email into mail from auth.users where id = uid;
  return public._process_admission(uid, mail, _entered);
end $$;

-- Email sign-up carries the admission number in the sign-up form; check it the moment the account exists.
create or replace function public.handle_new_user_admission()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'admission_no', '') <> '' then
    begin
      perform public._process_admission(new.id, new.email, new.raw_user_meta_data ->> 'admission_no');
    exception when others then
      null; -- never block account creation; the student can enter the number again after signing in
    end;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_admission on auth.users;
create trigger on_auth_user_admission
  after insert on auth.users
  for each row execute function public.handle_new_user_admission();

-- Admin: approve or deny a request, or revoke a verified student.
create or replace function public.admin_review_student(_uid uuid, _approve boolean, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Administrator access required' using errcode = '42501'; end if;
  update public.student_access set
    status = case when _approve then 'verified' else 'denied' end,
    method = 'admin',
    note = coalesce(nullif(btrim(_note), ''), note),
    admin_seen = true,
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where user_id = _uid;
end $$;

-- Admin: open the notification list (marks every request as seen).
create or replace function public.admin_mark_requests_seen()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then return; end if;
  update public.student_access set admin_seen = true where admin_seen = false;
end $$;

-- Admin: add a student by hand (for example someone who emailed you), by their account email.
create or replace function public.admin_add_student(_email text, _admission text default null)
returns text language plpgsql security definer set search_path = public, auth as $$
declare uid uuid; norm text := public.normalize_admission(_admission);
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Administrator access required' using errcode = '42501'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(_email)) limit 1;
  if uid is null then return 'no-account'; end if;
  insert into public.student_access (user_id, email, admission_no, entered_text, status, method, admin_seen, reviewed_at, reviewed_by)
  values (uid, lower(btrim(_email)), norm, left(coalesce(_admission, ''), 60), 'verified', 'admin', true, now(), auth.uid())
  on conflict (user_id) do update set status = 'verified', method = 'admin', admin_seen = true, reviewed_at = now(), reviewed_by = auth.uid(),
    admission_no = coalesce(excluded.admission_no, public.student_access.admission_no);
  return 'ok';
end $$;

revoke all on function public._process_admission(uuid, text, text) from public, anon, authenticated;
revoke all on function public.handle_new_user_admission() from public, anon, authenticated;
revoke all on function public.submit_admission(text) from public, anon;
revoke all on function public.admin_review_student(uuid, boolean, text) from public, anon;
revoke all on function public.admin_mark_requests_seen() from public, anon;
revoke all on function public.admin_add_student(text, text) from public, anon;
revoke all on function public.my_student_status() from public, anon;
grant execute on function public.submit_admission(text) to authenticated;
grant execute on function public.admin_review_student(uuid, boolean, text) to authenticated;
grant execute on function public.admin_mark_requests_seen() to authenticated;
grant execute on function public.admin_add_student(text, text) to authenticated;
grant execute on function public.my_student_status() to authenticated;
grant execute on function public.is_mku_student(uuid) to authenticated;
grant execute on function public.normalize_admission(text) to authenticated;
