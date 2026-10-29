-- Friend Zone v2: everyone starts on the same server instant (a countdown), "live" rooms where every player sees the same question at the same time,
-- records kept in the account of every signed-in player, a public peek for the share card, pictures in questions, and no waiting for the answer key.

alter table public.zone_questions add column if not exists image text not null default '';
alter table public.zone_players add column if not exists user_id uuid;
create index if not exists zone_players_room_idx on public.zone_players (room_id);
create index if not exists zone_players_user_idx on public.zone_players (user_id) where user_id is not null;

create table if not exists public.zone_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  room_code text not null,
  title text not null default '',
  topic text not null default '',
  game text not null default 'quiz',
  mode text not null default 'speed',
  score int not null default 0,
  rank int not null default 1,
  players int not null default 1,
  correct_n int not null default 0,
  answered_n int not null default 0,
  total int not null default 0,
  opponents text[] not null default '{}',
  played_at timestamptz not null default now(),
  unique (user_id, room_code)
);
create index if not exists zone_history_user_idx on public.zone_history (user_id, played_at desc);
alter table public.zone_history enable row level security;
revoke all on public.zone_history from anon, authenticated;

-- live rooms: every player gets the same question at the same moment (the clock decides, not the players)
create or replace function public.zone_slot_ms(p_room public.zone_rooms) returns numeric
language sql immutable as $$ select (public.zone_setting(p_room, 'perQuestionSec', 20) + 5) * 1000 $$;
create or replace function public.zone_is_live(p_room public.zone_rooms) returns boolean
language sql immutable as $$ select coalesce(p_room.settings ->> 'pace', '') = 'live' and p_room.mode in ('speed', 'sudden') $$;

-- the AI opponent, from the clock (only when the host added one)
create or replace function public.zone_ai_calc(p_room public.zone_rooms, p_n int)
returns table (score int, correct_n int, answered_n int, finished boolean)
language plpgsql stable as $$
declare
  a jsonb := p_room.ai;
  acc numeric; delay numeric; limit_ms numeric; slot numeric; elapsed numeric; cnt int; s int := 0; c int := 0; i int; lives int; ok boolean; live boolean := public.zone_is_live(p_room);
begin
  if a is null or p_room.started_at is null then return query select 0, 0, 0, false; return; end if;
  acc := coalesce((a ->> 'acc')::numeric, 0.6); delay := greatest(2000, coalesce((a ->> 'delay')::numeric, 9000));
  limit_ms := public.zone_setting(p_room, 'perQuestionSec', 20) * 1000;
  slot := public.zone_slot_ms(p_room);
  elapsed := greatest(0, extract(epoch from (least(now(), coalesce(p_room.ends_at, now())) - p_room.started_at)) * 1000);
  if live then
    cnt := least(p_n, greatest(0, floor((elapsed - least(delay, limit_ms)) / slot)::int + 1));
  else
    cnt := floor(elapsed / delay)::int;
    if p_room.mode = 'speed' then cnt := least(cnt, p_n); end if;
  end if;
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
  return query select s, c, cnt, ((p_room.mode = 'speed' or live) and cnt >= p_n);
end $$;

-- a finished room: close it once, and write the result into the account of every signed-in player
create or replace function public.zone_finish_room(p_rid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms; n int;
begin
  update public.zone_rooms set status = 'done' where id = p_rid and status <> 'done' returning * into r;
  if not found then return; end if;
  update public.zone_players set finished = true where room_id = p_rid and not finished;
  select count(*) into n from public.zone_questions where room_id = p_rid;
  with ranked as (
    select p.*, row_number() over (order by p.score desc, p.total_ms asc) as rk, count(*) over () as cnt from public.zone_players p where p.room_id = p_rid
  )
  insert into public.zone_history (user_id, room_code, title, topic, game, mode, score, rank, players, correct_n, answered_n, total, opponents)
  select p.user_id, r.code, r.title, r.topic, coalesce(nullif(r.settings ->> 'game', ''), 'quiz'), r.mode, p.score, p.rk::int, p.cnt::int, p.correct_n, p.answered_n, n,
    coalesce((select array_agg(o.nick) from (select o2.nick from public.zone_players o2 where o2.room_id = p_rid and o2.id <> p.id order by o2.score desc limit 6) o), '{}')
  from ranked p where p.user_id is not null
  on conflict (user_id, room_code) do nothing;
end $$;

-- live sudden death: a life is lost for a wrong answer and for a question left unanswered
create or replace function public.zone_sync_lives(p_room public.zone_rooms, p_n int) returns void
language plpgsql security definer set search_path = public as $$
declare slot numeric := public.zone_slot_ms(p_room); limit_ms numeric := public.zone_setting(p_room, 'perQuestionSec', 20) * 1000; elapsed numeric; past int; l0 int := public.zone_setting(p_room, 'lives', 1)::int;
begin
  if p_room.started_at is null or now() < p_room.started_at then return; end if;
  elapsed := extract(epoch from (now() - p_room.started_at)) * 1000;
  past := greatest(0, least(p_n, floor((elapsed - limit_ms) / slot)::int + 1));
  update public.zone_players p set lives = greatest(0, l0 - (select count(*) from public.zone_answers a where a.player_id = p.id and not a.ok)
      - greatest(0, past - (select count(*) from public.zone_answers a where a.player_id = p.id and a.seq < past)))
    where p.room_id = p_room.id and not p.finished;
  update public.zone_players set finished = true where room_id = p_room.id and not finished and lives <= 0;
end $$;

create or replace function public.zone_create(p_title text, p_topic text, p_mode text, p_settings jsonb, p_ai jsonb, p_questions jsonb, p_nick text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text; n int; i int; q jsonb; r public.zone_rooms; lives int;
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
  insert into public.zone_questions (room_id, idx, q, options, correct, explanation, ai_made, kind, image)
  select r.id, (t.ord - 1)::int, left(t.q ->> 'q', 800), t.q -> 'options', (t.q ->> 'correct')::int, left(coalesce(t.q ->> 'explanation', ''), 1200),
    coalesce((t.q ->> 'ai')::boolean, false), left(coalesce(nullif(t.q ->> 'kind', ''), 'mcq'), 12), left(coalesce(t.q ->> 'image', ''), 400)
  from jsonb_array_elements(p_questions) with ordinality as t(q, ord);
  for i in 0 .. n - 1 loop
    q := p_questions -> i;
    if jsonb_typeof(q -> 'options') <> 'array' or jsonb_array_length(q -> 'options') < 2 or (q ->> 'correct')::int < 0 or (q ->> 'correct')::int >= jsonb_array_length(q -> 'options') then raise exception 'Bad question %', i + 1; end if;
  end loop;
  lives := case when p_mode = 'sudden' then public.zone_setting(r, 'lives', 1)::int else 99 end;
  insert into public.zone_players (room_id, token, nick, is_host, lives, user_id) values (r.id, p_token, left(coalesce(nullif(btrim(p_nick), ''), 'Host'), 24), true, lives, uid);
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
  if pid is not null then
    update public.zone_players set user_id = coalesce(user_id, auth.uid()) where id = pid;
    return jsonb_build_object('ok', true);
  end if;
  if r.status = 'done' then raise exception 'This room has finished'; end if;
  if r.status = 'running' and public.zone_setting(r, 'late', 0) = 0 then raise exception 'The game has already started'; end if;
  if r.status = 'running' and public.zone_is_live(r) and r.started_at is not null and now() > r.started_at + interval '2 seconds' then raise exception 'This live game is already under way'; end if;
  if (select count(*) from public.zone_players where room_id = r.id) >= 40 then raise exception 'The room is full'; end if;
  lives := case when r.mode = 'sudden' then public.zone_setting(r, 'lives', 1)::int else 99 end;
  insert into public.zone_players (room_id, token, nick, lives, user_id) values (r.id, p_token, left(coalesce(nullif(btrim(p_nick), ''), 'Player'), 24), lives, auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- the host presses Start: a 8 second countdown that every screen counts against the server clock, then everyone begins at the same instant
create or replace function public.zone_start(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms; mins numeric; n int; st timestamptz;
begin
  select r2.* into r from public.zone_rooms r2 join public.zone_players p on p.room_id = r2.id and p.token = p_token and p.is_host where r2.code = upper(btrim(p_code));
  if not found then raise exception 'Only the host can start the game'; end if;
  if r.status <> 'lobby' then return jsonb_build_object('ok', true); end if;
  mins := public.zone_setting(r, 'minutes', 0);
  select count(*) into n from public.zone_questions where room_id = r.id;
  st := now() + interval '8 seconds';
  update public.zone_rooms set status = 'running', started_at = st,
    ends_at = case when public.zone_is_live(r) then st + ((n * public.zone_slot_ms(r) / 1000) || ' seconds')::interval
                   when r.mode = 'marathon' then st + (greatest(1, mins) || ' minutes')::interval
                   when mins > 0 then st + (mins || ' minutes')::interval else null end
    where id = r.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.zone_state(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms; me public.zone_players; n int; players jsonb; ai record; host_nick text; unfinished int;
begin
  select * into r from public.zone_rooms where code = upper(btrim(p_code));
  if not found then raise exception 'No room with that code'; end if;
  select * into me from public.zone_players where room_id = r.id and token = p_token;
  select count(*) into n from public.zone_questions where room_id = r.id;
  if r.status = 'running' then
    if public.zone_is_live(r) and r.mode = 'sudden' then perform public.zone_sync_lives(r, n); end if;
    select count(*) into unfinished from public.zone_players where room_id = r.id and not finished;
    if (r.ends_at is not null and now() > r.ends_at) or (unfinished = 0 and (r.started_at is null or now() >= r.started_at)) then
      perform public.zone_finish_room(r.id);
      r.status := 'done';
      select * into me from public.zone_players where room_id = r.id and token = p_token;
    end if;
  end if;
  select nick into host_nick from public.zone_players where room_id = r.id and is_host;
  select * into ai from public.zone_ai_calc(r, n);
  select coalesce(jsonb_agg(x order by (x ->> 'score')::int desc, (x ->> 'ms')::bigint asc), '[]'::jsonb) into players from (
    select jsonb_build_object('id', p.id, 'nick', p.nick, 'score', p.score, 'correct', p.correct_n, 'answered', p.answered_n, 'finished', p.finished, 'left', p.left_n, 'lives', p.lives, 'host', p.is_host, 'ai', false, 'me', (me.id is not null and p.id = me.id), 'ms', p.total_ms, 'acct', p.user_id is not null) as x
      from public.zone_players p where p.room_id = r.id
    union all
    select jsonb_build_object('id', 'ai', 'nick', coalesce(r.ai ->> 'name', 'Ompath AI'), 'score', ai.score, 'correct', ai.correct_n, 'answered', ai.answered_n, 'finished', ai.finished or r.status = 'done', 'left', 0, 'lives', 0, 'host', false, 'ai', true, 'me', false, 'ms', 0, 'acct', false) where r.ai is not null
  ) t;
  return jsonb_build_object(
    'now', (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'room', jsonb_build_object('code', r.code, 'title', r.title, 'topic', r.topic, 'mode', r.mode, 'status', r.status, 'settings', r.settings, 'n', n, 'hasAi', r.ai is not null, 'host', host_nick,
      'live', public.zone_is_live(r), 'slotMs', public.zone_slot_ms(r),
      'startedAt', case when r.started_at is null then null else (extract(epoch from r.started_at) * 1000)::bigint end,
      'endsAt', case when r.ends_at is null then null else (extract(epoch from r.ends_at) * 1000)::bigint end),
    'players', players,
    'me', case when me.id is null then null else jsonb_build_object('id', me.id, 'nick', me.nick, 'host', me.is_host, 'answered', me.answered_n, 'score', me.score, 'lives', me.lives, 'finished', me.finished) end);
end $$;

-- the questions. When the room is not an assessment the answer key comes with them, so a tap shows right or wrong at once and the answer is saved in the background
create or replace function public.zone_questions_for(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms; open_key boolean;
begin
  select r2.* into r from public.zone_rooms r2 join public.zone_players p on p.room_id = r2.id and p.token = p_token where r2.code = upper(btrim(p_code));
  if not found then raise exception 'Join the room first'; end if;
  if r.status = 'lobby' then raise exception 'The game has not started'; end if;
  open_key := public.zone_setting(r, 'assessment', 0) = 0;
  return (select coalesce(jsonb_agg(
      jsonb_build_object('idx', idx, 'q', q, 'options', options, 'ai', ai_made, 'kind', kind, 'image', image)
      || case when open_key then jsonb_build_object('key', correct, 'why', explanation) else '{}'::jsonb end
      order by idx), '[]'::jsonb) from public.zone_questions where room_id = r.id);
end $$;

create or replace function public.zone_answer(p_code text, p_token text, p_seq int, p_choice int, p_ms int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms; p public.zone_players; qq public.zone_questions; n int; ok boolean; pts int := 0; limit_ms numeric; ms int; qi int; fin boolean := false;
  slot numeric; since numeric; show boolean;
begin
  select r2.* into r from public.zone_rooms r2 where r2.code = upper(btrim(p_code));
  if not found then raise exception 'No room'; end if;
  select * into p from public.zone_players where room_id = r.id and token = p_token for update;
  if not found then raise exception 'Join the room first'; end if;
  if r.status <> 'running' or p.finished then return jsonb_build_object('finished', true, 'score', p.score); end if;
  if r.started_at is not null and now() < r.started_at - interval '0.5 second' then raise exception 'The game has not started yet'; end if;
  if r.ends_at is not null and now() > r.ends_at + interval '2 seconds' then update public.zone_players set finished = true where id = p.id; return jsonb_build_object('finished', true, 'score', p.score); end if;
  select count(*) into n from public.zone_questions where room_id = r.id;
  limit_ms := public.zone_setting(r, 'perQuestionSec', 20) * 1000;
  show := public.zone_setting(r, 'assessment', 0) = 0;

  if public.zone_is_live(r) then
    if p_seq < 0 or p_seq >= n then raise exception 'Bad question'; end if;
    slot := public.zone_slot_ms(r);
    since := extract(epoch from (now() - r.started_at)) * 1000 - p_seq * slot;
    if since > limit_ms + 1500 then return jsonb_build_object('late', true, 'score', p.score, 'answered', p.answered_n); end if;
    if since < -500 then raise exception 'Too early'; end if;
    if exists (select 1 from public.zone_answers where player_id = p.id and seq = p_seq) then return jsonb_build_object('stale', true, 'answered', p.answered_n, 'score', p.score); end if;
    select * into qq from public.zone_questions where room_id = r.id and zone_questions.idx = p_seq;
    ms := least(greatest(since::int, 300), limit_ms::int);
    if coalesce(p_ms, 0) between 300 and ms then ms := greatest(p_ms, ms - 1500); end if;
    ok := (p_choice = qq.correct);
    if ok then pts := case when r.mode = 'speed' then 100 + floor(100 * greatest(0, limit_ms - ms) / limit_ms)::int else 10 end; end if;
    insert into public.zone_answers (player_id, seq, idx, choice, ok, ms) values (p.id, p_seq, p_seq, p_choice, ok, ms);
    update public.zone_players set score = score + pts, correct_n = correct_n + case when ok then 1 else 0 end, answered_n = answered_n + 1, total_ms = total_ms + ms where id = p.id returning * into p;
    return jsonb_build_object('ok', ok, 'points', pts, 'score', p.score, 'answered', p.answered_n, 'finished', false) || case when show then jsonb_build_object('correct', qq.correct, 'explanation', qq.explanation) else '{}'::jsonb end;
  end if;

  if p_seq <> p.answered_n then return jsonb_build_object('stale', true, 'answered', p.answered_n, 'score', p.score); end if;
  qi := p_seq % n;
  select * into qq from public.zone_questions where room_id = r.id and zone_questions.idx = qi;
  ms := least(greatest(coalesce(p_ms, 0), 300), (limit_ms * 1.2)::int);
  ok := (p_choice = qq.correct);
  if ok then pts := case when r.mode = 'speed' then 100 + floor(100 * greatest(0, limit_ms - ms) / limit_ms)::int else 10 end; end if;
  insert into public.zone_answers (player_id, seq, idx, choice, ok, ms) values (p.id, p_seq, qi, p_choice, ok, ms);
  update public.zone_players set score = score + pts, correct_n = correct_n + case when ok then 1 else 0 end, answered_n = answered_n + 1, total_ms = total_ms + ms,
    lives = case when r.mode = 'sudden' and not ok then lives - 1 else lives end where id = p.id returning * into p;
  if (r.mode = 'speed' and p.answered_n >= n) or (r.mode = 'sudden' and p.lives <= 0) then update public.zone_players set finished = true where id = p.id; fin := true; end if;
  return jsonb_build_object('ok', ok, 'points', pts, 'correct', qq.correct, 'explanation', qq.explanation, 'score', p.score, 'lives', p.lives, 'finished', fin, 'answered', p.answered_n);
end $$;

create or replace function public.zone_end(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms;
begin
  select r2.* into r from public.zone_rooms r2 join public.zone_players p on p.room_id = r2.id and p.token = p_token and p.is_host where r2.code = upper(btrim(p_code));
  if not found then raise exception 'Only the host can end the game'; end if;
  update public.zone_rooms set ends_at = coalesce(least(ends_at, now()), now()) where id = r.id;
  perform public.zone_finish_room(r.id);
  return jsonb_build_object('ok', true);
end $$;

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
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('idx', q.idx, 'q', q.q, 'options', q.options, 'correct', q.correct, 'explanation', q.explanation, 'ai', q.ai_made, 'kind', q.kind, 'image', q.image) order by q.idx), '[]'::jsonb) from public.zone_questions q where q.room_id = r.id),
    'mine', (select coalesce(jsonb_agg(jsonb_build_object('seq', a.seq, 'idx', a.idx, 'choice', a.choice, 'ok', a.ok, 'ms', a.ms) order by a.seq), '[]'::jsonb) from public.zone_answers a where a.player_id = p.id));
end $$;

-- what a share card needs to say, for anyone with the link
create or replace function public.zone_peek(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms; host_nick text; n int; pc int;
begin
  select * into r from public.zone_rooms where code = upper(btrim(p_code));
  if not found then return null; end if;
  select nick into host_nick from public.zone_players where room_id = r.id and is_host;
  select count(*) into n from public.zone_questions where room_id = r.id;
  select count(*) into pc from public.zone_players where room_id = r.id;
  return jsonb_build_object('code', r.code, 'title', r.title, 'host', coalesce(host_nick, 'A friend'), 'game', coalesce(nullif(r.settings ->> 'game', ''), 'quiz'), 'mode', r.mode, 'status', r.status, 'n', n, 'players', pc,
    'perQ', public.zone_setting(r, 'perQuestionSec', 20), 'live', public.zone_is_live(r), 'ai', r.ai is not null);
end $$;

-- the signed-in player's record
create or replace function public.zone_my_history(p_limit int default 40) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); out jsonb;
begin
  if uid is null then return jsonb_build_object('played', 0, 'wins', 0, 'points', 0, 'games', '[]'::jsonb); end if;
  select jsonb_build_object(
    'played', (select count(*) from public.zone_history where user_id = uid),
    'wins', (select count(*) from public.zone_history where user_id = uid and rank = 1 and players > 1),
    'points', (select coalesce(sum(score), 0) from public.zone_history where user_id = uid),
    'games', coalesce((select jsonb_agg(to_jsonb(h) - 'user_id' - 'id' order by h.played_at desc) from (select * from public.zone_history where user_id = uid order by played_at desc limit least(greatest(p_limit, 1), 100)) h), '[]'::jsonb)
  ) into out;
  return out;
end $$;

do $$ declare f text; begin
  foreach f in array array['zone_join(text,text,text)', 'zone_start(text,text)', 'zone_state(text,text)', 'zone_questions_for(text,text)', 'zone_answer(text,text,int,int,int)', 'zone_flag_left(text,text)', 'zone_finish_me(text,text)', 'zone_results(text,text)', 'zone_end(text,text)', 'zone_peek(text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  execute 'revoke all on function public.zone_create(text,text,text,jsonb,jsonb,jsonb,text,text) from public';
  execute 'grant execute on function public.zone_create(text,text,text,jsonb,jsonb,jsonb,text,text) to authenticated';
  execute 'revoke all on function public.zone_my_history(int) from public';
  execute 'grant execute on function public.zone_my_history(int) to authenticated';
  execute 'revoke all on function public.zone_finish_room(uuid) from public, anon, authenticated';
  execute 'revoke all on function public.zone_sync_lives(public.zone_rooms, int) from public, anon, authenticated';
end $$;
