-- Reveal access is independently configurable from the general page paywall.
-- 0 = Reveal is free for everyone; >0 = Reveal requires an active subscription/pass.
insert into public.app_settings (key, value)
values ('reveal_price_kes', '5')
on conflict (key) do nothing;

create or replace function public.can_reveal_content()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'authenticated', (select auth.uid()) is not null,
    'subscribed', public.has_active_subscription(),
    'free', coalesce((select value from public.app_settings where key = 'reveal_price_kes'), '5')::numeric <= 0,
    'can_reveal',
      public.has_active_subscription()
      or coalesce((select value from public.app_settings where key = 'reveal_price_kes'), '5')::numeric <= 0
  );
$$;

revoke all on function public.can_reveal_content() from public;
grant execute on function public.can_reveal_content() to anon, authenticated;
