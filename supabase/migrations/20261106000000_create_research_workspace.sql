-- OmpathStudy Research Workspace
-- Private student research projects and private document storage.
create table if not exists public.research_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 180),
  programme text not null default '',
  university text not null default '',
  stage text not null default 'topic_selection'
    check (stage in ('topic_selection','proposal_development','ethics_approval','data_collection','data_analysis','report_writing','defence','completed')),
  research_question text not null default '',
  notes text not null default '',
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists research_projects_user_updated_idx on public.research_projects(user_id, updated_at desc);
alter table public.research_projects enable row level security;
drop policy if exists "Students read own research projects" on public.research_projects;
create policy "Students read own research projects" on public.research_projects for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Students create own research projects" on public.research_projects;
create policy "Students create own research projects" on public.research_projects for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Students update own research projects" on public.research_projects;
create policy "Students update own research projects" on public.research_projects for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Students delete own research projects" on public.research_projects;
create policy "Students delete own research projects" on public.research_projects for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.research_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.research_projects(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);
create index if not exists research_documents_project_idx on public.research_documents(project_id, created_at desc);
alter table public.research_documents enable row level security;
drop policy if exists "Students read own research documents" on public.research_documents;
create policy "Students read own research documents" on public.research_documents for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Students add own research documents" on public.research_documents;
create policy "Students add own research documents" on public.research_documents for insert to authenticated with check (auth.uid() = user_id and exists (select 1 from public.research_projects p where p.id = project_id and p.user_id = auth.uid()));
drop policy if exists "Students delete own research documents" on public.research_documents;
create policy "Students delete own research documents" on public.research_documents for delete to authenticated using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('research-documents','research-documents',false,10485760,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Students read own research files" on storage.objects;
create policy "Students read own research files" on storage.objects for select to authenticated using (bucket_id='research-documents' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Students upload own research files" on storage.objects;
create policy "Students upload own research files" on storage.objects for insert to authenticated with check (bucket_id='research-documents' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Students update own research files" on storage.objects;
create policy "Students update own research files" on storage.objects for update to authenticated using (bucket_id='research-documents' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='research-documents' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Students delete own research files" on storage.objects;
create policy "Students delete own research files" on storage.objects for delete to authenticated using (bucket_id='research-documents' and (storage.foldername(name))[1]=auth.uid()::text);
