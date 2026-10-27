-- The signed-in student's open mistakes: the latest attempt at each question was wrong.
-- Options and the explanation are read from the question set, so the notebook can show the right answer.
create or replace function public.my_mistakes(p_limit int default 60)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return null; end if;
  return coalesce((
    select jsonb_agg(row_to_json(t) order by t.at desc) from (
      select l.mcq_set_id as set_id, m.title as set_title, m.slug as set_slug,
             coalesce(nullif(m.category, ''), 'Other') as category,
             l.question_index as idx, l.question_text as question,
             l.selected_answer as selected, l.correct_answer as correct,
             m.questions -> l.question_index -> 'options' as options,
             m.questions -> l.question_index ->> 'explanation' as explanation,
             l.created_at as at
      from (
        select distinct on (a.mcq_set_id, a.question_index) a.*
        from public.user_answers a
        where a.user_id = uid
        order by a.mcq_set_id, a.question_index, a.created_at desc
      ) l
      join public.mcq_sets m on m.id = l.mcq_set_id and m.deleted_at is null
      where not l.is_correct
      order by l.created_at desc
      limit greatest(1, least(coalesce(p_limit, 60), 200))
    ) t
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.my_mistakes(int) from public, anon;
grant execute on function public.my_mistakes(int) to authenticated;
