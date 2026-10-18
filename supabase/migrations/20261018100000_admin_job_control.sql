-- Lets the admin assistant see and steer the AI background jobs (pause, resume, change how often they run). Administrators only, fixed list of jobs.
create or replace function public.admin_background_jobs()
returns table (job text, schedule text, active boolean, waiting bigint)
language plpgsql security definer set search_path = public, cron as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Administrators only'; end if;
  return query
    select j.jobname::text, j.schedule::text, j.active,
      case j.jobname
        when 'review-questions' then (select count(*) from public.mcq_sets m where m.published and m.deleted_at is null and not exists (select 1 from public.mcq_review_log l where l.set_id = m.id))
        when 'paper-doctor' then (select count(*) from public.paper_candidates(1000))
        else 0 end
    from cron.job j where j.jobname in ('weekly-exams', 'review-questions', 'paper-doctor') order by j.jobname;
end $$;

create or replace function public.admin_job_control(p_job text, p_action text, p_minutes int default null)
returns text language plpgsql security definer set search_path = public, cron as $$
declare jid bigint; sched text;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Administrators only'; end if;
  if p_job not in ('weekly-exams', 'review-questions', 'paper-doctor') then raise exception 'Unknown job'; end if;
  select jobid into jid from cron.job where jobname = p_job;
  if jid is null then raise exception 'That job is not scheduled'; end if;
  if p_action = 'pause' then perform cron.alter_job(jid, active := false); return 'paused';
  elsif p_action = 'resume' then perform cron.alter_job(jid, active := true); return 'running';
  elsif p_action = 'every' and p_job <> 'weekly-exams' and p_minutes between 1 and 120 then
    sched := '*/' || p_minutes || ' * * * *';
    perform cron.alter_job(jid, schedule := sched); return 'every ' || p_minutes || ' minutes';
  end if;
  raise exception 'Unsupported action';
end $$;
revoke all on function public.admin_background_jobs() from public, anon;
revoke all on function public.admin_job_control(text, text, int) from public, anon;
grant execute on function public.admin_background_jobs() to authenticated;
grant execute on function public.admin_job_control(text, text, int) to authenticated;
