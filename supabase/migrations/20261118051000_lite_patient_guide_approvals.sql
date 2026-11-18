-- Patient-guide approval registry for OmpathStudy Lite.
-- References existing main-site articles without modifying them.
create table if not exists public.lite_patient_guide_approvals (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null unique references public.articles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  patient_language text not null default 'en' check (patient_language in ('en','sw')),
  audience text not null default 'general' check (audience in ('general','adult_women','pregnancy','postpartum','adolescent','caregiver')),
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewer_name text,
  reviewer_qualification text,
  registration_body text,
  registration_number text,
  reviewer_attested boolean not null default false,
  review_notes text,
  reviewed_at timestamptz,
  review_due_at timestamptz,
  article_updated_at_snapshot timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lite_patient_guide_approval_complete check (
    status <> 'approved' or (
      reviewer_user_id is not null and
      length(trim(coalesce(reviewer_name,''))) >= 3 and
      length(trim(coalesce(reviewer_qualification,''))) >= 3 and
      length(trim(coalesce(registration_body,''))) >= 2 and
      length(trim(coalesce(registration_number,''))) >= 2 and
      reviewer_attested = true and reviewed_at is not null and
      review_due_at is not null and article_updated_at_snapshot is not null
    )
  )
);
create index if not exists lite_patient_guide_approvals_status_due_idx
  on public.lite_patient_guide_approvals(status, review_due_at);
alter table public.lite_patient_guide_approvals enable row level security;
revoke all on table public.lite_patient_guide_approvals from anon, authenticated;
grant select, insert, update, delete on table public.lite_patient_guide_approvals to service_role;
