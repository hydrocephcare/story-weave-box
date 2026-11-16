-- Persist the automated clinical review independently from a human review.
-- Existing topic rows are intentionally left unchanged (NULL means legacy/unreviewed metadata).
alter table public.topic_pages
  add column if not exists generator_model text,
  add column if not exists ai_review_status text,
  add column if not exists ai_review_model text,
  add column if not exists ai_reviewed_at timestamptz,
  add column if not exists ai_review_fix_rounds smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.topic_pages'::regclass
      and conname = 'topic_pages_ai_review_status_check'
  ) then
    alter table public.topic_pages
      add constraint topic_pages_ai_review_status_check
      check (ai_review_status is null or ai_review_status = 'passed');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.topic_pages'::regclass
      and conname = 'topic_pages_ai_review_fix_rounds_check'
  ) then
    alter table public.topic_pages
      add constraint topic_pages_ai_review_fix_rounds_check
      check (ai_review_fix_rounds is null or ai_review_fix_rounds between 0 and 2);
  end if;
end $$;

create index if not exists topic_pages_ai_review_idx
  on public.topic_pages (ai_review_status, ai_reviewed_at desc)
  where ai_review_status is not null;
