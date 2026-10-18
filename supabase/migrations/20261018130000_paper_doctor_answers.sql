-- The paper doctor also writes missing answers: pages of multiple-choice questions whose options are there but whose answers are not.
-- Those pages are queued at level 3 (their proposal still waits for approval in /admin/paper-fixes).
create or replace function public.paper_candidates(n int default 1) returns setof uuid language sql stable as $$
  select id from (
    select a.id, (f.status = 'working' and f.pass >= 2) as resume, a.created_at
    from public.articles a left join public.paper_fixes f on f.article_id = a.id
    where a.published and a.deleted_at is null and a.category !~* '^stories'
      and length(a.content) between 800 and 90000
      and (
        ((f.article_id is null or f.pass < 2 or f.status = 'working')
          and (a.content ~* '\(\s*\d+\s*marks?\s*\)' or a.content ~ '(?m)^\s*(\*\*)?(Model )?answer\s*:' or a.title ~* '(saq|laq|essay|short answer|long answer|past paper)' or a.content ~ '\*\*\*\*'))
        or
        ((f.article_id is null or f.pass < 3 or f.status = 'working')
          and (select count(*) from regexp_matches((regexp_split_to_array(a.content, '\n\s*(#+\s*)?\**\s*(short answer|essay|long answer|saq|laq)', 'i'))[1], '(^|\n)\s*\(?a[.)]\s+\S', 'gi')) >= 6
          and (select count(*) from regexp_matches((regexp_split_to_array(a.content, '\n\s*(#+\s*)?\**\s*(short answer|essay|long answer|saq|laq)', 'i'))[1], 'answer\s*[:：]', 'gi'))
              < 0.4 * (select count(*) from regexp_matches((regexp_split_to_array(a.content, '\n\s*(#+\s*)?\**\s*(short answer|essay|long answer|saq|laq)', 'i'))[1], '(^|\n)\s*\(?a[.)]\s+\S', 'gi')))
      )
  ) x order by resume desc nulls last, created_at desc limit n
$$;
revoke all on function public.paper_candidates(int) from public, anon, authenticated;
