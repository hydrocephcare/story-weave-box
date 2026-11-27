// Reads the OmpathStudy teaching corpus through the authenticated topic-maintenance API.
import fs from "node:fs";
import { maintenanceRequest } from "./maintenance-client.mjs";

const PAGE_SIZE = 50;
const COLS = ["articles", "mcq_sets", "essays"];

async function all(table) {
  const output = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await maintenanceRequest("corpus", { table, limit: PAGE_SIZE, offset });
    const rows = result.rows || [];
    output.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return output;
}

export async function loadPublishedTopicPages() {
  return all("topic_pages");
}

export async function loadCorpus() {
  const [articles, mcqs, essays] = await Promise.all([
    all(COLS[0]), all(COLS[1]), all(COLS[2]),
  ]);
  const notes = JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8"))
    .filter((note) => !note.unlisted)
    .map((note) => ({ ...note, text: fs.existsSync(note.file) ? fs.readFileSync(note.file, "utf8") : "" }));
  return { articles, mcqs, essays, notes, fetchedAt: new Date().toISOString() };
}

if (process.argv[1]?.endsWith("corpus.mjs")) {
  const corpus = await loadCorpus();
  fs.mkdirSync(".cache", { recursive: true });
  fs.writeFileSync(".cache/topics-corpus.json", JSON.stringify(corpus));
  console.log("Ompath corpus:", corpus.articles.length, "articles,", corpus.mcqs.length, "MCQ sets,", corpus.essays.length, "essays,", corpus.notes.length, "static notes");
}
