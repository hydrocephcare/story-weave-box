// node scripts/seo/share-story-og.mjs   Draws public/og/share-story.png (1200x630) for the finalist share page.
import fs from "node:fs";
import { Resvg } from "@resvg/resvg-js";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#1e3a5f"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5c542"/><stop offset="1" stop-color="#d97706"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#bg)"/>
<g transform="translate(90 120) scale(8)"><path d="M16 1.8 28 6v8.6c0 7.2-4.9 12.6-12 15.6C8.9 27.2 4 21.8 4 14.6V6z" fill="url(#g)"/><path d="M16 3.8 26 7.3v7.3c0 6.1-4.1 10.7-10 13.4-5.9-2.7-10-7.3-10-13.4V7.3z" fill="#1f2937"/><path d="m16 9.5-7.5 3.7L16 17l7.5-3.8z" fill="#f8d56b"/><path d="M11 15.6v3.4c0 1.2 2.2 2.4 5 2.4s5-1.2 5-2.4v-3.4l-5 2.4z" fill="#f8d56b" opacity=".85"/></g>
<text x="400" y="190" font-family="Georgia, serif" font-size="30" font-weight="700" fill="#f5c542" letter-spacing="4">FINALISTS &amp; GRADUATES</text>
<text x="400" y="270" font-family="Georgia, serif" font-size="64" font-weight="700" fill="#ffffff">Tell the juniors what</text>
<text x="400" y="345" font-family="Georgia, serif" font-size="64" font-weight="700" fill="#ffffff">med school was</text>
<text x="400" y="420" font-family="Georgia, serif" font-size="64" font-weight="700" fill="#ffffff">really like</text>
<text x="90" y="560" font-family="Arial, sans-serif" font-size="30" fill="#cbd5e1">Share your story on OmpathStudy · ompathstudy.com/share-your-story</text>
</svg>`;
fs.writeFileSync("public/og/share-story.png", new Resvg(svg).render().asPng());
const all = svg.replace("FINALISTS &amp; GRADUATES", "EVERY YEAR, EVERY SCHOOL").replace("Tell the juniors what", "Your medical school").replace("med school was", "story could be").replace("really like", "someone's best day").replace("ompathstudy.com/share-your-story", "ompathstudy.com/share-your-story");
fs.writeFileSync("public/og/share-story-all.png", new Resvg(all).render().asPng());
console.log("written");
