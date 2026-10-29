-- Friend Zone: live quiz rooms. A signed-in host makes a room from a topic, shares the code, friends (guests too) join with a nickname,
-- everyone answers the same questions against the clock and the scoreboard updates live (the screens poll zone_state every couple of seconds).
-- All tables are closed to the browser: every read and write goes through the functions below, so a player never receives a correct answer before answering.

create table if not exists public.zone_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null,
  title text not null default '',
  topic text not null default '',
  mode text not null default 'speed' check (mode in ('speed', 'marathon', 'sudden')),
  settings jsonb not null default '{}'::jsonb,
  ai jsonb,
  status text not null default 'lobby' check (status in ('lobby', 'running', 'done')),
  started_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.zone_questions (
  room_id uuid not null references public.zone_rooms(id) on delete cascade,
  idx int not null,
  q text not null,
  options jsonb not null,
  correct int not null,
  explanation text not null default '',
  ai_made boolean not null default false,
  kind text not null default 'mcq',
  primary key (room_id, idx)
);
alter table public.zone_questions add column if not exists kind text not null default 'mcq';
create table if not exists public.zone_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.zone_rooms(id) on delete cascade,
  token text not null,
  nick text not null,
  is_host boolean not null default false,
  score int not null default 0,
  correct_n int not null default 0,
  answered_n int not null default 0,
  lives int not null default 1,
  left_n int not null default 0,
  finished boolean not null default false,
  total_ms bigint not null default 0,
  joined_at timestamptz not null default now(),
  unique (room_id, token)
);
create table if not exists public.zone_answers (
  player_id uuid not null references public.zone_players(id) on delete cascade,
  seq int not null,
  idx int not null,
  choice int not null,
  ok boolean not null,
  ms int not null,
  primary key (player_id, seq)
);
create index if not exists zone_rooms_created_idx on public.zone_rooms (created_at);
alter table public.zone_rooms enable row level security;
alter table public.zone_questions enable row level security;
alter table public.zone_players enable row level security;
alter table public.zone_answers enable row level security;
revoke all on public.zone_rooms, public.zone_questions, public.zone_players, public.zone_answers from anon, authenticated;

-- a room's rules, with defaults
create or replace function public.zone_setting(p_room public.zone_rooms, p_key text, p_default numeric) returns numeric
language sql immutable as $$ select coalesce(nullif(p_room.settings ->> p_key, '')::numeric, p_default) $$;

-- the AI opponent is worked out from the clock: it "answers" one question every ai.delay ms and is right ai.acc of the time
create or replace function public.zone_ai_calc(p_room public.zone_rooms, p_n int)
returns table (score int, correct_n int, answered_n int, finished boolean)
language plpgsql stable as $$
declare
  a jsonb := p_room.ai;
  acc numeric; delay numeric; limit_ms numeric; elapsed numeric; cnt int; s int := 0; c int := 0; i int; lives int; ok boolean;
begin
  if a is null or p_room.started_at is null then return query select 0, 0, 0, false; return; end if;
  acc := coalesce((a ->> 'acc')::numeric, 0.6); delay := greatest(2000, coalesce((a ->> 'delay')::numeric, 9000));
  limit_ms := public.zone_setting(p_room, 'perQuestionSec', 20) * 1000;
  elapsed := extract(epoch from (least(now(), coalesce(p_room.ends_at, now())) - p_room.started_at)) * 1000;
  cnt := floor(elapsed / delay)::int;
  if p_room.mode = 'speed' then cnt := least(cnt, p_n); end if;
  lives := public.zone_setting(p_room, 'lives', 1)::int;
  for i in 0 .. cnt - 1 loop
    ok := (abs(hashtext(p_room.code || ':' || i)) % 100) < (acc * 100);
    if ok then
      c := c + 1;
      s := s + case when p_room.mode = 'speed' then 100 + floor(100 * greatest(0, limit_ms - least(delay, limit_ms)) / limit_ms)::int else 10 end;
    elsif p_room.mode = 'sudden' then
      lives := lives - 1;
      if lives <= 0 then return query select s, c, i + 1, true; return; end if;
    end if;
  end loop;
  return query select s, c, cnt, (p_room.mode = 'speed' and cnt >= p_n);
end $$;

create or replace function public.zone_new_code() returns text language plpgsql as $$
declare chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; k int;
begin
  loop
    c := 'ZONE-';
    for k in 1 .. 4 loop c := c || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
    exit when not exists (select 1 from public.zone_rooms where code = c);
  end loop;
  return c;
end $$;

-- the host (signed in) makes a room. p_questions: [{q, options:[..], correct, explanation, ai}]
create or replace function public.zone_create(p_title text, p_topic text, p_mode text, p_settings jsonb, p_ai jsonb, p_questions jsonb, p_nick text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); rid uuid; c text; n int; i int; q jsonb; r public.zone_rooms; lives int;
begin
  if uid is null then raise exception 'Sign in to host a room'; end if;
  if p_mode not in ('speed', 'marathon', 'sudden') then raise exception 'Unknown mode'; end if;
  if jsonb_typeof(p_questions) <> 'array' then raise exception 'No questions'; end if;
  n := jsonb_array_length(p_questions);
  if n < 3 or n > 80 then raise exception 'A room needs between 3 and 80 questions'; end if;
  if length(coalesce(p_token, '')) < 16 then raise exception 'Bad token'; end if;
  if (select count(*) from public.zone_rooms where host_id = uid and created_at > now() - interval '1 hour') >= 12 then raise exception 'Too many rooms this hour'; end if;
  c := public.zone_new_code();
  insert into public.zone_rooms (code, host_id, title, topic, mode, settings, ai) values (c, uid, left(coalesce(p_title, ''), 120), left(coalesce(p_topic, ''), 120), p_mode, coalesce(p_settings, '{}'::jsonb), p_ai)
    returning * into r;
  for i in 0 .. n - 1 loop
    q := p_questions -> i;
    if jsonb_typeof(q -> 'options') <> 'array' or jsonb_array_length(q -> 'options') < 2 or (q ->> 'correct')::int < 0 or (q ->> 'correct')::int >= jsonb_array_length(q -> 'options') then raise exception 'Bad question %', i + 1; end if;
    insert into public.zone_questions (room_id, idx, q, options, correct, explanation, ai_made, kind) values (r.id, i, left(q ->> 'q', 800), q -> 'options', (q ->> 'correct')::int, left(coalesce(q ->> 'explanation', ''), 1200), coalesce((q ->> 'ai')::boolean, false), left(coalesce(nullif(q ->> 'kind', ''), 'mcq'), 12));
  end loop;
  lives := case when p_mode = 'sudden' then public.zone_setting(r, 'lives', 1)::int else 99 end;
  insert into public.zone_players (room_id, token, nick, is_host, lives) values (r.id, p_token, left(coalesce(nullif(btrim(p_nick), ''), 'Host'), 24), true, lives);
  return jsonb_build_object('code', c);
end $$;

create or replace function public.zone_join(p_code text, p_nick text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms; pid uuid; lives int;
begin
  select * into r from public.zone_rooms where code = upper(btrim(p_code));
  if not found then raise exception 'No room with that code'; end if;
  if length(coalesce(p_token, '')) < 16 then raise exception 'Bad token'; end if;
  select id into pid from public.zone_players where room_id = r.id and token = p_token;
  if pid is not null then return jsonb_build_object('ok', true); end if;
  if r.status = 'done' then raise exception 'This room has finished'; end if;
  if r.status = 'running' and public.zone_setting(r, 'late', 0) = 0 then raise exception 'The game has already started'; end if;
  if (select count(*) from public.zone_players where room_id = r.id) >= 40 then raise exception 'The room is full'; end if;
  lives := case when r.mode = 'sudden' then public.zone_setting(r, 'lives', 1)::int else 99 end;
  insert into public.zone_players (room_id, token, nick, lives) values (r.id, p_token, left(coalesce(nullif(btrim(p_nick), ''), 'Player'), 24), lives);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.zone_start(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms; mins numeric; n int;
begin
  select r2.* into r from public.zone_rooms r2 join public.zone_players p on p.room_id = r2.id and p.token = p_token and p.is_host where r2.code = upper(btrim(p_code));
  if not found then raise exception 'Only the host can start the game'; end if;
  if r.status <> 'lobby' then return jsonb_build_object('ok', true); end if;
  mins := public.zone_setting(r, 'minutes', 0);
  select count(*) into n from public.zone_questions where room_id = r.id;
  update public.zone_rooms set status = 'running', started_at = now(),
    ends_at = case when r.mode = 'marathon' then now() + (greatest(1, mins) || ' minutes')::interval when mins > 0 then now() + (mins || ' minutes')::interval else null end
    where id = r.id;
  return jsonb_build_object('ok', true);
end $$;

-- everything a screen needs, in one call
create or replace function public.zone_state(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms; me public.zone_players; n int; players jsonb; ai record; host_nick text; unfinished int;
begin
  select * into r from public.zone_rooms where code = upper(btrim(p_code));
  if not found then raise exception 'No room with that code'; end if;
  select * into me from public.zone_players where room_id = r.id and token = p_token;
  select count(*) into n from public.zone_questions where room_id = r.id;
  -- time is up, or everyone is finished: close the room
  if r.status = 'running' then
    select count(*) into unfinished from public.zone_players where room_id = r.id and not finished;
    if (r.ends_at is not null and now() > r.ends_at) or unfinished = 0 then
      if r.ends_at is not null and now() > r.ends_at then update public.zone_players set finished = true where room_id = r.id and not finished; end if;
      update public.zone_rooms set status = 'done' where id = r.id and status = 'running';
      r.status := 'done';
    end if;
  end if;
  select nick into host_nick from public.zone_players where room_id = r.id and is_host;
  select * into ai from public.zone_ai_calc(r, n);
  select coalesce(jsonb_agg(x order by (x ->> 'score')::int desc, (x ->> 'ms')::bigint asc), '[]'::jsonb) into players from (
    select jsonb_build_object('id', p.id, 'nick', p.nick, 'score', p.score, 'correct', p.correct_n, 'answered', p.answered_n, 'finished', p.finished, 'left', p.left_n, 'lives', p.lives, 'host', p.is_host, 'ai', false, 'me', (me.id is not null and p.id = me.id), 'ms', p.total_ms) as x
      from public.zone_players p where p.room_id = r.id
    union all
    select jsonb_build_object('id', 'ai', 'nick', coalesce(r.ai ->> 'name', 'Ompath AI'), 'score', ai.score, 'correct', ai.correct_n, 'answered', ai.answered_n, 'finished', ai.finished or r.status = 'done', 'left', 0, 'lives', 0, 'host', false, 'ai', true, 'me', false, 'ms', 0) where r.ai is not null
  ) t;
  return jsonb_build_object(
    'now', (extract(epoch from now()) * 1000)::bigint,
    'room', jsonb_build_object('code', r.code, 'title', r.title, 'topic', r.topic, 'mode', r.mode, 'status', r.status, 'settings', r.settings, 'n', n, 'hasAi', r.ai is not null, 'host', host_nick,
      'startedAt', case when r.started_at is null then null else (extract(epoch from r.started_at) * 1000)::bigint end,
      'endsAt', case when r.ends_at is null then null else (extract(epoch from r.ends_at) * 1000)::bigint end),
    'players', players,
    'me', case when me.id is null then null else jsonb_build_object('id', me.id, 'nick', me.nick, 'host', me.is_host, 'answered', me.answered_n, 'score', me.score, 'lives', me.lives, 'finished', me.finished) end);
end $$;

-- the questions without their answers, only once the game is running
create or replace function public.zone_questions_for(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms;
begin
  select r2.* into r from public.zone_rooms r2 join public.zone_players p on p.room_id = r2.id and p.token = p_token where r2.code = upper(btrim(p_code));
  if not found then raise exception 'Join the room first'; end if;
  if r.status = 'lobby' then raise exception 'The game has not started'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('idx', idx, 'q', q, 'options', options, 'ai', ai_made, 'kind', kind) order by idx), '[]'::jsonb) from public.zone_questions where room_id = r.id);
end $$;

create or replace function public.zone_answer(p_code text, p_token text, p_seq int, p_choice int, p_ms int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms; p public.zone_players; qq public.zone_questions; n int; ok boolean; pts int := 0; limit_ms numeric; ms int; qi int; fin boolean := false;
begin
  select r2.* into r from public.zone_rooms r2 where r2.code = upper(btrim(p_code));
  if not found then raise exception 'No room'; end if;
  select * into p from public.zone_players where room_id = r.id and token = p_token for update;
  if not found then raise exception 'Join the room first'; end if;
  if r.status <> 'running' or p.finished then return jsonb_build_object('finished', true, 'score', p.score); end if;
  if r.ends_at is not null and now() > r.ends_at + interval '2 seconds' then update public.zone_players set finished = true where id = p.id; return jsonb_build_object('finished', true, 'score', p.score); end if;
  if p_seq <> p.answered_n then return jsonb_build_object('stale', true, 'answered', p.answered_n, 'score', p.score); end if;
  select count(*) into n from public.zone_questions where room_id = r.id;
  qi := p_seq % n;
  select * into qq from public.zone_questions where room_id = r.id and zone_questions.idx = qi;
  limit_ms := public.zone_setting(r, 'perQuestionSec', 20) * 1000;
  ms := least(greatest(coalesce(p_ms, 0), 300), (limit_ms * 1.2)::int);
  ok := (p_choice = qq.correct);
  if ok then pts := case when r.mode = 'speed' then 100 + floor(100 * greatest(0, limit_ms - ms) / limit_ms)::int else 10 end; end if;
  insert into public.zone_answers (player_id, seq, idx, choice, ok, ms) values (p.id, p_seq, qi, p_choice, ok, ms);
  update public.zone_players set score = score + pts, correct_n = correct_n + case when ok then 1 else 0 end, answered_n = answered_n + 1, total_ms = total_ms + ms,
    lives = case when r.mode = 'sudden' and not ok then lives - 1 else lives end where id = p.id returning * into p;
  if (r.mode = 'speed' and p.answered_n >= n) or (r.mode = 'sudden' and p.lives <= 0) then update public.zone_players set finished = true where id = p.id; fin := true; end if;
  return jsonb_build_object('ok', ok, 'correct', qq.correct, 'explanation', qq.explanation, 'score', p.score, 'lives', p.lives, 'finished', fin, 'answered', p.answered_n);
end $$;

-- the player left the screen (the host can see it; an assessment can end the attempt after a few times)
create or replace function public.zone_flag_left(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms; p public.zone_players; mx numeric;
begin
  select r2.* into r from public.zone_rooms r2 where r2.code = upper(btrim(p_code));
  if not found then return jsonb_build_object('ok', false); end if;
  update public.zone_players set left_n = left_n + 1 where room_id = r.id and token = p_token and r.status = 'running' and not finished returning * into p;
  mx := public.zone_setting(r, 'maxLeaves', 0);
  if p.id is not null and mx > 0 and p.left_n >= mx then update public.zone_players set finished = true where id = p.id; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.zone_finish_me(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.zone_players set finished = true where token = p_token and room_id = (select id from public.zone_rooms where code = upper(btrim(p_code)));
  return jsonb_build_object('ok', true);
end $$;

-- the host ends the game for everyone
create or replace function public.zone_end(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms;
begin
  select r2.* into r from public.zone_rooms r2 join public.zone_players p on p.room_id = r2.id and p.token = p_token and p.is_host where r2.code = upper(btrim(p_code));
  if not found then raise exception 'Only the host can end the game'; end if;
  update public.zone_players set finished = true where room_id = r.id;
  update public.zone_rooms set status = 'done', ends_at = coalesce(ends_at, now()) where id = r.id;
  return jsonb_build_object('ok', true);
end $$;

-- the full questions with answers, once the player (or the room) is finished
create or replace function public.zone_results(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms; p public.zone_players;
begin
  select * into r from public.zone_rooms where code = upper(btrim(p_code));
  if not found then raise exception 'No room'; end if;
  select * into p from public.zone_players where room_id = r.id and token = p_token;
  if not found then raise exception 'Join the room first'; end if;
  if r.status <> 'done' and not p.finished then raise exception 'Finish the game to see the answers'; end if;
  return jsonb_build_object(
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('idx', q.idx, 'q', q.q, 'options', q.options, 'correct', q.correct, 'explanation', q.explanation, 'ai', q.ai_made, 'kind', q.kind) order by q.idx), '[]'::jsonb) from public.zone_questions q where q.room_id = r.id),
    'mine', (select coalesce(jsonb_agg(jsonb_build_object('seq', a.seq, 'idx', a.idx, 'choice', a.choice, 'ok', a.ok, 'ms', a.ms) order by a.seq), '[]'::jsonb) from public.zone_answers a where a.player_id = p.id));
end $$;

do $$ declare f text; begin
  foreach f in array array['zone_join(text,text,text)', 'zone_start(text,text)', 'zone_state(text,text)', 'zone_questions_for(text,text)', 'zone_answer(text,text,int,int,int)', 'zone_flag_left(text,text)', 'zone_finish_me(text,text)', 'zone_results(text,text)', 'zone_end(text,text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  execute 'revoke all on function public.zone_create(text,text,text,jsonb,jsonb,jsonb,text,text) from public';
  execute 'grant execute on function public.zone_create(text,text,text,jsonb,jsonb,jsonb,text,text) to authenticated';
end $$;

-- rooms are kept for three days
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('zone-cleanup') where exists (select 1 from cron.job where jobname = 'zone-cleanup');
    perform cron.schedule('zone-cleanup', '17 3 * * *', $c$ delete from public.zone_rooms where created_at < now() - interval '3 days' $c$);
  end if;
exception when others then null;
end $$;
