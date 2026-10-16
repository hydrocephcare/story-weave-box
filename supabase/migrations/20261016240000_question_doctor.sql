-- 1. Housekeeping: the scheduler's run history grows every minute (65k rows, 11 MB in a day) and is never read.
create or replace function private.purge_cron_history() returns void language sql as $$
  delete from cron.job_run_details where end_time < now() - interval '2 days';
  delete from net._http_response where created < now() - interval '1 day';
$$;
select cron.unschedule(jobid) from cron.job where jobname = 'purge-cron-history';
select cron.schedule('purge-cron-history', '23 3 * * *', 'select private.purge_cron_history()');

-- 2. The question doctor's log: which sets the AI reviewer has checked, and where it disagreed with the stored answer key.
create table if not exists public.mcq_review_log (
  set_id uuid primary key references public.mcq_sets(id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  checked int not null default 0,
  dropped int not null default 0,
  disputed jsonb not null default '[]'::jsonb
);
alter table public.mcq_review_log enable row level security;
drop policy if exists "Admins read review log" on public.mcq_review_log;
create policy "Admins read review log" on public.mcq_review_log for select using (public.has_role(auth.uid(), 'admin'));

-- 3. Tidy labelling inside stored questions: "A. " typed into option text and "12." typed in front of a question (the page adds its own letters and numbers).
create table if not exists public.mcq_sets_backup_oct16 as select id, questions from public.mcq_sets;
create or replace function private.tidy_questions(qs jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(
    jsonb_set(
      jsonb_set(e.v, '{question}', to_jsonb(regexp_replace(coalesce(e.v->>'question',''), '^\s*(Q\s*\d+|\d+|Question\s*\d+)\s*[\.\):\-]\s*', '', 'i'))),
      '{options}',
      coalesce((select jsonb_agg(to_jsonb(regexp_replace(o, '^\s*\(?[A-Ea-e][\.\)]\s+', ''))) from jsonb_array_elements_text(e.v->'options') with ordinality x(o, n)), e.v->'options')
    ) order by e.ord), '[]'::jsonb)
  from jsonb_array_elements(qs) with ordinality e(v, ord)
$$;
update public.mcq_sets set questions = private.tidy_questions(questions)
 where jsonb_typeof(questions) = 'array' and questions::text ~ '"(\s*\(?[A-Ea-e][\.\)]\s|\s*(Q\s*\d+|\d+|Question\s*\d+)\s*[\.\):\-]\s)';
