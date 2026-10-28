-- Copies of question banks (mcq_sets.questions) and question posts (articles.content) taken just before their answer positions were evened out by
-- scripts/mcq/answer-positions.mjs or the "Answer positions" panel in Admin. Such a fix only moves options and the answer pointer; this table keeps
-- the exact earlier version so any bank or post can be put back (the script's "restore" mode). Administrators (and the service key) only.
create table if not exists public.mcq_answer_position_backups (
  id bigint generated always as identity primary key,
  kind text not null default 'mcq_set' check (kind in ('mcq_set', 'article')),
  item_id uuid not null,
  before jsonb not null,
  moves jsonb not null default '[]'::jsonb,
  source text not null default 'script',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists mcq_answer_position_backups_item on public.mcq_answer_position_backups (kind, item_id, created_at desc);
alter table public.mcq_answer_position_backups enable row level security;
drop policy if exists "admins read answer position backups" on public.mcq_answer_position_backups;
create policy "admins read answer position backups" on public.mcq_answer_position_backups for select to authenticated using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "admins add answer position backups" on public.mcq_answer_position_backups;
create policy "admins add answer position backups" on public.mcq_answer_position_backups for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
