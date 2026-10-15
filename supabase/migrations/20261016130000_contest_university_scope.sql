-- Which universities a contest is open to. An empty list means every university; a list of 2, 3 or more limits registration to those universities.
alter table public.contests add column if not exists university_ids uuid[] not null default '{}';
comment on column public.contests.university_ids is 'Universities allowed to register. Empty = open to all active universities.';
