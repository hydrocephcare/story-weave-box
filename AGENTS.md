# Compact Instructions

This project is mid-way through extracting the "Aponeurosis 01 (Limb SPOT)" PDF
(`public/Aponeurosis 01(Limb SPOT).pdf`, 1508 pages) into per-paper study articles
published to the live Supabase `articles` table, per the manifest at
`scratch/aponeurosis-manifest.json` (14 papers in the first-half scope, pages 0-753).

When compacting context, always preserve:
- The full list of the 14 papers from `scratch/aponeurosis-manifest.json`, with which
  are already published (with slugs) and which are still pending.
- For the paper currently in progress: which question images have been viewed,
  which answer-key pages have been read, and any answers already transcribed but
  not yet written to a markdown draft.
- The crop rectangle / script already tuned for the current paper's slide template
  (e.g. `scratch/crop-p5.mjs`), if one exists.
- The location of the working repo used for all site changes: the `story-weave-box`
  clone in the session scratchpad — NOT this directory. Site content, image uploads,
  and publish scripts live there, not in OMPATHSTUDY.
- The BlogPost.tsx image-rendering fix (in `preprocessContent`, exemption for
  `^!\[.*?\]\(\S+\)$` lines before the punctuation-spacing regex runs) — re-verify
  this survived after every `git pull` merge in that repo.
- Do not restart or redo any paper that has already been published.

When resuming after a compact, on a "continue" instruction: pick up the current
paper exactly where transcription/cropping/uploading left off, rather than
re-deriving the whole plan from scratch.
