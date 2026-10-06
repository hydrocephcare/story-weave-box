-- Fix MKU admission-number validation for MBChB students.
-- MKU medical students commonly use MBCHB + 9 digits, e.g. MBCHB262700349.
-- Keep the existing BMS/2023/60482 format supported as well.

create or replace function public.normalize_admission(raw text)
returns text language sql immutable as $$
  select case
    when upper(btrim(coalesce(raw, ''))) ~ '^BMS[[:space:]/\\-_.]*[0-9]{4}[[:space:]/\\-_.]*[0-9]{3,6}$'
    then regexp_replace(
      upper(btrim(raw)),
      '^BMS[[:space:]/\\-_.]*([0-9]{4})[[:space:]/\\-_.]*([0-9]{3,6})$',
      'BMS/\\1/\\2')
    when upper(btrim(coalesce(raw, ''))) ~ '^MBCHB[[:space:]/\\-_.]*[0-9]{9}$'
    then regexp_replace(
      upper(btrim(raw)),
      '^MBCHB[[:space:]/\\-_.]*([0-9]{9})$',
      'MBCHB\\1')
    else null
  end
$$;

-- Repair pending requests that were rejected only because the old validator did not know MBCHB.
do $$
declare
  r record;
  norm text;
begin
  for r in
    select user_id, entered_text
    from public.student_access
    where status = 'pending'
      and upper(coalesce(entered_text, '')) like 'MBCHB%'
  loop
    norm := public.normalize_admission(r.entered_text);
    if norm is not null and not exists (
      select 1 from public.student_access s
      where s.admission_no = norm and s.status = 'verified' and s.user_id <> r.user_id
    ) then
      update public.student_access
      set admission_no = norm,
          status = 'verified',
          method = 'format',
          note = null,
          admin_seen = true,
          reviewed_at = now()
      where user_id = r.user_id and status = 'pending';
    end if;
  end loop;
end $$;
