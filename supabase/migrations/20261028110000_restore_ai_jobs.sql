-- Makes the question writers automatic again (they were lost in the October Supabase move).
-- Every newly published note is picked up by these jobs on its own: MCQs, flashcards and SAQ/LAQ practice are written
-- one note per run, and a checker reviews the new questions. Paste into Supabase > SQL Editor > Run (once).
-- It copies the working "weekly-exams" job's address and key, so no key is typed or shown here.
do $$ declare cmd text; begin
  select command into cmd from cron.job where jobname = 'weekly-exams';
  if cmd is null then raise exception 'template job weekly-exams missing'; end if;
  perform cron.unschedule(jobid) from cron.job where jobname in ('note-mcqs', 'note-flashcards', 'note-essays', 'review-questions');
  perform cron.schedule('note-mcqs',        '*/3 * * * *', replace(replace(cmd, '/generate-exam', '/note-mcqs'),       '{"lane":0}', '{}'));
  perform cron.schedule('note-flashcards',  '*/3 * * * *', replace(replace(cmd, '/generate-exam', '/note-flashcards'), '{"lane":0}', '{}'));
  perform cron.schedule('note-essays',      '*/4 * * * *', replace(replace(cmd, '/generate-exam', '/note-essays'),     '{"lane":0}', '{}'));
  perform cron.schedule('review-questions', '*/5 * * * *', replace(cmd, '{"lane":0}', '{"review":true}'));
end $$;

select jobname, schedule, active from cron.job where jobname in ('note-mcqs', 'note-flashcards', 'note-essays', 'review-questions') order by jobname;
