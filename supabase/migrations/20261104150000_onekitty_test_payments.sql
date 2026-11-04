-- OneKitty test transactions are private backend records. No client role can read or mutate them.
create table if not exists public.onekitty_test_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_ref text not null unique,
  kitty_id bigint not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'KES',
  phone_number text not null,
  payment_mode text not null check (payment_mode in ('CHECKOUT','STK_REQUEST')),
  requested_channel_code text,
  provider_payment_ref text,
  request_reference text,
  checkout_url text,
  callback_status text not null default 'pending' check (callback_status in ('pending','callback_reported_success','callback_reported_failure')),
  callback_result_code text,
  callback_result_desc text,
  callback_channel_code text,
  callback_transaction_code text,
  callback_received_at timestamptz,
  callback_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists one kitty_test_payments_user_created_idx
  on public.onekitty_test_payments (user_id, created_at desc);
alter table public.onekitty_test_payments enable row level security;
revoke all on table public.onekitty_test_payments from anon, authenticated;
grant all on table public.onekitty_test_payments to service_role;
