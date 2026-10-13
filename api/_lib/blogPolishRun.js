// The polish itself, shared by the page-open endpoint (api/_lib/blogPolish.js) and the batch job (scripts/blogs/polish-batch.mjs).
// `ask(prompt, timeoutMs, maxTokens)` returns the model's text. Nothing here talks to the database.
import { BANK_PROMPT, CHUNK_PROMPT, META_PROMPT, NOTE_PROMPT, PAPER_PROMPT } from "./blogPolishPrompts.js";
import { chunksOf, cleanMeta, kindOf, parseJson, plain, restorePictures, soundPolish, VERDICTS } from "./blogPolishCore.js";

const unfence = (s) => String(s ?? "").replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim();

/**
 * Returns { title, description, verdict, reason, content, status }.
 * `content` is null when the text is left as it was (the reason says why). status is "done", or "partial" when the AI was too slow for the text.
 * `chunk: true` lets long pages be done piece by piece (batch job only; the page-open endpoint has a one-minute limit).
 */
export async function polishArticle(a, ask, { chunk = false } = {}) {
  const meta = parseJson(await ask(META_PROMPT(a, plain(a.content).slice(0, 2600) || a.title), 20000, 600)) ?? {};
  const verdict = VERDICTS.includes(meta.verdict) ? meta.verdict : "keep";
  const { title, description } = cleanMeta(meta.title, meta.description);
  const result = { title: title || null, description: description || null, verdict, reason: String(meta.reason ?? "").slice(0, 240), content: null, status: "done" };
  const note = (t) => { result.reason = [result.reason, t].filter(Boolean).join(" | ").slice(0, 400); };

  const text = a.content;
  const kind = kindOf(text);
  if (verdict === "irrelevant") { note("text left as it was"); return result; }
  if (kind === "scan") { note("scanned pages: shown as pictures"); return result; }
  if (kind === "formatted") { note("question format already fine"); return result; }

  const long = text.length > 14000;
  if (long && !chunk) { note("too long to polish on open; the batch job does it"); return result; }
  const prompts = { note: NOTE_PROMPT, bank: BANK_PROMPT, paper: PAPER_PROMPT };

  try {
    let out;
    if (!long) {
      out = unfence(await ask(prompts[kind](a, text), 40000, 8000));
    } else {
      const parts = chunksOf(text, 8500);
      const done = [];
      for (let i = 0; i < parts.length; i++) {
        const p = kind === "note" ? CHUNK_PROMPT(a, parts[i], i === 0) : prompts[kind](a, parts[i]);
        const piece = unfence(await ask(p, 55000, 8000));
        const bad = soundPolish(parts[i], piece, { headings: false, maxRatio: 1.6 });
        if (bad) { note(`polish rejected in part ${i + 1}: ${bad}`); return result; }
        done.push(piece);
      }
      out = done.join("\n\n");
    }
    // a note gains an intro and practice questions, so it may be longer; banks and papers only change shape
    out = restorePictures(text, out);
    const bad = soundPolish(text, out, { headings: kind === "note", maxRatio: kind === "note" ? 2.0 : 1.4, minWords: kind === "note" ? 0.68 : 0.8 });
    if (bad) { note(`polish rejected: ${bad}`); result.rejected = out; } else result.content = out;
  } catch (e) {
    result.status = "partial";
    note("text will be tried again");
  }
  return result;
}
