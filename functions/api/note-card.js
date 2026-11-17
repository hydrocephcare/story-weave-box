import { satori } from "@cf-wasm/satori";
import { Resvg } from "@cf-wasm/resvg";
import { noteCardTree } from "../../src/lib/noteCard.js";
import { interBoldBase64 } from "../../api/_cloudflare/interFont.js";

const ALLOWED = /^https:\/\/(upload\.wikimedia\.org|www\.ompathstudy\.com|ompathstudy\.com|cdn\.ompathstudy\.com|strfwaqvxvkhjbqrwmla\.supabase\.co)\//;
const font = Uint8Array.from(atob(interBoldBase64), (char) => char.charCodeAt(0));
const withTimeout = (url, ms, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(ms) });

async function asDataUri(url) {
  if (!ALLOWED.test(url)) return null;
  const response = await withTimeout(url, 4500, { headers: { "user-agent": "OmpathStudy/1.0 (https://www.ompathstudy.com)" } });
  const type = (response.headers.get("content-type") || "").split(";")[0];
  if (!response.ok || !/^image\/(png|jpeg)$/.test(type)) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 2_500_000) return null;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

async function topicPicture(title) {
  try {
    const query = new URLSearchParams({
      action: "query", format: "json", redirects: "1", titles: title,
      prop: "pageimages", piprop: "thumbnail", pithumbsize: "700",
    });
    const response = await withTimeout(`https://en.wikipedia.org/w/api.php?${query}`, 3500, {
      headers: { "user-agent": "OmpathStudy/1.0 (https://www.ompathstudy.com)" },
    });
    const json = await response.json();
    const source = Object.values(json?.query?.pages ?? {})[0]?.thumbnail?.source;
    return source ? await asDataUri(source) : null;
  } catch {
    return null;
  }
}

export async function onRequest({ request }) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams;
    const title = query.get("title") || "";
    const image = query.get("pic") === "wiki"
      ? await topicPicture(title)
      : query.get("image") ? await asDataUri(query.get("image")).catch(() => null) : null;
    const one = (key) => query.get(key) || undefined;
    const tree = noteCardTree({
      title, year: one("year"), unit: one("unit"), kind: one("kind"), week: one("week"),
      blurb: one("blurb"), host: one("host"), code: one("code"), facts: one("facts"),
      won: one("won"), name: one("name"), score: one("score"), rank: one("rank"),
      of: one("of"), acc: one("acc"), image,
    });
    const svg = await satori(tree, {
      width: 1200,
      height: 630,
      fonts: [{ name: "sans-serif", data: font, weight: 700, style: "normal" }],
    });
    const png = new Resvg(svg, {
      fitTo: { mode: "width", value: 1200 },
      font: { fontBuffers: [font] },
    }).render().asPng();
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "X-Robots-Tag": "noindex",
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return Response.redirect("https://www.ompathstudy.com/og-default.png", 302);
  }
}
