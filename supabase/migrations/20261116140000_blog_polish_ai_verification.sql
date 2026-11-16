alter table public.blog_polish
  add column if not exists ai_review_status text,
  add column if not exists ai_review_model text,
  add column if not exists ai_reviewed_at timestamptz,
  add column if not exists ai_review_issues jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.blog_polish'::regclass
      and conname = 'blog_polish_ai_review_status_check'
  ) then
    alter table public.blog_polish
      add constraint blog_polish_ai_review_status_check
      check (ai_review_status is null or ai_review_status in ('passed', 'held'));
  end if;
end $$;

create index if not exists blog_polish_ai_review_status_idx
  on public.blog_polish (ai_review_status, updated_at);
