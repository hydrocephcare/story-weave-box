-- Friend Zone: open games anyone can join, pause for the host, friends, and the study guide kept with a finished game.

alter table public.zone_rooms add column if not exists paused_at timestamptz;
alter table public.zone_history add column if not exists guide text;

create table if not exists public.zone_profiles (
  user_id uuid primary key,
  friend_code text not null unique,
  nick text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.zone_friends (
  user_id uuid not null,
  friend_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
alter table public.zone_profiles enable row level security;
alter table public.zone_friends enable row level security;
revoke all on public.zone_profiles, public.zone_friends from anon, authenticated;

-- open games: waiting rooms whose host ticked "let others join"
create or replace function public.zone_open_list() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return coalesce((select jsonb_agg(jsonb_build_object('code', r.code, 'title', r.title, 'game', coalesce(nullif(r.settings ->> 'game', ''), 'quiz'), 'mode', r.mode,
      'host', coalesce((select p.nick from public.zone_players p where p.room_id = r.id and p.is_host), 'A friend'),
      'players', (select count(*) from public.zone_players p where p.room_id = r.id),
      'n', (select count(*) from public.zone_questions q where q.room_id = r.id), 'created', r.created_at) order by r.created_at desc)
    from public.zone_rooms r where r.status = 'lobby' and coalesce(r.settings ->> 'open', '0') = '1' and r.created_at > now() - interval '2 hours' limit 20), '[]'::jsonb);
end $$;

-- pause and resume (host): everyone's clock stops, and the start and end times move forward by the time spent paused
create or replace function public.zone_pause(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms;
begin
  select r2.* into r from public.zone_rooms r2 join public.zone_players p on p.room_id = r2.id and p.token = p_token and p.is_host where r2.code = upper(btrim(p_code));
  if not found then raise exception 'Only the host can pause'; end if;
  if r.status = 'running' and r.paused_at is null and r.started_at is not null and now() >= r.started_at then update public.zone_rooms set paused_at = now() where id = r.id; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.zone_resume(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms; dur interval;
begin
  select r2.* into r from public.zone_rooms r2 join public.zone_players p on p.room_id = r2.id and p.token = p_token and p.is_host where r2.code = upper(btrim(p_code));
  if not found then raise exception 'Only the host can resume'; end if;
  if r.paused_at is not null then
    dur := now() - r.paused_at;
    update public.zone_rooms set started_at = started_at + dur, ends_at = case when ends_at is null then null else ends_at + dur end, paused_at = null where id = r.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- friends: a personal code, added both ways
create or replace function public.zone_my_code(p_nick text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text; chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; k int;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  select friend_code into c from public.zone_profiles where user_id = uid;
  if c is null then
    loop
      c := 'F';
      for k in 1 .. 5 loop c := c || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
      exit when not exists (select 1 from public.zone_profiles where friend_code = c);
    end loop;
    insert into public.zone_profiles (user_id, friend_code, nick) values (uid, c, left(coalesce(p_nick, ''), 24));
  elsif coalesce(btrim(p_nick), '') <> '' then
    update public.zone_profiles set nick = left(btrim(p_nick), 24) where user_id = uid;
  end if;
  return jsonb_build_object('code', c);
end $$;

create or replace function public.zone_add_friend(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); f public.zone_profiles;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  select * into f from public.zone_profiles where friend_code = upper(btrim(p_code));
  if not found then raise exception 'No friend has that code'; end if;
  if f.user_id = uid then raise exception 'That is your own code'; end if;
  if (select count(*) from public.zone_friends where user_id = uid) >= 200 then raise exception 'Friend list is full'; end if;
  insert into public.zone_friends (user_id, friend_id) values (uid, f.user_id), (f.user_id, uid) on conflict do nothing;
  return jsonb_build_object('ok', true, 'nick', f.nick);
end $$;

create or replace function public.zone_friends() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('code', p.friend_code, 'nick', p.nick,
      'played', (select count(*) from public.zone_history h where h.user_id = uid and p.nick <> '' and p.nick = any (h.opponents)),
      'open', (select r.code from public.zone_rooms r where r.host_id = f.friend_id and r.status = 'lobby' and r.created_at > now() - interval '2 hours' order by r.created_at desc limit 1)) order by p.nick)
    from public.zone_friends f join public.zone_profiles p on p.user_id = f.friend_id where f.user_id = uid), '[]'::jsonb);
end $$;

create or replace function public.zone_remove_friend(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); fid uuid;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  select user_id into fid from public.zone_profiles where friend_code = upper(btrim(p_code));
  delete from public.zone_friends where (user_id = uid and friend_id = fid) or (user_id = fid and friend_id = uid);
  return jsonb_build_object('ok', true);
end $$;

-- what the player keeps getting wrong, by topic, over all finished games
create or replace function public.zone_weak_topics() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('topic', topic, 'games', count(*), 'correct', sum(correct_n), 'answered', sum(answered_n), 'pct', round(100.0 * sum(correct_n) / nullif(sum(answered_n), 0))) as x
    from public.zone_history where user_id = uid and topic <> '' and answered_n > 0
    group by topic having sum(answered_n) >= 4 and 100.0 * sum(correct_n) / nullif(sum(answered_n), 0) < 70
    order by sum(correct_n)::numeric / nullif(sum(answered_n), 0) asc limit 5) t), '[]'::jsonb);
end $$;

create or replace function public.zone_save_guide(p_code text, p_guide text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('ok', false); end if;
  update public.zone_history set guide = left(p_guide, 12000) where user_id = uid and room_code = upper(btrim(p_code));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.zone_get_guide(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g text;
begin
  if uid is null then return null; end if;
  select guide into g from public.zone_history where user_id = uid and room_code = upper(btrim(p_code));
  return to_jsonb(g);
end $$;

create or replace function public.zone_my_history(p_limit int default 40) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); out jsonb;
begin
  if uid is null then return jsonb_build_object('played', 0, 'wins', 0, 'points', 0, 'games', '[]'::jsonb); end if;
  select jsonb_build_object(
    'played', (select count(*) from public.zone_history where user_id = uid),
    'wins', (select count(*) from public.zone_history where user_id = uid and rank = 1 and players > 1),
    'points', (select coalesce(sum(score), 0) from public.zone_history where user_id = uid),
    'games', coalesce((select jsonb_agg((to_jsonb(h) - 'user_id' - 'id' - 'guide') || jsonb_build_object('has_guide', h.guide is not null) order by h.played_at desc) from (select * from public.zone_history where user_id = uid order by played_at desc limit least(greatest(p_limit, 1), 100)) h), '[]'::jsonb)
  ) into out;
  return out;
end $$;

do $$ declare f text; begin
  foreach f in array array['zone_open_list()', 'zone_pause(text,text)', 'zone_resume(text,text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  foreach f in array array['zone_my_code(text)', 'zone_add_friend(text)', 'zone_friends()', 'zone_remove_friend(text)', 'zone_weak_topics()', 'zone_save_guide(text,text)', 'zone_get_guide(text)', 'zone_my_history(int)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- the functions that know about a paused room
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
  elapsed := greatest(0, extract(epoch from (least(coalesce(p_room.paused_at, now()), coalesce(p_room.ends_at, now())) - p_room.started_at)) * 1000);
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
  if r.paused_at is not null then raise exception 'The game is paused'; end if;
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

create or replace function public.zone_state(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms; me public.zone_players; n int; players jsonb; ai record; host_nick text; unfinished int; expired boolean := false;
begin
  select * into r from public.zone_rooms where code = upper(btrim(p_code));
  if not found then raise exception 'No room with that code'; end if;
  -- nobody started it, or nobody finished it: it is closed
  if (r.status = 'lobby' and r.created_at < now() - interval '2 hours') or (r.status = 'running' and coalesce(r.started_at, r.created_at) < now() - interval '3 hours') then
    perform public.zone_finish_room(r.id); r.status := 'done'; expired := true;
  end if;
  select * into me from public.zone_players where room_id = r.id and token = p_token;
  select count(*) into n from public.zone_questions where room_id = r.id;
  if r.status = 'running' and r.paused_at is null then
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
      'live', public.zone_is_live(r), 'slotMs', public.zone_slot_ms(r), 'pausedAt', case when r.paused_at is null then null else (extract(epoch from r.paused_at) * 1000)::bigint end, 'expired', expired and r.started_at is null,
      'startedAt', case when r.started_at is null then null else (extract(epoch from r.started_at) * 1000)::bigint end,
      'endsAt', case when r.ends_at is null then null else (extract(epoch from r.ends_at) * 1000)::bigint end),
    'players', players,
    'me', case when me.id is null then null else jsonb_build_object('id', me.id, 'nick', me.nick, 'host', me.is_host, 'answered', me.answered_n, 'score', me.score, 'lives', me.lives, 'finished', me.finished) end);
end $$;
