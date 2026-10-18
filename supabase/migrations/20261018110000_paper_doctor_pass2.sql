-- Second, stricter pass of the paper doctor: every written paper is checked again (the first pass often left pages as they were). The very first version of each page is kept in first_content.
alter table public.paper_fixes add column if not exists pass int not null default 1;
alter table public.paper_fixes add column if not exists first_content text;
update public.paper_fixes set first_content = coalesce(first_content, old_content) where first_content is null;
create or replace function public.paper_candidates(n int default 1) returns setof uuid language sql stable as $$
  select id from (
    select a.id, (f.status = 'working' and f.pass >= 2) as resume, a.created_at
    from public.articles a left join public.paper_fixes f on f.article_id = a.id
    where a.published and a.deleted_at is null and a.category !~* '^stories'
      and length(a.content) between 800 and 90000
      and (f.article_id is null or f.pass < 2 or f.status = 'working')
      and (a.content ~* '\(\s*\d+\s*marks?\s*\)' or a.content ~ '(?m)^\s*(\*\*)?(Model )?answer\s*:' or a.title ~* '(saq|laq|essay|short answer|long answer|past paper)' or a.content ~ '\*\*\*\*')
  ) x order by resume desc nulls last, created_at desc limit n
$$;
revoke all on function public.paper_candidates(int) from public, anon, authenticated;
