-- Browser-based Health Support uses an unguessable session ID and consent;
-- only USSD needs the network-provided caller number for session matching.
alter table public.lite_health_encounters
  alter column phone_number drop not null;
