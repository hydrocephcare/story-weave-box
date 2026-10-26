// POST /api/ai?task=assist { mode: "bio" | "story" | "titles", ... }: helps a student write. It only returns text. The browser shows it and the writer decides what to keep.
// It never invents facts about the person: it works from what they typed and the details they gave (name, university, year).
import { askJson } from "./llm.js";

const hits = new Map();
const LEVEL = (y) => (Number(y) === 7 ? "a finalist" : Number(y) >= 1 && Number(y) <= 6 ? `a Year ${Number(y)} student` : "a medical student");
const clip = (v, n) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n);

const BIO = (b) => ({
  system: `You help a medical student write a short "About the author" note that appears at the end of their story on a student website.
Write in the FIRST PERSON, 2 to 3 warm, natural sentences, at most 280 characters. Use ONLY these facts: ${LEVEL(b.year)}${b.university ? ` at ${b.university}` : ""}${b.name ? `, name ${b.name}` : ""}${b.notes ? `, and what they told you: "${b.notes}"` : ""}.
Do not invent hobbies, achievements, specialities or numbers. If they gave few facts, keep it simple and sincere, and end with one gentle line to readers.
Return ONLY JSON: {"text": "..."}`,
  user: "Write my note.",
});

const STORY = {
  system: `You are an editor for a student-stories website. Polish the writer's story.
Rules: keep EVERY fact, event, name and opinion; keep the writer's own voice, first person and tone; do not add new events, advice, lessons or statistics; do not make it longer than 110% of the original.
Fix spelling, grammar and punctuation, split run-on blocks into clear paragraphs (blank line between paragraphs), start sentences with capitals, and keep any list items as they are.
No headings, no markdown symbols, no commentary. Return ONLY JSON: {"text": "the polished story, paragraphs separated by a blank line"}`,
};

const TITLES = {
  system: `Suggest 4 short, honest titles (max 70 characters each) for this student's story. They should sound like a person, not an advert, and use only what is in the story.
Return ONLY JSON: {"titles": ["...", "...", "...", "..."]}`,
};

const CAPTION = {
  system: `Write ONE short caption (max 120 characters) for a picture a student is adding to their story. Use only the nearby story text and the file name. Do not claim to see details you cannot know, and do not invent facts. Plain words, no quotes, no hashtags.
Return ONLY JSON: {"text": "the caption"}`,
};

export default async function assist(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (mine.length >= 20) return res.status(429).json({ error: "You have used the helper a lot this hour. Please try again a little later." });
  hits.set(ip, [...mine, now]); if (hits.size > 5000) hits.clear();

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const mode = String(body.mode ?? "");
  let msgs;
  if (mode === "bio") {
    const b = { name: clip(body.name, 60), university: clip(body.university, 60), year: body.year, notes: clip(body.notes, 400).replace(/"/g, "'") };
    const p = BIO(b); msgs = [{ role: "system", content: p.system }, { role: "user", content: p.user }];
  } else if (mode === "story") {
    const text = clip(body.text, 12000);
    if (text.length < 80) return res.status(400).json({ error: "Write a little more first, then ask for help." });
    msgs = [{ role: "system", content: STORY.system }, { role: "user", content: text }];
  } else if (mode === "titles") {
    const text = clip(body.text, 6000);
    if (text.length < 80) return res.status(400).json({ error: "Write a little more first, then ask for title ideas." });
    msgs = [{ role: "system", content: TITLES.system }, { role: "user", content: text }];
  } else if (mode === "caption") {
    const near = clip(body.text, 1200);
    const file = clip(body.name, 80).replace(/[_-]+/g, " ").replace(/\.[a-z0-9]+$/i, "");
    msgs = [{ role: "system", content: CAPTION.system }, { role: "user", content: `Nearby text: ${near || "(none)"}\nFile name: ${file || "(none)"}` }];
  } else return res.status(400).json({ error: "unknown mode" });

  const out = await askJson(msgs, { prefer: "groq", temperature: 0.4, maxTokens: mode === "story" ? 6000 : 600 });
  if (out.error) return res.status(503).json({ error: out.error });
  let j = null; try { j = JSON.parse(out.text); } catch { /* not json */ }
  if (mode === "titles") { const titles = Array.isArray(j?.titles) ? j.titles.map((t) => clip(t, 90)).filter(Boolean).slice(0, 4) : []; return titles.length ? res.status(200).json({ titles }) : res.status(502).json({ error: "The helper gave no ideas. Please try again." }); }
  const text = clip(j?.text, mode === "story" ? 14000 : 320);
  if (!text) return res.status(502).json({ error: "The helper gave no answer. Please try again." });
  return res.status(200).json({ text });
}
