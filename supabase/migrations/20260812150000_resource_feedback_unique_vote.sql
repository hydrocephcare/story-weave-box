-- Prevents a signed-in user from voting "helpful" / "needs improvement" more
-- than once on the same resource. Rows with user_id IS NULL (anonymous
-- voters) are exempt automatically -- Postgres never treats two NULLs as
-- equal for a UNIQUE constraint, so anonymous votes stay unrestricted at the
-- DB layer (the client already applies a best-effort localStorage guard for
-- that case). This also lets the client upsert on conflict instead of
-- inserting a duplicate row when a signed-in user changes their vote.
ALTER TABLE public.resource_feedback
  ADD CONSTRAINT resource_feedback_user_vote_unique UNIQUE (user_id, resource_type, resource_id);
