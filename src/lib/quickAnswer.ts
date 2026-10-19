// A short answer to what was searched, streamed from the site's AI and kept for the session. Used by the search box (Ctrl+K) and the /search page.
// The free allowance is shared, so a visitor cannot use up the AI by searching.
export const FREE_PER_DAY = 12;
const dayKey = () => `ompath_search_ai_${new Date().toISOString().slice(0, 10)}`;
export const usedToday = () => { try { return Number(localStorage.getItem(dayKey()) ?? 0); } catch { return 0; } };
const spend = () => { try { localStorage.setItem(dayKey(), String(usedToday() + 1)); } catch { /* ignore */ } };

export const cachedAnswer = (q: string): string | null => { try { return sessionStorage.getItem(`ompath_qa2_${q.trim().toLowerCase()}`); } catch { return null; } };

/** Worth asking about: a real question or term, not a course code. */
export const askable = (q: string) => q.trim().length >= 4 && !/^[A-Za-z]{3,4}\s?\d{3,4}/.test(q.trim());

/** Streams a short answer (three bullets); `onText` gets the text so far. Throws when nothing came back. */
async function once(q: string, sources: { title: string; subtitle?: string; snippet?: string }[], signal: AbortSignal, onText: (t: string) => void): Promise<string> {
  const query = q.trim();
  const body = { question: `Explain "${query}" for a medical student in exactly three short bullet points, about 60 words in all. Start with what it is. Use the site's notes first. If a word appears misspelled, infer and answer the most likely intended medical term, especially when any part of the query is clearly medical. Only reply with NOT_MEDICAL when the query is clearly unrelated to medicine or health even after correcting likely typos.`, history: [], sources: sources.slice(0, 5).map((h) => ({ kind: "site", title: h.title, subtitle: h.subtitle, snippet: (h.snippet ?? "").slice(0, 900) })) };
  const r = await fetch("/api/ai-chat", { method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok || !r.body) throw new Error("off");
  const reader = r.body.getReader(); const dec = new TextDecoder();
  let buf = "", out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const l of lines) {
      const d = l.trim(); if (!d.startsWith("data:")) continue;
      const p = d.slice(5).trim(); if (!p || p === "[DONE]") continue;
      try { const piece = JSON.parse(p)?.choices?.[0]?.delta?.content; if (piece) { out += piece; if (!"NOT_MEDICAL".startsWith(out.trim().toUpperCase().slice(0, 11))) onText(out); } } catch { /* partial */ }
    }
  }
  if (!out.trim() || /^NOT_MEDICAL/i.test(out.trim())) throw new Error("not medical");
  spend();
  try { sessionStorage.setItem(`ompath_qa2_${query.toLowerCase()}`, out); } catch { /* ignore */ }
  return out;
}

/** The server tries every key in turn; if the whole request still fails, it is asked once more before giving up. */
export async function streamQuickAnswer(q: string, sources: { title: string; subtitle?: string; snippet?: string }[], signal: AbortSignal, onText: (t: string) => void): Promise<string> {
  try { return await once(q, sources, signal, onText); } catch (e) {
    if ((e as Error).name === "AbortError" || (e as Error).message === "not medical") throw e;
    await new Promise((r) => setTimeout(r, 1200));
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    return once(q, sources, signal, onText);
  }
}
