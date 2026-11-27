// Reads the public OmpathStudy teaching corpus through Neon Data API.
// Uses a short-lived anonymous Neon Auth token; no PostgreSQL password is needed in GitHub Actions.
import fs from "node:fs";
import path from "node:path";
import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";

function readDotEnv() {
  if (!fs.existsSync(".env")) return {};
  return Object.fromEntries(fs.readFileSync(".env", "utf8").split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }));
}
const env = { ...readDotEnv(), ...process.env };
const AUTH_URL = env.NEON_AUTH_URL || env.VITE_NEON_AUTH_URL;
const DATA_API_URL = env.NEON_DATA_API_URL || env.VITE_NEON_DATA_API_URL;
if (!AUTH_URL || !DATA_API_URL) throw new Error("NEON_AUTH_URL and NEON_DATA_API_URL are required.");

const client = createClient({
  auth: { adapter: SupabaseAuthAdapter(), url: AUTH_URL, allowAnonymous: true },
  dataApi: {
    url: DATA_API_URL,
    options: { global: { headers: env.POLISH_WRITE_KEY ? { "x-polish-key": env.POLISH_WRITE_KEY } : {} } },
  },
});

const CACHE = ".cache/topics-corpus.json";
const COLS = {
  articles: "id,title,slug,category,content,created_at,updated_at",
  mcq_sets: "id,title,slug,category,questions,created_at,updated_at",
  essays: "id,title,slug,category,short_answer_questions,long_answer_questions,created_at,updated_at",
};
const PAGE_SIZE = 500;

async function all(table, columns, filter) {
  const output = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = client.from(table).select(columns).order("created_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
    if (filter === "library") query = query.eq("published", true).is("deleted_at", null);
    if (filter === "topics") query = query.eq("status", "published");
    const { data, error } = await query;
    if (error) throw new Error("Neon Data API " + table + ": " + error.message);
    const rows = data || [];
    output.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return output;
}

export async function loadPublishedTopicPages() {
  return all("topic_pages", "slug,name,category,content,reviewed,updated_at", "topics");
}

export async function loadCorpus() {
  const [articles, mcqs, essays] = await Promise.all([
    all("articles", COLS.articles, "library"),
    all("mcq_sets", COLS.mcq_sets, "library"),
    all("essays", COLS.essays, "library"),
  ]);
  const notes = JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8"))
    .filter((note) => !note.unlisted)
    .map((note) => ({ ...note, text: fs.existsSync(note.file) ? fs.readFileSync(note.file, "utf8") : "" }));
  return { articles, mcqs, essays, notes, fetchedAt: new Date().toISOString() };
}

if (process.argv[1]?.endsWith("corpus.mjs")) {
  const corpus = await loadCorpus();
  fs.mkdirSync(".cache", { recursive: true });
  fs.writeFileSync(path.join(".cache", "topics-corpus.json"), JSON.stringify(corpus));
  console.log("Neon corpus:", corpus.articles.length, "articles,", corpus.mcqs.length, "MCQ sets,", corpus.essays.length, "essays,", corpus.notes.length, "static notes");
}
