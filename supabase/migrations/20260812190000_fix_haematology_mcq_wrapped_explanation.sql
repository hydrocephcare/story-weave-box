-- A hard line-break split "RBC)" into "RB" + "C)". The article renderer then
-- interpreted C) as another choice after the answer, producing a duplicate
-- Choices block. Repair the published source without changing its meaning.
update public.articles
set content = replace(content, E'low RB\nC) reflects pancytopenia', 'low RBC) reflects pancytopenia'),
    updated_at = now()
where slug = 'haematology-exam-mcqs'
  and content like E'%low RB\nC) reflects pancytopenia%';
