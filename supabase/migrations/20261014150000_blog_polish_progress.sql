-- A long blog is polished a few pieces at a time, each time someone opens it. This remembers how many pieces are done,
-- so the work is never repeated and the next visit carries on where the last one stopped.
alter table public.blog_polish add column if not exists parts_done int not null default 0;
