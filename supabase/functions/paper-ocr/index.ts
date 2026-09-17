import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOmniRoute, omniRouteConfig } from "../_shared/omniroute.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ─── Gemini vision call with key + model rotation ─── */

function geminiKeys(): string[] {
  const keys: string[] = [];
  for (const name of ["GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3", "GEMINI_API_KEY_4", "GEMINI_API_KEY_5"]) {
    const v = Deno.env.get(name)?.trim();
    if (v && !keys.includes(v)) keys.push(v);
  }
  return keys;
}

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

async function callVision(prompt: string, images: { mime: string; data: string }[]): Promise<string> {
  // Prefer the OmniRoute combo when configured; send images as OpenAI image_url parts.
  const omni = omniRouteConfig();
  if (omni) {
    try {
      const content = [
        { type: "text", text: prompt },
        ...images.map((im) => ({ type: "image_url", image_url: { url: `data:${im.mime};base64,${im.data}` } })),
      ];
      return await callOmniRoute(omni, {
        messages: [{ role: "user", content }],
        temperature: 0.1,
        maxTokens: 8192,
        timeoutMs: 110000,
      });
    } catch (e: any) {
      console.log("OmniRoute vision unavailable, falling back to Gemini:", e?.message || String(e));
    }
  }

  const keys = geminiKeys();
  if (!keys.length) throw new Error("No Gemini API key configured");

  const parts: unknown[] = [{ text: prompt }, ...images.map((im) => ({ inlineData: { mimeType: im.mime, data: im.data } }))];
  let lastErr = "";

  for (const key of keys) {
    for (const model of MODELS) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 110000);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
            }),
            signal: controller.signal,
          },
        );
        if (res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
          if (text.trim()) return text;
          lastErr = "empty response";
          continue;
        }
        lastErr = `${res.status} ${(await res.text()).slice(0, 200)}`;
        if (res.status === 429 || res.status === 500 || res.status === 503) continue;
        if (res.status === 404) continue;
        throw new Error(`Gemini ${lastErr}`);
      } catch (e: any) {
        lastErr = e?.name === "AbortError" ? "timeout" : e?.message || String(e);
      } finally {
        clearTimeout(timeout);
      }
    }
  }
  throw new Error(`Gemini unavailable: ${lastErr}`);
}

/* ─── Scanned page helpers ─── */

const IMG_RE = /!\[[^\]]*\]\(\s*(\S+?)\s*\)/g;

function pageUrls(article: any): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const field of [article.original_notes, article.content]) {
    for (const m of String(field || "").matchAll(IMG_RE)) {
      const url = m[1];
      if (!/^https?:\/\//.test(url) || seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function fetchImage(url: string): Promise<{ mime: string; data: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    if (!mime.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf.length || buf.length > 6 * 1024 * 1024) return null;
    return { mime, data: toBase64(buf) };
  } catch {
    return null;
  }
}

const PROMPT = (title: string, startNumber: number) => `You are transcribing scanned pages of a real medical school past paper: "${title}".

Return GitHub-flavoured Markdown only — no preamble, no code fences, no commentary.

RULES
1. Transcribe every question you can see, in the order the pages present them. Keep the wording of the paper.
2. Number questions CONTINUOUSLY across the whole paper. The first question on these pages is number ${startNumber}. Never restart at 1, never repeat a number, never skip a number. Write the number as "${startNumber}. " at the start of the stem line.
3. Each multiple-choice question must be laid out exactly like this, one choice per line, nothing glued together:

${startNumber}. Full question stem here?
A) first choice
B) second choice
C) third choice
D) fourth choice
E) fifth choice
✅ Answer: C

4. Never invent or reconstruct text. Transcribe only what is visible. If a word or option is genuinely unreadable, write [unreadable] in its exact position. Preserve the number of choices shown on the page.
5. The answer line is mandatory for every multiple-choice question:
   - If the scan shows the answer marked (tick, cross, circle, underline, shading, handwriting, bold), report THAT letter and prefix the line with "✅ Answer: ".
   - If nothing is marked, work out the correct answer yourself from medical knowledge and write "Answer: " (no tick) followed by the letter.
   - Add a second line "Explanation: " with one short sentence justifying the answer.
6. Preserve the source choices exactly; do not rewrite them to equalize length or style.
7. For essay / short-answer questions: write the numbered question, keep mark allocations like "(5 marks)", then give "Answer: " followed by a concise model answer in short bullet lines starting with "- ". Use arrows (→) for sequences and life cycles, never commas.
8. Reproduce tables as Markdown tables. Never output raw "###", stray asterisks, or quotation-mark scaffolding.
9. Skip cover pages, instruction pages, blank pages and answer-sheet grids — questions only. Never output placeholders such as "Full question stem here" or claim that an unseen question exists.

Output the transcription now.`;

/* ─── HTTP ─── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "pages";

    if (action === "list") {
      const { data, error } = await sb
        .from("articles")
        .select("id, title, category, content, original_notes")
        .ilike("category", body.category || "%")
        .is("deleted_at", null)
        .order("title");
      if (error) throw error;
      return json({
        articles: (data || []).map((a: any) => ({
          id: a.id,
          title: a.title,
          category: a.category,
          pages: pageUrls(a).length,
          content_len: (a.content || "").length,
        })),
      });
    }

    const articleId: string = body.article_id;
    if (!articleId) throw new Error("article_id required");
    const { data: article, error: aErr } = await sb
      .from("articles")
      .select("id, title, content, original_notes")
      .eq("id", articleId)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!article) throw new Error("article not found");

    const urls = pageUrls(article);

    if (action === "pages") return json({ id: article.id, title: article.title, pages: urls.length, urls });

    if (action === "commit") {
      const content: string = body.content;
      if (typeof content !== "string" || content.trim().length < 40) throw new Error("content too short");
      const patch: Record<string, unknown> = { content, updated_at: new Date().toISOString() };
      if (body.original_notes) patch.original_notes = body.original_notes;
      if (body.meta_description) patch.meta_description = String(body.meta_description).slice(0, 300);
      if (body.published !== undefined) patch.published = !!body.published;
      const { error } = await sb.from("articles").update(patch).eq("id", articleId);
      if (error) throw error;
      return json({ ok: true, length: content.length });
    }

    if (action === "ocr") {
      const from = Math.max(0, Number(body.from) || 0);
      const count = Math.min(Math.max(1, Number(body.count) || 4), 8);
      const startNumber = Math.max(1, Number(body.start_number) || 1);
      const slice = urls.slice(from, from + count);
      if (!slice.length) return json({ done: true, text: "", next_from: from, pages: urls.length });

      const images: { mime: string; data: string }[] = [];
      for (const u of slice) {
        const im = await fetchImage(u);
        if (im) images.push(im);
      }
      if (!images.length) throw new Error(`no readable images at pages ${from}-${from + count}`);

      const text = await callVision(PROMPT(article.title, startNumber), images);
      const cleaned = text.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "").trim();
      return json({
        text: cleaned,
        from,
        used: images.length,
        next_from: from + slice.length,
        pages: urls.length,
        done: from + slice.length >= urls.length,
      });
    }

    throw new Error(`unknown action: ${action}`);
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 400);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
