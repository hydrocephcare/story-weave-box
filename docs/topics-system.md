# Topic pages (one page per subject, built from the library)

**What it does.** For every disease, bone, hormone or process the library covers, there is a page at `/topic/<name>` that gathers
the notes, definitions, images, practice questions and related topics from everywhere on the site. `/topics` lists them A to Z.
The same words inside any study note become links to their topic page. The sitemap and the HTML that Google reads are rebuilt on every deploy.

## How it is built

| Step | File | When it runs |
|---|---|---|
| Read notes, MCQ sets, essays | `scripts/topics/corpus.mjs` | every build |
| Find topics, collect material, write `public/topics/*.json` | `scripts/topics/build-topics.mjs` | every build (`npm run build` calls `scripts/topics/run.mjs`, which never fails the build) |
| Plain-HTML copy for Google and link previews, sitemap entries | `scripts/topics/prerender-topics.mjs` (called from `scripts/library/prerender.mjs`) | every build |
| The page people see | `src/pages/TopicPage.tsx`, `src/pages/TopicsIndex.tsx`, `src/lib/topics.ts` | in the browser |
| Links from notes to topics | `linkTopics` in `src/lib/noteLinks.js` (study notes), `src/lib/keyword-link.tsx` (database notes) | in the browser |
| AI overviews, a few a day | `scripts/topics/ai-fill.mjs`, `.github/workflows/topics-daily.yml` | daily |

`public/topics/` is generated and is not committed. AI overviews are committed in `src/data/topicAi/<slug>.json`.

## Adding or fixing topics

* A new note is picked up automatically: its title, headings and wording feed the builder on the next deploy.
* To make sure a subject gets a page, add its name to `scripts/topics/seeds.mjs` (the builder still needs at least one note about it).
* To stop a word becoming a topic, add it to `GENERIC_TOKENS` in the same file.
* An abbreviation (such as ODD) works when a note writes the full name followed by the abbreviation in brackets.

## AI overviews (optional)

1. In GitHub: Settings > Secrets and variables > Actions > New repository secret `ANTHROPIC_API_KEY`.
2. Optional: a Vercel deploy hook as the secret `VERCEL_DEPLOY_HOOK`, so the site is rebuilt every day even when nothing else changed.
3. The workflow writes up to five overviews a day for the most-used topics that have none. Change the number when you run it by hand.

Safety: the model is given only what the site already says and is told to leave out anything it is not sure of; anything that looks like a
dose is removed; each overview is saved as `"reviewed": false` and the page says it is AI-written and not yet reviewed by a doctor. After a
doctor has checked one, set `"reviewed": true` in its file and the warning disappears.

## Reading tools

`src/components/AccessibilityTools.tsx` is the faint tab on the left edge of every page: text size, line spacing, an easy-read font, high
contrast, underlined links, stop motion, read aloud (this page or the selected text) and a translate menu. Choices are remembered on the device.

## Pages written on demand (the "AI fills the gaps" part)

When someone opens a topic the library has little on (or no page at all, for example /topic/lupus-nephritis), the page first shows the
site's existing material. It then calls the same-origin **/api/topic-write** route, which validates the Neon Auth session, checks the
topic_page_generation entitlement in Neon, drafts with Groq and independently reviews with Gemini. If the dedicated writer is busy, the
browser can fall back to the Neon-backed **/api/ai-chat** route and assemble the page in short parts. The completed page is saved through
the Neon Data API's **publish_topic_page** RPC. It is written once per topic; subsequent readers load the saved row from Neon.

The server requires GROQ_API_KEYS (or GROQ_API_KEY) and GEMINI_API_KEYS (or GEMINI_API_KEY) in the Vercel environment.
If generation, review, authentication or persistence fails, the page keeps its existing library material and offers a retry; an unreviewed
or malformed page must not be published.

The production Neon database must contain topic_pages, the review metadata columns, publish_topic_page and save_topic_deep.
These are already present in the production Neon branch checked on 2026-11-27. Keep the historical SQL migration files in the repository
as migration history; do not rerun the old Supabase migrations against the retired project.

## Pictures from the web

src/lib/webMedia.ts asks Wikipedia and Wikimedia Commons (free, no key, no AI) for the lead picture, a short definition and a few figures, shows the
author and licence, and remembers the answer on the device for 30 days. If nothing is found the page simply has no picture.

To correct or approve a page, edit its row in topic_pages (set reviewed to true when a doctor has checked it) or delete the row to have it rewritten.

## How the AI writes and publishes now (Neon)

The dedicated Neon-backed writer is the only route that publishes topic pages. It validates the Neon Auth session, consumes the topic-generation entitlement,
uses Groq for drafting and Gemini for independent review, then persists through the server-only `publish_topic_page` RPC. The RPC refuses unsafe
or unreviewed content and caps new topic pages at 150 per day. Ompath AI chat remains a separate question-and-answer feature; it does not publish pages.
Deep exam notes use `/api/topic-write` with `mode: "deep"`, require a Neon Auth session, and persist through the server-only `save_topic_deep` RPC.

The daily GitHub workflow authenticates to the same-origin `/api/topic-maintenance` route with a short-lived GitHub Actions OIDC token.
The route verifies the repository, main branch and exact workflow identity, then reads and updates `articles`, `mcq_sets`, `essays` and
`topic_pages` using the server-side Neon connection and AI provider keys already held by the deployment. No database password or long-lived
write secret is stored in GitHub Actions. The workflow rebuilds static topic pages, updates the image sitemap, reviews legacy pages with Gemini,
and fills the deep-note queue. The Vercel build merges committed, Gemini-passed content without rereading the entire database.
Newly generated static pages are included in the topic index, prerendered HTML and sitemap on the next deployment.
