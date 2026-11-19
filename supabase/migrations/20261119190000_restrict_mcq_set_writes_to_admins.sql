-- Remove the legacy permissive policy that allowed anonymous and authenticated
-- users to insert, update, and delete MCQ banks. Published banks remain readable
-- under the existing published-row SELECT policy while the secure content API
-- migration is completed.
drop policy if exists "Allow all operations for managing mcq_sets" on public.mcq_sets;

create policy "Admins manage mcq_sets"
on public.mcq_sets
for all
to authenticated
using ((select public.has_role(auth.uid(), 'admin'::public.app_role)))
with check ((select public.has_role(auth.uid(), 'admin'::public.app_role)));
