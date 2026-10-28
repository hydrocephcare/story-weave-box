do $$ declare cmd text; begin
  select command into cmd from cron.job where jobname = 'weekly-exams';
  if cmd is null then raise exception 'template job weekly-exams missing'; end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'note-cases';
  perform cron.schedule('note-cases', '15 */3 * * *', replace(replace(cmd, '/generate-exam', '/note-cases'), '{"lane":0}', '{}'));
end $$;
select jobname, schedule, active from cron.job where jobname = 'note-cases';
