-- The share card of a result ("Hannah won Thyroid"): what a finished game says about one player, for anyone with the link. Only finished games, only public facts.
create or replace function public.zone_peek_player(p_code text, p_nick text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.zone_rooms; p public.zone_players; rk int; cnt int; n int;
begin
  select * into r from public.zone_rooms where code = upper(btrim(p_code));
  if not found or r.status <> 'done' or r.started_at is null then return null; end if;
  select * into p from public.zone_players where room_id = r.id and lower(nick) = lower(btrim(p_nick)) order by score desc limit 1;
  if not found then return null; end if;
  select count(*) into cnt from public.zone_players where room_id = r.id;
  select count(*) + 1 into rk from public.zone_players o where o.room_id = r.id and (o.score > p.score or (o.score = p.score and o.total_ms < p.total_ms));
  select count(*) into n from public.zone_questions where room_id = r.id;
  return jsonb_build_object('nick', p.nick, 'title', r.title, 'game', coalesce(nullif(r.settings ->> 'game', ''), 'quiz'), 'score', p.score, 'rank', rk, 'players', cnt, 'correct', p.correct_n, 'answered', p.answered_n, 'total', n);
end $$;
revoke all on function public.zone_peek_player(text, text) from public;
grant execute on function public.zone_peek_player(text, text) to anon, authenticated;
