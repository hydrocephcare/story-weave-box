import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCopy, Info, Loader2, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { NOTE_PROMPT, lintNote, matchOutline, tidyNote, type NoteIssue } from "@/lib/noteStandard";
import { MCQ_SET_PROMPT } from "@/lib/mcqParse";
import { UNIT_CATEGORIES } from "@/lib/store";

interface Row { id: string; title: string; category: string; content: string; original_notes: string | null; og_image_url: string | null; published: boolean; created_at: string; slug: string | null; is_raw: boolean }

const LEVEL = {
  error: { icon: AlertTriangle, cls: "text-destructive", label: "Must fix" },
  warn: { icon: AlertTriangle, cls: "text-amber-600 dark:text-amber-400", label: "Should fix" },
  tip: { icon: Info, cls: "text-primary", label: "Tip" },
} as const;

export const cardPath = (title: string, category: string) => {
  const p = new URLSearchParams({ title: title.slice(0, 140), kind: "Notes" });
  const m = category.match(/^Year\s*(\d)\s*:\s*(.*)$/i);
  if (m) { p.set("year", m[1]); p.set("unit", m[2].slice(0, 40)); }
  return `/api/note-card?${p.toString()}`;
};

function Issues({ issues }: { issues: NoteIssue[] }) {
  if (!issues.length) return <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Nothing to fix.</p>;
  return (
    <ul className="space-y-1.5">
      {issues.map((i) => { const L = LEVEL[i.level]; const Icon = L.icon; return (
        <li key={i.code + i.message} className="flex items-start gap-2 text-sm"><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${L.cls}`} /><span><span className={`mr-1.5 text-[11px] font-bold uppercase tracking-wide ${L.cls}`}>{L.label}</span>{i.message}{i.fixable && <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">auto-fix</span>}</span></li>
      ); })}
    </ul>
  );
}

function OutlineLine({ category, title }: { category: string; title: string }) {
  const m = useMemo(() => matchOutline(category, title), [category, title]);
  return (
    <p className={`text-sm ${m.item ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
      <span className="font-bold">Course outline: </span>{m.note}{m.week && !m.note.includes(m.week) ? ` (${m.week})` : ""}
    </p>
  );
}

/** Admin: the note standard. The ChatGPT prompt, a checker for any note, and a list of the latest notes with what is wrong and a one-tap tidy-up. */
export default function NoteQualityAdmin() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    setRows(null);
    const { data } = await (supabase as unknown as { from: (t: string) => any }).from("articles") // eslint-disable-line @typescript-eslint/no-explicit-any
      .select("id,title,category,content,original_notes,og_image_url,published,created_at,slug,is_raw").is("deleted_at", null).order("created_at", { ascending: false }).limit(40);
    setRows((data ?? []) as Row[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const reports = useMemo(() => new Map((rows ?? []).map((r) => [r.id, lintNote({ title: r.title, category: r.category, content: r.content ?? "", known: UNIT_CATEGORIES, hasImage: Boolean(r.og_image_url) || /!\[[^\]]*\]\(/.test(r.content ?? "") })])), [rows]);

  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); toast({ title: `${what} copied` }); } catch { toast({ title: "Could not copy", variant: "destructive" }); } };

  const fix = async (r: Row) => {
    const tidy = tidyNote(r.content ?? "", r.title);
    if (tidy === r.content) { toast({ title: "Nothing to tidy automatically" }); return; }
    setBusy(r.id);
    // the first time, the original text is kept in original_notes so nothing is lost
    const { error } = await (supabase as unknown as { from: (t: string) => any }).from("articles").update({ content: tidy, ...(r.original_notes ? {} : { original_notes: r.content }) }).eq("id", r.id); // eslint-disable-line @typescript-eslint/no-explicit-any
    setBusy(null);
    if (error) { toast({ title: "Could not save", description: error.message, variant: "destructive" }); return; }
    setRows((list) => (list ?? []).map((x) => (x.id === r.id ? { ...x, content: tidy } : x)));
    toast({ title: "Tidied", description: "The layout was repaired. The wording is unchanged." });
  };

  const showInUnit = async (r: Row) => {
    const tidy = tidyNote(r.content ?? "", r.title);
    const { error } = await (supabase as unknown as { from: (t: string) => any }).from("articles").update({ is_raw: false, content: tidy, ...(r.original_notes ? {} : { original_notes: r.content }) }).eq("id", r.id); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error) { toast({ title: "Could not save", description: error.message, variant: "destructive" }); return; }
    setRows((list) => (list ?? []).map((x) => (x.id === r.id ? { ...x, is_raw: false, content: tidy } : x)));
    toast({ title: "Now shown in its unit", description: "The layout was tidied too." });
  };

  const draftReport = useMemo(() => (draft.trim() ? lintNote({ title, category, content: draft, known: UNIT_CATEGORIES }) : null), [draft, title, category]);
  const draftTidy = useMemo(() => (draft.trim() ? tidyNote(draft, title) : ""), [draft, title]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-xl font-bold text-foreground">Note quality</h2>
        <p className="text-sm text-muted-foreground">One layout for every note: easy to read on a phone, questions with hidden answers, and a share picture. Give ChatGPT the prompt, then check and tidy what it returns.</p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-bold"><Sparkles className="h-4 w-4 text-primary" /> 1 · Prompt for ChatGPT</h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void copy(NOTE_PROMPT, "Note prompt")}><ClipboardCopy className="mr-1.5 h-4 w-4" /> Prompt for a note</Button>
            <Button size="sm" variant="outline" onClick={() => void copy(MCQ_SET_PROMPT, "MCQ prompt")}><ClipboardCopy className="mr-1.5 h-4 w-4" /> Prompt for an MCQ set</Button>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Paste it first, then write: “Topic: Pleural effusion. Year 4, Internal Medicine, week 3.” ChatGPT then writes the note in the site's layout.</p>
        <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer font-semibold">Read the prompt</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-[11px] leading-relaxed">{NOTE_PROMPT}</pre></details>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 font-bold"><Wand2 className="h-4 w-4 text-primary" /> 2 · Check a note before you publish it</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category, like Year 4: Internal Medicine" aria-label="Category" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste what ChatGPT wrote" aria-label="Note text" rows={7} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs" />
        {draftReport && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">{draftReport.words} words · about {draftReport.readMinutes} min · {draftReport.sections} sections · {draftReport.mcqs} MCQs · {draftReport.essays} essay / short-answer · {draftReport.recall} recall</p>
            <Issues issues={draftReport.issues} />
            <OutlineLine category={category} title={title} />
            {title && <div><p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Share picture</p><img src={cardPath(title, category)} alt="Share card" className="w-full max-w-sm rounded-lg border border-border" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /></div>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={draftTidy === draft} onClick={() => setDraft(draftTidy)}><Wand2 className="mr-1.5 h-4 w-4" /> Tidy the layout</Button>
              <Button size="sm" variant="outline" onClick={() => void copy(draftTidy, "Tidy note")}><ClipboardCopy className="mr-1.5 h-4 w-4" /> Copy tidy version</Button>
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold">3 · Latest notes on the site</h3>
          <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="mr-1.5 h-4 w-4" /> Refresh</Button>
        </div>
        {rows === null ? <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p> : (
          <ul className="mt-3 space-y-2">
            {rows.map((r) => {
              const rep = reports.get(r.id)!;
              const errs = rep.issues.filter((i) => i.level === "error").length;
              const warns = rep.issues.filter((i) => i.level === "warn").length;
              const fixable = rep.issues.some((i) => i.fixable);
              return (
                <li key={r.id} className="rounded-xl border border-border bg-card">
                  <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-start gap-3 px-3.5 py-3 text-left">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${errs ? "bg-destructive" : warns ? "bg-amber-500" : "bg-emerald-500"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{r.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.category} · {new Date(r.created_at).toLocaleDateString()}{r.published ? "" : " · draft"} · {errs} must-fix · {warns} should-fix · {rep.mcqs} MCQs</span>
                    </span>
                  </button>
                  {open === r.id && (
                    <div className="space-y-3 border-t border-border px-3.5 py-3">
                      {r.is_raw && (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                          <AlertTriangle className="h-4 w-4 text-amber-600" /> <span className="min-w-0 flex-1">This note is marked <b>raw</b>, so it is hidden from its unit's notes and from the lists.</span>
                          <Button size="sm" onClick={() => void showInUnit(r)}>Show it in its unit</Button>
                        </div>
                      )}
                      <Issues issues={rep.issues} />
                      <OutlineLine category={r.category} title={r.title} />
                      <p className="text-sm"><span className="font-bold">Share picture: </span>{r.og_image_url ? "the note's own picture" : "a card drawn from the title, year and unit"}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={!fixable || busy === r.id} onClick={() => void fix(r)}>{busy === r.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />} Tidy the layout</Button>
                        {r.slug && <Button size="sm" variant="outline" asChild><a href={`/blog/${r.slug}`} target="_blank" rel="noreferrer">Open the note</a></Button>}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
