// Writes a topic page when a reader opens one the site has little on, then publishes it for everyone.
// Route 1 (best): the topic-ai edge function (one call, server-side checks). Route 2 (works today): Ompath AI, the assistant that is already
// deployed, asked for the page in two or three short parts, then the page is saved with the publish_topic_page database function.
// Nothing here may break a page: every failure returns a status, and the reader keeps what the site already has.
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase-config";
import { buildPartPrompts, mergeParts, parseJsonReply } from "../../supabase/functions/_shared/topicParts.js";
import { slugOf, validName } from "../../supabase/functions/_shared/topicAi.js";
import type { AiPage } from "@/lib/topics";

export type WriteResult = { status: "published"; page: AiPage & { subject?: string }; saved: boolean; slug?: string; name?: string } | { status: "rejected" | "failed" | "busy" | "limit" | "bot" | "paused" };

const DAY_KEY = "ompath_topic_writes";
const PER_VISITOR_PER_DAY = 40;
const FN_DOWN = "ompath_topic_fn_down";
const AI_PAUSED = "ompath_ai_paused";
/** When the assistant has said it is out of credits, nothing is asked of it again for an hour: no wasted calls, no spinner. */
export const aiPaused = () => { try { return Date.now() - Number(localStorage.getItem(AI_PAUSED) ?? 0) < 3600_000; } catch { return false; } };
const pauseAi = () => { try { localStorage.setItem(AI_PAUSED, String(Date.now())); } catch { /* ignore */ } };
const today = () => new Date().toISOString().slice(0, 10);

export const looksLikeBot = () => typeof navigator === "undefined" || /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp/i.test(navigator.userAgent) || (navigator as Navigator & { webdriver?: boolean }).webdriver === true;

function writesToday(): number { try { const v = JSON.parse(localStorage.getItem(DAY_KEY) ?? "null"); return v?.day === today() ? Number(v.n) || 0 : 0; } catch { return 0; } }
function countWrite() { try { localStorage.setItem(DAY_KEY, JSON.stringify({ day: today(), n: writesToday() + 1 })); } catch { /* storage blocked */ } }
const fnKnownDown = () => { try { return Date.now() - Number(localStorage.getItem(FN_DOWN) ?? 0) < 6 * 3600_000; } catch { return false; } };
const markFnDown = () => { try { localStorage.setItem(FN_DOWN, String(Date.now())); } catch { /* ignore */ } };

/** One streamed answer from Ompath AI, as plain text. */
async function askOmpathAi(question: string, snippet: string, name: string, category: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ompath-ai`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}` },
    body: JSON.stringify({ question, history: [], sources: snippet ? [{ kind: "site", title: name, subtitle: category, snippet: snippet.slice(0, 2600) }] : [] }),
  });
  if (res.status === 402 || res.status === 429) { pauseAi(); throw new Error("paused"); }
  if (!res.ok || !res.body) throw new Error(`ai ${res.status}`);
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = "", text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const l of lines) {
      const d = l.trim();
      if (!d.startsWith("data:")) continue;
      const p = d.slice(5).trim();
      if (p === "[DONE]") continue;
      try { const piece = JSON.parse(p)?.choices?.[0]?.delta?.content; if (piece) text += piece; } catch { /* partial line */ }
    }
  }
  return text;
}


async function publish(page: AiPage & { subject?: string }, slug: string, name: string, category: string): Promise<{ saved: boolean }> {
  try {
    const { data } = await (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: { ok?: boolean; reason?: string } | null }> })
      .rpc("publish_topic_page", { p_slug: slug, p_name: name, p_category: category || page.subject || "", p_content: page, p_model: "gemini" });
    return { saved: Boolean(data?.ok) };
  } catch { return { saved: false }; }
}

const API_DOWN = "ompath_topic_api_down";
const apiKnownDown = () => { try { return Date.now() - Number(localStorage.getItem(API_DOWN) ?? 0) < 3 * 3600_000; } catch { return false; } };

/** Route 0: the site's own server, which holds the Gemini keys and takes turns between them. */
async function viaServer(name: string, category: string, context: string, signal?: AbortSignal): Promise<{ status: "published"; page: AiPage & { subject?: string } } | { status: "rejected" | "busy" } | null> {
  if (apiKnownDown()) return null;
  try {
    const r = await fetch("/api/topic-write", { method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ name, category, context: context.slice(0, 3000) }) });
    if (r.status === 503 || r.status === 404 || r.status === 405) { try { localStorage.setItem(API_DOWN, String(Date.now())); } catch { /* ignore */ } return null; }
    const j = (await r.json().catch(() => null)) as { status?: string; page?: AiPage & { subject?: string } } | null;
    if (j?.status === "published" && j.page) return { status: "published", page: j.page };
    if (j?.status === "rejected") return { status: "rejected" };
    if (j?.status === "busy") return null; // another route may still have room
    return null;
  } catch { return null; }
}

export async function writeTopicPage({ name, category, context, signal }: { name: string; category: string; context: string; signal?: AbortSignal }): Promise<WriteResult> {
  if (!validName(name)) return { status: "failed" };
  if (looksLikeBot()) return { status: "bot" };
  if (writesToday() >= PER_VISITOR_PER_DAY) return { status: "limit" };
  const slug = slugOf(name);

  // Route 0: our own server with the Gemini keys
  const viaApi = await viaServer(name, category, context, signal);
  if (viaApi?.status === "rejected") return { status: "rejected" };
  if (viaApi?.status === "published") {
    countWrite();
    // the page is saved under the clean title the writer chose, not under what was typed
    const title = String((viaApi.page as { title?: string }).title ?? "").trim();
    const cleanName = validName(title) ? title : name;
    const cleanSlug = slugOf(cleanName) || slug;
    const { saved } = await publish(viaApi.page, cleanSlug, cleanName, category);
    return { status: "published", page: viaApi.page, saved, slug: cleanSlug, name: cleanName };
  }

  // Route 1: the server function, when it has been deployed
  if (!fnKnownDown()) {
    try {
      const { data, error } = await supabase.functions.invoke("topic-ai", { body: { name, category, context: context.slice(0, 3000) } });
      const status = (data as { status?: string } | null)?.status;
      if (!error && status === "published" && (data as { page?: AiPage }).page) { countWrite(); return { status: "published", page: (data as { page: AiPage }).page, saved: true }; }
      if (!error && status === "rejected") return { status: "rejected" };
      if (!error && status === "busy") return { status: "busy" };
      if (error && !(error as { context?: Response }).context) markFnDown();
      else if (error) { const code = (error as { context?: Response }).context?.status; if (code === 404 || code === 0 || code === undefined) markFnDown(); }
    } catch { markFnDown(); }
  }

  if (aiPaused()) return { status: "paused" };
  // Route 2: Ompath AI in short parts, then publish with the database function
  try {
    const prompts = buildPartPrompts({ name, category });
    let first = await askOmpathAi(prompts[0], context, name, category, signal).then(parseJsonReply, () => null);
    if (!first) first = await askOmpathAi(prompts[0], "", name, category, signal).then(parseJsonReply, () => null);
    if (!first) return { status: aiPaused() ? "paused" : "failed" };
    if (first.medical === false) return { status: "rejected" };
    const later = await Promise.all(prompts.slice(1).map((p) => askOmpathAi(p, "", name, category, signal).then(parseJsonReply, () => null)));
    const parts = [first, ...later] as (Record<string, unknown> | null)[];
    let page: AiPage & { medical?: boolean };
    try { page = mergeParts(parts, { name, category, model: "gemini" }) as AiPage & { medical?: boolean }; } catch {
      // the answer came in an unusable shape: ask once more without the site's notes
      const again = await askOmpathAi(prompts[0], "", name, category, signal).then(parseJsonReply, () => null);
      if (!again) return { status: "failed" };
      try { page = mergeParts([again, ...later], { name, category, model: "gemini" }) as AiPage & { medical?: boolean }; } catch { return { status: "failed" }; }
    }
    if (page.medical === false) return { status: "rejected" };
    countWrite();
    let saved = false;
    try {
      const { data } = await (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: { ok?: boolean; existing?: boolean; reason?: string } | null }> })
        .rpc("publish_topic_page", { p_slug: slug, p_name: name, p_category: category || (page as { subject?: string }).subject || "", p_content: page, p_model: "gemini" });
      saved = Boolean(data?.ok);
      if (data?.reason === "busy") return { status: "published", page, saved: false };
    } catch { saved = false; }
    return { status: "published", page, saved };
  } catch { return { status: "failed" }; }
}
