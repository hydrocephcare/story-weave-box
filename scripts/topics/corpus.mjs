// Reads everything the site teaches, in one place, for the topic builder: notes (database and markdown), MCQ sets, essays.
// Uses the public key (it only reads what visitors can already read). The result is cached in .cache/ so the builder can be re-run quickly.
//   node scripts/topics/corpus.mjs            read the database and write .cache/topics-corpus.json
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const envFile = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
// the committed .env names the real project, so it wins over any variable the host may have set for something else
const env = { ...process.env, ...Object.fromEntries(envFile.split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])) };
// the host's build may not have .env or the variables, so fall back to the public address and key the website itself ships with
// Every deploy reads the whole library to find topics (about 30 MB). Those reads go through the Cloudflare cache (R2) so deploys do not use up the free Supabase data
// limit; for a build the cache may serve a copy up to 6 hours old. If the cache is unreachable the read goes to Supabase as before.
const CACHE_WORKER = "https://ompath-sb-cache.hydrocephcare.workers.dev";
const SB_BASE = env.VITE_SUPABASE_URL || "https://strfwaqvxvkhjbqrwmla.supabase.co";
const buildFetch = async (input, init) => {
  try {
    const url = typeof input === "string" ? input : input.url;
    const path = url.startsWith(SB_BASE) ? url.slice(SB_BASE.length) : "";
    if ((init?.method || "GET").toUpperCase() === "GET" && /^\/rest\/v1\/(articles|mcq_sets|essays|topic_pages)\?/.test(path)) {
      const h = new Headers(init?.headers);
      const range = h.get("range") || "", prefer = h.get("prefer") || "";
      if (/^(\d+-\d*)?$/.test(range) && /^(count=(exact|planned|estimated))?$/.test(prefer)) {
        const r = await fetch(`${CACHE_WORKER}/?bt=1&u=${encodeURIComponent(path)}${range ? `&rg=${range}` : ""}${prefer ? `&pf=${prefer}` : ""}`, { signal: init?.signal });
        if (r.ok) return r;
      }
    }
  } catch { /* fall through to Supabase */ }
  return fetch(input, init);
};
const sb = createClient(SB_BASE,env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cmZ3YXF2eHZraGpicXJ3bWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MTIwNzEsImV4cCI6MjEwODI4ODA3MX0.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE", { auth: { persistSession: false }, global: { fetch: buildFetch } });

async function all(table, cols, filter) {
  const out = [];
  for (let from = 0; ; from += 50) {
    let q = sb.from(table).select(cols).order("created_at", { ascending: false }).range(from, from + 49);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) { console.error(table, error.message); break; }
    out.push(...data);
    if (data.length < 50) break;
  }
  return out;
}

/** Topic pages already written and published on the site (by the AI or an editor), so every deploy includes them in the static pages and the sitemap. */
export async function loadPublishedTopicPages() {
  try {
    const { data, error } = await sb.from("topic_pages").select("slug,name,category,content,reviewed,updated_at").eq("status", "published").order("updated_at", { ascending: false }).limit(2000);
    if (error) { console.error("topic_pages", error.message); return []; }
    return data ?? [];
  } catch (e) { console.error("topic_pages", String(e)); return []; }
}

const CACHE = ".cache/topics-corpus.json";
const COLS = {
  articles: "id,title,slug,category,content,created_at,updated_at",
  mcq_sets: "id,title,slug,category,questions,created_at,updated_at",
  essays: "id,title,slug,category,short_answer_questions,long_answer_questions,created_at,updated_at",
};

/** Reads only what changed since the cached copy: the ids that are live now (tiny), plus the rows updated since. Reading the whole library costs about 30 MB of the free data limit. */
async function refresh(table, prevRows, since, live) {
  const ids = new Set((await all(table, "id", live)).map((r) => r.id));
  const byId = new Map(prevRows.filter((r) => ids.has(r.id)).map((r) => [r.id, r]));   // drops anything unpublished or deleted since
  for (const r of await all(table, COLS[table], (q) => live(q).gte("updated_at", since))) byId.set(r.id, r);
  const missing = [...ids].filter((id) => !byId.has(id));
  for (let i = 0; i < missing.length; i += 20) {
    const { data, error } = await sb.from(table).select(COLS[table]).in("id", missing.slice(i, i + 20));
    if (error) { console.error(table, error.message); break; }
    for (const r of data) byId.set(r.id, r);
  }
  return [...byId.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function loadCorpus() {
  const live = (q) => q.eq("published", true).is("deleted_at", null);
  let articles, mcqs, essays;
  let prev = null;
  try { if (!process.env.FULL_CORPUS && fs.existsSync(CACHE)) prev = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch { prev = null; }
  const ageDays = prev ? (Date.now() - Date.parse(prev.fetchedAt)) / 86_400_000 : Infinity;
  if (prev && ageDays < 8 && prev.articles?.length > 100) {
    const since = new Date(Date.parse(prev.fetchedAt) - 3_600_000).toISOString();
    console.log("[corpus] incremental read since " + since + " (a full read happens when the cache is over 8 days old or FULL_CORPUS=1)");
    [articles, mcqs, essays] = await Promise.all([refresh("articles", prev.articles, since, live), refresh("mcq_sets", prev.mcqs, since, live), refresh("essays", prev.essays, since, live)]);
  } else {
    console.log("[corpus] full read");
    [articles, mcqs, essays] = await Promise.all([all("articles", COLS.articles, live), all("mcq_sets", COLS.mcq_sets, live), all("essays", COLS.essays, live)]);
  }
  const notes = JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8")).map((n) => ({ ...n, text: fs.existsSync(n.file) ? fs.readFileSync(n.file, "utf8") : "" }));
  return { articles, mcqs, essays, notes, fetchedAt: new Date().toISOString() };
}

if (process.argv[1].endsWith("corpus.mjs")) {
  const c = await loadCorpus();
  fs.mkdirSync(".cache", { recursive: true });
  fs.writeFileSync(path.join(".cache", "topics-corpus.json"), JSON.stringify(c));
  console.log("articles", c.articles.length, "mcq sets", c.mcqs.length, "essays", c.essays.length, "static notes", c.notes.length);
}
