-- Semester passes (KES 150) that were sold while the plan was set to 1 day. STEP 1: look at the list. STEP 2: only if it looks right, extend them.

-- STEP 1 (read only)
select id, code, plan, amount, created_at, expires_at, expires_at - created_at as length
from public.access_grants
where amount = 150 and expires_at - created_at <= interval '2 days'
order by created_at desc;

-- STEP 2 (run after checking the list above): give each of them 90 days from the day it was bought
-- update public.access_grants set expires_at = created_at + interval '90 days'
-- where amount = 150 and expires_at - created_at <= interval '2 days';
