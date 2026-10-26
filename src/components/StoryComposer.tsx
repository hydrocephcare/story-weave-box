import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DOMPurify from "dompurify";
import { Sparkles, ImagePlus, X, Check, CheckCircle2, ChevronDown, Copy, Eye, ExternalLink, Loader2, MessageCircle, PenLine, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import StoryEditor from "@/components/StoryEditor";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { SITE_URL, buildStoryPath } from "@/lib/seo";
import { STORY_CRITERIA, STORY_MIN_CHARACTERS } from "@/lib/storyCriteria";
import { ownerTagFor, storyToEditable } from "@/lib/storyOwner";
import { isGeneratedThumb, storyThumb, whatsappLink } from "@/lib/storyShare";
import { uploadStoryImage } from "@/lib/storyImage";

export const STORY_CATEGORIES = ["Experience", "Advice", "First-year life", "Clinical rotations", "Exams & study", "Reflection", "Campus & fun", "Other"];
const DRAFT = "ompath_story_draft_v2";
const LAST = "ompath_story_last";
const MAX_CHARS = 20000;

export interface EditableStory { id: string; title: string; content: string; category: string; tags?: string[] | null; cover_image_url?: string | null }

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Plain text to safe HTML (used for old stories and tests): blank lines start a paragraph, "## " is a heading. */
import { tidyHtml } from "@/lib/tidyStory";
import FinalistBadge from "@/components/FinalistBadge";
import { assistBio, assistStory, assistTitles, paragraphsToHtml } from "@/lib/storyAssist";
import { ABOUT_MAX, UNIVERSITIES, aboutFromTags, aboutTag, photoFromTags, photoTag, uniFromTags, uniTag, withoutAuthorTags } from "@/lib/storyAuthor";

/** What the writer suggests changes with the year: first years are not on the wards yet, finalists look back. */
export function yearGuide(year: number): { placeholder: string; categories: string[] } {
  if (year === 7) return { placeholder: "e.g. What I wish I knew before I started med school", categories: ["Advice", "Reflection", "Exams & study", "Clinical rotations", "Experience", "Campus & fun", "Other"] };
  if (year >= 1 && year <= 3) return { placeholder: year === 1 ? "e.g. My first month on campus" : "e.g. Surviving the pre-clinical years", categories: STORY_CATEGORIES.filter((c) => c !== "Clinical rotations" && (year === 1 || c !== "First-year life")) };
  if (year >= 4) return { placeholder: "e.g. My first day on the wards", categories: STORY_CATEGORIES.filter((c) => c !== "First-year life") };
  return { placeholder: "e.g. My first day on the wards", categories: STORY_CATEGORIES };
}

export function textToHtml(text: string): string {
  return text.replace(/\r/g, "").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean).map((block) => {
    const h = block.match(/^#{1,3}\s+(.+)$/);
    return h ? `<h3>${escapeHtml(h[1])}</h3>` : `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`;
  }).join("\n");
}

/** Only formatting survives: no scripts, no styles, no images or embeds, links always open safely. */
export function cleanStoryHtml(html: string): string {
  const safe = DOMPurify.sanitize(html, { ALLOWED_TAGS: ["p", "br", "h2", "h3", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "hr", "a", "img"], ALLOWED_ATTR: ["href", "src", "alt"] });
  const doc = new DOMParser().parseFromString(`<body>${safe}</body>`, "text/html");
  doc.querySelectorAll("img").forEach((img) => {
    if (!/^https:\/\//i.test(img.getAttribute("src") ?? "")) { img.remove(); return; }
    img.setAttribute("loading", "lazy"); if (!img.getAttribute("alt")) img.setAttribute("alt", "");
  });
  doc.querySelectorAll("a").forEach((a) => {
    if (!/^https?:\/\//i.test(a.getAttribute("href") ?? "")) { a.replaceWith(...Array.from(a.childNodes)); return; }
    a.setAttribute("rel", "nofollow ugc noopener"); a.setAttribute("target", "_blank");
  });
  return doc.body.innerHTML;
}

const readDraft = (): { title?: string; html?: string; category?: string; year?: number; about?: string; uni?: string } => { try { return JSON.parse(localStorage.getItem(DRAFT) ?? "{}"); } catch { return {}; } };

export default function StoryComposer({ open, onClose, onPublished, editing, startYear }: { open: boolean; onClose: () => void; onPublished: () => void; editing?: EditableStory | null; startYear?: number }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [html, setHtml] = useState("");
  const [initialHtml, setInitialHtml] = useState("");
  const [docKey, setDocKey] = useState("0");
  const [plain, setPlain] = useState("");
  const [category, setCategory] = useState("Experience");
  const [year, setYear] = useState(0);
  const [name, setName] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [about, setAbout] = useState("");
  const [uni, setUni] = useState("");
  const [photo, setPhoto] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState("");
  const [titleIdeas, setTitleIdeas] = useState<string[]>([]);
  const [undoHtml, setUndoHtml] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [busy, setBusy] = useState(false);
  const [cover, setCover] = useState("");
  const [coverBusy, setCoverBusy] = useState(false);
  const [done, setDone] = useState<{ url: string; path: string; title: string; edited: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const isEdit = Boolean(editing);

  useEffect(() => {
    if (!open) return;
    setTab("write"); setDone(null);
    const key = `${editing?.id ?? "new"}-${Date.now()}`;
    if (editing) {
      const e = storyToEditable(editing.content);
      setCover(isGeneratedThumb(editing.cover_image_url) ? "" : editing.cover_image_url ?? "");
      setTitle(editing.title); setInitialHtml(e.html); setHtml(e.html); setCategory(editing.category || "Experience");
      setYear(Number(editing.tags?.find((t) => /^year-[1-7]$/.test(t))?.slice(5)) || 0);
      setName(e.name || ((user?.user_metadata?.full_name as string | undefined) ?? "").trim()); setAnonymous(e.anonymous); setAbout(aboutFromTags(editing.tags)); setUni(uniFromTags(editing.tags)); setPhoto(photoFromTags(editing.tags));
      setDocKey(key);
      return;
    }
    const d = readDraft();
    setCover("");
    setTitle(d.title ?? ""); setInitialHtml(d.html ?? ""); setHtml(d.html ?? ""); setCategory(d.category ?? "Experience");
    let y = d.year ?? 0;
    if (!y) { try { y = Number(localStorage.getItem("ompath_my_year")) || 0; } catch { /* ignore */ } }
    if (startYear && startYear >= 1 && startYear <= 7) y = startYear; // a shared link such as /finalists opens the writer on that year
    setYear(y); setAnonymous(false); setAbout(d.about ?? ""); setUni(d.uni ?? "");
    { const md = (user?.user_metadata ?? {}) as { avatar_url?: string; bio?: string }; setPhoto(md.avatar_url ?? ""); if (!d.about && md.bio) setAbout(md.bio); }
    if (user && !d.uni) void (supabase as any).from("profiles").select("university").eq("user_id", user.id).maybeSingle().then(({ data }: { data: { university?: string } | null }) => { if (data?.university) setUni((u) => u || (data.university as string)); });
    setName(((user?.user_metadata?.full_name as string | undefined) ?? "").trim());
    setDocKey(key);
  }, [open, user, editing]);

  // A new story's draft is kept on this device, so closing the window or losing signal never loses it.
  useEffect(() => {
    if (!open || isEdit || done) return;
    const t = window.setTimeout(() => { try { localStorage.setItem(DRAFT, JSON.stringify({ title, html, category, year, about, uni })); } catch { /* storage blocked */ } }, 500);
    return () => window.clearTimeout(t);
  }, [open, isEdit, done, title, html, category, year, about, uni]);

  const chars = plain.trim().length;
  const words = useMemo(() => plain.trim().split(/\s+/).filter(Boolean).length, [plain]);
  const links = Math.max((html.match(/href=/g) ?? []).length, (plain.match(/https?:\/\/|www\./gi) ?? []).length);
  const problem = !title.trim() ? "Give your story a title." : chars < STORY_MIN_CHARACTERS ? `Write a little more (${STORY_MIN_CHARACTERS - chars} more characters).` : chars > MAX_CHARS ? "That is too long. Please trim it." : links > 2 ? "Please remove some links. Stories are not adverts." : !year ? "Choose your year." : "";
  const aiFail = (e: unknown) => toast({ title: "The helper could not help", description: (e as Error).message, variant: "destructive" });
  const polishStory = async () => {
    setAiBusy("story");
    try {
      const t = await assistStory(plain);
      if (!t) return;
      const next = paragraphsToHtml(t);
      setUndoHtml(html); setInitialHtml(next); setHtml(next); setDocKey(String(Date.now()));
      toast({ title: "Polished", description: "Read it through. Press Undo if you prefer your own version." });
    } catch (e) { aiFail(e); } finally { setAiBusy(""); }
  };
  const undoPolish = () => { if (undoHtml === null) return; setInitialHtml(undoHtml); setHtml(undoHtml); setDocKey(String(Date.now())); setUndoHtml(null); };
  const ideasForTitle = async () => { setAiBusy("titles"); try { setTitleIdeas(await assistTitles(plain)); } catch (e) { aiFail(e); } finally { setAiBusy(""); } };
  const writeAbout = async () => { setAiBusy("about"); try { const t = await assistBio({ name: anonymous ? "" : name, university: uni, year, notes: about }); if (t) setAbout(t.slice(0, ABOUT_MAX)); } catch (e) { aiFail(e); } finally { setAiBusy(""); } };
  const display = anonymous ? "A medical student" : name.trim() || "A medical student";
  const previewHtml = useMemo(() => cleanStoryHtml(html), [html]);

  async function publish() {
    if (problem || busy || !user) return;
    if (!isEdit) {
      try { if (Date.now() - Number(localStorage.getItem(LAST) ?? 0) < 60_000) { toast({ title: "One moment", description: "Please wait a minute between stories." }); return; } } catch { /* ignore */ }
    }
    setBusy(true);
    try {
      const owner = await ownerTagFor(user.id);
      if (!owner) throw new Error("Could not verify your account. Please try again.");
      const text = plain.replace(/\s+/g, " ").trim();
      const fields = {
        title: title.trim().slice(0, 150),
        content: `<p><em>By ${escapeHtml(display)} · ${year === 7 ? "Finalist" : `Year ${year}`}</em></p>${tidyHtml(cleanStoryHtml(html))}`,
        category,
        meta_description: text.slice(0, 160),
        reading_time_minutes: Math.max(1, Math.ceil(words / 200)),
      };
      if (editing) {
        if (!editing.tags?.includes(owner)) throw new Error("You can only edit your own stories.");
        const keep = withoutAuthorTags((editing.tags ?? []).filter((t) => !/^year-\d$/.test(t)));
        const aboutT = aboutTag(about);
        const uniT = uniTag(uni);
        const photoT = photoTag(photo);
        const thumb = { cover_image_url: cover || storyThumb(category), og_image_url: cover || storyThumb(category) };
        const { error } = await supabase.from("stories").update({ ...fields, ...thumb, tags: [...keep, `year-${year}`, ...(aboutT ? [aboutT] : []), ...(uniT ? [uniT] : []), ...(photoT ? [photoT] : [])] }).eq("id", editing.id).contains("tags", [owner]);
        if (error) throw error;
        const path = buildStoryPath({ id: editing.id, title: fields.title });
        setDone({ url: `${SITE_URL}${path}`, path, title: fields.title, edited: true });
        onPublished();
        return;
      }
      const { data, error } = await supabase.from("stories").insert({ ...fields, published: true, tags: [`year-${year}`, "student", owner, ...(user.email_confirmed_at ? ["verified"] : []), ...(aboutTag(about) ? [aboutTag(about)] : []), ...(uniTag(uni) ? [uniTag(uni)] : []), ...(photoTag(photo) ? [photoTag(photo)] : [])], cover_image_url: cover || storyThumb(category), og_image_url: cover || storyThumb(category) }).select("id,title").single();
      if (error) throw error;
      try { localStorage.removeItem(DRAFT); localStorage.setItem(LAST, String(Date.now())); } catch { /* ignore */ }
      const path = buildStoryPath({ id: data.id, title: data.title });
      setDone({ url: `${SITE_URL}${path}`, path, title: data.title, edited: false });
      setTitle(""); setHtml(""); setInitialHtml(""); setPlain(""); setCover("");
      onPublished();
    } catch (e) {
      toast({ title: isEdit ? "Could not save" : "Could not publish", description: (e as Error).message || "Please try again.", variant: "destructive" });
    } finally { setBusy(false); }
  }

  const pickCover = async (file: File) => {
    setCoverBusy(true);
    try { setCover(await uploadStoryImage(file)); }
    catch (e) { toast({ title: "Picture not added", description: (e as Error).message, variant: "destructive" }); }
    finally { setCoverBusy(false); }
  };

  const copy = async (url: string) => { try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ } };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex h-[100dvh] w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[94dvh] sm:rounded-2xl lg:max-w-4xl">
        <div className="border-b border-border bg-gradient-to-r from-primary/15 via-primary/5 to-transparent px-5 pb-0 pt-4 pr-12">
          <DialogTitle className="font-serif text-xl font-bold lg:text-2xl">{done ? (done.edited ? "Saved" : "Your story is live") : isEdit ? "Edit your story" : "Share your story"}</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs lg:text-sm">{done ? "Share it, or go and see it." : isEdit ? "Change anything, check the preview, then save. The live story updates at once." : "First years to final years, anything about medical school. It goes live as soon as you publish."}</DialogDescription>
          {user && !done && (
            <div className="mt-3 flex gap-1" role="tablist" aria-label="Write or preview">
              {([["write", "Write", PenLine], ["preview", "Preview", Eye]] as const).map(([id, label, Icon]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2 text-sm font-bold transition-colors ${tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="h-4 w-4" /> {label}</button>
              ))}
            </div>
          )}
        </div>

        {!user ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="font-serif text-lg font-bold">Log in to publish</p>
            <p className="max-w-sm text-sm text-muted-foreground">Stories are written by signed-in students, so you can come back and edit yours. Your draft will be waiting.</p>
            <Link to={`/login?redirect=${encodeURIComponent("/stories?write=1")}`} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Log in or sign up</Link>
          </div>
        ) : done ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"><Check className="h-9 w-9" /></span>
            <div>
              <p className="font-serif text-2xl font-bold">{done.edited ? "Your changes are saved" : "Published. Well done."}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">“{done.title}” is on Stories. You can edit it any time from the story page.</p>
            </div>
            <div className="flex w-full max-w-sm flex-col gap-2">
              <Link to={done.path} onClick={onClose} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"><ExternalLink className="h-4 w-4" /> View my story</Link>
              <a href={whatsappLink(`I just shared my story on Ompath Study: “${done.title}”. Read it, and add yours 👇\n${done.url}`)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-bold text-[#073b1d]"><MessageCircle className="h-4 w-4" /> Share on WhatsApp</a>
              <button type="button" onClick={() => void copy(done.url)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-bold hover:border-primary">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Link copied" : "Copy link"}</button>
            </div>
          </div>
        ) : (
          <>
            <div className={tab === "preview" ? "min-h-0 flex-1 overflow-y-auto bg-muted/30 px-4 py-5" : "hidden"}>
              <article className="mx-auto max-w-2xl rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-8">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-primary">Preview: this is how it will look</p>
                <img src={cover || storyThumb(category)} alt="" className="mb-5 w-full rounded-xl border border-border" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">{category}</span>
                  {year === 7 ? <FinalistBadge className="h-5 w-5" label /> : year > 0 && <span className="rounded-full bg-foreground/5 px-2.5 py-0.5 text-[11px] font-semibold text-foreground/70">{`Year ${year}`}</span>}
                  {words > 0 && <span className="text-[11px] text-muted-foreground">{Math.max(1, Math.ceil(words / 200))} min read</span>}
                </div>
                <h2 className="mt-3 font-serif text-3xl font-bold leading-tight">{title.trim() || "Your title"}</h2>
                <p className="mt-2 text-sm italic text-muted-foreground">By {display} · {year === 7 ? "Finalist" : `Year ${year || "?"}`}</p>
                {previewHtml && chars > 0
                  ? <div className="story-prose mt-5 text-[17px] leading-8" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  : <p className="mt-5 text-sm text-muted-foreground">Nothing written yet. Switch to Write and tell your story.</p>}
              </article>
            </div>

            <div className={tab === "write" ? "min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6" : "hidden"}>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label htmlFor="story-title" className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">Title</label>
                  <button type="button" onClick={() => void ideasForTitle()} disabled={aiBusy !== "" || chars < 80} className="inline-flex items-center gap-1 text-xs font-bold text-primary disabled:opacity-50">{aiBusy === "titles" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Title ideas</button>
                </div>
                {titleIdeas.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{titleIdeas.map((t) => <button key={t} type="button" onClick={() => { setTitle(t); setTitleIdeas([]); }} className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold hover:border-primary">{t}</button>)}</div>}
                <input id="story-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder={yearGuide(year).placeholder} className="w-full rounded-xl border border-border bg-background px-3.5 py-3 font-serif text-xl font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 lg:text-2xl" />
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr,auto]">
                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">What is it about?</p>
                  <div className="flex flex-wrap gap-1.5">{[...new Set([category, ...yearGuide(year).categories])].map((c) => <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c} className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${category === c ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}>{c}</button>)}</div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Your year</p>
                  <div className="flex flex-wrap gap-1.5">{[1, 2, 3, 4, 5, 6, 7].map((y) => <button key={y} type="button" onClick={() => { setYear(y); if (!yearGuide(y).categories.includes(category)) setCategory("Experience"); }} aria-pressed={year === y} className={`h-9 min-w-[3rem] rounded-full border px-3 text-sm font-bold transition-colors ${year === y ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}>{y === 7 ? <span className="inline-flex items-center gap-1.5"><FinalistBadge className="h-5 w-5" />Finalist</span> : `Y${y}`}</button>)}</div>
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Cover picture <span className="font-medium normal-case tracking-normal">(optional, shown on the story and when shared)</span></p>
                {cover ? (
                  <div className="relative mb-4 overflow-hidden rounded-xl border border-border">
                    <img src={cover} alt="Your cover" className="max-h-64 w-full object-cover" />
                    <button type="button" onClick={() => setCover("")} className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-black/70 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-black/85"><X className="h-3.5 w-3.5" /> Remove</button>
                  </div>
                ) : (
                  <label className={`mb-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3.5 text-sm text-muted-foreground hover:border-primary hover:text-primary ${coverBusy ? "opacity-60" : ""}`}>
                    {coverBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                    <span><strong className="block text-foreground">{coverBusy ? "Uploading…" : "Add a cover picture"}</strong>Without one, your story gets a picture for its topic.</span>
                    <input type="file" accept="image/*" className="hidden" disabled={coverBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickCover(f); e.target.value = ""; }} />
                  </label>
                )}
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Your story</p>
                  <div className="flex items-center gap-2">
                    {undoHtml !== null && <button type="button" onClick={undoPolish} className="text-xs font-bold text-muted-foreground underline">Undo</button>}
                    <button type="button" onClick={() => void polishStory()} disabled={aiBusy !== "" || chars < 80} className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-xs font-bold text-primary disabled:opacity-50">{aiBusy === "story" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Polish with AI</button>
                  </div>
                </div>
                <StoryEditor html={initialHtml} resetKey={docKey} onChange={(h, t) => { setHtml(h); setPlain(t); }} />
                <p className={`mt-1 text-xs ${chars >= STORY_MIN_CHARACTERS ? "text-primary" : "text-muted-foreground"}`}>{words} words · {chars} characters{chars < STORY_MIN_CHARACTERS ? ` · at least ${STORY_MIN_CHARACTERS}` : " · good length"}{isEdit ? "" : " · draft saved on this device"}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr,auto] sm:items-end">
                <div>
                  <label htmlFor="story-name" className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">Name shown</label>
                  <input id="story-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={anonymous} placeholder="Your name" className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-50" />
                </div>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" /> Post anonymously</label>
              </div>

              <div>
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-primary to-emerald-500 ring-2 ring-border">{photo ? <img src={photo} alt="Your photo" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center font-serif text-xl font-bold text-primary-foreground">{(name.trim()[0] || "?").toUpperCase()}</span>}</div>
                  <div className="text-sm"><label className="cursor-pointer font-bold text-primary hover:underline">{photoBusy ? "Uploading…" : photo ? "Change photo" : "Add your photo"}<input type="file" accept="image/*" className="hidden" disabled={photoBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPhotoBusy(true); void uploadStoryImage(f).then(setPhoto).catch((er) => toast({ title: "Photo not added", description: (er as Error).message, variant: "destructive" })).finally(() => setPhotoBusy(false)); } e.target.value = ""; }} /></label>{photo && <button type="button" onClick={() => setPhoto("")} className="ml-3 text-muted-foreground hover:text-destructive">Remove</button>}<p className="text-xs text-muted-foreground">Optional. Shown with your note at the end of the story. Save it once in your account to reuse it.</p></div>
                </div>
                <label htmlFor="story-uni" className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">University <span className="font-medium normal-case tracking-normal">(optional)</span></label>
                <input id="story-uni" list="story-unis" value={uni} onChange={(e) => setUni(e.target.value.slice(0, 60))} placeholder="e.g. Mount Kenya University (MKU)" className="mb-4 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary" />
                <datalist id="story-unis">{UNIVERSITIES.map((u) => <option key={u} value={u} />)}</datalist>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label htmlFor="story-about" className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">About you <span className="font-medium normal-case tracking-normal">(optional, shown at the end of your story)</span></label>
                  <button type="button" onClick={() => void writeAbout()} disabled={aiBusy !== ""} className="inline-flex items-center gap-1 text-xs font-bold text-primary disabled:opacity-50">{aiBusy === "about" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Help me write it</button>
                </div>
                <textarea id="story-about" value={about} onChange={(e) => setAbout(e.target.value.slice(0, ABOUT_MAX))} rows={3} placeholder="Tell readers a little about yourself: your year, your school, what you love about medicine, what you would tell a junior." className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:border-primary" />
                <p className="mt-1 text-xs text-muted-foreground">{about.length}/{ABOUT_MAX}{user?.email_confirmed_at ? " · your story will carry a Verified tick" : ""}</p>
              </div>

              <div className="rounded-xl border border-border bg-muted/40">
                <button type="button" onClick={() => setShowRules((v) => !v)} aria-expanded={showRules} className="flex w-full items-center justify-between px-3.5 py-2.5 text-sm font-bold">Story guidelines <ChevronDown className={`h-4 w-4 transition-transform ${showRules ? "rotate-180" : ""}`} /></button>
                {showRules && <ul className="space-y-2 border-t border-border px-3.5 py-3">{STORY_CRITERIA.map((c) => <li key={c.title} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><strong>{c.title}.</strong> <span className="text-muted-foreground">{c.detail}</span></span></li>)}</ul>}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border bg-background px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">{problem || (isEdit ? "Ready to save." : "Ready. It goes live right away.")}</p>
              {tab === "write" && !problem && <button type="button" onClick={() => setTab("preview")} className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-border px-4 py-3 text-sm font-bold hover:border-primary sm:inline-flex"><Eye className="h-4 w-4" /> Preview</button>}
              <button type="button" onClick={() => void publish()} disabled={Boolean(problem) || busy} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {isEdit ? "Save changes" : "Publish"}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
