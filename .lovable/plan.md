## Goal
Fix the critical bugs and SEO/structure problems on ompathstudy.com in one focused pass.

## What I will fix (in this order)

### 1. "Set not found" on homepage links (CRITICAL BUG)
- Recent items on homepage use `buildMcqPath(item)` but `item` may be missing `slug`. Fix `Index.tsx` query to include slug for ALL types (mcq_sets, articles, flashcards, stories) and fall back to `${id}-${slugify(title)}` when slug is null.
- Update `getMcqSetBySlugOrId` / equivalents to also accept the bare `id` as a final fallback (so even legacy/unsynced rows resolve).

### 2. "e.trim is not a function" when adding category
- Bug is in `AdminEditor.tsx` category add: `newCategoryName.trim()` is called on a non-string. Coerce with `String(newCategoryName ?? "")` and guard the handler. Also fix anywhere `.trim()` is called on possibly non-string values in MCQ generate flow.

### 3. Remove "OMPATH" branding from titles/meta everywhere
- Audit `seo.ts`, `Index.tsx`, `BlogPost.tsx`, `McqStudy.tsx`, `og-preview` edge function. Replace patterns like `${title} | OMPATH`, `… – OMPATH`, etc. with clean `${title}` or `${title} – {Category}`.
- Ensure every page sets a real `<meta name="description">` (strip markdown/HTML, 155 chars). When article has no description, auto-derive from first 155 chars of stripped content.

### 4. Multi-key Gemini rotation (no Lovable AI fallback)
- Add `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` secrets (request via add_secret).
- Refactor edge functions (`generate-content`, `generate-exam`, `mcq-quality-fix`, `content-upgrade`, `auto-update-articles`, `bulk-cleanup`, `mcq-auto-audit`) to use a shared `callGemini()` helper that rotates through all available keys on 429/5xx and removes the Lovable AI path entirely.

### 5. MCQ exam-style header (across all MCQ pages)
- In `McqStudy.tsx` / `McqViewer.tsx` / `ExamMode.tsx`, render a top "exam paper" header card with:
  - Institution: "Mount Kenya University" (default, configurable in settings)
  - Unit / Category name
  - Exam title
  - Number of questions, estimated time, attempt count (from `user_answers` aggregate)
  - Date
- Style as a bordered card resembling a CAT cover sheet.

### 6. Article page upgrades
- Better markdown rendering: tables get horizontal scroll wrapper + zebra rows + sticky header cells; bullets/numbers/headings styled clearly.
- Mid-article inline "Continue Reading" card after ~50% scroll position (related article from same category, with thumbnail + description).
- "Related Articles" carousel at the bottom (same category, horizontally scrolling).
- Comments section (simple Lovable Cloud table `article_comments` with name + body, RLS open-read / authed-write).

### 7. Admin MCQ editing parity with articles
- In `AdminEditor.tsx` MCQ tab, allow:
  - Editing existing MCQ sets (load by id, prefill title/category/notes/questions).
  - Setting category dropdown (same picker as articles).
  - Setting a thumbnail (cover image URL or generated).

### 8. Crawler / share-link rendering
- Verify `og-preview` edge function returns proper SSR HTML for `/blog/*`, `/mcqs/*`, `/flashcards/*`, `/stories/*` so ChatGPT/Claude/Google can read full title + description + first paragraph.
- Update `vercel.json` rewrites to route bot user-agents to `og-preview`.

## Out of scope for this pass (will flag, not fix)
- Full comments moderation UI, payment flow changes, PWA tweaks.

## Technical notes
- All Supabase changes via migration tool.
- Keep design tokens (teal, Source Serif/Sans). No hardcoded colors.
- Edge function changes auto-deploy.

## Confirmation needed before I start
1. OK to add `GEMINI_API_KEY_2` and `GEMINI_API_KEY_3` secrets (you'll paste values)?
2. OK to create `article_comments` table (public read, authed insert)?
3. Default institution name = "Mount Kenya University" — confirm or give different default?
