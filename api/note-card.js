import fs from "node:fs";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { noteCardTree } from "../src/lib/noteCard.js";

let font;
const loadFont = () => (font ??= fs.readFileSync(path.join(process.cwd(), "api", "_assets", "inter-700.woff")));
const one = (v) => (Array.isArray(v) ? v[0] : v);

/** /api/note-card?title=…&year=4&unit=…&kind=Notes&week=Week 3: the share picture for a note that has no picture of its own. */
export default async function handler(req, res) {
  try {
    const q = req.query ?? {};
    const tree = noteCardTree({ title: one(q.title), year: one(q.year), unit: one(q.unit), kind: one(q.kind), week: one(q.week) });
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
