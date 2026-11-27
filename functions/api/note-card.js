import { Buffer } from "node:buffer";
import satori from "satori";
import { Resvg } from "@cf-wasm/resvg/workerd";
import { noteCardTree } from "../../src/lib/noteCard.js";

const ALLOWED = /^https:\/\/(upload\.wikimedia\.org|www\.ompathstudy\.com|ompathstudy\.com|cdn\.ompathstudy\.com|strfwaqvxvkhjbqrwmla\.supabase\.co)\//i;
let fontPromise;

const loadFont = async () => {
  if (!fontPromise) fontPromise = (async () => {
    const cssResponse = await fetch("https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap", {
      headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36" },
      signal: AbortSignal.timeout(8000),
    });
    if (!cssResponse.ok) throw new Error("Font provider unavailable");
    const css = await cssResponse.text();
    const blocks = css.match(/@font-face\s*\{[^}]+\}/g) || [];
    const latin = blocks.find((block) => /U\+0000-00FF/i.test(block)) || blocks[blocks.length - 1];
    const url = latin?.match(/url\((https:\/\/[^)]+)\)/)?.[1];
    if (!url) throw new Error("Inter font URL missing");
    const fontResponse = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!fontResponse.ok) throw new Error("Font download failed");
    return new Uint8Array(await fontResponse.arrayBuffer());
  })();
  return fontPromise;
};

const withTimeout = async (url, ms, init = {}) => {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  return response;
};

async function asDataUri(url) {
  if (!ALLOWED.test(url)) return null;
  const response = await withTimeout(url, 4500, { headers: { "user-agent": "OmpathStudy/1.0 (https://www.ompathstudy.com)" } });
  const type = (response.headers.get("content-type") || "").split(";")[0];
  if (!response.ok || !/^image\/(png|jpeg)$/.test(type)) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 2_500_000) return null;
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function topicPicture(title) {
  try {
    const query = new URLSearchParams({ action: "query", format: "json", redirects: "1", titles: title, prop: "pageimages", piprop: "thumbnail", pithumbsize: "700" });
    const response = await withTimeout(`https://en.wikipedia.org/w/api.php?${query}`, 3500, { headers: { "user-agent": "OmpathStudy/1.0 (https://www.ompathstudy.com)" } });
    const data = await response.json();
    const src = Object.values(data?.query?.pages ?? {})[0]?.thumbnail?.source;
    return src ? await asDataUri(src) : null;
  } catch { return null; }
}

export const onRequestGet = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const q = url.searchParams;
    const title = q.get("title") || "";
    const image = q.get("pic") === "wiki"
      ? await topicPicture(title)
      : q.get("image") ? await asDataUri(q.get("image")) : null;
    const tree = noteCardTree({
      title, year: q.get("year"), unit: q.get("unit"), kind: q.get("kind"), week: q.get("week"),
      blurb: q.get("blurb"), host: q.get("host"), code: q.get("code"), facts: q.get("facts"),
      won: q.get("won"), name: q.get("name"), score: q.get("score"), rank: q.get("rank"),
      of: q.get("of"), acc: q.get("acc"), image,
    });
    const svg = await satori(tree, {
      width: 1200, height: 630,
      fonts: [{ name: "sans-serif", data: await loadFont(), weight: 700, style: "normal" }],
    });
    const renderer = await Resvg.async(svg, { fitTo: { mode: "width", value: 1200 } });
    const png = renderer.render().asPng();
    return new Response(png, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "x-robots-tag": "noindex",
        "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[note-card]", error instanceof Error ? error.message : String(error));
    return Response.redirect(new URL("/og-default.png", request.url), 302);
  }
};
