// Writes a flashcard deck from one study note, so what a student reads can be revised as recall cards.
// Called by the schedule (x-cron-key) or by a signed-in administrator. One note per call.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { chatText } from "../_shared/aiChat.js";
import { cleanTopicTitle } from "../_shared/topicTitle.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `You write revision flashcards for Kenyan medical students from ONE study note. Return ONLY a JSON array, no markdown.
Each item: {"question":"...","answer":"..."}
Rules:
- One idea per card. The question asks for ONE thing (a definition, a cause, a feature, a number, a next step).
- The answer is POINTED and SHORT: 2 to 4 bullet lines, each starting with "- " and no longer than 10 words. No sentences that wander. If a picture would help and the note contains an image link, you may add it as ![label](url) on its own line.
- For drugs write cards that drill: "Class of X?", "Mechanism of X?", "Main uses of X?", "Key side effects of X?", "Contraindications of X?" so the facts can be rehearsed one at a time.
- Use only facts that are in the note. Never invent doses, numbers or criteria.
- Cover the whole note in the order it is taught: definition, causes or risk factors, features, investigations, management, complications.
- Questions must stand alone (name the condition; never say "the note", "above" or "this").
- No duplicate cards.`;

function parse(raw: string) {
  const start = raw.indexOf("[");
  if (start < 0) return [];
  const whole = raw.slice(start);
  let parsed: any = null;
  try { parsed = JSON.parse(whole.slice(0, whole.lastIndexOf("]") + 1)); } catch {
    let end = whole.length;
    for (let tries = 0; tries < 60 && parsed === null; tries++) {
      const cut = whole.lastIndexOf("}", end - 1);
      if (cut < 0) break;
      try { parsed = JSON.parse(whole.slice(0, cut + 1) + "]"); } catch { end = cut; }
    }
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  return parsed
    .filter((c: any) => c?.question && c?.answer)
    .map((c: any) => ({ question: String(c.question).trim(), answer: Array.isArray(c.answer) ? c.answer.map((x: any) => `- ${x}`).join("\n") : String(c.answer).trim() }))
    .filter((c: any) => { const k = c.question.toLowerCase().replace(/[^a-z0-9]+/g, " ").slice(0, 60); if (seen.has(k) || c.question.length < 8) return false; seen.add(k); return true; });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cronOk = !!Deno.env.get("CRON_KEY") && req.headers.get("x-cron-key") === Deno.env.get("CRON_KEY");
    const body = await req.json().catch(() => ({}));
    let readerOnly = false;   // a signed-in student who has just finished a note may ask for that one note's deck, nothing else
    if (!cronOk) {
      const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = token ? await supabase.auth.getUser(token) : { data: null };
      const { data: ok } = u?.user ? await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" }) : { data: false };
      if (!ok) {
        if (!u?.user || !/^[0-9a-f-]{36}$/i.test(String(body?.article_id || ""))) return json({ error: "Administrators only." }, 403);
        readerOnly = true;
      }
    }
    if (readerOnly) {
      const { data: have } = await supabase.from("flashcard_sets").select("id").eq("source_reference", body.article_id).is("deleted_at", null).limit(1);
      if (have && have.length) return json({ success: true, status: "exists" });
    }
    const { data: ids } = await supabase.rpc("note_flashcard_candidates", { n: 1 });
    const id = body?.article_id || (Array.isArray(ids) ? (ids[0]?.id ?? ids[0]) : null);
    if (!id) return json({ success: true, done: true });
    const { data: a, error } = await supabase.from("articles").select("id, title, category, content").eq("id", id).single();
    if (error || !a) return json({ error: error?.message || "not found" }, 500);

    const text = String(a.content).replace(/\r\n/g, "\n").replace(/!\[[^\]]*\]\([^)]*\)/g, "").slice(0, 10000);
    const count = Math.max(12, Math.min(30, Math.round(text.length / 330)));
    let cards: ReturnType<typeof parse> = [];
    let lastErr = "";
    for (let attempt = 0; attempt < 2 && cards.length < Math.max(8, Math.floor(count * 0.6)); attempt++) {
      try {
        const raw = await chatText(Deno.env.toObject(), [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Write ${count} flashcards from this note.\nTITLE: ${a.title}\nSUBJECT: ${a.category}\n\n${text}` },
        ], { temperature: 0.35, maxTokens: 4200, timeoutMs: 70000 });
        const got = parse(raw);
        if (got.length > cards.length) cards = got;
      } catch (e) { lastErr = e instanceof Error ? e.message.slice(0, 120) : String(e); }
    }
    if (cards.length < 8) {
      await supabase.from("flashcard_sets").insert({ title: `${a.title} (cards pending)`, category: a.category, cards: [], published: false, source_reference: a.id, source_type: "note_generated", original_notes: JSON.stringify({ failed: lastErr || "too few usable cards", at: new Date().toISOString() }) });
      return json({ success: true, title: a.title, status: "skipped", why: lastErr || `only ${cards.length} usable` });
    }
    const title = `${cleanTopicTitle(a.title)}: Flashcards`;
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
    let slug = base;
    for (let n = 2; n < 30; n++) {
      const { data: hit } = await supabase.from("flashcard_sets").select("id").eq("slug", slug).maybeSingle();
      if (!hit) break;
      slug = `${base}-${n}`;
    }
    const { error: insErr } = await supabase.from("flashcard_sets").insert({
      title, slug, category: a.category, cards, published: true, source_reference: a.id, source_type: "note_generated",
      meta_description: `${cards.length} flashcards to revise ${cleanTopicTitle(a.title)}, written from the Ompath Study notes.`,
      original_notes: JSON.stringify({ type: "note_flashcards", article_id: a.id, generated_at: new Date().toISOString() }),
    });
    if (insErr) return json({ error: insErr.message }, 500);
    return json({ success: true, title: a.title, cards: cards.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
