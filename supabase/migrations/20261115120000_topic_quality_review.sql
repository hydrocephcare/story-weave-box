-- Topic quality, delayed independent review, reversible corrections and admin review queue.
alter table public.topic_pages
  add column if not exists topic_type text,
  add column if not exists ai_review_status text not null default 'pending',
  add column if not exists ai_checked_at timestamptz,
  add column if not exists requires_review boolean not null default false,
  add column if not exists review_status text not null default 'pending',
  add column if not exists review_loops integer not null default 0,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_by_name text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists last_reviewed_at timestamptz;

create table if not exists public.review_jobs (
  id uuid primary key default gen_random_uuid(),
  article_id text not null,
  run_after timestamptz not null default (now() + interval '5 minutes'),
  status text not null default 'pending' check (status in ('pending','processing','approved','needs_review','rejected','failed','cancelled')),
  attempts integer not null default 0,
  loop_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists review_jobs_due_idx on public.review_jobs(run_after, created_at) where status='pending';
create unique index if not exists review_jobs_one_pending_per_topic on public.review_jobs(article_id) where status='pending';

create table if not exists public.audit_findings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  article_id text not null,
  section text not null,
  claim text not null,
  verdict text not null check (verdict in ('supported','unsupported','contradicted','unverifiable')),
  severity text not null check (severity in ('high','medium','low')),
  reference text,
  suggested_fix text,
  requires_review boolean not null default false,
  status text not null default 'pending' check (status in ('pending','applied','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
create index if not exists audit_findings_queue_idx on public.audit_findings(created_at desc) where status='pending';

create table if not exists public.article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id text not null,
  old_text jsonb not null,
  new_text jsonb,
  reason text not null,
  source text not null,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists article_revisions_article_idx on public.article_revisions(article_id, created_at desc);

alter table public.review_jobs enable row level security;
alter table public.audit_findings enable row level security;
alter table public.article_revisions enable row level security;

drop policy if exists "Admins read topic review jobs" on public.review_jobs;
create policy "Admins read topic review jobs" on public.review_jobs for select to authenticated using (public.has_role(auth.uid(),'admin'));
drop policy if exists "Admins read topic audit findings" on public.audit_findings;
create policy "Admins read topic audit findings" on public.audit_findings for select to authenticated using (public.has_role(auth.uid(),'admin'));
drop policy if exists "Admins update topic audit findings" on public.audit_findings;
create policy "Admins update topic audit findings" on public.audit_findings for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
drop policy if exists "Admins read topic article revisions" on public.article_revisions;
create policy "Admins read topic article revisions" on public.article_revisions for select to authenticated using (public.has_role(auth.uid(),'admin'));

grant select on public.review_jobs, public.audit_findings, public.article_revisions to authenticated;
revoke all on public.review_jobs, public.audit_findings, public.article_revisions from anon;
grant all on public.review_jobs, public.audit_findings, public.article_revisions to service_role;

create or replace function public.enqueue_topic_review()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('app.topic_review_write', true) = 'true' then
    return new;
  end if;
  if new.status = 'published' and new.content is not null
     and (tg_op = 'INSERT' or old.status is distinct from new.status or old.content is distinct from new.content) then
    insert into public.review_jobs(article_id, run_after, status, loop_count, last_error, updated_at)
    values (new.slug, now() + interval '5 minutes', 'pending', 0, null, now())
    on conflict (article_id) where status='pending'
    do update set run_after=excluded.run_after, loop_count=0, last_error=null, updated_at=now();
    update public.topic_pages set ai_review_status='pending', ai_checked_at=null, requires_review=false, review_status='pending'
      where slug=new.slug and (ai_review_status is distinct from 'pending' or ai_checked_at is not null);
  end if;
  return new;
end;
$$;

drop trigger if exists topic_pages_enqueue_review on public.topic_pages;
create trigger topic_pages_enqueue_review
after insert or update of content, status on public.topic_pages
for each row execute function public.enqueue_topic_review();

create or replace function public.set_topic_page_type()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $
begin
  if new.content is not null and new.content ? 'topicType' then
    new.topic_type := new.content->>'topicType';
  end if;
  return new;
end;
$;
drop trigger if exists topic_pages_set_type on public.topic_pages;
create trigger topic_pages_set_type
before insert or update of content on public.topic_pages
for each row execute function public.set_topic_page_type();

create or replace function public.claim_topic_review_jobs(p_limit integer default 5)
returns table(id uuid, article_id text, loop_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with due as (
    select j.id from public.review_jobs j
    where j.status='pending' and j.run_after <= now()
    order by j.run_after, j.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit,5),1),5)
  )
  update public.review_jobs j
     set status='processing', attempts=j.attempts+1, updated_at=now()
    from due
   where j.id=due.id
  returning j.id, j.article_id, j.loop_count;
end;
$$;
revoke all on function public.claim_topic_review_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_topic_review_jobs(integer) to service_role;

-- Save a rollback snapshot before merging section-only corrections into the page JSON.
create or replace function public.apply_topic_review_sections(
  p_slug text, p_sections jsonb, p_faq jsonb default null, p_exam jsonb default null,
  p_reason text default 'AI review correction', p_source text default 'topic review', p_loop integer default 1
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.topic_pages%rowtype;
  old_sections jsonb;
  new_sections jsonb;
  item jsonb;
  section_key text;
  section_idx integer;
  old_snapshot jsonb;
  new_snapshot jsonb;
begin
  if jsonb_typeof(coalesce(p_sections,'[]'::jsonb)) <> 'array' then
    return jsonb_build_object('ok',false,'reason','sections_shape');
  end if;
  select * into current_row from public.topic_pages where slug=p_slug and status='published' for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  old_sections := coalesce(current_row.content->'sections','[]'::jsonb);
  new_sections := old_sections;
  for item in select value from jsonb_array_elements(coalesce(p_sections,'[]'::jsonb)) loop
    section_key := coalesce(item->>'key',item->>'h',item->>'heading','');
    select ordinality::integer - 1 into section_idx
      from jsonb_array_elements(new_sections) with ordinality as s(value,ordinality)
     where coalesce(value->>'key',value->>'h',value->>'heading','')=section_key
     limit 1;
    if section_idx is null then
      new_sections := new_sections || jsonb_build_array(item);
    else
      new_sections := jsonb_set(new_sections,array[section_idx::text],item,true);
    end if;
    section_idx := null;
  end loop;
  old_snapshot := jsonb_build_object('sections',old_sections,'faq',current_row.content->'faq','exam',current_row.content->'exam');
  new_snapshot := jsonb_build_object('sections',new_sections,
    'faq',case when p_faq is null then current_row.content->'faq' else p_faq end,
    'exam',case when p_exam is null then current_row.content->'exam' else p_exam end);
  insert into public.article_revisions(article_id,old_text,new_text,reason,source)
  values(p_slug,old_snapshot,new_snapshot,p_reason,p_source);
  perform set_config('app.topic_review_write','true',true);
  update public.topic_pages
     set content = content || jsonb_build_object('sections',new_sections)
         || case when p_faq is null then '{}'::jsonb else jsonb_build_object('faq',p_faq) end
         || case when p_exam is null then '{}'::jsonb else jsonb_build_object('exam',p_exam) end,
         review_loops=greatest(coalesce(p_loop,1),0), updated_at=now()
   where slug=p_slug;
  update public.audit_findings set status='applied',resolved_at=now()
   where article_id=p_slug and status='pending' and requires_review=false;
  return jsonb_build_object('ok',true,'sections_changed',jsonb_array_length(coalesce(p_sections,'[]'::jsonb)));
end;
$$;
revoke all on function public.apply_topic_review_sections(text,jsonb,jsonb,jsonb,text,text,integer) from public, anon, authenticated;
grant execute on function public.apply_topic_review_sections(text,jsonb,jsonb,jsonb,text,text,integer) to service_role;

create or replace function public.mark_topic_medically_reviewed(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin') then
    raise exception 'admin_required';
  end if;
  update public.topic_pages
     set reviewed=true, reviewed_by=auth.uid(), reviewed_by_name=coalesce((select nullif(raw_user_meta_data->>'full_name','') from auth.users where id=auth.uid()), (select email from auth.users where id=auth.uid()), 'OmpathStudy administrator'), reviewed_at=now(), updated_at=now()
   where slug=p_slug and status='published';
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.mark_topic_medically_reviewed(text) from public, anon;
grant execute on function public.mark_topic_medically_reviewed(text) to authenticated;

create or replace function public.remove_and_rewrite_topic_page(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare old_content jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin') then
    raise exception 'admin_required';
  end if;
  select content into old_content from public.topic_pages where slug=p_slug for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  insert into public.article_revisions(article_id,old_text,new_text,reason,source,changed_by)
  values(p_slug,coalesce(old_content,'{}'::jsonb),null,'Admin removed page and requested a rewrite','admin',auth.uid());
  update public.review_jobs set status='cancelled',updated_at=now(),completed_at=now()
   where article_id=p_slug and status in ('pending','processing');
  update public.topic_pages
     set status='failed',content=null,reviewed=false,reviewed_by=null,reviewed_by_name=null,reviewed_at=null,
         ai_checked_at=null,ai_review_status='pending',requires_review=false,review_status='pending',review_loops=0,updated_at=now()
   where slug=p_slug;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.remove_and_rewrite_topic_page(text) from public, anon;
grant execute on function public.remove_and_rewrite_topic_page(text) to authenticated;

create or replace function public.apply_topic_audit_finding(p_finding_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare f public.audit_findings%rowtype; page public.topic_pages%rowtype; old_sections jsonb; new_sections jsonb; idx integer; old_section jsonb; new_section jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin') then raise exception 'admin_required'; end if;
  select * into f from public.audit_findings where id=p_finding_id and status='pending' and requires_review=true for update;
  if not found then return jsonb_build_object('ok',false,'reason','finding_not_pending'); end if;
  if coalesce(f.suggested_fix,'')='' then return jsonb_build_object('ok',false,'reason','no_suggested_fix'); end if;
  select * into page from public.topic_pages where slug=f.article_id and status='published' for update;
  if not found then return jsonb_build_object('ok',false,'reason','topic_not_found'); end if;
  old_sections:=coalesce(page.content->'sections','[]'::jsonb);
  select ordinality::integer-1,value into idx,old_section
    from jsonb_array_elements(old_sections) with ordinality as s(value,ordinality)
   where coalesce(value->>'key',value->>'h',value->>'heading','')=f.section limit 1;
  if idx is null then return jsonb_build_object('ok',false,'reason','section_not_found'); end if;
  new_section:=jsonb_set(old_section,'{p}',to_jsonb(f.suggested_fix),true);
  if jsonb_typeof(old_section->'content')='object' then
    new_section:=jsonb_set(new_section,'{content,p}',to_jsonb(f.suggested_fix),true);
  end if;
  new_sections:=jsonb_set(old_sections,array[idx::text],new_section,true);
  insert into public.article_revisions(article_id,old_text,new_text,reason,source,changed_by)
  values(f.article_id,jsonb_build_object('section',old_section),jsonb_build_object('section',new_section),'Admin applied high-risk AI finding: '||f.claim,'admin',auth.uid());
  perform set_config('app.topic_review_write','true',true);
  update public.topic_pages set content=jsonb_set(content,'{sections}',new_sections,true),updated_at=now(),
    requires_review=exists(select 1 from public.audit_findings where article_id=f.article_id and status='pending' and requires_review=true and id<>f.id)
    where slug=f.article_id;
  update public.audit_findings set status='applied',resolved_at=now(),resolved_by=auth.uid() where id=f.id;
  insert into public.review_jobs(article_id,run_after,status,loop_count,updated_at)
  values(f.article_id,now()+interval '5 minutes','pending',0,now())
  on conflict (article_id) where status='pending'
  do update set run_after=excluded.run_after,loop_count=0,updated_at=now();
  update public.topic_pages set ai_review_status='pending',review_status='pending',ai_checked_at=null
   where slug=f.article_id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.apply_topic_audit_finding(uuid) from public, anon;
grant execute on function public.apply_topic_audit_finding(uuid) to authenticated;

create or replace function public.dismiss_topic_audit_finding(p_finding_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare f public.audit_findings%rowtype;
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin') then raise exception 'admin_required'; end if;
  update public.audit_findings set status='dismissed',resolved_at=now(),resolved_by=auth.uid()
   where id=p_finding_id and status='pending' returning * into f;
  if not found then return jsonb_build_object('ok',false,'reason','finding_not_pending'); end if;
  update public.topic_pages set requires_review=exists(select 1 from public.audit_findings where article_id=f.article_id and status='pending' and requires_review=true)
   where slug=f.article_id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.dismiss_topic_audit_finding(uuid) from public, anon;
grant execute on function public.dismiss_topic_audit_finding(uuid) to authenticated;

-- Supabase Vault values are supplied during deployment; the cron job safely no-ops until both exist.
create or replace function public.invoke_topic_review_cron()
returns void
language plpgsql
security definer
set search_path = public, vault, net, pg_temp
as $$
declare project_url text; service_key text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name='project_url' limit 1;
  select decrypted_secret into service_key from vault.decrypted_secrets where name='topic_review_service_role_key' limit 1;
  if coalesce(project_url,'')='' or coalesce(service_key,'')='' then return; end if;
  perform net.http_post(
    url:=rtrim(project_url,'/')||'/functions/v1/topic-review',
    headers:=jsonb_build_object('Content-Type','application/json','apikey',service_key,'Authorization','Bearer '||service_key),
    body:='{}'::jsonb,
    timeout_milliseconds:=10000
  );
end;
$$;
revoke all on function public.invoke_topic_review_cron() from public, anon, authenticated;
do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net') then
    perform cron.schedule('topic-review-every-minute','* * * * *','select public.invoke_topic_review_cron()');
  end if;
end;
$$;
