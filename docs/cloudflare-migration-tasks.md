# Cloudflare migration: task queue

Updated 2026-10-23. Resume rule: read this file, check real resource state, continue at the first task that is not `completed`.
Retry rule for network errors: up to 8 tries, waiting 2, 4, 8, 16 ... seconds. After that mark `blocked` and go to an independent task.
Stop-and-ask boundaries: production DNS or traffic, deleting source data, paid resources, unidentified destination, weaker auth.

| # | Task | Depends on | Status | Verified by |
| --- | --- | --- | --- | --- |
| 1 | Pages preview upload `preview-1023` | none | completed | Wrangler reported "Deployment complete"; https://preview-1023.ompathstudy.pages.dev returns 200 (deployment 9db13e89) |
| 2 | Smoke tests on preview (pages, assets, auth form) | 1 | completed (static only) | Routes /, /papers, /imed, /clinical/osce-2019, /clinical/osce-stations, /login return 200; JS bundles, images, manifest, sw.js, robots.txt load. Not tested: sign-in, database-driven pages (not a browser test) |
| 3 | Export old database (all tables) to local JSON | none | completed | 89 public tables compared with source count(*): every table with data matches exactly (0 mismatches). Three backup tables (articles_content_backup_20261020, mcq_sets_backup_oct16, seo_backup_oct16) not exported; they remain in the source. auth.users (34) not yet exported |
| 4 | Verify export integrity | 3 | completed | Counts verified as above; files parse |
| 5 | Back up destination (new project) before import | 4 | completed | 24 tables and 3 auth users saved locally (scratchpad dest-backup) |
| 6 | Import in dependency order, count checks per batch | 4, 5 | done | Data imported into strfwaqvxvkhjbqrwmla with `scripts/import-old-data.mjs`; sign-in confirmed by the owner |
| 7 | Third project `lkgfzjwhmfjvntzphbsh` ownership | none | blocked | In neither authorized account. Needs: the email of the Supabase account that owns it |
| 8 | Port `topic-ai` Worker | none | pending | 401 without sign-in, 403 for non-admin, deploys |
| 9 | Worker admin-path tests | an existing admin session | blocked | Needs an admin sign-in token from the owner; test-admin creation is not allowed |
| 10 | Replace exposed Cloudflare token | 1 | pending (action for owner) | Owner revokes in dashboard, creates least-privilege token, sets `CLOUDFLARE_API_TOKEN` locally; I verify the old one no longer works |
| 11 | Storage files (148 MB) | quota reset or upgrade | blocked | Old project storage API is quota-blocked |
