-- Central server-side freemium entitlements and atomic usage accounting.
create table if not exists public.feature_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  period_start date not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature, period_start)
);
alter table public.feature_usage enable row level security;
drop policy if exists "Users can view own feature usage" on public.feature_usage;
create policy "Users can view own feature usage" on public.feature_usage
  for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'::public.app_role));
revoke all on public.feature_usage from anon, authenticated;
grant select on public.feature_usage to authenticated;

alter table public.flashcard_sets add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.mcq_sets add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.flashcard_sets alter column owner_id set default auth.uid();

drop policy if exists "Allow all operations for managing flashcard_sets" on public.flashcard_sets;
create policy "Admins manage flashcard sets" on public.flashcard_sets
  for all to authenticated using (public.has_role(auth.uid(),'admin'::public.app_role))
  with check (public.has_role(auth.uid(),'admin'::public.app_role));
create policy "Creators manage own flashcard sets" on public.flashcard_sets
  for all to authenticated using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

insert into public.app_settings(key,value) values
 ('free_ompath_ai_daily','8'),
 ('free_ai_note_generation_weekly','2'),
 ('free_ai_flashcard_generation_weekly','2'),
 ('free_ai_mcq_generation_weekly','2'),
 ('free_ai_picture_questions_daily','15'),
 ('free_topic_page_generation_weekly','1')
on conflict (key) do nothing;

create or replace function public.consume_feature(p_feature text, p_units integer default 1)
returns jsonb language plpgsql security definer set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_admin boolean := false;
  v_subs boolean := false;
  v_paid boolean := false;
  v_limit integer := 0;
  v_period date := current_date;
  v_period_type text := 'day';
  v_key text;
  v_used integer := 0;
begin
  if v_user is null then return jsonb_build_object('allowed',false,'reason','login_required','remaining',0); end if;
  if p_units is null or p_units < 1 or p_units > 100 then return jsonb_build_object('allowed',false,'reason','invalid_units','remaining',0); end if;
  select public.has_role(v_user,'admin'::public.app_role) into v_admin;
  if coalesce(v_admin,false) then return jsonb_build_object('allowed',true,'reason','admin','unlimited',true); end if;
  select coalesce((select value='true' from public.app_settings where key='subscriptions_enabled' limit 1),false) into v_subs;
  if not v_subs then return jsonb_build_object('allowed',true,'reason','subscriptions_disabled','unlimited',true); end if;
  select exists(select 1 from public.access_grants g
    where (g.user_id=v_user or (v_email<>'' and lower(coalesce(g.email,''))=v_email))
      and (g.expires_at is null or g.expires_at>now())
      and coalesce(g.scope,'all') in ('all','premium','content')) into v_paid;
  if v_paid then return jsonb_build_object('allowed',true,'reason','active_plan','unlimited',true); end if;
  case p_feature
    when 'ompath_ai_questions' then v_key:='free_ompath_ai_daily'; v_period_type:='day';
    when 'ai_note_generation' then v_key:='free_ai_note_generation_weekly'; v_period_type:='week';
    when 'ai_flashcard_generation' then v_key:='free_ai_flashcard_generation_weekly'; v_period_type:='week';
    when 'ai_mcq_generation' then v_key:='free_ai_mcq_generation_weekly'; v_period_type:='week';
    when 'ai_picture_questions' then v_key:='free_ai_picture_questions_daily'; v_period_type:='day';
    when 'topic_page_generation' then v_key:='free_topic_page_generation_weekly'; v_period_type:='week';
    else return jsonb_build_object('allowed',false,'reason','unknown_feature','remaining',0);
  end case;
  select greatest(0,coalesce(nullif(value,'')::integer,0)) into v_limit from public.app_settings where key=v_key;
  if not found then
    v_limit := case v_key when 'free_ompath_ai_daily' then 8 when 'free_ai_note_generation_weekly' then 2
      when 'free_ai_flashcard_generation_weekly' then 2 when 'free_ai_mcq_generation_weekly' then 2
      when 'free_ai_picture_questions_daily' then 15 when 'free_topic_page_generation_weekly' then 1 else 0 end;
  end if;
  if v_limit=0 then return jsonb_build_object('allowed',false,'reason','upgrade_required','remaining',0,'limit',v_limit); end if;
  if v_period_type='week' then v_period:=date_trunc('week',current_date)::date; end if;
  insert into public.feature_usage(user_id,feature,period_start,used,updated_at) values(v_user,p_feature,v_period,p_units,now())
  on conflict(user_id,feature,period_start) do update set used=public.feature_usage.used+excluded.used,updated_at=now()
  where public.feature_usage.used+excluded.used<=v_limit returning used into v_used;
  if v_used is null then
    select used into v_used from public.feature_usage where user_id=v_user and feature=p_feature and period_start=v_period;
    return jsonb_build_object('allowed',false,'reason','quota_exhausted','used',coalesce(v_used,0),'limit',v_limit,'remaining',0,'period',v_period_type);
  end if;
  return jsonb_build_object('allowed',true,'reason','free_allowance','used',v_used,'limit',v_limit,'remaining',greatest(0,v_limit-v_used),'period',v_period_type);
end;
$$;
revoke all on function public.consume_feature(text,integer) from public;
grant execute on function public.consume_feature(text,integer) to authenticated;
comment on function public.consume_feature(text,integer) is 'Atomically consumes a configured free feature allowance. Admins and users with active access grants are unlimited.';
