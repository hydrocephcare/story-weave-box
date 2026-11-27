// Topic pages are generated, clinically reviewed and persisted by the Neon-backed server route.
import { supabase } from "@/integrations/supabase/client";
import { slugOf, validName } from "../../supabase/functions/_shared/topicAi.js";
import type { AiPage } from "@/lib/topics";

export type TopicChoices = {
  level: "year3" | "year4" | "year5";
  angles: string[];
  setting: "tropical" | "general";
  depth: "quick" | "full";
};

export type WriteResult =
  | { status: "published"; page: AiPage & { subject?: string }; saved: boolean; slug?: string; name?: string }
  | { status: "rejected" | "failed" | "busy" | "limit" | "bot" | "paused" };

const DAY_KEY = "ompath_topic_writes";
const PER_VISITOR_PER_DAY = 40;
const AI_PAUSED = "ompath_ai_paused";

export const aiPaused = () => {
  try { return Date.now() - Number(localStorage.getItem(AI_PAUSED) ?? 0) < 3_600_000; }
  catch { return false; }
};

export const looksLikeBot = () =>
  typeof navigator === "undefined"
  || /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp/i.test(navigator.userAgent)
  || (navigator as Navigator & { webdriver?: boolean }).webdriver === true;

const today = () => new Date().toISOString().slice(0, 10);
function writesToday(): number {
  try {
    const value = JSON.parse(localStorage.getItem(DAY_KEY) ?? "null");
    return value?.day === today() ? Number(value.n) || 0 : 0;
  } catch { return 0; }
}
function countWrite() {
  try { localStorage.setItem(DAY_KEY, JSON.stringify({ day: today(), n: writesToday() + 1 })); }
  catch { /* storage blocked */ }
}

async function viaServer(
  name: string,
  category: string,
  context: string,
  choices?: TopicChoices,
  keepSlug?: boolean,
  signal?: AbortSignal,
): Promise<
  | { status: "published"; page: AiPage & { subject?: string }; saved: boolean; slug?: string; name?: string }
  | { status: "rejected" | "busy" | "limit" }
  | null
> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return { status: "rejected" };

    const response = await fetch("/api/topic-write", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, category, context: context.slice(0, 3000), choices, keepSlug }),
    });

    if (response.status === 401) return { status: "rejected" };
    if (response.status === 402) return { status: "limit" };
    if (response.status === 429 || response.status === 503) return { status: "busy" };

    const result = await response.json().catch(() => null) as {
      status?: string;
      page?: AiPage & { subject?: string };
      saved?: boolean;
      slug?: string;
      name?: string;
    } | null;

    if (result?.status === "published" && result.page) {
      return {
        status: "published",
        page: result.page,
        saved: result.saved === true,
        slug: result.slug,
        name: result.name,
      };
    }
    if (result?.status === "rejected") return { status: "rejected" };
    if (result?.status === "limit") return { status: "limit" };
    if (result?.status === "busy") return { status: "busy" };
    return null;
  } catch {
    return null;
  }
}

export async function writeTopicPage({
  name, category, context, choices, keepSlug, signal,
}: {
  name: string;
  category: string;
  context: string;
  choices?: TopicChoices;
  keepSlug?: boolean;
  signal?: AbortSignal;
}): Promise<WriteResult> {
  if (!validName(name)) return { status: "failed" };
  if (looksLikeBot()) return { status: "bot" };
  if (writesToday() >= PER_VISITOR_PER_DAY) return { status: "limit" };

  const result = await viaServer(name, category, context, choices, keepSlug, signal);
  if (!result) return { status: "failed" };
  if (result.status !== "published") return result;
  if (!result.saved) return { status: "failed" };

  countWrite();
  return {
    status: "published",
    page: result.page,
    saved: true,
    slug: result.slug || slugOf(name),
    name: result.name || name,
  };
}
