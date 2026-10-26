// Deterministic story clean-up (no AI): spacing, punctuation spacing, capital letters and tidy paragraphs.

const FIXES: [RegExp, string][] = [
  [/\bi\b(?=['’]|\s)/g, "I"],
  [/\bim\b/g, "I'm"], [/\bdont\b/gi, "don't"], [/\bcant\b/gi, "can't"], [/\bdidnt\b/gi, "didn't"], [/\bwasnt\b/gi, "wasn't"],
  [/\bive\b/g, "I've"], [/\bwont\b/gi, "won't"], [/\bisnt\b/gi, "isn't"], [/\bcouldnt\b/gi, "couldn't"],
  [/\bteh\b/gi, "the"], [/\brecieve/gi, "receive"], [/\bdefinately\b/gi, "definitely"], [/\bseperate/gi, "separate"],
  [/\bwich\b/gi, "which"], [/\bbecuase\b/gi, "because"], [/\bexperiance/gi, "experience"],
];

/** Fixes spacing and capitals inside one run of text. */
export function tidyText(raw: string): string {
  let t = raw.replace(/\u00a0/g, " ").replace(/[ \t]{2,}/g, " ");
  t = t.replace(/\s+([,.;:!?])/g, "$1");                 // no space before punctuation
  t = t.replace(/([,;:!?])(?=[A-Za-z])/g, "$1 ");        // space after punctuation
  t = t.replace(/([a-z])\.(?=[A-Z][a-z])/g, "$1. ");     // "end.Next" -> "end. Next"
  t = t.replace(/\.{4,}/g, "...").replace(/([!?]){3,}/g, "$1$1").replace(/,{2,}/g, ",");
  for (const [re, to] of FIXES) t = t.replace(re, to);
  t = t.replace(/([.!?]["')\]”’]*\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase()); // capital after a full stop
  return t;
}

/** A long unbroken block becomes readable paragraphs: sentences are grouped (about 40 to 75 words each) and no paragraph is left with a lonely last line. */
export function splitLongBlock(text: string, maxWords = 110): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  const words = t.split(" ").length;
  if (words <= maxWords) return [t];
  const sentences = t.match(/[^.!?]+(?:[.!?]+["')\]”’]*|$)\s*/g)?.map((x) => x.trim()).filter(Boolean) ?? [t];
  if (sentences.length < 4) return [t];
  const target = Math.max(40, Math.min(75, Math.round(words / Math.ceil(words / 60))));
  const out: string[] = []; let cur: string[] = []; let n = 0;
  for (const sen of sentences) {
    const w = sen.split(" ").length;
    if (n >= target && cur.length >= 2) { out.push(cur.join(" ")); cur = []; n = 0; }
    cur.push(sen); n += w;
  }
  if (cur.length) { if (out.length && n < 15) out[out.length - 1] += " " + cur.join(" "); else out.push(cur.join(" ")); }
  return out;
}

const capFirst = (s: string) => s.replace(/^(\s*(?:["'“‘(]\s*)?)([a-z])/, (_, a, b) => a + b.toUpperCase());

/** Plain text or light markdown: one paragraph per blank-line block, every paragraph starts with a capital. */
export function tidyPlain(text: string): string {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/).map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean).join("\n")).filter(Boolean);
  return blocks.flatMap((b) => (/^(#{1,3}\s|[-*>]\s|!\[|[-*_]{3,}$)/.test(b) ? [b] : splitLongBlock(capFirst(tidyText(b))))).join("\n\n");
}

/** Story HTML: tidies each text node, drops empty paragraphs, capitalises the start of every paragraph and heading. */
export function tidyHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = []; for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  for (const n of nodes) if (!n.parentElement?.closest("a")) n.nodeValue = tidyText(n.nodeValue ?? "");
  doc.body.querySelectorAll("p").forEach((p) => {
    if (!(p.textContent ?? "").trim() && !p.querySelector("img")) p.remove();
  });
  doc.body.querySelectorAll("p, li, h2, h3, blockquote").forEach((el) => {
    const w = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const v = n.nodeValue ?? ""; if (!v.trim()) continue;
      n.nodeValue = capFirst(v).replace(/^\s+/, ""); break;
    }
  });
  // a long single block of text is split into paragraphs
  doc.body.querySelectorAll("p").forEach((para) => {
    if (para.children.length) return;
    const parts = splitLongBlock(para.textContent ?? "");
    if (parts.length < 2) return;
    parts.forEach((txt) => { const np = doc.createElement("p"); np.textContent = txt; para.parentNode?.insertBefore(np, para); });
    para.remove();
  });
  return doc.body.innerHTML;
}

export function tidyStory(content: string): string {
  return /<[a-z][\s\S]*>/i.test(content) ? tidyHtml(content) : tidyPlain(content);
}
