-- Autopilot job: "SEO fixes by itself". It shows up on the Autopilot page with Off / Ask me / Auto. On Auto, the admin pages rewrite up to 10 weak
-- search descriptions at most every 6 hours while you are signed in; each run is logged with an Undo. Needs 20261016160000_autopilot.sql. Safe to run twice.
insert into public.agent_capabilities (key, title, description, mode, sort) values
  ('seo_autofix', 'SEO fixes by itself', 'Finds posts whose search description is missing, too short or too long and rewrites up to 10 at a time (at most every 6 hours, while you are signed in). The old text is kept in the log so Undo puts it back. Never deletes anything.', 'ask', 15)
on conflict (key) do update set title = excluded.title, description = excluded.description, sort = excluded.sort;
