-- Stories: anyone could edit or delete any story (the old policy was "for all using (true)"). From now on:
--   * everyone can read published stories;
--   * a signed-in student can add a story that carries their own owner tag, and edit or delete only stories that carry it;
--   * an admin can do everything.
-- The owner tag is the same fingerprint the app makes in src/lib/storyOwner.ts: "owner-" + the first 8 bytes of sha256('ompath-story-owner:' || user id), in hex.
-- Run this once in the Supabase SQL editor.

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'stories' loop
    execute format('drop policy %I on public.stories', p.policyname);
  end loop;
end $$;

alter table public.stories enable row level security;

create or replace function public.story_owner_tag(uid uuid) returns text language sql immutable as
$$ select 'owner-' || encode(substring(sha256(convert_to('ompath-story-owner:' || uid::text, 'UTF8')) from 1 for 8), 'hex') $$;

create policy "stories read published" on public.stories for select using (published = true and deleted_at is null);
create policy "stories read own" on public.stories for select to authenticated using (tags @> array[public.story_owner_tag(auth.uid())]);
create policy "stories admin all" on public.stories for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "stories add own" on public.stories for insert to authenticated with check (tags @> array[public.story_owner_tag(auth.uid())]);
create policy "stories edit own" on public.stories for update to authenticated using (tags @> array[public.story_owner_tag(auth.uid())]) with check (tags @> array[public.story_owner_tag(auth.uid())]);
create policy "stories delete own" on public.stories for delete to authenticated using (tags @> array[public.story_owner_tag(auth.uid())]);

revoke insert, update, delete on public.stories from anon;
