-- Public catalogue for the Exam Center and MCQ banks: titles, units and question counts without the question bodies.
create or replace function public.exam_catalog()
returns table (id uuid, title text, slug text, category text, created_at timestamptz, question_count int, kind text, exam_year text, university text)
language sql stable security invoker set search_path = public as $$
  select m.id, m.title, m.slug, coalesce(m.category, 'Uncategorized'), m.created_at,
         case when jsonb_typeof(m.questions) = 'array' then jsonb_array_length(m.questions) else 0 end,
         case when m.source_type = 'past_paper' or m.exam_year is not null then 'past_paper'
              when m.title ilike '%exam%' or m.category ilike 'Weekly Exam%' then 'exam'
              else 'bank' end,
         m.exam_year, m.university
  from public.mcq_sets m
  where m.published and m.deleted_at is null
  order by m.created_at desc;
$$;
grant execute on function public.exam_catalog() to anon, authenticated;
