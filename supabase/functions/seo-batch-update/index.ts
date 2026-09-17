import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ARTICLE_BATCH = 10;
const MCQ_BATCH = 10;

function stripText(input: string, max = 160): string {
  return (input || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+\]\(([^)]*)\)/g, "$1")
    .replace(/[#>*_`|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function getCursor(sb: any, key: string): Promise<string> {
  const { data } = await sb.from("app_settings").select("value").eq("key", key).maybeSingle();
  return (data as any)?.value || "";
}

async function setCursor(sb: any, key: string, value: string) {
  await sb.from("app_settings").upsert({ key, value }, { onConflict: "key" });
}

async function appendLog(sb: any, key: string, entry: any) {
  const { data } = await sb.from("app_settings").select("value").eq("key", key).maybeSingle();
  let arr: any[] = [];
  try { arr = JSON.parse((data as any)?.value || "[]"); } catch {}
  arr.unshift(entry);
  arr = arr.slice(0, 30);
  await sb.from("app_settings").upsert({ key, value: JSON.stringify(arr) }, { onConflict: "key" });
}

function buildArticleMeta(title: string, content: string, category: string) {
  const meta_title = (title || "Study Notes").slice(0, 80);
  const cat = (category || "").replace(/^Year\s*\d+:\s*/i, "").trim();
  const desc = stripText(content || "", 155);
  const fallback = `${title} — clinical study notes${cat ? " on " + cat : ""} for medical students.`;
  const meta_description = (desc.length > 60 ? desc : fallback).slice(0, 160);
  return { meta_title, meta_description };
}

function buildMcqMeta(title: string, questions: any[], category: string) {
  const count = Array.isArray(questions) ? questions.length : 0;
  const meta_title = (title || "MCQ Practice").slice(0, 80);
  const cat = (category || "").replace(/^Year\s*\d+:\s*/i, "").trim();
  const firstQ = stripText(questions?.[0]?.question || "", 90);
  const desc = `${count} clinical MCQs${cat ? " in " + cat : ""}. ${firstQ}`.trim();
  const meta_description = desc.slice(0, 160);
  return { meta_title, meta_description };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const articleCursor = await getCursor(sb, "seo_batch_article_cursor");
    const mcqCursor = await getCursor(sb, "seo_batch_mcq_cursor");

    // ---------- Articles ----------
    let aQuery = sb.from("articles")
      .select("id, title, content, category, meta_title, meta_description")
      .eq("published", true)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .limit(ARTICLE_BATCH);
    if (articleCursor) aQuery = aQuery.gt("id", articleCursor);
    const { data: articles } = await aQuery;

    const articleResults: any[] = [];
    for (const a of articles || []) {
      const meta = buildArticleMeta(a.title, a.content, a.category);
      const updates: any = {};
      if (!a.meta_title || a.meta_title.length < 5 || a.meta_title.includes("|")) {
        updates.meta_title = meta.meta_title;
      }
      if (!a.meta_description || a.meta_description.length < 50) {
        updates.meta_description = meta.meta_description;
      }
      if (Object.keys(updates).length) {
        await sb.from("articles").update(updates).eq("id", a.id);
        articleResults.push({ id: a.id, title: a.title, updated: Object.keys(updates) });
      } else {
        articleResults.push({ id: a.id, title: a.title, updated: [] });
      }
    }

    if (articles && articles.length > 0) {
      await setCursor(sb, "seo_batch_article_cursor", articles[articles.length - 1].id);
    } else {
      await setCursor(sb, "seo_batch_article_cursor", "");
    }

    // ---------- MCQs ----------
    let mQuery = sb.from("mcq_sets")
      .select("id, title, questions, category, meta_title, meta_description")
      .eq("published", true)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .limit(MCQ_BATCH);
    if (mcqCursor) mQuery = mQuery.gt("id", mcqCursor);
    const { data: mcqs } = await mQuery;

    const mcqResults: any[] = [];
    for (const m of mcqs || []) {
      const meta = buildMcqMeta(m.title, m.questions as any[], m.category);
      const updates: any = {};
      if (!m.meta_title || m.meta_title.length < 5) updates.meta_title = meta.meta_title;
      if (!m.meta_description || m.meta_description.length < 50) updates.meta_description = meta.meta_description;
      if (Object.keys(updates).length) {
        await sb.from("mcq_sets").update(updates).eq("id", m.id);
        mcqResults.push({ id: m.id, title: m.title, updated: Object.keys(updates) });
      } else {
        mcqResults.push({ id: m.id, title: m.title, updated: [] });
      }
    }

    if (mcqs && mcqs.length > 0) {
      await setCursor(sb, "seo_batch_mcq_cursor", mcqs[mcqs.length - 1].id);
    } else {
      await setCursor(sb, "seo_batch_mcq_cursor", "");
    }

    const summary = {
      timestamp: new Date().toISOString(),
      articles_processed: articleResults.length,
      articles_updated: articleResults.filter(r => r.updated.length).length,
      mcqs_processed: mcqResults.length,
      mcqs_updated: mcqResults.filter(r => r.updated.length).length,
      article_cursor_after: articles?.[articles.length - 1]?.id || "(reset)",
      mcq_cursor_after: mcqs?.[mcqs.length - 1]?.id || "(reset)",
    };

    await appendLog(sb, "seo_batch_log", summary);

    return new Response(JSON.stringify({ ...summary, articleResults, mcqResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("seo-batch-update error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});