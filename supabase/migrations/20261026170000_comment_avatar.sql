-- Comments show the commenter's account picture, not just an initial.
alter table public.story_comments add column if not exists avatar_url text;

update public.story_comments c
set avatar_url = coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
from auth.users u
where u.id = c.user_id and c.avatar_url is null
  and coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture') ~ '^https://';
