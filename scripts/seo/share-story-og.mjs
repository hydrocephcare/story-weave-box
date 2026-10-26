// node scripts/seo/share-story-og.mjs   Draws the two share pictures (1200x630) used when the share pages are sent in WhatsApp, X and Facebook:
//   public/og/share-story.png      for finalists (the shield badge)
//   public/og/share-story-all.png  for everyone (an open book with a spark)
import fs from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const bg = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#1e3a5f"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5c542"/><stop offset="1" stop-color="#d97706"/></linearGradient>
<linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5eead4"/><stop offset="1" stop-color="#14b8a6"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#bg)"/>
<circle cx="1080" cy="90" r="190" fill="#14b8a6" opacity=".08"/><circle cx="130" cy="560" r="150" fill="#f5c542" opacity=".07"/>`;
const foot = (s) => `<text x="90" y="565" font-family="Arial, sans-serif" font-size="28" fill="#cbd5e1">${s}</text>
<text x="1110" y="565" text-anchor="end" font-family="Georgia, serif" font-size="34" font-weight="700" fill="#ffffff">Ompath<tspan fill="#5eead4">Study</tspan></text>`;
const lines = (a, b, c) => `<text x="400" y="270" font-family="Georgia, serif" font-size="62" font-weight="700" fill="#ffffff">${a}</text>
<text x="400" y="345" font-family="Georgia, serif" font-size="62" font-weight="700" fill="#ffffff">${b}</text>
<text x="400" y="420" font-family="Georgia, serif" font-size="62" font-weight="700" fill="#ffffff">${c}</text>`;

const shield = `<g transform="translate(90 120) scale(8)"><path d="M16 1.8 28 6v8.6c0 7.2-4.9 12.6-12 15.6C8.9 27.2 4 21.8 4 14.6V6z" fill="url(#g)"/><path d="M16 3.8 26 7.3v7.3c0 6.1-4.1 10.7-10 13.4-5.9-2.7-10-7.3-10-13.4V7.3z" fill="#1f2937"/><path d="m16 9.5-7.5 3.7L16 17l7.5-3.8z" fill="#f8d56b"/><path d="M11 15.6v3.4c0 1.2 2.2 2.4 5 2.4s5-1.2 5-2.4v-3.4l-5 2.4z" fill="#f8d56b" opacity=".85"/></g>`;
const book = `<g transform="translate(95 150)" fill="none" stroke-linecap="round" stroke-linejoin="round">
<path d="M10 40 C60 10 110 10 130 40 V190 C110 165 60 165 10 190 Z" fill="#1f2937" stroke="url(#t)" stroke-width="9"/>
<path d="M250 40 C200 10 150 10 130 40 V190 C150 165 200 165 250 190 Z" fill="#1f2937" stroke="url(#t)" stroke-width="9"/>
<path d="M45 85 H100 M45 115 H100 M45 145 H85 M160 85 H215 M160 115 H215" stroke="#5eead4" stroke-width="7" opacity=".55"/>
<path d="M195 -10 l8 26 26 8 -26 8 -8 26 -8 -26 -26 -8 26 -8 z" fill="#f5c542" stroke="none"/></g>`;

const finalists = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">${bg}${shield}
<text x="400" y="190" font-family="Georgia, serif" font-size="30" font-weight="700" fill="#f5c542" letter-spacing="4">FINALISTS &amp; GRADUATES</text>
${lines("Tell the juniors what", "med school was", "really like")}${foot("ompathstudy.com/finalists")}</svg>`;
const everyone = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">${bg}${book}
<text x="400" y="190" font-family="Georgia, serif" font-size="30" font-weight="700" fill="#f5c542" letter-spacing="4">ANYONE CAN SHARE</text>
${lines("Your story", "could be someone's", "best day")}${foot("Any year. Any course.")}</svg>`;

fs.writeFileSync("public/og/share-story.png", new Resvg(finalists).render().asPng());
fs.writeFileSync("public/og/share-story-all.png", new Resvg(everyone).render().asPng());
console.log("written");
