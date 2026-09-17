import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_BASE_URL = "https://www.ompathstudy.com";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeBaseUrl(url: string | null | undefined): string {
  const trimmed = String(url || "").trim();
  if (!trimmed) return DEFAULT_BASE_URL;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProtocol.replace(/\/+$/, ""));
    if (/(^|\.)ompathstudy\.com$/i.test(u.hostname)) u.hostname = "www.ompathstudy.com";
    u.protocol = "https:";
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return withProtocol.replace(/\/+$/, "");
  }
}

function slugFromTitle(title: string): string {
  return (title || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function resolveBaseUrl(sb: any, bodySiteUrl?: unknown): Promise<string> {
  if (typeof bodySiteUrl === "string" && bodySiteUrl.trim()) return normalizeBaseUrl(bodySiteUrl);
  const { data } = await sb.from("app_settings").select("value").eq("key", "site_url").maybeSingle();
  return normalizeBaseUrl((data as any)?.value);
}

function buildArticleUrl(base: string, a: { id: string; title: string; slug?: string | null }) {
  const slug = a.slug || slugFromTitle(a.title) || "article";
  return `${base}/blog/${slug}`;
}

function buildStoryUrl(base: string, s: { id: string; title: string }) {
  return `${base}/stories/${s.id}-${slugFromTitle(s.title) || "story"}`;
}

async function pingSearchEngines(baseUrl: string) {
  const sitemapUrl = `${baseUrl}/sitemap-dynamic.xml`;
  const targets = [
    `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
    `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
  ];

  const results: Array<{ endpoint: string; status: "ok" | "failed"; code?: number; error?: string }> = [];

  for (const endpoint of targets) {
    try {
      const response = await fetch(endpoint, { method: "GET" });
      results.push({ endpoint, status: response.ok ? "ok" : "failed", code: response.status });
    } catch (error: any) {
      results.push({ endpoint, status: "failed", error: error?.message || "Ping failed" });
    }
  }

  return { sitemap_url: sitemapUrl, results };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);
    const baseUrl = await resolveBaseUrl(sb, body?.site_url);

    if (action === "get_config") {
      return json({ base_url: baseUrl, sitemap_url: `${baseUrl}/sitemap-dynamic.xml` });
    }

    if (action === "set_site_url" || action === "set_config") {
      const nextSiteUrl = normalizeBaseUrl(body?.site_url);
      const { data: existing } = await sb.from("app_settings").select("id").eq("key", "site_url").maybeSingle();
      if (existing) {
        await sb.from("app_settings").update({ value: nextSiteUrl }).eq("key", "site_url");
      } else {
        await sb.from("app_settings").insert({ key: "site_url", value: nextSiteUrl });
      }
      return json({ success: true, base_url: nextSiteUrl, sitemap_url: `${nextSiteUrl}/sitemap-dynamic.xml` });
    }

    if (action === "list_all_urls") {
      const yearFilter = body?.year || null;
      const contentType = body?.content_type || "all";

      const urls: Array<{ type: string; id: string; title: string; url: string; has_meta?: boolean; category?: string }> = [];

      if (contentType === "all" || contentType === "articles") {
        let q = sb.from("articles").select("id, title, category, meta_title, meta_description, og_image_url, slug").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false });
        if (yearFilter && /^Year [1-6]$/.test(yearFilter)) q = q.like("category", `${yearFilter}:%`);
        const { data } = await q;
        (data || []).forEach(a => urls.push({
          type: "article", id: a.id, title: a.title, category: a.category,
          url: buildArticleUrl(baseUrl, a),
          has_meta: !!(a.meta_title && a.meta_description && a.og_image_url),
        }));
      }

      if (contentType === "all" || contentType === "stories") {
        const { data } = await sb.from("stories").select("id, title, category, cover_image_url").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false });
        (data || []).forEach(s => urls.push({
          type: "story", id: s.id, title: s.title, category: s.category,
          url: buildStoryUrl(baseUrl, s),
          has_meta: !!s.cover_image_url,
        }));
      }

      if (contentType === "all" || contentType === "mcqs") {
        const { data } = await sb.from("mcq_sets").select("id, title, category").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false });
        (data || []).forEach(m => urls.push({
          type: "mcq", id: m.id, title: m.title, category: m.category,
          url: `${baseUrl}/mcqs/${m.id}`, has_meta: true,
        }));
      }

      if (contentType === "all" || contentType === "flashcards") {
        const { data } = await sb.from("flashcard_sets").select("id, title, category").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false });
        (data || []).forEach(f => urls.push({
          type: "flashcard", id: f.id, title: f.title, category: f.category,
          url: `${baseUrl}/flashcards/${f.id}`, has_meta: true,
        }));
      }

      const batchSize = 50;
      const batches: Array<{ batch_number: number; count: number; urls: typeof urls }> = [];
      for (let i = 0; i < urls.length; i += batchSize) {
        batches.push({ batch_number: Math.floor(i / batchSize) + 1, count: Math.min(batchSize, urls.length - i), urls: urls.slice(i, i + batchSize) });
      }

      return json({ total: urls.length, batch_count: batches.length, batches, base_url: baseUrl });
    }

    if (action === "list_batches") {
      const yearFilter = body?.year || null;
      let query = sb.from("articles").select("id, title, category, created_at, meta_title, meta_description, slug, og_image_url").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false });
      if (yearFilter && /^Year [1-6]$/.test(yearFilter)) query = query.like("category", `${yearFilter}:%`);
      const { data: articles, error } = await query;
      if (error) throw error;

      const batchSize = 50;
      const batches: Array<{ batch_number: number; count: number; articles: any[] }> = [];
      for (let i = 0; i < (articles || []).length; i += batchSize) {
        const batch = articles!.slice(i, i + batchSize);
        batches.push({
          batch_number: Math.floor(i / batchSize) + 1,
          count: batch.length,
          articles: batch.map(a => ({
            id: a.id, title: a.title, category: a.category,
            url: buildArticleUrl(baseUrl, a),
            has_meta: !!(a.meta_title && a.meta_description),
          })),
        });
      }
      return json({ total: (articles || []).length, batch_count: batches.length, batches, base_url: baseUrl });
    }

    if (action === "generate_urls") {
      const batchNumber = body?.batch_number || 1;
      const yearFilter = body?.year || null;
      let query = sb.from("articles").select("id, title, slug").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false });
      if (yearFilter && /^Year [1-6]$/.test(yearFilter)) query = query.like("category", `${yearFilter}:%`);
      const { data: articles, error } = await query;
      if (error) throw error;

      const batchSize = 50;
      const start = (batchNumber - 1) * batchSize;
      const batch = (articles || []).slice(start, start + batchSize);
      const urls = batch.map(a => buildArticleUrl(baseUrl, a));

      return json({ batch_number: batchNumber, count: urls.length, urls, urls_text: urls.join("\n"), sitemap_url: `${baseUrl}/sitemap-dynamic.xml` });
    }

    if (action === "auto_index") {
      const urls: string[] = body?.urls || [];
      if (!urls.length) return json({ skipped: true, reason: "No URLs" });

      const sitemapPing = await pingSearchEngines(baseUrl);
      const googleApiKey = body?.google_api_key || Deno.env.get("GOOGLE_INDEXING_API_KEY");
      if (!googleApiKey) {
        return json({
          method: "sitemap_ping",
          urls,
          sitemap_ping: sitemapPing,
          message: "Sitemap ping submitted. Add GOOGLE_INDEXING_API_KEY secret to enable direct Google URL submission.",
        });
      }

      const results: Array<{ url: string; status: string; error?: string }> = [];
      for (const url of urls.slice(0, 10)) {
        try {
          const response = await fetch(
            `https://indexing.googleapis.com/v3/urlNotifications:publish?key=${googleApiKey}`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, type: "URL_UPDATED" }) },
          );
          results.push({ url, status: response.ok ? "submitted" : "failed", error: response.ok ? undefined : (await response.text()).slice(0, 200) });
        } catch (e: any) {
          results.push({ url, status: "failed", error: e.message });
        }
      }
      return json({ method: "api", results, submitted: results.filter(r => r.status === "submitted").length, sitemap_ping: sitemapPing });
    }

    if (action === "submit_to_google") {
      const googleApiKey = body?.google_api_key || Deno.env.get("GOOGLE_INDEXING_API_KEY");
      const urls: string[] = body?.urls || [];
      if (!urls.length) throw new Error("No URLs provided");

      const sitemapPing = await pingSearchEngines(baseUrl);

      if (!googleApiKey) {
        return json({
          method: "manual",
          message: "No Google API key. Copy URLs and paste into Google Search Console.",
          urls,
          urls_text: urls.join("\n"),
          sitemap_ping: sitemapPing,
        });
      }

      const results: Array<{ url: string; status: string; error?: string }> = [];
      for (const url of urls) {
        try {
          const response = await fetch(
            `https://indexing.googleapis.com/v3/urlNotifications:publish?key=${googleApiKey}`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, type: "URL_UPDATED" }) },
          );
          results.push({ url, status: response.ok ? "submitted" : "failed", error: response.ok ? undefined : (await response.text()).slice(0, 200) });
        } catch (e: any) {
          results.push({ url, status: "failed", error: e.message });
        }
      }
      return json({ method: "api", submitted: results.filter(r => r.status === "submitted").length, failed: results.filter(r => r.status === "failed").length, total: urls.length, results, sitemap_ping: sitemapPing });
    }

    throw new Error("Unknown action");
  } catch (e: any) {
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});
