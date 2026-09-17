import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const KEYS = [1, 2, 3, 4, 5]
  .map((n) => Deno.env.get(n === 1 ? "GEMINI_API_KEY" : `GEMINI_API_KEY_${n}`))
  .filter(Boolean) as string[];

const PROMPT = `You are transcribing scanned pages of a Kenyan medical school exam paper.
Transcribe ALL printed text from these page images into clean readable Markdown, in page order.
Rules:
- Keep the original question numbering (1., 2., a), b), i), ii)).
- Put every multiple-choice option on its own line as "A) text", "B) text" — never merge two options on one line.
- Use "## SECTION A" only for real printed section titles. Never invent headings.
- Reproduce tables as markdown tables.
- Do not add answers, commentary or explanations that are not printed on the page.
- No asterisks, no hashes inside sentences, no quotation wrappers, no emojis.
- Skip blank or unreadable pages silently.
Return only the Markdown transcription.`;

async function toInline(url: string) {
  const r = await fetch(url);
  if (!r.ok) return null;
  const buf = new Uint8Array(await r.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
  return { inlineData: { mimeType: r.headers.get("content-type") || "image/jpeg", data: btoa(bin) } };
}

async function ocr(urls: string[]) {
  const parts: unknown[] = [{ text: PROMPT }];
  for (const u of urls) {
    const p = await toInline(u);
    if (p) parts.push(p);
  }
  if (parts.length < 2) return "";
  for (const key of KEYS) {
    for (const model of ["gemini-2.5-flash", "gemini-2.0-flash"]) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 8192 } }),
          },
        );
        if (!res.ok) continue;
        const j = await res.json();
        const text = j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("\n")?.trim();
        if (text) return text;
      } catch (_e) { /* try next */ }
    }
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const only: string | undefined = body.id;

  const { data: rows, error } = await supabase
    .from("articles")
    .select("id,slug,content")
    .is("deleted_at", null)
    .limit(400);
  if (error) return json({ error: error.message }, 500);

  const isScanOnly = (c: string) =>
    /!\[/.test(c) && c.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\s+/g, " ").length < 700;
  const queue = (rows || []).filter((r) => (only ? r.id === only : isScanOnly(r.content)));
  if (!queue.length) return json({ done: true, remaining: 0 });

  const target = queue[0];
  const imgs = [...new Set([...target.content.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]))];
  const intro = target.content.split("![")[0].trim();
  // Resumable: each call OCRs a slice of pages and parks the partial transcript
  // in app_settings so the 150s function limit is never hit.
  const progressKey = `ocr:${target.id}`;
  const { data: saved } = await supabase.from("app_settings").select("value").eq("key", progressKey).maybeSingle();
  const prev: { done: number; text: string } = saved?.value ? JSON.parse(saved.value) : { done: 0, text: "" };

  const PER_CALL = 12;
  const slice = imgs.slice(prev.done, prev.done + PER_CALL);
  const groups: string[][] = [];
  for (let i = 0; i < slice.length; i += 4) groups.push(slice.slice(i, i + 4));
  const results = await Promise.all(groups.map((g) => ocr(g)));
  const parts: string[] = prev.text ? [prev.text] : [];
  results.filter(Boolean).forEach((t) => parts.push(t));
  const transcript = parts.join("\n\n").replace(/```(?:markdown)?/g, "").trim();
  const done = Math.min(prev.done + PER_CALL, imgs.length);
  if (done < imgs.length) {
    await supabase.from("app_settings").upsert({ key: progressKey, value: JSON.stringify({ done, text: transcript }) }, { onConflict: "key" });
    return json({ slug: target.slug, pages: `${done}/${imgs.length}`, remaining: queue.length });
  }
  await supabase.from("app_settings").delete().eq("key", progressKey);
  if (transcript.length < 200) {
    // Mark it so the queue advances instead of looping on a bad scan.
    await supabase.from("articles").update({ published: false }).eq("id", target.id);
    return json({ slug: target.slug, status: "unreadable", remaining: queue.length - 1 });
  }

  const scans = imgs.map((u, i) => `![Page ${i + 1}](${u})`).join("\n\n");
  const content = `${intro}\n\n${transcript}\n\n## Original scanned pages\n\n${scans}\n`;
  const upd = await supabase
    .from("articles")
    .update({ content, updated_at: new Date().toISOString(), published: true })
    .eq("id", target.id);
  if (upd.error) return json({ error: upd.error.message }, 500);
  return json({ slug: target.slug, chars: transcript.length, remaining: queue.length - 1 });
});
