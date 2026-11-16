-- Let scheduled server-side topic workers update legacy pages using the same private
-- write key already used by the blog-polish worker. The public anon key alone cannot write.
drop policy if exists "server updates reviewed topics" on public.topic_pages;
create policy "server updates reviewed topics"
  on public.topic_pages for update to anon, authenticated
  using (public.polish_write_ok())
  with check (public.polish_write_ok());
grant update (content, model, reviewed, updated_at, generator_model, ai_review_status, ai_review_model, ai_reviewed_at, ai_review_fix_rounds)
  on public.topic_pages to anon, authenticated;
