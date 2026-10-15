-- ONE FILE: installs the contest platform and the notification tables it uses. Safe to run twice.
-- Built by scripts/imed/build-contest-sql.mjs from 16 migrations.

-- ===== 20260830050000_notification_campaigns.sql =====
CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
  action_url text,
  audience text NOT NULL DEFAULT 'all_users'
    CHECK (audience IN ('all_users', 'subscribers', 'study_year')),
  study_year integer CHECK (study_year BETWEEN 1 AND 6),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sending', 'sent', 'partial', 'failed')),
  recipient_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.notification_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  action_url text,
  read_at timestamptz,
  email_status text NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped')),
  email_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

drop policy if exists "admins manage notification campaigns" on public.notification_campaigns;

create policy "admins manage notification campaigns" on public.notification_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
drop policy if exists "users read own notifications" on public.user_notifications;
create policy "users read own notifications" on public.user_notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
drop policy if exists "users update own notifications" on public.user_notifications;
create policy "users update own notifications" on public.user_notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
drop policy if exists "admins read notifications" on public.user_notifications;
create policy "admins read notifications" on public.user_notifications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
drop policy if exists "users manage own notification preferences" on public.notification_preferences;
create policy "users manage own notification preferences" on public.notification_preferences
  FOR ALL TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_campaigns TO authenticated;
GRANT SELECT, UPDATE ON public.user_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_campaigns, public.user_notifications, public.notification_preferences TO service_role;

CREATE INDEX IF NOT EXISTS user_notifications_user_created_idx
  ON public.user_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_campaigns_created_idx
  ON public.notification_campaigns(created_at DESC);


-- ===== 20260910230500_contest_platform_foundation.sql =====
create table if not exists public.contest_universities (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  abbreviation text, active boolean not null default true, verified boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null,
  subtitle text not null default '', status text not null default 'concept' check (status in ('concept','registration','live','completed','cancelled')),
  subjects text[] not null default '{}', eligible_years integer[] not null default '{}', competition_format text not null default '',
  registration_opens_at timestamptz, registration_closes_at timestamptz, starts_at timestamptz,
  published boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (eligible_years <@ array[1,2,3,4,5,6])
);
create table if not exists public.contest_registrations (
  id uuid primary key default gen_random_uuid(), contest_id uuid not null references public.contests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, university_id uuid not null references public.contest_universities(id),
  study_year integer not null check (study_year between 1 and 6), representation text not null default 'individual' check (representation in ('individual','university_team')),
  status text not null default 'pending' check (status in ('pending','verified','rejected','withdrawn')), accepted_rules_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (contest_id, user_id)
);
create index if not exists contests_public_status_start_idx on public.contests (published, status, starts_at);
create index if not exists contest_registrations_user_idx on public.contest_registrations (user_id, contest_id);
create index if not exists contest_registrations_university_idx on public.contest_registrations (university_id, contest_id);
alter table public.contest_universities enable row level security;
alter table public.contests enable row level security;
alter table public.contest_registrations enable row level security;
revoke all on public.contest_universities from anon, authenticated;
revoke all on public.contests from anon, authenticated;
revoke all on public.contest_registrations from anon, authenticated;
grant select on public.contest_universities to anon, authenticated;
grant select on public.contests to anon, authenticated;
grant select, insert, update on public.contest_registrations to authenticated;
drop policy if exists "Active contest universities are public" on public.contest_universities;
create policy "Active contest universities are public" on public.contest_universities for select to anon, authenticated using (active = true or public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Published contests are public" on public.contests;
create policy "Published contests are public" on public.contests for select to anon, authenticated using (published = true or public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Participants can view own contest registrations" on public.contest_registrations;
create policy "Participants can view own contest registrations" on public.contest_registrations for select to authenticated using ((select auth.uid()) = user_id or public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Participants can register for an open contest" on public.contest_registrations;
create policy "Participants can register for an open contest" on public.contest_registrations for insert to authenticated with check (
  (select auth.uid()) = user_id and status = 'pending' and exists (
    select 1 from public.contests c where c.id = contest_id and c.published = true and c.status = 'registration'
      and (c.registration_opens_at is null or c.registration_opens_at <= now()) and (c.registration_closes_at is null or c.registration_closes_at > now())
  )
);
drop policy if exists "Participants can withdraw own pending registration" on public.contest_registrations;
create policy "Participants can withdraw own pending registration" on public.contest_registrations for update to authenticated
using ((select auth.uid()) = user_id and status = 'pending') with check ((select auth.uid()) = user_id and status in ('pending','withdrawn'));
drop policy if exists "Administrators manage contest universities" on public.contest_universities;
create policy "Administrators manage contest universities" on public.contest_universities for all to authenticated using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Administrators manage contests" on public.contests;
create policy "Administrators manage contests" on public.contests for all to authenticated using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Administrators manage contest registrations" on public.contest_registrations;
create policy "Administrators manage contest registrations" on public.contest_registrations for all to authenticated using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
insert into public.contest_universities (name, slug, abbreviation) values
 ('Mount Kenya University','mount-kenya-university','MKU'), ('University of Nairobi','university-of-nairobi','UoN'),
 ('Kenyatta University','kenyatta-university','KU'), ('Jomo Kenyatta University of Agriculture and Technology','jkuat','JKUAT'),
 ('Moi University','moi-university','MU'), ('Kenya Methodist University','kenya-methodist-university','KeMU'),
 ('Maseno University','maseno-university','MSU'), ('Egerton University','egerton-university','EU')
on conflict (slug) do update set name=excluded.name, abbreviation=excluded.abbreviation, updated_at=now();
insert into public.contests (slug,title,subtitle,status,subjects,eligible_years,competition_format,published)
values ('inter-university-medical-challenge','Inter-University Medical Challenge','A national knowledge arena for Kenya''s next generation of clinicians.','concept',array['Anatomy','Physiology','Pathology','Microbiology'],array[1,2,3],'Qualifiers → Semifinal → Grand final',true)
on conflict (slug) do update set title=excluded.title, subtitle=excluded.subtitle, subjects=excluded.subjects, eligible_years=excluded.eligible_years, competition_format=excluded.competition_format, updated_at=now();


-- ===== 20260910231500_optimize_contest_rls_policies.sql =====
drop policy if exists "Administrators manage contest universities" on public.contest_universities;
drop policy if exists "Administrators manage contests" on public.contests;
drop policy if exists "Administrators manage contest registrations" on public.contest_registrations;
drop policy if exists "Participants can register for an open contest" on public.contest_registrations;
drop policy if exists "Participants can withdraw own pending registration" on public.contest_registrations;

drop policy if exists "Administrators create contest universities" on public.contest_universities;

create policy "Administrators create contest universities" on public.contest_universities for insert to authenticated
with check (public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Administrators update contest universities" on public.contest_universities;
create policy "Administrators update contest universities" on public.contest_universities for update to authenticated
using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Administrators delete contest universities" on public.contest_universities;
create policy "Administrators delete contest universities" on public.contest_universities for delete to authenticated
using (public.has_role((select auth.uid()), 'admin'));

drop policy if exists "Administrators create contests" on public.contests;

create policy "Administrators create contests" on public.contests for insert to authenticated
with check (public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Administrators update contests" on public.contests;
create policy "Administrators update contests" on public.contests for update to authenticated
using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Administrators delete contests" on public.contests;
create policy "Administrators delete contests" on public.contests for delete to authenticated
using (public.has_role((select auth.uid()), 'admin'));

drop policy if exists "Participants register when open" on public.contest_registrations;

create policy "Participants register when open" on public.contest_registrations for insert to authenticated
with check (
  public.has_role((select auth.uid()), 'admin') or (
    (select auth.uid()) = user_id and status = 'pending' and exists (
      select 1 from public.contests c where c.id = contest_id and c.published = true and c.status = 'registration'
        and (c.registration_opens_at is null or c.registration_opens_at <= now())
        and (c.registration_closes_at is null or c.registration_closes_at > now())
    )
  )
);
drop policy if exists "Participants withdraw or admins update" on public.contest_registrations;
create policy "Participants withdraw or admins update" on public.contest_registrations for update to authenticated
using (public.has_role((select auth.uid()), 'admin') or ((select auth.uid()) = user_id and status = 'pending'))
with check (public.has_role((select auth.uid()), 'admin') or ((select auth.uid()) = user_id and status in ('pending','withdrawn')));
drop policy if exists "Administrators delete contest registrations" on public.contest_registrations;
create policy "Administrators delete contest registrations" on public.contest_registrations for delete to authenticated
using (public.has_role((select auth.uid()), 'admin'));


-- ===== 20260910234500_contest_live_round_foundation.sql =====
create schema if not exists private;

create table if not exists public.contest_rounds (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  title text not null,
  round_number integer not null check (round_number > 0),
  status text not null default 'scheduled' check (status in ('scheduled','lobby','live','closed','cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  duration_seconds integer not null default 1800 check (duration_seconds between 60 and 14400),
  question_count integer not null default 0 check (question_count >= 0),
  advancement_count integer check (advancement_count is null or advancement_count > 0),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contest_id, round_number),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.contest_questions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.contest_rounds(id) on delete cascade,
  position integer not null check (position > 0),
  stem text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8),
  snapshot_hash text not null,
  created_at timestamptz not null default now(),
  unique (round_id, position)
);

create table if not exists private.contest_answer_keys (
  question_id uuid primary key references public.contest_questions(id) on delete cascade,
  correct_index integer not null check (correct_index >= 0),
  explanation text,
  created_at timestamptz not null default now()
);

create table if not exists public.contest_attempts (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.contest_rounds(id) on delete cascade,
  registration_id uuid not null references public.contest_registrations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','submitted','eliminated','expired','void')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  eliminated_at timestamptz,
  score numeric(7,2),
  created_at timestamptz not null default now(),
  unique (round_id, user_id)
);

create table if not exists public.contest_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.contest_attempts(id) on delete cascade,
  question_id uuid not null references public.contest_questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  selected_index integer not null check (selected_index >= 0),
  response_ms integer check (response_ms is null or response_ms >= 0),
  submitted_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create table if not exists public.contest_integrity_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.contest_attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('tab_hidden','focus_lost','fullscreen_exit','copy_attempt','paste_attempt','context_menu','disconnected','reconnected')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create index if not exists contest_rounds_contest_idx on public.contest_rounds (contest_id, round_number);
create index if not exists contest_questions_round_idx on public.contest_questions (round_id, position);
create index if not exists contest_attempts_registration_idx on public.contest_attempts (registration_id);
create index if not exists contest_attempts_user_idx on public.contest_attempts (user_id, round_id);
create index if not exists contest_answers_question_idx on public.contest_answers (question_id);
create index if not exists contest_answers_user_idx on public.contest_answers (user_id, attempt_id);
create index if not exists contest_integrity_attempt_idx on public.contest_integrity_events (attempt_id, occurred_at);
create index if not exists contest_integrity_user_idx on public.contest_integrity_events (user_id, occurred_at);

alter table public.contest_rounds enable row level security;
alter table public.contest_questions enable row level security;
alter table public.contest_attempts enable row level security;
alter table public.contest_answers enable row level security;
alter table public.contest_integrity_events enable row level security;

revoke all on public.contest_rounds, public.contest_questions, public.contest_attempts, public.contest_answers, public.contest_integrity_events from anon, authenticated;
grant select on public.contest_rounds to anon, authenticated;
grant select on public.contest_questions to authenticated;
grant select, insert on public.contest_attempts, public.contest_answers, public.contest_integrity_events to authenticated;

revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

drop policy if exists "Published rounds are visible" on public.contest_rounds;

create policy "Published rounds are visible" on public.contest_rounds for select to anon, authenticated using (
  public.has_role((select auth.uid()), 'admin') or exists (
    select 1 from public.contests c where c.id = contest_id and c.published = true
  )
);
drop policy if exists "Administrators create contest rounds" on public.contest_rounds;
create policy "Administrators create contest rounds" on public.contest_rounds for insert to authenticated with check (public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Administrators update contest rounds" on public.contest_rounds;
create policy "Administrators update contest rounds" on public.contest_rounds for update to authenticated using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Administrators delete contest rounds" on public.contest_rounds;
create policy "Administrators delete contest rounds" on public.contest_rounds for delete to authenticated using (public.has_role((select auth.uid()), 'admin'));

drop policy if exists "Verified entrants see admitted questions" on public.contest_questions;

create policy "Verified entrants see admitted questions" on public.contest_questions for select to authenticated using (
  public.has_role((select auth.uid()), 'admin') or exists (
    select 1
    from public.contest_rounds r
    join public.contest_registrations cr on cr.contest_id = r.contest_id
    where r.id = round_id and r.status in ('lobby','live') and cr.user_id = (select auth.uid()) and cr.status = 'verified'
  )
);
drop policy if exists "Administrators create scheduled questions" on public.contest_questions;
create policy "Administrators create scheduled questions" on public.contest_questions for insert to authenticated with check (
  public.has_role((select auth.uid()), 'admin') and exists (select 1 from public.contest_rounds r where r.id = round_id and r.status = 'scheduled' and r.locked_at is null)
);
drop policy if exists "Administrators update scheduled questions" on public.contest_questions;
create policy "Administrators update scheduled questions" on public.contest_questions for update to authenticated using (
  public.has_role((select auth.uid()), 'admin') and exists (select 1 from public.contest_rounds r where r.id = round_id and r.status = 'scheduled' and r.locked_at is null)
) with check (
  public.has_role((select auth.uid()), 'admin') and exists (select 1 from public.contest_rounds r where r.id = round_id and r.status = 'scheduled' and r.locked_at is null)
);
drop policy if exists "Administrators delete scheduled questions" on public.contest_questions;
create policy "Administrators delete scheduled questions" on public.contest_questions for delete to authenticated using (
  public.has_role((select auth.uid()), 'admin') and exists (select 1 from public.contest_rounds r where r.id = round_id and r.status = 'scheduled' and r.locked_at is null)
);

drop policy if exists "Participants view own attempts" on public.contest_attempts;

create policy "Participants view own attempts" on public.contest_attempts for select to authenticated using ((select auth.uid()) = user_id or public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Verified participants start live attempts" on public.contest_attempts;
create policy "Verified participants start live attempts" on public.contest_attempts for insert to authenticated with check (
  public.has_role((select auth.uid()), 'admin') or (
    (select auth.uid()) = user_id and status = 'active' and exists (
      select 1 from public.contest_rounds r
      join public.contest_registrations cr on cr.contest_id = r.contest_id
      where r.id = round_id and cr.id = registration_id and cr.user_id = (select auth.uid()) and cr.status = 'verified'
        and r.status = 'live' and (r.starts_at is null or r.starts_at <= now()) and (r.ends_at is null or r.ends_at > now())
    )
  )
);

drop policy if exists "Participants view own answers" on public.contest_answers;

create policy "Participants view own answers" on public.contest_answers for select to authenticated using ((select auth.uid()) = user_id or public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Participants submit one live answer" on public.contest_answers;
create policy "Participants submit one live answer" on public.contest_answers for insert to authenticated with check (
  public.has_role((select auth.uid()), 'admin') or (
    (select auth.uid()) = user_id and exists (
      select 1 from public.contest_attempts a
      join public.contest_rounds r on r.id = a.round_id
      join public.contest_questions q on q.round_id = r.id
      where a.id = attempt_id and a.user_id = (select auth.uid()) and a.status = 'active' and q.id = question_id
        and r.status = 'live' and (r.starts_at is null or r.starts_at <= now()) and (r.ends_at is null or r.ends_at > now())
    )
  )
);

drop policy if exists "Participants and admins view integrity events" on public.contest_integrity_events;

create policy "Participants and admins view integrity events" on public.contest_integrity_events for select to authenticated using ((select auth.uid()) = user_id or public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Participants log own active attempt events" on public.contest_integrity_events;
create policy "Participants log own active attempt events" on public.contest_integrity_events for insert to authenticated with check (
  public.has_role((select auth.uid()), 'admin') or (
    (select auth.uid()) = user_id and exists (
      select 1 from public.contest_attempts a where a.id = attempt_id and a.user_id = (select auth.uid()) and a.status = 'active'
    )
  )
);

insert into public.contest_rounds (contest_id, title, round_number, status, duration_seconds)
select id, 'National Qualifier', 1, 'scheduled', 1800
from public.contests where slug = 'inter-university-medical-challenge'
on conflict (contest_id, round_number) do nothing;


-- ===== 20260910235000_contest_moderator_table_grants.sql =====
grant insert, update, delete on public.contest_rounds to authenticated;
grant insert, update, delete on public.contest_questions to authenticated;


-- ===== 20260910241500_contest_question_import_and_scoring.sql =====
create or replace function public.admin_replace_contest_questions(p_round_id uuid, p_questions jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  question_id uuid;
  item_count integer := 0;
  option_count integer;
  answer_index integer;
begin
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) < 1 or jsonb_array_length(p_questions) > 200 then
    raise exception 'Question bank must contain between 1 and 200 questions';
  end if;
  if not exists (select 1 from public.contest_rounds where id = p_round_id and status = 'scheduled' and locked_at is null) then
    raise exception 'Only an unlocked scheduled round can be edited';
  end if;

  delete from public.contest_questions where round_id = p_round_id;
  for item in select value from jsonb_array_elements(p_questions)
  loop
    option_count := jsonb_array_length(item->'options');
    answer_index := (item->>'correctIndex')::integer;
    if length(trim(item->>'stem')) < 5 or jsonb_typeof(item->'options') <> 'array' or option_count < 2 or option_count > 8
      or answer_index < 0 or answer_index >= option_count then
      raise exception 'Invalid question at position %', item_count + 1;
    end if;
    question_id := gen_random_uuid();
    insert into public.contest_questions (id, round_id, position, stem, options, snapshot_hash)
    values (question_id, p_round_id, item_count + 1, trim(item->>'stem'), item->'options',
      encode(extensions.digest(convert_to((jsonb_build_object('stem', trim(item->>'stem'), 'options', item->'options'))::text, 'UTF8'), 'sha256'), 'hex'));
    insert into private.contest_answer_keys (question_id, correct_index, explanation)
    values (question_id, answer_index, nullif(trim(item->>'explanation'), ''));
    item_count := item_count + 1;
  end loop;
  update public.contest_rounds set question_count = item_count, updated_at = now() where id = p_round_id;
  return item_count;
end;
$$;

create or replace function public.score_contest_attempt(p_attempt_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  result numeric;
begin
  select case when count(q.id) = 0 then 0 else round(100.0 * count(*) filter (where a.selected_index = k.correct_index) / count(q.id), 2) end
  into result
  from public.contest_attempts ca
  join public.contest_questions q on q.round_id = ca.round_id
  left join public.contest_answers a on a.attempt_id = ca.id and a.question_id = q.id
  join private.contest_answer_keys k on k.question_id = q.id
  where ca.id = p_attempt_id;

  update public.contest_attempts set status = 'submitted', submitted_at = now(), score = result
  where id = p_attempt_id and status = 'active';
  if not found then raise exception 'Attempt is not active'; end if;
  return result;
end;
$$;

revoke all on function public.admin_replace_contest_questions(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.score_contest_attempt(uuid) from public, anon, authenticated;
grant execute on function public.admin_replace_contest_questions(uuid, jsonb) to service_role;
grant execute on function public.score_contest_attempt(uuid) to service_role;


-- ===== 20260910244500_contest_operations_and_leaderboards.sql =====
alter table public.contest_rounds add column if not exists tab_switch_limit integer not null default 2 check (tab_switch_limit between 1 and 20);
alter table public.contest_rounds add column if not exists focus_loss_limit integer not null default 3 check (focus_loss_limit between 1 and 30);
alter table public.contest_rounds add column if not exists auto_eliminate boolean not null default false;
alter table public.contest_rounds add column if not exists integrity_policy text not null default 'Integrity events are logged and reviewed by a moderator. Automatic elimination is used only when explicitly enabled for the round.';

create table if not exists public.contest_university_results (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  round_id uuid not null references public.contest_rounds(id) on delete cascade,
  university_id uuid not null references public.contest_universities(id) on delete cascade,
  rank integer not null check (rank > 0),
  participant_count integer not null check (participant_count > 0),
  average_score numeric(7,2) not null,
  total_points numeric(10,2) not null,
  published boolean not null default false,
  published_at timestamptz not null default now(),
  unique (round_id, university_id)
);
create index if not exists contest_results_contest_rank_idx on public.contest_university_results (contest_id, rank);
create index if not exists contest_results_round_idx on public.contest_university_results (round_id, rank);
create index if not exists contest_results_university_idx on public.contest_university_results (university_id);
alter table public.contest_university_results enable row level security;
revoke all on public.contest_university_results from anon, authenticated;
grant select on public.contest_university_results to anon, authenticated;
drop policy if exists "Published university contest results are public" on public.contest_university_results;
create policy "Published university contest results are public" on public.contest_university_results for select to anon, authenticated using (
  public.has_role((select auth.uid()), 'admin') or published = true
);

revoke insert on public.contest_integrity_events from authenticated;
drop policy if exists "Participants log own active attempt events" on public.contest_integrity_events;


-- ===== 20260910251500_contest_rehearsal_and_advancement.sql =====
create table if not exists public.contest_advancements (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  registration_id uuid not null references public.contest_registrations(id) on delete cascade,
  source_round_id uuid not null references public.contest_rounds(id) on delete cascade,
  target_round_id uuid references public.contest_rounds(id) on delete set null,
  decision text not null check (decision in ('advanced','eliminated','wildcard')),
  reason text not null check (length(trim(reason)) between 3 and 500),
  decided_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_id, source_round_id)
);

create table if not exists public.contest_moderator_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  action_type text not null check (action_type in ('attempt_override','advancement_decision')),
  target_type text not null check (target_type in ('contest_attempt','contest_registration')),
  target_id uuid not null,
  reason text not null check (length(trim(reason)) between 3 and 500),
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists contest_advancements_registration_idx on public.contest_advancements (registration_id, source_round_id);
create index if not exists contest_advancements_contest_idx on public.contest_advancements (contest_id, created_at desc);
create index if not exists contest_advancements_source_round_idx on public.contest_advancements (source_round_id);
create index if not exists contest_advancements_target_round_idx on public.contest_advancements (target_round_id) where target_round_id is not null;
create index if not exists contest_advancements_decided_by_idx on public.contest_advancements (decided_by);
create index if not exists contest_moderator_actions_target_idx on public.contest_moderator_actions (target_type, target_id, created_at desc);
create index if not exists contest_moderator_actions_actor_idx on public.contest_moderator_actions (actor_id, created_at desc);

alter table public.contest_advancements enable row level security;
alter table public.contest_moderator_actions enable row level security;

revoke all on public.contest_advancements, public.contest_moderator_actions from anon, authenticated;
grant select on public.contest_advancements, public.contest_moderator_actions to authenticated;

drop policy if exists "Participants view own advancement" on public.contest_advancements;

create policy "Participants view own advancement" on public.contest_advancements for select to authenticated using (
  public.has_role((select auth.uid()), 'admin') or exists (
    select 1 from public.contest_registrations cr
    where cr.id = registration_id and cr.user_id = (select auth.uid())
  )
);

drop policy if exists "Administrators view moderator audit" on public.contest_moderator_actions;

create policy "Administrators view moderator audit" on public.contest_moderator_actions for select to authenticated using (
  public.has_role((select auth.uid()), 'admin')
);


-- ===== 20260911001000_contest_appeals.sql =====
create table if not exists public.contest_appeals (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  registration_id uuid not null references public.contest_registrations(id) on delete cascade,
  attempt_id uuid references public.contest_attempts(id) on delete set null,
  advancement_id uuid references public.contest_advancements(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('integrity','score','advancement','technical')),
  statement text not null check (length(trim(statement)) between 20 and 2000),
  status text not null default 'open' check (status in ('open','reviewing','upheld','overturned','dismissed')),
  resolution text check (resolution is null or length(trim(resolution)) between 10 and 2000),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(attempt_id, advancement_id) = 1)
);
create unique index if not exists contest_appeals_open_target_idx on public.contest_appeals (user_id, coalesce(attempt_id, advancement_id)) where status in ('open','reviewing');
create index if not exists contest_appeals_contest_status_idx on public.contest_appeals (contest_id, status, created_at);
create index if not exists contest_appeals_registration_idx on public.contest_appeals (registration_id);
create index if not exists contest_appeals_attempt_idx on public.contest_appeals (attempt_id) where attempt_id is not null;
create index if not exists contest_appeals_advancement_idx on public.contest_appeals (advancement_id) where advancement_id is not null;
create index if not exists contest_appeals_resolved_by_idx on public.contest_appeals (resolved_by) where resolved_by is not null;
alter table public.contest_appeals enable row level security;
revoke all on public.contest_appeals from anon, authenticated;
grant select on public.contest_appeals to authenticated;
drop policy if exists "Participants view own appeals" on public.contest_appeals;
create policy "Participants view own appeals" on public.contest_appeals for select to authenticated using (
  (select auth.uid()) = user_id or public.has_role((select auth.uid()), 'admin')
);

alter table public.contest_moderator_actions drop constraint if exists contest_moderator_actions_action_type_check;
alter table public.contest_moderator_actions drop constraint if exists contest_moderator_actions_action_type_check;
alter table public.contest_moderator_actions add constraint contest_moderator_actions_action_type_check check (action_type in ('attempt_override','advancement_decision','appeal_resolution'));
alter table public.contest_moderator_actions drop constraint if exists contest_moderator_actions_target_type_check;
alter table public.contest_moderator_actions drop constraint if exists contest_moderator_actions_target_type_check;
alter table public.contest_moderator_actions add constraint contest_moderator_actions_target_type_check check (target_type in ('contest_attempt','contest_registration','contest_appeal'));


-- ===== 20260914070000_link_contest_rounds_to_exam_papers.sql =====
alter table public.contest_rounds
  add column if not exists source_mcq_set_id uuid references public.mcq_sets(id) on delete set null,
  add column if not exists source_exam_title text;

comment on column public.contest_rounds.source_mcq_set_id is
  'Published MCQ paper selected by an administrator as the source for this round.';

comment on column public.contest_rounds.source_exam_title is
  'Snapshot of the selected exam title retained for contest administration and audit.';

create index if not exists contest_rounds_source_mcq_set_id_idx
  on public.contest_rounds(source_mcq_set_id)
  where source_mcq_set_id is not null;


-- ===== 20260914080000_add_contest_share_image.sql =====
alter table public.contests add column if not exists share_image_url text;
comment on column public.contests.share_image_url is 'Public HTTPS image used for contest cards and social sharing previews.';
update public.contests set share_image_url = 'https://www.ompathstudy.com/assets/ompath-logo-DD7-AL6w.png' where slug = 'hematology-live-contest-demo' and share_image_url is null;


-- ===== 20260914093000_contest_readiness_automation.sql =====
alter table public.contest_rounds
  add column if not exists auto_open boolean not null default true,
  add column if not exists auto_close boolean not null default true,
  add column if not exists entry_grace_minutes integer not null default 10 check (entry_grace_minutes between 0 and 60),
  add column if not exists results_visible boolean not null default false;

alter table public.notification_campaigns drop constraint if exists notification_campaigns_audience_check;
alter table public.notification_campaigns drop constraint if exists notification_campaigns_audience_check;
alter table public.notification_campaigns add constraint notification_campaigns_audience_check
check (audience in ('all_users','subscribers','study_year','contest'));

create table if not exists private.contest_reminder_log (
  contest_id uuid not null references public.contests(id) on delete cascade,
  event_key text not null,
  created_at timestamptz not null default now(),
  primary key (contest_id, event_key)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contest-posters', 'contest-posters', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public reads contest posters" on storage.objects;
create policy "Public reads contest posters" on storage.objects for select to public
using (bucket_id = 'contest-posters');
drop policy if exists "Admins upload contest posters" on storage.objects;
create policy "Admins upload contest posters" on storage.objects for insert to authenticated
with check (bucket_id = 'contest-posters' and public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Admins update contest posters" on storage.objects;
create policy "Admins update contest posters" on storage.objects for update to authenticated
using (bucket_id = 'contest-posters' and public.has_role((select auth.uid()), 'admin'))
with check (bucket_id = 'contest-posters' and public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Admins delete contest posters" on storage.objects;
create policy "Admins delete contest posters" on storage.objects for delete to authenticated
using (bucket_id = 'contest-posters' and public.has_role((select auth.uid()), 'admin'));

create or replace function private.sync_contest_schedule()
returns void language plpgsql security invoker set search_path = '' as $$
declare expired_attempt record;
begin
  update public.contest_rounds
  set status = 'live', locked_at = coalesce(locked_at, now()), updated_at = now()
  where auto_open and status in ('scheduled','lobby') and question_count > 0
    and starts_at is not null and starts_at <= now() and (ends_at is null or ends_at > now());

  update public.contest_rounds
  set status = 'closed', updated_at = now()
  where auto_close and status = 'live' and ends_at is not null and ends_at <= now();

  for expired_attempt in
    select a.id from public.contest_attempts a join public.contest_rounds r on r.id = a.round_id
    where a.status = 'active' and r.ends_at is not null and r.ends_at <= now()
  loop
    perform public.score_contest_attempt(expired_attempt.id);
  end loop;

  update public.contests c set status = 'live', updated_at = now()
  where status in ('concept','registration') and exists (select 1 from public.contest_rounds r where r.contest_id = c.id and r.status = 'live');

  update public.contests c set status = 'completed', updated_at = now()
  where status = 'live' and not exists (select 1 from public.contest_rounds r where r.contest_id = c.id and r.status in ('scheduled','lobby','live'));
end;
$$;

create or replace function private.queue_contest_reminders()
returns void language plpgsql security invoker set search_path = '' as $$
declare item record; campaign_id uuid; actor_id uuid;
begin
  select user_id into actor_id from public.user_roles where role = 'admin' order by id limit 1;
  if actor_id is null then return; end if;
  for item in
    select c.id, c.slug, c.title, r.starts_at,
      case when r.starts_at <= now() then 'live'
           when r.starts_at <= now() + interval '1 hour' then 'one-hour'
           else 'twenty-four-hour' end as event_key
    from public.contests c join public.contest_rounds r on r.contest_id = c.id
    where c.published and r.status in ('scheduled','lobby','live') and r.starts_at is not null
      and r.starts_at <= now() + interval '24 hours'
      and not exists (select 1 from private.contest_reminder_log l where l.contest_id = c.id and l.event_key = case when r.starts_at <= now() then 'live' when r.starts_at <= now() + interval '1 hour' then 'one-hour' else 'twenty-four-hour' end)
  loop
    insert into private.contest_reminder_log(contest_id,event_key) values(item.id,item.event_key) on conflict do nothing;
    insert into public.notification_campaigns(title,message,action_url,audience,status,recipient_count,created_by,sent_at)
    values(item.title || case item.event_key when 'live' then ' is now live' when 'one-hour' then ' starts in one hour' else ' starts tomorrow' end,
      case item.event_key when 'live' then 'The contest is open. Enter the secure lobby now.' when 'one-hour' then 'Prepare your device and connection. The contest starts in one hour.' else 'Your registered contest begins within 24 hours.' end,
      'https://www.ompathstudy.com/contests/' || item.slug || '/lobby','contest','partial',
      (select count(*) from public.contest_registrations where contest_id=item.id and status in ('pending','verified')),actor_id,now()) returning id into campaign_id;
    insert into public.user_notifications(campaign_id,user_id,title,message,action_url,email_status)
    select campaign_id,cr.user_id,item.title || case item.event_key when 'live' then ' is now live' when 'one-hour' then ' starts in one hour' else ' starts tomorrow' end,
      case item.event_key when 'live' then 'The contest is open. Enter the secure lobby now.' when 'one-hour' then 'Prepare your device and connection. The contest starts in one hour.' else 'Your registered contest begins within 24 hours.' end,
      'https://www.ompathstudy.com/contests/' || item.slug || '/lobby','skipped'
    from public.contest_registrations cr where cr.contest_id=item.id and cr.status in ('pending','verified') on conflict do nothing;
  end loop;
end;
$$;

revoke all on function private.sync_contest_schedule() from public, anon, authenticated;
grant execute on function private.sync_contest_schedule() to postgres, service_role;
revoke all on function private.queue_contest_reminders() from public, anon, authenticated;
grant execute on function private.queue_contest_reminders() to postgres, service_role;

do $$
begin
  begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron is not available: contest reminders will not be scheduled'; end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'sync-contest-schedule';
    perform cron.schedule('sync-contest-schedule', '* * * * *', 'select private.sync_contest_schedule();');
    perform cron.unschedule(jobid) from cron.job where jobname = 'queue-contest-reminders';
    perform cron.schedule('queue-contest-reminders', '* * * * *', 'select private.queue_contest_reminders();');
  end if;
end $$;

drop policy if exists "Verified participants start live attempts" on public.contest_attempts;
create policy "Verified participants start live attempts" on public.contest_attempts for insert to authenticated with check (
  public.has_role((select auth.uid()), 'admin') or (
    (select auth.uid()) = user_id and status = 'active' and exists (
      select 1 from public.contest_rounds r join public.contest_registrations cr on cr.contest_id = r.contest_id
      where r.id = round_id and cr.id = registration_id and cr.user_id = (select auth.uid()) and cr.status = 'verified'
        and r.status = 'live' and r.starts_at <= now() and now() <= r.starts_at + make_interval(mins => r.entry_grace_minutes)
        and (r.ends_at is null or r.ends_at > now())
    )
  )
);

create index if not exists contest_rounds_automatic_schedule_idx
on public.contest_rounds (status, starts_at, ends_at) where auto_open or auto_close;


-- ===== 20260914094500_contest_registration_notifications.sql =====
create or replace function private.notify_contest_registration()
returns trigger language plpgsql security definer set search_path = '' as $$
declare campaign_id uuid; actor_id uuid; contest_row record; notice_title text; notice_message text;
begin
  select user_id into actor_id from public.user_roles where role='admin' order by id limit 1;
  select title,slug into contest_row from public.contests where id=new.contest_id;
  if actor_id is null or contest_row is null then return new; end if;
  if tg_op='INSERT' then
    notice_title := 'Contest registration received'; notice_message := 'Your registration for ' || contest_row.title || ' was received and is awaiting verification.';
  elsif old.status is distinct from new.status and new.status='verified' then
    notice_title := 'Contest entry verified'; notice_message := 'Your entry for ' || contest_row.title || ' is verified. Open the lobby to review the schedule.';
  else return new;
  end if;
  insert into public.notification_campaigns(title,message,action_url,audience,status,recipient_count,created_by,sent_at)
  values(notice_title,notice_message,'https://www.ompathstudy.com/contests/' || contest_row.slug || '/lobby','contest','partial',1,actor_id,now()) returning id into campaign_id;
  insert into public.user_notifications(campaign_id,user_id,title,message,action_url,email_status)
  values(campaign_id,new.user_id,notice_title,notice_message,'https://www.ompathstudy.com/contests/' || contest_row.slug || '/lobby','skipped');
  return new;
end;
$$;

drop trigger if exists contest_registration_notification on public.contest_registrations;
drop trigger if exists contest_registration_notification on public.contest_registrations;
create trigger contest_registration_notification after insert or update of status on public.contest_registrations
for each row execute function private.notify_contest_registration();

revoke all on function private.notify_contest_registration() from public, anon, authenticated;


-- ===== 20260914102000_contest_university_proposals.sql =====
alter table public.contest_universities
  add column if not exists proposed_by uuid references auth.users(id) on delete set null;

create index if not exists contest_universities_proposed_by_idx
  on public.contest_universities (proposed_by)
  where proposed_by is not null;

drop policy if exists "Participants view own proposed universities" on public.contest_universities;
create policy "Participants view own proposed universities"
  on public.contest_universities
  for select
  to authenticated
  using ((select auth.uid()) = proposed_by);


-- ===== 20260914113000_contest_matchups_and_three_strikes.sql =====
alter table public.contest_rounds
  add column if not exists university_a_id uuid references public.contest_universities(id) on delete set null,
  add column if not exists university_b_id uuid references public.contest_universities(id) on delete set null;

alter table public.contest_rounds
  drop constraint if exists contest_rounds_distinct_universities;
alter table public.contest_rounds drop constraint if exists contest_rounds_distinct_universities;
alter table public.contest_rounds add constraint contest_rounds_distinct_universities
  check (university_a_id is null or university_b_id is null or university_a_id <> university_b_id);

update public.contest_rounds
set tab_switch_limit = 3,
    focus_loss_limit = 3,
    auto_eliminate = true,
    updated_at = now()
where tab_switch_limit <> 3 or focus_loss_limit <> 3 or auto_eliminate is not true;

create index if not exists contest_rounds_university_a_idx on public.contest_rounds (university_a_id);
create index if not exists contest_rounds_university_b_idx on public.contest_rounds (university_b_id);


-- ===== 20260914124500_contest_advanced_competition.sql =====
alter table public.contests
  add column if not exists max_participants_per_university integer not null default 50 check (max_participants_per_university between 1 and 1000);

alter table public.contest_registrations
  add column if not exists team_name text,
  add column if not exists team_role text not null default 'member' check (team_role in ('captain','member'));

alter table public.contest_rounds
  add column if not exists shuffle_questions boolean not null default true,
  add column if not exists marks_correct numeric(6,2) not null default 1 check (marks_correct > 0),
  add column if not exists marks_incorrect numeric(6,2) not null default 0 check (marks_incorrect between -10 and 0);

create index if not exists contest_registrations_team_idx
  on public.contest_registrations (contest_id, university_id, team_name)
  where representation = 'university_team';

create or replace function public.score_contest_attempt(p_attempt_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  result numeric;
begin
  select case when count(q.id) = 0 then 0 else greatest(0, round(100.0 * (
    count(*) filter (where a.selected_index = k.correct_index) * r.marks_correct
    + count(*) filter (where a.selected_index is not null and a.selected_index <> k.correct_index) * r.marks_incorrect
  ) / (count(q.id) * r.marks_correct), 2)) end
  into result
  from public.contest_attempts ca
  join public.contest_rounds r on r.id = ca.round_id
  join public.contest_questions q on q.round_id = ca.round_id
  left join public.contest_answers a on a.attempt_id = ca.id and a.question_id = q.id
  join private.contest_answer_keys k on k.question_id = q.id
  where ca.id = p_attempt_id
  group by r.marks_correct, r.marks_incorrect;

  update public.contest_attempts set status = 'submitted', submitted_at = now(), score = coalesce(result, 0)
  where id = p_attempt_id and status = 'active';
  if not found then raise exception 'Attempt is not active'; end if;
  return coalesce(result, 0);
end;
$$;

revoke all on function public.score_contest_attempt(uuid) from public, anon, authenticated;
grant execute on function public.score_contest_attempt(uuid) to service_role;



-- Sample universities so the registration form has something to choose from (an admin can edit or remove them in Admin > Contests).
insert into public.contest_universities (name, slug, abbreviation, active, verified)
select v.name, v.slug, v.abbr, true, true from (values ('University of Nairobi', 'university-of-nairobi', 'UoN'), ('Kenyatta University', 'kenyatta-university', 'KU'), ('Mount Kenya University', 'mount-kenya-university', 'MKU')) as v(name, slug, abbr)
where not exists (select 1 from public.contest_universities u where u.slug = v.slug);
