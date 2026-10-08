import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookOpen, ChevronRight, Clock, Loader2, PenLine, Search, X } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { buildStoryPath, updateMetaTags, SITE_URL } from "@/lib/seo";
import StoryComposer, { STORY_CATEGORIES, type EditableStory } from "@/components/StoryComposer";
import { useOwnerTag } from "@/lib/storyOwner";
import { INVITE_TEXT, INVITE_URL, shareOut } from "@/lib/storyShare";
import { MessageCircle } from "lucide-react";
import { Pencil } from "lucide-react";

interface Story {
  id: string;
  title: string;
  category: string;
  created_at: string;
  cover_image_url?: string | null;
  meta_description?: string | null;
  reading_time_minutes?: number | null;
  tags?: string[] | null;
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
const yearOf = (s: Story) => Number(s.tags?.find((t) => /^year-[1-6]$/.test(t))?.slice(5)) || 0;

/** A soft colour per category so the page is easy to scan. */
const TONES = ["from-teal-500/25 to-teal-500/5", "from-indigo-500/25 to-indigo-500/5", "from-rose-500/25 to-rose-500/5", "from-amber-500/25 to-amber-500/5", "from-emerald-500/25 to-emerald-500/5", "from-purple-500/25 to-purple-500/5"];
const tone = (s: string) => TONES[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length];

function Meta({ story }: { story: Story }) {
  const y = yearOf(story);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {story.category && story.category !== "Uncategorized" && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">{story.category}</span>}
      {y > 0 && <span className="rounded-full bg-foreground/5 px-2.5 py-0.5 text-[11px] font-semibold text-foreground/70">Year {y}</span>}
      <span className="text-[11px] text-muted-foreground">{formatDate(story.created_at)}</span>
    </div>
  );
}

function Cover({ story, className }: { story: Story; className: string }) {
  return story.cover_image_url
    ? <img src={story.cover_image_url} alt="" loading="lazy" className={`${className} object-cover`} />
    : <div className={`${className} flex items-center justify-center bg-gradient-to-br ${tone(story.category || story.title)}`}><BookOpen className="h-10 w-10 text-foreground/25" /></div>;
}

function FeaturedCard({ story }: { story: Story }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Link to={buildStoryPath(story)} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-lg sm:flex-row">
        <div className="relative shrink-0 overflow-hidden sm:w-80">
          <Cover story={story} className="h-48 w-full transition-transform duration-700 group-hover:scale-105 sm:h-full" />
          <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow">Latest</span>
        </div>
        <div className="flex flex-1 flex-col justify-between p-5 sm:p-6">
          <div>
            <Meta story={story} />
            <h2 className="mt-3 font-serif text-2xl font-bold leading-snug transition-colors group-hover:text-primary sm:text-3xl">{story.title}</h2>
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{story.meta_description}</p>
          </div>
          <span className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-primary">Read story <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
        </div>
      </Link>
    </motion.div>
  );
}

function StoryCard({ story, index }: { story: Story; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04 }} whileHover={{ y: -3 }}>
      <Link to={buildStoryPath(story)} className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-md">
        <Cover story={story} className="h-40 w-full transition-transform duration-500 group-hover:scale-[1.03]" />
        <div className="flex flex-1 flex-col p-4">
          <Meta story={story} />
          <h3 className="mb-2 mt-2.5 line-clamp-2 font-serif text-base font-bold leading-snug transition-colors group-hover:text-primary">{story.title}</h3>
          <p className="line-clamp-3 flex-1 text-xs leading-relaxed text-muted-foreground">{story.meta_description}</p>
          <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" /> {story.reading_time_minutes ? `${story.reading_time_minutes} min read` : "Student story"}</p>
        </div>
      </Link>
    </motion.div>
  );
}

export default function Stories() {
  const [params, setParams] = useSearchParams();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [year, setYear] = useState(0);
  const [writing, setWriting] = useState(params.get("write") === "1");
  const [editing, setEditing] = useState<EditableStory | null>(null);
  const [mine, setMine] = useState<EditableStory[]>([]);
  const ownerTag = useOwnerTag();

  useEffect(() => {
    updateMetaTags({ title: "Student Stories | Ompath Study", description: "Experiences, advice and reflections from MKU and Kenyan medical students, first year to final year.", url: `${SITE_URL}/stories`, type: "website" });
  }, []);

  const load = useCallback(() => {
    supabase.from("stories")
      .select("id,title,category,created_at,cover_image_url,meta_description,reading_time_minutes,tags")
      .eq("published", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(300)
      .then(({ data }) => { setStories((data ?? []) as unknown as Story[]); setLoading(false); });
  }, []);
  useEffect(load, [load]);

  const loadMine = useCallback(() => {
    if (!ownerTag) { setMine([]); return; }
    supabase.from("stories").select("id,title,content,category,tags,cover_image_url").contains("tags", [ownerTag]).is("deleted_at", null).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setMine((data ?? []) as unknown as EditableStory[]), () => undefined);
  }, [ownerTag]);
  useEffect(loadMine, [loadMine]);
  const refresh = () => { load(); loadMine(); };

  const openWriter = () => setWriting(true);
  const closeWriter = () => { setWriting(false); if (params.get("write")) { params.delete("write"); setParams(params, { replace: true }); } };

  const categories = useMemo(() => {
    const seen = new Set(stories.map((s) => s.category).filter((c) => c && c !== "Uncategorized"));
    return ["All", ...STORY_CATEGORIES.filter((c) => seen.has(c)), ...[...seen].filter((c) => !STORY_CATEGORIES.includes(c)).sort()];
  }, [stories]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return stories.filter((s) => (category === "All" || s.category === category) && (!year || yearOf(s) === year) && (!term || s.title.toLowerCase().includes(term) || (s.meta_description ?? "").toLowerCase().includes(term) || s.category.toLowerCase().includes(term)));
  }, [stories, search, category, year]);

  const browsing = Boolean(search.trim()) || category !== "All" || year > 0;
  const [first, ...rest] = filtered;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f766e] via-[#0e5a62] to-[#0b2545] px-5 py-8 text-white shadow-lg sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-[#f2b632]/25 blur-2xl" aria-hidden="true" />
        <p className="relative text-xs font-bold uppercase tracking-[0.2em] text-white/80">Ompath Study</p>
        <h1 className="relative mt-1 font-serif text-4xl font-bold sm:text-5xl">Student Stories</h1>
        <p className="relative mt-2 max-w-xl text-sm text-white/90 sm:text-base">The late nights, the wards, the wins and the wobbles. Read what medical school is really like, then share your own. Every year has something worth telling, and your name can stay private.</p>
        <div className="relative mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={openWriter} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#0b2545] shadow transition-transform hover:scale-[1.02] active:scale-95"><PenLine className="h-4 w-4" /> Share your story</button>
          <button type="button" onClick={() => void shareOut(INVITE_TEXT.split("\n")[0], INVITE_URL, "Every medical student has a story. Share yours.")} className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-4 py-3 text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/20"><MessageCircle className="h-4 w-4" /> Invite classmates</button>
          {stories.length > 0 && <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur">{stories.length} stor{stories.length === 1 ? "y" : "ies"} shared</span>}
        </div>
      </section>

      {mine.length > 0 && (
        <section className="mt-6 rounded-2xl border border-primary/25 bg-primary/5 p-4" aria-label="Your stories">
          <h2 className="font-serif text-lg font-bold">Your stories</h2>
          <ul className="mt-2 divide-y divide-border/70">
            {mine.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <Link to={buildStoryPath(m)} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-primary">{m.title}</Link>
                <button type="button" onClick={() => setEditing(m)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold hover:border-primary hover:text-primary"><Pencil className="h-3.5 w-3.5" /> Edit</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Filters */}
      <section className="mt-6 space-y-3" aria-label="Find a story">
        <div className="flex items-center rounded-xl border border-border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <Search className="ml-3.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search stories…" aria-label="Search stories" className="w-full bg-transparent px-3 py-3 text-base placeholder:text-muted-foreground focus:outline-none sm:text-sm" />
          {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="mr-3 rounded-full p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Topic">
          {categories.map((c) => <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${category === c ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50"}`}>{c}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Year">
          <span className="mr-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Year</span>
          {[0, 1, 2, 3, 4, 5, 6].map((y) => <button key={y} type="button" onClick={() => setYear(y)} aria-pressed={year === y} className={`h-9 min-w-[2.75rem] rounded-full border px-3 text-xs font-bold transition-colors ${year === y ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40"}`}>{y === 0 ? "All" : `Y${y}`}</button>)}
        </div>
      </section>

      {/* Stories */}
      <section className="mt-6">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="font-serif text-lg font-bold">{stories.length === 0 ? "No stories yet" : "Nothing matches that"}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{stories.length === 0 ? "Be the first to share what medical school has been like for you." : "Try another topic or year, or write the story you wish you could find."}</p>
            <button type="button" onClick={openWriter} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"><PenLine className="h-4 w-4" /> Share your story</button>
          </div>
        ) : (
          <div className="space-y-6">
            {browsing && <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{filtered.length} stor{filtered.length === 1 ? "y" : "ies"}</p>}
            {!browsing && first && <FeaturedCard story={first} />}
            {!browsing && rest.length > 0 && <div className="flex items-center gap-3"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">More stories</p><div className="h-px flex-1 bg-border" /></div>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(browsing ? filtered : rest).map((s, i) => <StoryCard key={s.id} story={s} index={i} />)}
            </div>
          </div>
        )}
      </section>

      <StoryComposer open={writing || Boolean(editing)} editing={editing} onClose={() => { setEditing(null); closeWriter(); }} onPublished={refresh} />
    </div>
  );
}
