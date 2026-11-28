-- Neon Data API: RLS policies call auth.uid(), so anonymous requests need
-- schema visibility even when the referenced functions themselves are callable.
-- This is additive and does not change table privileges or RLS policy logic.
GRANT USAGE ON SCHEMA auth TO anonymous;
