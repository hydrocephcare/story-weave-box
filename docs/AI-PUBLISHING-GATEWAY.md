# OmpathStudy AI publishing gateway

One remote MCP server that lets authorized AI assistants (ChatGPT, Claude, any MCP client) read, edit, add images to and publish OmpathStudy lessons. It runs as a Cloudflare Worker (`cloudflare/workers/publish-mcp`), so it does not depend on any computer being on.

## Status (read this first)

| | State |
|---|---|
| Code: 32 tools, OAuth 2.1 sign-in, upload links, audit log, kill switch | **Implemented** |
| Unit tests (21) and end-to-end test (81 checks, real OAuth + PKCE + MCP calls, local Worker, **fake database**) | **Passing** |
| Worker `ompath-publish-mcp` on Cloudflare | **Deployed**: `https://ompath-publish-mcp.hydrocephcare.workers.dev` |
| Live checks done: `/health`, `/mcp` rejects tokenless calls (401), OAuth discovery metadata | **Verified** |
| Database writes to the production site | **Not active.** The Worker has no `SUPABASE_SERVICE_ROLE_KEY` yet. Reads and writes fail until the owner sets it (below). |
| `https://publish.ompathstudy.com/mcp` | **Not created.** Wrangler's login cannot edit DNS (zone is read-only). See "Custom domain". |
| Connected to ChatGPT | **No.** Not configured, not tested. |
| Connected to Claude | **No.** The endpoint speaks the standard protocol, but no Claude client has been connected yet. |
| Image optimisation (resize/recompress) | **Not implemented.** Images are validated (real file type, 8 MB cap) and stored as uploaded. |
| Admin web page | **Not built.** Administration is done through the `admin_*` tools (below). |
| Acceptance test ("Acute Abdomen" in a new ChatGPT chat) | **Not run**, because of the first four blockers. |

## What the audit found

- **Production site:** React/Vite app on Vercel (`www.ompathstudy.com`).
- **Production database:** Supabase project `strfwaqvxvkhjbqrwmla`. This is the one the live site reads (checked in the browser's network calls). The older project `dekyjrfwvavtoivqivno` is a retired copy; do not point anything at it.
- **Lessons** are rows of the `articles` table: `id`, `title`, `slug`, `content` (Markdown), `category` (for example `Year 4: Surgery`), `unit`, `published`, `deleted_at` (soft delete), `tags`, `meta_title`, `meta_description`, `featured_image`, `updated_at`. Years, semesters and units have their own small tables. There is no separate "draft" column: unpublished means `published = false`.
- **Content format:** Markdown with `##` sections, tables, lists and `![alt](url)` images. This gateway uses it as is; no new schema.
- **Images:** the R2 bucket `ompathstudy`, served from `https://cdn.ompathstudy.com` (existing worker `ompath-r2-upload` uses it for admin uploads). The gateway writes to the same bucket under `ai/YYYY/MM/`, so nothing else is touched.
- **Existing Workers (left alone):** `ompath-r2-upload`, `ompath-sb-cache` (public reads are cached at the edge for up to 3 hours per lesson), `ompath-generate-content`.
- **Auth on the site:** Supabase Auth; admins are found with the `has_role(user, 'admin')` function. The gateway reuses exactly that: only an admin can authorize an assistant.
- **Two behaviours that matter for publishing:**
  1. **Edge cache.** After a publish the gateway asks `ompath-sb-cache` to forget the lesson (needs the optional `PURGE_KEY` secret). Without it, readers can see the old text for up to 3 hours.
  2. **Rewritten-note overlay.** Many Year 4 lessons are shown from a file in the website repository (`public/blog-fixes/<id>.md`) instead of the stored text. A database edit does not change what readers see for those. The tools report `overlay: true` for such lessons so the assistant can tell the owner.

## Architecture

```
ChatGPT / Claude / other MCP client
        │  HTTPS, Streamable HTTP  +  OAuth 2.1 access token
        ▼
Cloudflare Worker  ompath-publish-mcp
  /mcp        32 tools (stateless; nothing depends on chat history)
  /authorize  consent page: owner signs in with the OmpathStudy ADMIN account, ticks permissions
  /token /register  OAuth (PKCE, dynamic client registration)   /.well-known/*  discovery
  /upload/<signed token>   one-shot image upload link
        │                         │                       │
        ▼                         ▼                       ▼
 Supabase `articles`        R2 `ompathstudy`        KV (new namespace `OMPATH_PUBLISH_MCP`)
 (service role, that        images under ai/        OAuth clients and grants, drafts, revisions,
  table only)                                        audit log, rate limits, kill switch
```

Safety design:

- **Edits never touch the live lesson.** `update_lesson`, `save_lesson_draft` and the image tools write a **draft** (in KV). The live row changes only in `publish_lesson`.
- **Partial updates.** `update_lesson` replaces, appends or inserts one section and leaves the rest of the lesson as it is. Replacing a whole published lesson needs `confirm_full_replace`.
- **Publish needs the preview.** `publish_lesson` needs `preview_hash` (from `preview_lesson`, a hash of the exact text) and `confirm_user_approved: true`. If the draft changed since the preview, or the lesson was changed by someone else since the draft began, it refuses.
- **Verified publishing.** After writing, the Worker reads the row back and compares it. `published: true, verified: true` is returned only if the database confirms. A copy of the previous text is saved as a revision before every change.
- **Destructive actions** (`unpublish_lesson`, `archive_lesson`, `remove_lesson_image`, `delete_section`, `admin_revoke_client`) need an explicit confirm flag. Archive is the site's soft delete.
- **No duplicates.** `create_lesson` refuses when the slug or the title in that category already exists.
- **Least privilege.** Scopes: `lessons:read`, `lessons:write`, `lessons:publish`, `images:write`, `admin`. The owner ticks them on the consent page; a tool outside the granted scopes is refused.
- **Database exposure.** The service-role key is a Worker secret and is used only for the `articles` table, the `category_counts` function and the year/semester/unit lists. Only a whitelist of columns can be written. No student, profile, payment or credential table is ever read.
- **Sanitising and validation.** Script/iframe/handler/`javascript:` content is stripped; images must be on `cdn.ompathstudy.com` and have alt text; tables need a header row; length is capped.
- **Rate limits:** 40 writes and 200 reads per minute per assistant (approximate, because KV is eventually consistent), and 6 failed sign-ins per ten minutes per address.
- **Audit log:** every write, success or failure, records assistant, owner email, operation, lesson, time and revision (90 days).
- **Kill switch:** `admin_set_publishing {enabled:false}` stops every write at once; reading keeps working.

## Tools

Reading: `search_lessons`, `list_lessons`, `get_lesson`, `get_lesson_metadata`, `list_categories`, `list_years`, `list_semesters`, `list_units`, `get_lesson_images`, `validate_lesson`, `preview_lesson`, `get_lesson_preview`, `get_publishing_status`, `get_recent_changes`, `get_system_status`, `list_images`.

Writing: `create_lesson` (unpublished), `update_lesson`, `save_lesson_draft`, `publish_lesson`, `unpublish_lesson`, `archive_lesson`.

Images: `upload_image`, `upload_multiple_images` (up to 6; base64), `request_upload_url` (for clients that cannot send bytes: returns signed single-use links valid ten minutes; `PUT` the raw image to the link), `attach_image_to_lesson` (under a section heading, start or end, with alt text and caption), `replace_lesson_image`, `remove_lesson_image`.

Owner only (`admin` scope): `admin_list_clients`, `admin_revoke_client`, `admin_set_publishing`, `admin_get_audit_log`.

## One-time setup the owner must do

1. **Give the Worker its database key.** In the Supabase dashboard of project `strfwaqvxvkhjbqrwmla`, copy the **service_role** key, then run in `cloudflare/workers/publish-mcp`:
   ```
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```
   (paste when asked; it is never shown or stored in the repository).
2. *(Recommended)* **Cache purge:** `npx wrangler secret put PURGE_KEY` with the same key the `ompath-sb-cache` Worker uses, so a publish clears the 3-hour edge cache.
3. **Check** `https://ompath-publish-mcp.hydrocephcare.workers.dev/mcp` after connecting: the `get_system_status` tool should report `database: ok`.

### Custom domain (`publish.ompathstudy.com`)

The Cloudflare login used for deployment can read but not edit DNS. To use the preferred address, either add the Worker custom domain in the Cloudflare dashboard (Workers & Pages → `ompath-publish-mcp` → Settings → Domains & Routes → Add → Custom domain → `publish.ompathstudy.com`; Cloudflare creates the DNS record itself), or re-login wrangler with DNS permission and add to `wrangler.jsonc`:
```
"routes": [{ "pattern": "publish.ompathstudy.com", "custom_domain": true }]
```
then `npx wrangler deploy`. Until then the working endpoint is the `workers.dev` address. Assistants that already connected to the old address must be re-added after the move.

## Connecting assistants

Endpoint: `https://ompath-publish-mcp.hydrocephcare.workers.dev/mcp`  (later `https://publish.ompathstudy.com/mcp`). Each assistant authorizes **independently** and shows up as its own client, so you can revoke one without affecting the others. Authorizing opens a page on the gateway where you sign in with your OmpathStudy **admin** account and tick the permissions. Start with read-only if you want to test.

**Claude (Claude Code):**
```
claude mcp add --transport http ompathstudy https://ompath-publish-mcp.hydrocephcare.workers.dev/mcp
```
then run `/mcp` and choose *Authenticate*.

**Claude (claude.ai / desktop):** Settings → Connectors → Add custom connector → paste the endpoint → complete the sign-in.

**ChatGPT:** custom MCP connectors are available only on some plans and, as far as is known to the author, behind *Developer mode* (Settings → Apps & Connectors → Advanced settings → Developer mode, then Create connector with the endpoint and OAuth). On Business/Enterprise a workspace admin may have to allow it, and then the connector can be shared at workspace level rather than set up in each chat. ChatGPT only supports OAuth or no authentication for such connectors (not a static bearer token), which is why the gateway uses OAuth. Availability and menu names change; **this has not been tested with ChatGPT**, so treat these steps as unverified until a real connection works.

**Other MCP clients** (JSON config):
```json
{ "mcpServers": { "ompathstudy": { "type": "http", "url": "https://ompath-publish-mcp.hydrocephcare.workers.dev/mcp" } } }
```
Any client that supports Streamable HTTP and OAuth 2.1 with dynamic client registration works. Discovery is at `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server`.

## Revoking and rotating

- Ask any connected assistant to run `admin_list_clients`, then `admin_revoke_client` with the client id and confirmation. That client's tokens stop working at once; others are unaffected.
- Panic button: `admin_set_publishing {enabled:false}`.
- Rotate the upload-signing secret: `npx wrangler secret put UPLOAD_SIGNING_SECRET` (outstanding upload links stop working).
- Rotate the database key: create a new service-role key in Supabase and run `wrangler secret put SUPABASE_SERVICE_ROLE_KEY` again.
- Access tokens last one hour and are renewed with refresh tokens; revoking removes both.

## Publishing a lesson with images (what the assistant should do)

1. `search_lessons` → `get_lesson` (note `overlay`).
2. `update_lesson` (for example `insert_after_section` with a new "Appendicitis" section).
3. `upload_multiple_images` (or `request_upload_url` + `PUT`).
4. `attach_image_to_lesson` for each image, with alt text and caption.
5. `validate_lesson`, then `preview_lesson`; show the user the outline, the section changes and the images.
6. Only after the user says publish: `publish_lesson` with the `preview_hash` and `confirm_user_approved: true`.
7. Report the returned `url`, `verified` and `revision`. If `overlay` or `cache_purged: false` is reported, tell the user.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Tools return `Database 401/403` or `Invalid API key` | `SUPABASE_SERVICE_ROLE_KEY` not set or wrong. |
| "This account is not an OmpathStudy admin." | The account lacks the `admin` role (`has_role`). |
| Published, but readers see the old text | Edge cache (set `PURGE_KEY`, or wait up to 3 hours) or the lesson has an overlay file in `public/blog-fixes/`. |
| "Publishing is switched off" | Kill switch is on: `admin_set_publishing {enabled:true}`. |
| "The draft changed since it was previewed" | Call `preview_lesson` again and show the user. |
| "Only JPEG, PNG and WebP…" | The file's bytes are checked, not its name or type. |
| Connector says unauthorized after a revoke | Re-authorize the assistant. |
| 429 on the consent page | Too many wrong passwords; wait ten minutes. |

## Security notes

- Passwords are checked against the site's own sign-in and never stored. Secrets live only in Cloudflare Worker secrets. The consent page cannot be framed and its form is bound to the browser that opened it.
- The deployed Worker uses `workers.dev`; once the custom domain exists, delete the `workers_dev` route to close the old address.
- The service-role key bypasses database row rules. The Worker confines it to the `articles` table by construction (a fixed set of calls and a column whitelist), but anyone who can edit the Worker code can widen that. Keep deploy rights with the owner.
- Revisions and drafts are stored in KV (revisions one year, drafts 30 days, audit 90 days).

## Developing and testing

```
cd cloudflare/workers/publish-mcp
npm install --legacy-peer-deps
npm test                          # unit tests
npx tsc --noEmit                  # types
node test/e2e/fake-supabase.mjs 9911 &
npx wrangler dev -c wrangler.test.jsonc --port 8787 --local &
node test/e2e/run.mjs             # full OAuth + tool flow against the fake database
```
