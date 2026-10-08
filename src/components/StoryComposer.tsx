import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronDown, Loader2, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { buildStoryPath } from "@/lib/seo";
import { STORY_CRITERIA, STORY_MIN_CHARACTERS } from "@/lib/storyCriteria";

export const STORY_CATEGORIES = ["Experience", "Advice", "First-year life", "Clinical rotations", "Exams & study", "Reflection", "Campus & fun", "Other"];
const DRAFT = "ompath_story_draft";
const LAST = "ompath_story_last";
const MAX_CHARS = 20000;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Plain text from the box becomes safe HTML: blank lines start a paragraph, "## " is a heading, nothing the student types can run as code. */
export function textToHtml(text: string): string {
  return text.replace(/\r/g, "").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean).map((block) => {
    const h = block.match(/^#{1,3}\s+(.+)$/);
    return h ? `<h3>${escapeHtml(h[1])}</h3>` : `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`;
  }).join("\n");
}

const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT) ?? "{}") as { title?: string; body?: string; category?: string; year?: number }; } catch { return {}; } };

export default function StoryComposer({ open, onClose, onPublished }: { open: boolean; onClose: () => void; onPublished: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("Experience");
  const [year, setYear] = useState(0);
  const [name, setName] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const d = readDraft();
    setTitle(d.title ?? ""); setBody(d.body ?? ""); setCategory(d.category ?? "Experience");
    let y = d.year ?? 0;
    if (!y) { try { y = Number(localStorage.getItem("ompath_my_year")) || 0; } catch { /* ignore */ } }
    setYear(y);
    setName(((user?.user_metadata?.full_name as string | undefined) ?? "").trim());
  }, [open, user]);

  // The draft is kept on this device, so closing the window or losing signal never loses a half-written story.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => { try { localStorage.setItem(DRAFT, JSON.stringify({ title, body, category, year })); } catch { /* storage blocked */ } }, 400);
    return () => window.clearTimeout(t);
  }, [open, title, body, category, year]);

  const chars = body.trim().length;
  const words = useMemo(() => body.trim().split(/\s+/).filter(Boolean).length, [body]);
  const links = (body.match(/https?:\/\/|www\./gi) ?? []).length;
  const problem = !title.trim() ? "Give your story a title." : chars < STORY_MIN_CHARACTERS ? `Write a little more (${STORY_MIN_CHARACTERS - chars} more characters).` : chars > MAX_CHARS ? "That is too long. Please trim it." : links > 2 ? "Please remove the links. Stories are not adverts." : !year ? "Choose your year." : "";

  async function publish() {
    if (problem || busy) return;
    try { if (Date.now() - Number(localStorage.getItem(LAST) ?? 0) < 60_000) { toast({ title: "One moment", description: "Please wait a minute between stories." }); return; } } catch { /* ignore */ }
    setBusy(true);
    try {
      const display = anonymous ? "A medical student" : name.trim() || "A medical student";
      const byline = `<p><em>By ${escapeHtml(display)} · Year ${year}</em></p>`;
      const text = body.trim();
      const { data, error } = await supabase.from("stories").insert({
        title: title.trim().slice(0, 150),
        content: byline + textToHtml(text),
        category,
        published: true,
        tags: [`year-${year}`, "student"],
        meta_description: text.replace(/\s+/g, " ").slice(0, 160),
        reading_time_minutes: Math.max(1, Math.ceil(words / 200)),
      }).select("id,title").single();
      if (error) throw error;
      try { localStorage.removeItem(DRAFT); localStorage.setItem(LAST, String(Date.now())); } catch { /* ignore */ }
      toast({ title: "Your story is live", description: "Thank you for sharing." });
      setTitle(""); setBody("");
      onPublished(); onClose();
      if (data) navigate(buildStoryPath({ id: data.id, title: data.title }));
    } catch (e) {
      toast({ title: "Could not publish", description: (e as Error).message || "Please try again.", variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex h-[100dvh] w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[92dvh] sm:rounded-2xl">
        <div className="border-b border-border bg-gradient-to-r from-primary/15 via-primary/5 to-transparent px-5 py-4 pr-12">
          <DialogTitle className="font-serif text-xl font-bold">Share your story</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs">First years to final years, anything about medical school. It goes live in Stories as soon as you publish.</DialogDescription>
        </div>

        {!user ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="font-serif text-lg font-bold">Log in to publish</p>
            <p className="max-w-sm text-sm text-muted-foreground">It takes a moment, and it keeps Stories for real students. Your draft will be waiting.</p>
            <Link to={`/login?redirect=${encodeURIComponent("/stories?write=1")}`} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Log in or sign up</Link>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <label htmlFor="story-title" className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">Title</label>
                <input id="story-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder="e.g. My first day on the wards" className="w-full rounded-xl border border-border bg-background px-3.5 py-3 font-serif text-lg font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>

              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">What is it about?</p>
                <div className="flex flex-wrap gap-1.5">{STORY_CATEGORIES.map((c) => <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c} className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${category === c ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}>{c}</button>)}</div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Your year</p>
                <div className="flex flex-wrap gap-1.5">{[1, 2, 3, 4, 5, 6].map((y) => <button key={y} type="button" onClick={() => setYear(y)} aria-pressed={year === y} className={`h-9 min-w-[3.5rem] rounded-full border px-3 text-sm font-bold transition-colors ${year === y ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}>Y{y}</button>)}</div>
              </div>

              <div>
                <label htmlFor="story-body" className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">Your story</label>
                <textarea id="story-body" value={body} onChange={(e) => setBody(e.target.value)} rows={11} placeholder={"Tell it your way. What happened? What did you learn? What would you tell someone starting out?\n\nLeave a blank line to start a new paragraph."} className="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-3 text-base leading-7 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                <p className={`mt-1 text-xs ${chars >= STORY_MIN_CHARACTERS ? "text-primary" : "text-muted-foreground"}`}>{words} words · {chars} characters{chars < STORY_MIN_CHARACTERS ? ` · at least ${STORY_MIN_CHARACTERS}` : " · good length"} · saved on this device as you type</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr,auto] sm:items-end">
                <div>
                  <label htmlFor="story-name" className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">Name shown</label>
                  <input id="story-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={anonymous} placeholder="Your name" className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-50" />
                </div>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" /> Post anonymously</label>
              </div>

              <div className="rounded-xl border border-border bg-muted/40">
                <button type="button" onClick={() => setShowRules((v) => !v)} aria-expanded={showRules} className="flex w-full items-center justify-between px-3.5 py-2.5 text-sm font-bold">Story guidelines <ChevronDown className={`h-4 w-4 transition-transform ${showRules ? "rotate-180" : ""}`} /></button>
                {showRules && <ul className="space-y-2 border-t border-border px-3.5 py-3">{STORY_CRITERIA.map((c) => <li key={c.title} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><strong>{c.title}.</strong> <span className="text-muted-foreground">{c.detail}</span></span></li>)}</ul>}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border bg-background px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">{problem || "Ready. It goes live right away."}</p>
              <button type="button" onClick={() => void publish()} disabled={Boolean(problem) || busy} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
