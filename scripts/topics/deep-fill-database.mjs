import { generateCheckedDeep } from "../../supabase/functions/_shared/contentCheck.js";
const SB = (process.env.SUPABASE_URL || "https://strfwaqvxvkhjbqrwmla.supabase.co").replace(/\/$/, "");
const KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdHJmd2Fxdnh2a2hqYnFyd21sYSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzkyNzEyMDcxLCJleHAiOjIxMDgyODA3MX0.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE", WRITE = process.env.POLISH_WRITE_KEY || "";
const GROQ = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "", GEMINI = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
const COUNT = Math.max(1, Math.min(40, Number(process.env.TOPIC_DEEP_DB_COUNT || process.argv[2] || 40)));
const PARALLEL = Math.max(1, Math.min(3, Number(process.env.TOPIC_DEEP_DB_PARALLEL || 2)));
if (!KEY || !WRITE) throw new Error("SUPABASE_ANON_KEY and POLISH_WRITE_KEY are required for secure topic updates.");
if (!GROQ.trim() || !GEMINI.trim()) throw new Error("Both GROQ_API_KEYS (writer) and GEMINI_API_KEYS (reviewer) are required.");
const headers = { apikey: KEY, Authorization: "Bearer " + KEY, "x-polish-key": WRITE, "content-type": "application/json" };
async function request(path, options = {}) {
  const r = await fetch(SB + "/rest/v1/" + path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const body = await r.text(); let json = null; try { json = body ? JSON.parse(body) : null; } catch {}
  if (!r.ok) throw new Error("Supabase " + r.status + ": " + body.slice(0, 350));
  return json;
}
const rows = await request("topic_pages?select=slug,name,category,content,updated_at&status=eq.published&order=updated_at.asc&limit=1000");
const ready = (d) => Boolean(d?.checked) && (d?.sections?.length || 0) >= 7 && (d?.vivas?.length || 0) >= 12 && (d?.mcqs?.length || 0) >= 6 && (d?.cases?.length || 0) >= 2 && (d?.facts?.length || 0) >= 6 && (d?.mistakes?.length || 0) >= 5 && (d?.exam?.length || 0) >= 12;
const queue = (Array.isArray(rows) ? rows : []).filter((r) => !ready(r.content?.deep)).slice(0, COUNT);
console.log("Published topics: " + rows.length + "; complete deep notes: " + (rows.length - rows.filter((r) => !ready(r.content?.deep)).length) + "; processing " + queue.length + ".");
let next = 0, saved = 0, failed = 0;
const worker = async () => {
  while (true) {
    const i = next++; if (i >= queue.length) return;
    const row = queue[i];
    try {
      const deep = await generateCheckedDeep({ name: row.name, category: row.category || "Medicine", base: row.content || {}, past: [] },
        { GROQ_API_KEYS: GROQ, GEMINI_API_KEYS: GEMINI }, fetch, 240000);
      const content = { ...(row.content || {}), deep };
      const result = await request("topic_pages?slug=eq." + encodeURIComponent(row.slug) + "&status=eq.published", {
        method: "PATCH", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ content, updated_at: new Date().toISOString() }),
      });
      if (!Array.isArray(result) || !result.length) throw new Error("Page changed while processing or deep-note write was rejected.");
      saved++; console.log("deep notes saved and Gemini-checked: " + row.name);
    } catch (e) { failed++; console.error("left in queue for retry: " + row.name + ": " + String(e?.message || e).slice(0, 180)); }
  }
};
await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
console.log("Live deep-note queue: " + saved + " saved; " + failed + " held; " + Math.max(0, rows.length - saved) + " still pending.");
if (failed) process.exitCode = 1;
