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

When someone opens a topic the library has little on (or one with no page at all, for example /topic/lupus-nephritis), the page shows what the
site has straight away and asks the **topic-ai** Supabase edge function (supabase/functions/topic-ai) to write the rest with **Gemini**, through the
same Lovable gateway Ompath AI uses (secret LOVABLE_API_KEY, already set). The answer is saved in the topic_pages table, so the model is asked **once per
topic**: the next reader gets the saved copy free. Credit savers: short prompt, one call per topic ever, a daily cap (default 60 new pages, TOPIC_AI_DAILY_CAP),
nothing is generated for topics the site already covers well, and non-medical names are remembered as rejected.

If anything fails (no key, model down, cap reached) the reader still sees the site's own material plus a "try again" button.

Switch it on (once): run supabase/migrations/20261012180000_topic_pages.sql, and make sure the topic-ai function is deployed (Lovable does it on sync).
No Vercel keys are needed. The model falls back to OmniRoute, then to GEMINI_API_KEY, if the gateway fails.
The daily GitHub job (a few overviews a day) uses the GEMINI_API_KEY secret.

## Pictures from the web

src/lib/webMedia.ts asks Wikipedia and Wikimedia Commons (free, no key, no AI) for the lead picture, a short definition and a few figures, shows the
author and licence, and remembers the answer on the device for 30 days. If nothing is found the page simply has no picture.

To correct or approve a page, edit its row in topic_pages (set reviewed to true when a doctor has checked it) or delete the row to have it rewritten.
