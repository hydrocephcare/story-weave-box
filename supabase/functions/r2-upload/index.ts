import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const BUCKET = Deno.env.get("R2_BUCKET")!;
const configuredPublicBase = (Deno.env.get("R2_PUBLIC_BASE") || "").replace(/\/+$/, "");
// R2 assets are served from the CDN hostname.  The application hostname routes
// unknown paths back to the SPA and therefore returns HTML for image URLs.
const PUBLIC_BASE = configuredPublicBase.replace(
  /^https?:\/\/(?:www\.)?ompathstudy\.com(?=\/|$)/i,
  "https://cdn.ompathstudy.com",
);

const r2 = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  service: "s3",
  region: "auto",
});

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/svg+xml", "application/pdf"];
const MAX_BYTES = 15 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { dataUrl, filename } = await req.json();
    if (typeof dataUrl !== "string") throw new Error("dataUrl required");
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
    if (!m) throw new Error("dataUrl must be a base64 data URL");
    const contentType = m[1].toLowerCase();
    if (!ALLOWED.includes(contentType)) throw new Error(`unsupported type: ${contentType}`);
    const bin = atob(m[2].replace(/\s/g, ""));
    if (bin.length > MAX_BYTES) throw new Error("file too large (max 15MB)");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const ext = contentType === "image/jpeg" ? "jpg" : contentType === "application/pdf" ? "pdf" : contentType.split("/")[1].replace(/[^a-z0-9]/g, "");
    const base = String(filename || "image")
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "image";
    const now = new Date();
    const key = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${base}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    const res = await r2.fetch(`https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key}`, {
      method: "PUT",
      body: bytes,
      headers: { "Content-Type": contentType },
    });
    if (!res.ok) throw new Error(`R2 upload failed: ${res.status} ${(await res.text()).slice(0, 200)}`);

    return new Response(JSON.stringify({ url: `${PUBLIC_BASE}/${key}`, key }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
