// Writes a flashcard deck from one study note, so what a student reads can be revised as recall cards.
// Called by the schedule (x-cron-key) or by a signed-in administrator. One note per call.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { chatText } from "../_shared/aiChat.js";
import { cleanTopicTitle } from "../_shared/topicTitle.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `You write revision flashcards for Kenyan medical students from ONE study note, as a good clinician-teacher would: every card is a compact summary of one ANGLE of the subject, never a single trivia line. Return ONLY a JSON array, no markdown fences.
Each item: {"question":"...","answer":"..."}

PLAN FIRST (silently): list the angles the note supports, then write one card per angle, in this teaching order. Use only the angles the note actually covers:
1 Definition and why it matters; 2 Epidemiology and risk factors; 3 Aetiology / causes; 4 Pathophysiology and pathology (the mechanism, step by step); 5 Clinical features (symptoms, signs, how it looks at the bedside); 6 Classification / severity; 7 Investigations (what, why, expected findings); 8 Differentials and how to tell them apart; 9 Management (the drug class and why, first-line, doses ONLY if in the note, non-drug care); 10 Complications; 11 Ward-round points (what to examine, monitor, chart, position the patient, review daily, red flags, when to escalate, discharge advice); 12 Prognosis and prevention. For a note about several conditions or drugs, repeat the angles for each (a drug: class, mechanism, uses, side effects, cautions and interactions).

ANSWER FORMAT (never one sentence, but the WHOLE answer must fit on a phone card with no scrolling: 35 to 60 words in total, every line a tight phrase):
- Line 1: the direct answer in bold, e.g. **Chronic reversible inflammatory airway disease with variable obstruction**
- Then 3 to 4 short lines, each beginning "- " and, where it helps, a label such as "Pathology:", "Physiology:", "Pharmacology:", "Bedside:", "Ward round:". Each line is a short clear phrase or sentence that EXPLAINS (why, how, what to do), not a list of words.
- Last line: "Related: " plus 1 to 3 connected facts (a contrast, a cause, a next step).
- If the note contains an image link that helps, add it as ![label](url) on its own line.

NO REPETITION: each fact appears in exactly ONE card. Before writing a card, check that its angle and its facts are not already in an earlier card; if the angle is covered, skip it. A later card may name an earlier idea only in its "Related:" line, never re-explain it. Questions must be different from each other in what they ask.
Use only facts that are in the note; never invent numbers, doses or criteria. Questions must stand alone (name the condition; never say "the note", "above" or "this") and ask for ONE angle, e.g. "Asthma: what happens in the airway (pathophysiology)?".`;

/** Drops a card whose question and answer share most of their words with a card already kept (the same fact asked twice). */
function dedupe<T extends { question: string; answer: string }>(cards: T[]): T[] {
  const bag = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9s]/g, " ").split(/s+/).filter((w) => w.length > 3));
  const kept: { c: T; q: Set<string>; a: Set<string> }[] = [];
  const sim = (x: Set<string>, y: Set<string>) => { if (!x.size || !y.size) return 0; let n = 0; for (const w of x) if (y.has(w)) n++; return n / Math.min(x.size, y.size); };
  for (const c of cards) {
    const q = bag(c.question), a = bag(c.answer);
    if (kept.some((k) => sim(q, k.q) > 0.8 || sim(a, k.a) > 0.6)) continue;
    kept.push({ c, q, a });
  }
  return kept.map((k) => k.c);
}

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
    let id = body?.article_id || (Array.isArray(ids) ? (ids[0]?.id ?? ids[0]) : null);
    // nothing new to write: bring an older deck up to the richer format, in place (its cards are replaced, the deck is kept)
    let upgrade: { id: string } | null = null;
    if (!id && cronOk) {
      const { data: old } = await supabase.from("flashcard_sets").select("id, source_reference").eq("source_type", "note_generated").eq("published", true).is("deleted_at", null).not("original_notes", "like", "%\"v\":2%").limit(1);
      if (old && old[0]?.source_reference) { id = old[0].source_reference; upgrade = { id: old[0].id }; }
    }
    if (!id) return json({ success: true, done: true });
    const { data: a, error } = await supabase.from("articles").select("id, title, category, content").eq("id", id).single();
    if (error || !a) return json({ error: error?.message || "not found" }, 500);

    const text = String(a.content).replace(/\r\n/g, "\n").replace(/!\[[^\]]*\]\([^)]*\)/g, "").slice(0, 10000);
    const count = Math.max(10, Math.min(22, Math.round(text.length / 450)));
    let cards: ReturnType<typeof parse> = [];
    let lastErr = "";
    for (let attempt = 0; attempt < 2 && cards.length < Math.max(8, Math.floor(count * 0.6)); attempt++) {
      try {
        const raw = await chatText(Deno.env.toObject(), [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Write ${count} flashcards from this note.\nTITLE: ${a.title}\nSUBJECT: ${a.category}\n\n${text}` },
        ], { temperature: 0.35, maxTokens: 7000, timeoutMs: 70000 });
        const got = dedupe(parse(raw));
        if (got.length > cards.length) cards = got;
      } catch (e) { lastErr = e instanceof Error ? e.message.slice(0, 120) : String(e); }
    }
    if (cards.length < 8 && upgrade) {
      await supabase.from("flashcard_sets").update({ original_notes: JSON.stringify({ type: "note_flashcards", v: 2, kept: true, at: new Date().toISOString() }) }).eq("id", upgrade.id);
      return json({ success: true, status: "upgrade skipped", why: lastErr });
    }
    if (cards.length < 8) {
      await supabase.from("flashcard_sets").insert({ title: `${a.title} (cards pending)`, category: a.category, cards: [], published: false, source_reference: a.id, source_type: "note_generated", original_notes: JSON.stringify({ failed: lastErr || "too few usable cards", at: new Date().toISOString() }) });
      return json({ success: true, title: a.title, status: "skipped", why: lastErr || `only ${cards.length} usable` });
    }
    if (upgrade) {
      await supabase.from("flashcard_sets").update({ cards, original_notes: JSON.stringify({ type: "note_flashcards", v: 2, article_id: a.id, generated_at: new Date().toISOString() }), meta_description: `${cards.length} flashcards to revise ${cleanTopicTitle(a.title)}, written from the Ompath Study notes.` }).eq("id", upgrade.id);
      return json({ success: true, title: a.title, cards: cards.length, upgraded: true });
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
      original_notes: JSON.stringify({ type: "note_flashcards", v: 2, article_id: a.id, generated_at: new Date().toISOString() }),
    });
    if (insErr) return json({ error: insErr.message }, 500);
    return json({ success: true, title: a.title, cards: cards.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
