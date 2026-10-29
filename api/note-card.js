import fs from "node:fs";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { noteCardTree } from "../src/lib/noteCard.js";

let font;
const loadFont = () => (font ??= fs.readFileSync(path.join(process.cwd(), "api", "_assets", "inter-700.woff")));
const one = (v) => (Array.isArray(v) ? v[0] : v);

const ALLOWED = /^https:\/\/(upload\.wikimedia\.org|www\.ompathstudy\.com|ompathstudy\.com|cdn\.ompathstudy\.com|strfwaqvxvkhjbqrwmla\.supabase\.co)\//;
const withTimeout = async (url, ms, init) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); } };

/** A picture for a topic from the free encyclopaedia's lead image, as a data URI (png or jpeg only: that is what the card can draw). */
async function topicPicture(title) {
  try {
    const q = new URLSearchParams({ action: "query", format: "json", redirects: "1", titles: title, prop: "pageimages", piprop: "thumbnail", pithumbsize: "700" });
    const j = await (await withTimeout(`https://en.wikipedia.org/w/api.php?${q}`, 3500, { headers: { "user-agent": "OmpathStudy/1.0 (https://www.ompathstudy.com)" } })).json();
    const src = Object.values(j?.query?.pages ?? {})[0]?.thumbnail?.source;
    return src ? await asDataUri(src) : null;
  } catch { return null; }
}
async function asDataUri(url) {
  if (!ALLOWED.test(url)) return null;
  const r = await withTimeout(url, 4500, { headers: { "user-agent": "OmpathStudy/1.0 (https://www.ompathstudy.com)" } });
  const type = (r.headers.get("content-type") || "").split(";")[0];
  if (!r.ok || !/^image\/(png|jpeg)$/.test(type)) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.length > 2_500_000 ? null : `data:${type};base64,${buf.toString("base64")}`;
}

/** /api/note-card?title=…&year=4&unit=…&kind=Notes&week=Week 3: the share picture for a note that has no picture of its own. */
export default async function handler(req, res) {
  try {
    const q = req.query ?? {};
    // pic=wiki: a topic card with the subject's own picture; image=<https url>: a given picture
    const image = one(q.pic) === "wiki" ? await topicPicture(String(one(q.title) || "")) : one(q.image) ? await asDataUri(String(one(q.image))).catch(() => null) : null;
    const tree = noteCardTree({ title: one(q.title), year: one(q.year), unit: one(q.unit), kind: one(q.kind), week: one(q.week), blurb: one(q.blurb), host: one(q.host), code: one(q.code), facts: one(q.facts), image });
    const svg = await satori(tree, { width: 1200, height: 630, fonts: [{ name: "sans-serif", data: loadFont(), weight: 700, style: "normal" }] });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");
    res.status(200).send(Buffer.from(png));
  } catch {
    // never a broken image: fall back to the site's default picture
    res.setHeader("Location", "https://www.ompathstudy.com/og-default.png");
    res.status(302).end();
  }
}
