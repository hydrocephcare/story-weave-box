# OmpathStudy verification staging

This branch contains a read-only operational dashboard. It checks public production endpoints and does not initiate payments, modify Neon records, or unlock accounts.

## Dashboard
https://ompathstudy-verification.hydrocephcare.workers.dev

## Auto-deploy
GitHub Actions workflow: `.github/workflows/deploy-verification-dashboard.yml`

To enable automatic deployment after changes are pushed to `verification-staging`, add these repository Actions secrets:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token scoped to this account with Workers Scripts Write permission.
- `CLOUDFLARE_ACCOUNT_ID`: the OmpathStudy Cloudflare account ID.

The dashboard Worker has already been deployed once directly. Until both GitHub secrets are configured, the GitHub auto-deploy workflow cannot authenticate and will fail. Do not place tokens in source files or commit messages.

## Full application preview status
This is not yet a full OmpathStudy app preview. The full application still needs a separate staging build/deployment and isolated test credentials. Production Vercel remains unchanged.
