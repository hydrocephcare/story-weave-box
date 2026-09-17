-- Make the supplementary catalogue answer-ready without transferring full
-- article/quiz payloads to every learner's phone.
update public.articles
set contains_answer_key = true
where published = true
  and deleted_at is null
  and content ~* E'(^|\\n)\\s*(#{1,6}\\s*)?((model|suggested|correct)\\s+)?answers?\\b|(^|\\n)\\s*(#{1,6}\\s*)?(explanation|rationale|marking scheme)\\b|correct answer\\s*[:\\-]';

update public.mcq_sets m
set contains_answer_key = true,
    answer_key_verified = true
where published = true
  and deleted_at is null
  and jsonb_typeof(m.questions::jsonb) = 'array'
  and jsonb_array_length(m.questions::jsonb) > 0
  and not exists (
    select 1
    from jsonb_array_elements(m.questions::jsonb) q
    where not (q ? 'correct_answer')
       or q->'correct_answer' = 'null'::jsonb
  );

update public.flashcard_sets f
set contains_answer_key = true,
    answer_key_verified = true
where published = true
  and deleted_at is null
  and jsonb_typeof(f.cards::jsonb) = 'array'
  and jsonb_array_length(f.cards::jsonb) > 0
  and not exists (
    select 1
    from jsonb_array_elements(f.cards::jsonb) card
    where nullif(btrim(card->>'answer'), '') is null
  );
