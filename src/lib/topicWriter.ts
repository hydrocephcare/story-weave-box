// Writes a topic page when a reader opens one the site has little on, then publishes it for everyone.
// Route 1 (best): the topic-ai edge function (one call, server-side checks). Route 2 (works today): Ompath AI, the assistant that is already
// deployed, asked for the page in two or three short parts, then the page is saved with the publish_topic_page database function.
// Nothing here may break a page: every failure returns a status, and the reader keeps what the site already has.
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase-config";
import { buildPartPrompts, mergeParts, parseJsonReply } from "../../supabase/functions/_shared/topicParts.js";
import { slugOf, validName } from "../../supabase/functions/_shared/topicAi.js";
import type { AiPage } from "@/lib/topics";

export type WriteResult = { status: "published"; page: AiPage & { subject?: string }; saved: boolean } | { status: "rejected" | "failed" | "busy" | "limit" | "bot" };

const DAY_KEY = "ompath_topic_writes";
const PER_VISITOR_PER_DAY = 5;
const FN_DOWN = "ompath_topic_fn_down";
const today = () => new Date().toISOString().slice(0, 10);

const looksLikeBot = () => typeof navigator === "undefined" || /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp/i.test(navigator.userAgent) || (navigator as Navigator & { webdriver?: boolean }).webdriver === true;

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

export async function writeTopicPage({ name, category, context, signal }: { name: string; category: string; context: string; signal?: AbortSignal }): Promise<WriteResult> {
  if (!validName(name)) return { status: "failed" };
  if (looksLikeBot()) return { status: "bot" };
  if (writesToday() >= PER_VISITOR_PER_DAY) return { status: "limit" };
  const slug = slugOf(name);

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

  // Route 2: Ompath AI in short parts, then publish with the database function
  try {
    const prompts = buildPartPrompts({ name, category });
    const first = await askOmpathAi(prompts[0], context, name, category, signal).then(parseJsonReply, () => null);
    if (!first) return { status: "failed" };
    if (first.medical === false) return { status: "rejected" };
    const later = await Promise.all(prompts.slice(1).map((p) => askOmpathAi(p, "", name, category, signal).then(parseJsonReply, () => null)));
    const parts = [first, ...later] as (Record<string, unknown> | null)[];
    let page: AiPage & { medical?: boolean };
    try { page = mergeParts(parts, { name, category, model: "gemini" }) as AiPage & { medical?: boolean }; } catch { return { status: "failed" }; }
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
