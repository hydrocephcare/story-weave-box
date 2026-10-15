// One-off: thin topic pages are kept out of Google until they are deep; an admin can rewrite one deeper in one tap; the card no longer offers "quick" (the saved page is always the full one).
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 90)); return s.replace(x, y); };

edit("src/lib/topics.ts", (s) => {
  if (s.includes("isDeepPage")) return s;
  s += `
/** A page is "deep" when it has the sections, tables and examiner questions a student can revise from. Thin pages stay out of Google until they are rewritten. */
export function isDeepPage(p: { sections?: { b?: unknown[]; t?: unknown[]; p?: string }[]; exam?: unknown[] } | null | undefined): boolean {
  if (!p) return false;
  const secs = p.sections ?? [];
  const points = secs.reduce((n, x) => n + (x.b?.length ?? 0) + (x.t?.length ?? 0) + (x.p ? 1 : 0), 0);
  return secs.length >= 9 && (p.exam?.length ?? 0) >= 8 && points >= 45;
}

/** Admin: write the full, deep version now and replace what is saved. */
export async function rewriteDeeper(slug: string, name: string, category: string): Promise<string> {
  const r = await writeTopicPage({ name, category, context: "", choices: { level: "year4", angles: [], setting: "tropical", depth: "full" } });
  if (r.status !== "published") return "The writer is busy or out of credits. Try again in a minute.";
  const { error } = await (supabase as unknown as { from: (t: string) => { upsert: (v: Record<string, unknown>, o: Record<string, unknown>) => Promise<{ error: { message: string } | null }> } })
    .from("topic_pages").upsert({ slug, name, category: category || (r.page as { subject?: string }).subject || null, status: "published", content: r.page, reviewed: false, updated_at: new Date().toISOString() }, { onConflict: "slug" });
  return error ? error.message : "Rewritten. Reload to read it.";
}
`;
  return s;
});

edit("src/pages/TopicPage.tsx", (s) => {
  if (s.includes("rewriteDeeper")) return s;
  s = swap(s, "import { DOMAIN_STYLE, imageCaption,", "import { DOMAIN_STYLE, imageCaption, isDeepPage, rewriteDeeper,");
  s = swap(s, '        <link rel="canonical" href={`${SITE}${topicPath(slug)}`} />\n        <meta property="og:title"', '        <link rel="canonical" href={`${SITE}${topicPath(slug)}`} />\n        {page && !isDeepPage(page) && <meta name="robots" content="noindex,follow" />}\n        <meta property="og:title"');
  s = swap(s, '>Remove and rewrite</button>', '>Remove and rewrite</button>\n              {!isDeepPage(page) && <button type="button" className="rounded-lg border border-primary/50 bg-primary/10 px-3 py-1.5 text-primary hover:bg-primary/20" onClick={async () => { setAdminMsg("Writing the deep version, about 40 seconds..."); setAdminMsg(await rewriteDeeper(slug, name, topic?.c ?? "")); }}>Thin page: rewrite deeper</button>}');
  // the saved page is always the full one: no "quick" option
  s = swap(s, '        <div><p className="text-sm font-bold">How deep</p><div className="mt-2 flex flex-wrap gap-2">{([["full", "Full topic: everything an examiner can ask"], ["quick", "Quick revision"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={depth === k} onClick={() => setDepth(k)} className={chip(depth === k)}>{l}</button>)}</div></div>\n', "");
  s = swap(s, '  const [depth, setDepth] = useState<TopicChoices["depth"]>("full");\n', "");
  s = swap(s, "onStart({ level, angles, setting, depth })", 'onStart({ level, angles, setting, depth: "full" })');
  s = swap(s, "Four quick taps, so the page is built for you and is not a general summary.", "Three quick taps, so the page is built for you and is not a general summary. Every page is written in full.");
  return s;
});

edit("api/topics-sitemap.js", (s) => {
  if (s.includes("deep")) return s;
  s = swap(s, "select=slug,updated_at&status=eq.published", "select=slug,updated_at,sections:content->sections,exam:content->exam&status=eq.published");
  s = swap(s, "const fresh = rows.filter((r) => r.slug && !indexed.has(r.slug));", "// only pages deep enough to be indexed (thin ones carry noindex until they are rewritten)\n    const deep = (r) => Array.isArray(r.sections) && r.sections.length >= 9 && Array.isArray(r.exam) && r.exam.length >= 8;\n    const fresh = rows.filter((r) => r.slug && !indexed.has(r.slug) && deep(r));");
  return s;
});
console.log("depth gate applied");
