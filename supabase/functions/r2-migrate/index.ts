import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const BUCKET = Deno.env.get("R2_BUCKET")!;
const PUBLIC_BASE = (Deno.env.get("R2_PUBLIC_BASE") || "").replace(/\/+$/, "");
const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

const r2 = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  service: "s3",
  region: "auto",
});

async function putObject(key: string, body: Uint8Array | string, contentType: string) {
  const url = `${ENDPOINT}/${BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const res = await r2.fetch(url, {
    method: "PUT",
    body,
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) {
    throw new Error(`R2 PUT ${key} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return `${PUBLIC_BASE}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const DATA_URL_RE = /data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+?)(?=["'\)\s>]|$)/g;

/** Replace every base64 data URL in a string with an uploaded R2 URL. */
async function migrateDataUrls(text: string, keyPrefix: string) {
  const matches = [...text.matchAll(DATA_URL_RE)];
  if (!matches.length) return { text, uploaded: 0, bytes: 0 };
  let out = text;
  let uploaded = 0;
  let bytes = 0;
  for (let i = 0; i < matches.length; i++) {
    const [full, ext, b64] = matches[i];
    try {
      const data = b64ToBytes(b64);
      const safeExt = ext.toLowerCase() === "jpeg" ? "jpg" : ext.toLowerCase().replace(/[^a-z0-9]/g, "");
      const key = `${keyPrefix}/${i + 1}-${crypto.randomUUID().slice(0, 8)}.${safeExt || "png"}`;
      const url = await putObject(key, data, `image/${ext}`);
      out = out.split(full).join(url);
      uploaded++;
      bytes += data.length;
    } catch (_e) {
      // leave this one in place; continue with the rest
    }
  }
  return { text: out, uploaded, bytes };
}

const TEXT_FIELDS: Record<string, string[]> = {
  articles: ["content", "original_notes", "featured_image", "og_image_url"],
  mcq_sets: ["questions", "original_notes", "featured_image", "og_image_url"],
  stories: ["content", "featured_image", "og_image_url", "cover_image_url"],
  essays: ["short_answer_questions", "long_answer_questions"],
};

function slugKey(row: any) {
  return (row.slug && String(row.slug).trim()) || row.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "images";
    const table: string = body.table || "articles";
    const limit: number = Math.min(Number(body.limit) || 5, 25);
    const cursor: string | null = body.cursor || null;
    const ids: string[] | null = Array.isArray(body.ids) && body.ids.length ? body.ids : null;

    if (!TEXT_FIELDS[table]) throw new Error(`unsupported table: ${table}`);

    if (action === "ping") {
      const url = await putObject("_healthcheck.txt", `ok ${new Date().toISOString()}`, "text/plain");
      return json({ ok: true, url });
    }

    const fields = TEXT_FIELDS[table];
    let q = sb
      .from(table)
      .select(["id", "title", "slug", "category", "created_at", ...fields].filter(Boolean).join(","))
      .order("created_at", { ascending: true })
      .limit(limit);
    if (cursor) q = q.gt("created_at", cursor);
    if (ids) q = q.in("id", ids);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows?.length) return json({ done: true, processed: 0, table, action });

    let uploaded = 0;
    let bytesFreed = 0;
    let changed = 0;
    const errors: string[] = [];

    for (const row of rows as any[]) {
      try {
        if (action === "images") {
          const patch: Record<string, any> = {};
          for (const f of fields) {
            const raw = row[f];
            if (raw == null) continue;
            const isObj = typeof raw === "object";
            const text = isObj ? JSON.stringify(raw) : String(raw);
            if (!text.includes("data:image")) continue;
            const res = await migrateDataUrls(text, `content-images/${table}/${slugKey(row)}/${f}`);
            if (res.uploaded > 0) {
              patch[f] = isObj ? JSON.parse(res.text) : res.text;
              uploaded += res.uploaded;
              bytesFreed += text.length - res.text.length;
            }
          }
          if (Object.keys(patch).length) {
            const { error: upErr } = await sb.from(table).update(patch).eq("id", row.id);
            if (upErr) throw upErr;
            changed++;
          }
        } else if (action === "posts") {
          const key = `posts/${table}/${slugKey(row)}.json`;
          await putObject(key, JSON.stringify(row, null, 2), "application/json");
          if (typeof row.content === "string" && row.content.length) {
            await putObject(
              `posts/${table}/${slugKey(row)}.md`,
              `# ${row.title || ""}\n\n${row.content}\n`,
              "text/markdown; charset=utf-8",
            );
          }
          uploaded++;
        } else {
          throw new Error(`unknown action: ${action}`);
        }
      } catch (e: any) {
        errors.push(`${row.id}: ${e?.message || e}`);
      }
    }

    const last = (rows as any[])[rows.length - 1];
    return json({
      done: rows.length < limit,
      table,
      action,
      processed: rows.length,
      changed,
      uploaded,
      bytesFreed,
      nextCursor: last.created_at,
      errors,
    });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}