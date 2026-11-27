// Reads the OmpathStudy teaching corpus from Neon for the topic builder.
// Database access is server-side only: NEON_DATABASE_URL (or DATABASE_URL) is required.
// No Supabase URL, anon key, cache worker, or legacy Supabase fallback is used.
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

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
const connectionString = env.NEON_DATABASE_URL || env.DATABASE_URL || "";
if (!connectionString) throw new Error("NEON_DATABASE_URL (or DATABASE_URL) is required. Topic builds must not fall back to Supabase.");
const db = neon(connectionString);

const CACHE = ".cache/topics-corpus.json";
const COLS = {
  articles: "id,title,slug,category,content,created_at,updated_at",
  mcq_sets: "id,title,slug,category,questions,created_at,updated_at",
  essays: "id,title,slug,category,short_answer_questions,long_answer_questions,created_at,updated_at",
};
const PAGE_SIZE = 500;

async function all(table, columns, where = "published = true AND deleted_at IS NULL") {
  if (!Object.hasOwn(COLS, table) && table !== "topic_pages") throw new Error("Unsupported topic corpus table: " + table);
  const output = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const rows = await db.query(
      `SELECT ${columns} FROM public.${table} WHERE ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [PAGE_SIZE, offset],
    );
    output.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return output;
}

/** Published AI topic pages are read from Neon so static builds and sitemaps include newly published pages. */
export async function loadPublishedTopicPages() {
  try {
    return await all("topic_pages", "slug,name,category,content,reviewed,updated_at", "status = 'published'");
  } catch (error) {
    console.error("[topics] Could not read published topic pages from Neon:", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function loadCorpus() {
  const [articles, mcqs, essays] = await Promise.all([
    all("articles", COLS.articles),
    all("mcq_sets", COLS.mcq_sets),
    all("essays", COLS.essays),
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
