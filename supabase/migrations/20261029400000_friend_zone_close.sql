-- Friend Zone: rooms that are finished or abandoned are closed. A room nobody started closes after 2 hours, a game that was started closes after 3 hours,
-- a game that was never played leaves no record, and a host can see and close their open rooms from any device.

create or replace function public.zone_finish_room(p_rid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms; n int;
begin
  update public.zone_rooms set status = 'done' where id = p_rid and status <> 'done' returning * into r;
  if not found then return; end if;
  update public.zone_players set finished = true where room_id = p_rid and not finished;
  if r.started_at is null then return; end if;  -- never played: nothing to record
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

create or replace function public.zone_close_stale() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from public.zone_rooms where (status = 'lobby' and created_at < now() - interval '2 hours')
      or (status = 'running' and coalesce(started_at, created_at) < now() - interval '3 hours') loop
    perform public.zone_finish_room(r.id); n := n + 1;
  end loop;
  return n;
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
      'live', public.zone_is_live(r), 'slotMs', public.zone_slot_ms(r), 'expired', expired and r.started_at is null,
      'startedAt', case when r.started_at is null then null else (extract(epoch from r.started_at) * 1000)::bigint end,
      'endsAt', case when r.ends_at is null then null else (extract(epoch from r.ends_at) * 1000)::bigint end),
    'players', players,
    'me', case when me.id is null then null else jsonb_build_object('id', me.id, 'nick', me.nick, 'host', me.is_host, 'answered', me.answered_n, 'score', me.score, 'lives', me.lives, 'finished', me.finished) end);
end $$;

-- the signed-in host's rooms that are still open, and a way to close one from any device
create or replace function public.zone_my_open() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('code', r.code, 'title', r.title, 'status', r.status, 'players', (select count(*) from public.zone_players p where p.room_id = r.id), 'created', r.created_at) order by r.created_at desc)
    from public.zone_rooms r where r.host_id = uid and r.status <> 'done' and r.created_at > now() - interval '1 day'), '[]'::jsonb);
end $$;

create or replace function public.zone_close_mine(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.zone_rooms;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  select * into r from public.zone_rooms where code = upper(btrim(p_code)) and host_id = uid;
  if not found then raise exception 'That is not your room'; end if;
  update public.zone_rooms set ends_at = coalesce(least(ends_at, now()), now()) where id = r.id;
  perform public.zone_finish_room(r.id);
  return jsonb_build_object('ok', true);
end $$;

do $$ begin
  execute 'revoke all on function public.zone_my_open() from public';
  execute 'grant execute on function public.zone_my_open() to authenticated';
  execute 'revoke all on function public.zone_close_mine(text) from public';
  execute 'grant execute on function public.zone_close_mine(text) to authenticated';
  execute 'revoke all on function public.zone_close_stale() from public, anon, authenticated';
  execute 'revoke all on function public.zone_finish_room(uuid) from public, anon, authenticated';
  execute 'grant execute on function public.zone_state(text,text) to anon, authenticated';
end $$;

-- every 10 minutes, close what is stale
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('zone-close-stale') where exists (select 1 from cron.job where jobname = 'zone-close-stale');
    perform cron.schedule('zone-close-stale', '*/10 * * * *', $c$ select public.zone_close_stale() $c$);
  end if;
exception when others then null;
end $$;
