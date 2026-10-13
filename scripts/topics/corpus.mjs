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
const sb = createClient(env.VITE_SUPABASE_URL || "https://lkgfzjwhmfjvntzphbsh.supabase.co", env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrZ2Z6andobWZqdm50enBoYnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3Nzk5MjIsImV4cCI6MjA4NzM1NTkyMn0.a2QY6TxzKNM2AhuuoDkgdKifI3XhSGhYRlhpqZpvAwo", { auth: { persistSession: false } });

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

export async function loadCorpus() {
  const live = (q) => q.eq("published", true).is("deleted_at", null);
  const [articles, mcqs, essays] = await Promise.all([
    all("articles", "id,title,slug,category,content,created_at,updated_at", live),
    all("mcq_sets", "id,title,slug,category,questions,created_at", live),
    all("essays", "id,title,slug,category,short_answer_questions,long_answer_questions,created_at", live),
  ]);
  const notes = JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8")).map((n) => ({ ...n, text: fs.existsSync(n.file) ? fs.readFileSync(n.file, "utf8") : "" }));
  return { articles, mcqs, essays, notes, fetchedAt: new Date().toISOString() };
}

if (process.argv[1].endsWith("corpus.mjs")) {
  const c = await loadCorpus();
  fs.mkdirSync(".cache", { recursive: true });
  fs.writeFileSync(path.join(".cache", "topics-corpus.json"), JSON.stringify(c));
  console.log("articles", c.articles.length, "mcq sets", c.mcqs.length, "essays", c.essays.length, "static notes", c.notes.length);
}
