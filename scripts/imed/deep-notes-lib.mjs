// One-off: topics.ts goes back to the single revision-page flow (no question card, no auto-upgrade) and gains the deep exam notes writer.
import fs from "node:fs";
const f = "src/lib/topics.ts";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
const swap = (x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 90)); s = s.replace(x, y); };

swap('export type TopicPhase = "loading" | "intake" |', 'export type TopicPhase = "loading" |');
swap("  reviewed?: boolean;\n}\nexport interface Topic", "  reviewed?: boolean;\n  /** The deep exam notes: written once, on request, from what the revision page lacks. */\n  deep?: DeepNotes;\n}\nexport interface DeepNotes { sections: { h: string; p?: string; b?: string[]; t?: { a: string; b: string }[] }[]; exam: string[]; model?: string; generatedAt?: string }\nexport interface Topic");
swap("async function askServer(slug: string, name: string, category: string, context: string, choices?: TopicChoices): Promise<Ask> {", "async function askServer(slug: string, name: string, category: string, context: string): Promise<Ask> {");
swap("const r = await writeTopicPage({ name, category, context, choices });", "const r = await writeTopicPage({ name, category, context });");
swap('import { writeTopicPage, aiPaused, looksLikeBot, type TopicChoices } from "@/lib/topicWriter";', 'import { writeTopicPage, looksLikeBot } from "@/lib/topicWriter";');
swap("  const [intake, setIntake] = useState(false);\n  const [chosen, setChosen] = useState<{ slug: string; c: TopicChoices } | null>(null);\n", "");
swap(" setRedirectTo(null); setIntake(false);", " setRedirectTo(null);");
// the upgrade block
const a = s.indexOf("      if (have) {\n        setPage(have); setPhase(\"ready\");");
const b = s.indexOf("      setPhase(t ? \"ready\" : \"writing\");");
if (a < 0 || b < 0) throw new Error("blocks");
s = s.slice(0, a) + "      if (have) { setPage(have); setPhase(\"ready\"); return; }\n\n      // nothing written yet: show what the site has straight away, and write the revision page in the background\n" + s.slice(b);
swap("const res = await askServer(slug, name, category, context, mine);", "const res = await askServer(slug, name, category, context);");
swap("  }, [slug, attempt, chosen]);", "  }, [slug, attempt]);");
swap("  const startWriting = useCallback((c: TopicChoices) => setChosen({ slug, c }), [slug]);\n", "");
swap("retry, writing, intake, startWriting, name:", "retry, writing, name:");
// replace the tail (isDeepPage, rewriteDeeper, upgradeThin) with the deep notes writer
const t = s.indexOf("/** A page is \"deep\" when");
if (t < 0) throw new Error("tail");
s = s.slice(0, t) + [
  "/**",
  " * Writes the deep exam notes for a topic, once. The writer is shown the revision page, so it adds what is missing and does not repeat it; the notes are",
  " * saved with the page and every later reader gets them without any AI call. Returns the notes, or why it failed.",
  " */",
  "export async function writeDeepNotes(slug: string, name: string, category: string, base: AiPage): Promise<{ deep: DeepNotes } | { error: \"busy\" | \"failed\" | \"bot\" }> {",
  "  if (looksLikeBot()) return { error: \"bot\" };",
  "  try {",
  "    const digest = { sections: base.sections.map((x) => ({ h: x.h, p: x.p, b: (x.b ?? []).slice(0, 4) })), exam: base.exam ?? [] };",
  "    const r = await fetch(\"/api/topic-write\", { method: \"POST\", headers: { \"content-type\": \"application/json\" }, body: JSON.stringify({ mode: \"deep\", name, category, base: digest }) });",
  "    const j = (await r.json().catch(() => null)) as { status?: string; deep?: DeepNotes } | null;",
  "    if (j?.status === \"published\" && j.deep) {",
  "      const clean = { ...base, deep: undefined } as AiPage;",
  "      try { await (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<unknown> }).rpc(\"save_topic_deep\", { p_slug: slug, p_name: name, p_category: category || base.subject || \"\", p_base: JSON.parse(JSON.stringify(clean)), p_deep: j.deep }); } catch { /* shown anyway; saved next time */ }",
  "      return { deep: j.deep };",
  "    }",
  "    return { error: r.status === 429 || j?.status === \"busy\" ? \"busy\" : \"failed\" };",
  "  } catch { return { error: \"failed\" }; }",
  "}",
  "",
].join("\n");
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("topics.ts updated");
