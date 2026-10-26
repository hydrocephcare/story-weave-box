// The writing helper for stories and the author profile (served by /api/ai?task=assist). It returns text only; the writer decides what to keep.
type Reply = { text?: string; titles?: string[]; error?: string };

async function call(body: Record<string, unknown>): Promise<Reply> {
  try {
    const r = await fetch("/api/ai?task=assist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as Reply;
    if (!r.ok) throw new Error(j.error || "The helper is busy. Please try again in a minute.");
    return j;
  } catch (e) { throw new Error((e as Error).message || "The helper is busy. Please try again in a minute."); }
}

export const assistBio = async (p: { name: string; university: string; year: number | string; notes: string }) => (await call({ mode: "bio", ...p })).text ?? "";
export const assistStory = async (text: string) => (await call({ mode: "story", text })).text ?? "";
export const assistTitles = async (text: string) => (await call({ mode: "titles", text })).titles ?? [];

/** Plain paragraphs from the helper to editor HTML. */
export const paragraphsToHtml = (t: string) =>
  t.replace(/\r/g, "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br />")}</p>`).join("");
