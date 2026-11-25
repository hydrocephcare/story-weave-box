alter table public.lite_students
  add column if not exists pin_hash text,
  add column if not exists pin_salt text,
  add column if not exists session_token_hash text,
  add column if not exists session_expires_at timestamptz,
  add column if not exists parent_phone text,
  add column if not exists parent_sms_opt_in boolean not null default false,
  add column if not exists preferred_language text not null default 'en',
  add column if not exists school_name text,
  add column if not exists registration_channel text not null default 'web',
  add column if not exists consent_at timestamptz;

create index if not exists lite_students_study_level_idx on public.lite_students (study_level);
create index if not exists lite_attempts_student_attempted_idx on public.lite_attempts (student_id, attempted_at desc);
create index if not exists lite_sms_deliveries_student_date_idx on public.lite_sms_deliveries (student_id, delivery_date desc);

create table if not exists public.lite_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 3 and 140),
  body text not null check (length(trim(body)) between 3 and 1200),
  audience_study_level text,
  include_parents boolean not null default false,
  status text not null default 'draft' check (status in ('draft','queued','sent','failed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivery_summary jsonb not null default '{}'::jsonb
);
alter table public.lite_announcements enable row level security;

create table if not exists public.lite_attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.lite_students(id) on delete cascade,
  attendance_date date not null default current_date,
  status text not null check (status in ('present','absent','late','excused')),
  recorded_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  unique(student_id, attendance_date)
);
alter table public.lite_attendance enable row level security;

create table if not exists public.lite_airtime_rewards (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.lite_students(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0 and amount <= 1000),
  currency text not null default 'KES',
  reason text not null check (length(trim(reason)) between 3 and 240),
  status text not null default 'pending' check (status in ('pending','approved','sent','failed','cancelled')),
  provider_reference text,
  approved_by uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.lite_airtime_rewards enable row level security;

create index if not exists lite_announcements_created_idx on public.lite_announcements (created_at desc);
create index if not exists lite_attendance_date_idx on public.lite_attendance (attendance_date desc);
create index if not exists lite_airtime_rewards_status_idx on public.lite_airtime_rewards (status, created_at desc);
