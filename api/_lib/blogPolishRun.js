// The polish itself, shared by the page-open endpoint (api/_lib/blogPolish.js) and the batch job (scripts/blogs/polish-batch.mjs).
// `ask(prompt, timeoutMs, maxTokens)` returns the model's text. Nothing here talks to the database.
import { CHUNK_PROMPT, META_PROMPT, NOTE_PROMPT, QUESTIONS_PROMPT, REPAIR_PROMPT } from "./blogPolishPrompts.js";
import { chunksOf, cleanMeta, kindOf, missingSentences, hasLocked, parseJson, plain, restorePictures, soundPolish, VERDICTS } from "./blogPolishCore.js";

const unfence = (s) => String(s ?? "").replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim();

// The polish may never strip more than about a fifth of what the author wrote. A note gains an intro and practice questions, so only its floor is lower.
const RULES = {
  note: { headings: true, maxRatio: 2.0, minWords: 0.8, minRatio: 0.7 },
  questions: { headings: false, maxRatio: 1.5, minWords: 0.8, minRatio: 0.8 },
  part: { headings: false, maxRatio: 1.6, minWords: 0.8, minRatio: 0.75 },
};

/**
 * Returns { title, description, image_query, verdict, reason, content, status }.
 * `content` is null when the text is left as it was (the reason says why). status is "done", or "partial" when the AI was too slow for the text.
 * `chunk: true` lets long pages be done piece by piece (batch job only; the page-open endpoint has a one-minute limit).
 */
export async function polishArticle(a, ask, { chunk = false } = {}) {
  const meta = parseJson(await ask(META_PROMPT(a, plain(a.content).slice(0, 2600) || a.title), 20000, 600)) ?? {};
  const verdict = VERDICTS.includes(meta.verdict) ? meta.verdict : "keep";
  const { title, description } = cleanMeta(meta.title, meta.description);
  const image = String(meta.image ?? "").replace(/[^A-Za-z0-9 ,.'()-]/g, " ").replace(/ +/g, " ").trim().slice(0, 60);
  const result = { title: title || null, description: description || null, image_query: image.length >= 3 ? image : null, verdict, reason: String(meta.reason ?? "").slice(0, 240), content: null, status: "done" };
  const note = (t) => { result.reason = [result.reason, t].filter(Boolean).join(" | ").slice(0, 400); };

  const text = a.content;
  const kind = kindOf(text);
  if (verdict === "irrelevant") { note("text left as it was"); return result; }
  if (hasLocked(text)) { note("has locked sections: text left as it was"); return result; }
  if (kind === "scan") { note("scanned pages: shown as pictures"); return result; }
  if (kind === "formatted") { note("question layout already fine"); return result; }

  const long = text.length > 14000;
  if (long && !chunk) { note("too long to polish on open; the batch job does it"); return result; }
  const make = (part, first) => (kind === "note" ? (long ? CHUNK_PROMPT(a, part, first) : NOTE_PROMPT(a, part)) : QUESTIONS_PROMPT(a, part));

  // one piece: ask, check it keeps at least 80% of what the author wrote, and if not ask once more naming what was left out
  const once = async (part, rules, first) => {
    let out = restorePictures(part, unfence(await ask(make(part, first), long ? 55000 : 40000, 8000)));
    let bad = soundPolish(part, out, rules);
    if (bad && /^(words|numbers|length)/.test(bad)) {
      out = restorePictures(part, unfence(await ask(REPAIR_PROMPT(a, out, missingSentences(part, out), bad), long ? 55000 : 40000, 8000)));
      bad = soundPolish(part, out, rules);
    }
    return { out, bad };
  };

  try {
    let out, bad;
    if (!long) {
      ({ out, bad } = await once(text, kind === "note" ? RULES.note : RULES.questions, true));
    } else {
      const parts = chunksOf(text, 8500);
      const done = [];
      for (let i = 0; i < parts.length; i++) {
        const r = await once(parts[i], RULES.part, i === 0);
        if (r.bad) { note(`polish rejected in part ${i + 1}: ${r.bad}`); return result; }
        done.push(r.out);
      }
      out = done.join("\n\n");
      bad = soundPolish(text, out, kind === "note" ? RULES.note : RULES.questions);
    }
    if (bad) { note(`polish rejected: ${bad}`); result.rejected = out; } else result.content = out;
  } catch (e) {
    result.status = "partial";
    note("text will be tried again");
  }
  return result;
}
