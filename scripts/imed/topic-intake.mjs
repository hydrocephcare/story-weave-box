// One-off: the reader's choices (level, angles, setting, depth) travel from the topic page to the writer, and the page asks before it writes.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 90)); return s.replace(x, y); };

edit("src/lib/topicWriter.ts", (s) => {
  if (s.includes("TopicChoices")) return s;
  s = swap(s, "export type WriteResult =", "/** What the reader chose before the page was written. */\nexport type TopicChoices = { level: \"year3\" | \"year4\" | \"year5\"; angles: string[]; setting: \"tropical\" | \"general\"; depth: \"quick\" | \"full\" };\n\nexport type WriteResult =");
  s = swap(s, "async function viaServer(name: string, category: string, context: string, signal?: AbortSignal)", "async function viaServer(name: string, category: string, context: string, choices?: TopicChoices, signal?: AbortSignal)");
  s = swap(s, "body: JSON.stringify({ name, category, context: context.slice(0, 3000) }) });\n    if (r.status === 503", "body: JSON.stringify({ name, category, context: context.slice(0, 3000), choices }) });\n    if (r.status === 503");
  s = swap(s, "export async function writeTopicPage({ name, category, context, signal }: { name: string; category: string; context: string; signal?: AbortSignal })", "export async function writeTopicPage({ name, category, context, choices, signal }: { name: string; category: string; context: string; choices?: TopicChoices; signal?: AbortSignal })");
  s = swap(s, "await viaServer(name, category, context, signal);", "await viaServer(name, category, context, choices, signal);");
  return s;
});

edit("src/lib/topics.ts", (s) => {
  if (s.includes("TopicChoices")) return s;
  s = swap(s, 'import { writeTopicPage } from "@/lib/topicWriter";', 'import { writeTopicPage, aiPaused, looksLikeBot, type TopicChoices } from "@/lib/topicWriter";');
  s = swap(s, 'export type TopicPhase = "loading" |', 'export type TopicPhase = "loading" | "intake" |');
  s = swap(s, "async function askServer(slug: string, name: string, category: string, context: string): Promise<Ask> {", "async function askServer(slug: string, name: string, category: string, context: string, choices?: TopicChoices): Promise<Ask> {");
  s = swap(s, "const r = await writeTopicPage({ name, category, context });", "const r = await writeTopicPage({ name, category, context, choices });");
  s = swap(s, "  const [asking, setAsking] = useState(false);", "  const [asking, setAsking] = useState(false);\n  const [intake, setIntake] = useState(false);\n  const [chosen, setChosen] = useState<{ slug: string; c: TopicChoices } | null>(null);");
  s = swap(s, '    setTopic(null); setPage(null); setPhase("loading"); setFresh(false); setRedirectTo(null);', '    setTopic(null); setPage(null); setPhase("loading"); setFresh(false); setRedirectTo(null); setIntake(false);');
  s = swap(s, "      // nothing written yet: show what the site has straight away, and write the rest in the background\n", "      // nothing written yet: ask the reader a few questions first (level, angles, setting, depth), then write the page to match\n      const mine = chosen?.slug === slug ? chosen.c : undefined;\n      if (!mine && !looksLikeBot() && !aiPaused() && !wasRejected(slug) && !recentlyTried(slug)) { setIntake(true); setPhase(t ? \"ready\" : \"intake\"); return; }\n      setIntake(false);\n");
  s = swap(s, "const res = await askServer(slug, name, category, context);", "const res = await askServer(slug, name, category, context, mine);");
  s = swap(s, "  }, [slug, attempt]);", "  }, [slug, attempt, chosen]);");
  s = swap(s, "  const writing = asking;\n  return { topic, page, phase, fresh, redirectTo, retry, writing,", "  const writing = asking;\n  const startWriting = useCallback((c: TopicChoices) => setChosen({ slug, c }), [slug]);\n  return { topic, page, phase, fresh, redirectTo, retry, writing, intake, startWriting,");
  return s;
});
console.log("wiring applied");
