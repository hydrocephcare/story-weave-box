# Ompath Study deployment sync

GitHub `main` is the single source of truth for code and deployment.

## Canonical chain

1. Lovable must be connected to `2023mkumbchb-source/story-weave-box` and commit to `main`.
2. Local/Codex work must fetch `origin/main` before editing and push completed work to `main`.
3. Vercel project `ompathstud-a7g2` must import the same repository and use `main` as its Production Branch.
4. `www.ompathstudy.com` and `ompathstudy.com` must point to that Vercel project.

Vercel settings:

- Framework preset: Vite
- Root directory: `.`
- Install command: `npm install` (or the Vercel default)
- Build command: `npm run build`
- Output directory: `dist`
- Production branch: `main`
- Automatic deployments: enabled

The single `main-sync.yml` GitHub workflow tests and builds every push to `main`; it deliberately does not deploy a second Cloudflare Pages copy. Vercel is the only production publisher for the `.com` domain. `supabase-keepalive.yml` is unrelated maintenance and does not publish site code.

The local `.vercel` link can belong to an older Vercel account/project. Do not deploy with `vercel --prod` until it has been relinked to `ompathstud-a7g2`. Git pushes to `main` remain the normal deployment path.

## Safe update sequence

```powershell
git fetch origin main
git merge origin/main
# make and verify changes
git push origin HEAD:main
```

If Lovable has pushed while local changes are in progress, fetch and merge `origin/main` again before pushing. Resolve any real conflict locally and run the build before publishing.
