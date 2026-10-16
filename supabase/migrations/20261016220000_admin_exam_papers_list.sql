-- Light list for the contest pickers: no question bodies leave the database (the old query downloaded every question of every published set).
create or replace function public.admin_exam_papers()
returns table (id uuid, title text, category text, slug text, question_count int, kind text)
language sql stable security invoker set search_path = public as $$
  select t.id, t.title, t.category, t.slug, t.question_count, t.kind from (
    select m.id, m.title, coalesce(m.category, 'Uncategorised') as category, m.slug,
           case when jsonb_typeof(m.questions) = 'array' then jsonb_array_length(m.questions) else 0 end as question_count,
           case when m.source_type = 'past_paper' or m.exam_year is not null then 'Past paper'
                when m.title ilike '%exam%' or m.category ilike 'Weekly Exam%' then 'Exam'
                else 'MCQ bank' end as kind
    from public.mcq_sets m
    where m.published and m.deleted_at is null
  ) t
  order by case t.kind when 'Past paper' then 0 when 'Exam' then 1 else 2 end, t.category, t.title;
$$;
grant execute on function public.admin_exam_papers() to authenticated;
