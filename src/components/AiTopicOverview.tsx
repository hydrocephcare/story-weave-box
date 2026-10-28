import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { askOmpathAi } from "@/lib/topicWriter";
import { mdToHtml } from "@/lib/miniMarkdown";
import { openAI } from "@/lib/aiEvents";

const KEY = "ompath_pack_overview_v1";
const TTL = 14 * 86400_000;
const read = (k: string): string | null => { try { const m = JSON.parse(localStorage.getItem(KEY) ?? "{}"); return m[k] && Date.now() - m[k].t < TTL ? m[k].text : null; } catch { return null; } };
const save = (k: string, text: string) => { try { const m = JSON.parse(localStorage.getItem(KEY) ?? "{}"); m[k] = { t: Date.now(), text }; localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage blocked */ } };

/** The first step of a revision pack: a short overview written by Ompath AI for this topic, in this unit, from the unit's own notes. */
export default function AiTopicOverview({ topic, unit, noteTitles }: { topic: string; unit: string; noteTitles: string[] }) {
  const key = `${topic.toLowerCase()}|${unit}`;
  const [text, setText] = useState<string | null>(() => read(key));
  const [state, setState] = useState<"idle" | "loading" | "failed">(text ? "idle" : "loading");

  useEffect(() => {
    const cached = read(key);
    if (cached) { setText(cached); setState("idle"); return; }
    const ctl = new AbortController();
    setText(null); setState("loading");
    const q = `Write a short revision overview of "${topic}"${unit ? ` for the ${unit} unit` : ""} for an MBChB student. Use these headings in markdown: ## What it is, ## Key points to know, ## Investigations and management (only if it applies), ## What examiners ask. Keep it under 350 words, plain bullets, no preamble.`;
    askOmpathAi(q, noteTitles.length ? `Notes on the site for this topic: ${noteTitles.slice(0, 8).join("; ")}` : "", topic, unit, ctl.signal)
      .then((t) => { const clean = t.trim(); if (clean.length < 80) throw new Error("short"); save(key, clean); setText(clean); setState("idle"); })
      .catch(() => { if (!ctl.signal.aborted) setState("failed"); });
    return () => ctl.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "loading") return <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> Ompath AI is writing the overview…</p>;
  if (text) return (
    <div>
      <article className="note-body text-[15px]" dangerouslySetInnerHTML={{ __html: mdToHtml(text, { skipTitle: true }).html }} />
      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><Sparkles className="h-3 w-3 text-primary" aria-hidden /> Written by Ompath AI. Check it against the notes below.</p>
    </div>
  );
  return <button type="button" onClick={() => openAI(`Explain ${topic}${unit ? ` in ${unit}` : ""} for a medical student, then list what an examiner expects.`)} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-bold hover:border-primary/50"><Sparkles className="h-4 w-4 text-primary" aria-hidden /> The overview did not load. Ask Ompath AI instead</button>;
}
