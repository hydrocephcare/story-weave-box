import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookOpen, ChevronRight, Clock, Loader2, PenLine, Search, SlidersHorizontal, X } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { buildStoryPath, updateMetaTags, SITE_URL } from "@/lib/seo";
import StoryComposer, { STORY_CATEGORIES, type EditableStory } from "@/components/StoryComposer";
import { useOwnerTag } from "@/lib/storyOwner";
import { INVITE_TEXT, INVITE_URL, shareOut, isGeneratedThumb } from "@/lib/storyShare";
import { MessageCircle } from "lucide-react";
import { Pencil } from "lucide-react";
import FinalistBadge from "@/components/FinalistBadge";
import { uniFromTags } from "@/lib/storyAuthor";
import { readSaved } from "@/lib/storyExtras";
import { Bookmark } from "lucide-react";

interface Story {
  id: string;
  title: string;
  category: string;
  created_at: string;
  slug?: string | null;
  cover_image_url?: string | null;
  meta_description?: string | null;
  reading_time_minutes?: number | null;
  tags?: string[] | null;
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
const yearOf = (s: Story) => Number(s.tags?.find((t) => /^year-[1-8]$/.test(t))?.slice(5)) || 0;

/** A soft colour per category so the page is easy to scan. */
const TONES = ["from-teal-500/25 to-teal-500/5", "from-indigo-500/25 to-indigo-500/5", "from-rose-500/25 to-rose-500/5", "from-amber-500/25 to-amber-500/5", "from-emerald-500/25 to-emerald-500/5", "from-purple-500/25 to-purple-500/5"];
const tone = (s: string) => TONES[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length];

function Meta({ story }: { story: Story }) {
  const y = yearOf(story);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {story.category && story.category !== "Uncategorized" && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">{story.category}</span>}
      {y === 7 ? <FinalistBadge className="h-5 w-5" label /> : y > 0 && <span className="rounded-full bg-foreground/5 px-2.5 py-0.5 text-[11px] font-semibold text-foreground/70">{y === 8 ? "Another course" : `Year ${y}`}</span>}
      <span className="text-[11px] text-muted-foreground">{formatDate(story.created_at)}</span>
    </div>
  );
}

function Cover({ story, className }: { story: Story; className: string }) {
  return story.cover_image_url && !isGeneratedThumb(story.cover_image_url)
    ? <img src={story.cover_image_url} alt="" loading="lazy" className={`${className} object-cover`} />
    : <div className={`${className} flex items-center justify-center bg-gradient-to-br ${tone(story.category || story.title)}`}><span className="select-none font-serif text-8xl leading-none text-foreground/15" aria-hidden>“</span></div>;
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
  const [uni, setUni] = useState("");
  const [sortBy, setSortBy] = useState<"new" | "short" | "long">("new");
  const [onlySaved, setOnlySaved] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  useEffect(() => { setSavedIds(readSaved()); }, [onlySaved]);
  const [writing, setWriting] = useState(params.get("write") === "1");
  const [editing, setEditing] = useState<EditableStory | null>(null);
  const [mine, setMine] = useState<EditableStory[]>([]);
  const ownerTag = useOwnerTag();

  useEffect(() => {
    updateMetaTags({ title: "Student Stories | Ompath Study", description: "Experiences, advice and reflections from MKU and Kenyan medical students, first year to final year.", url: `${SITE_URL}/stories`, type: "website" });
  }, []);

  const load = useCallback(() => {
    supabase.from("stories")
      .select("id,title,slug,category,created_at,cover_image_url,meta_description,reading_time_minutes,tags")
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
  const [mineStats, setMineStats] = useState<Record<string, { views: number; reactions: number; comments: number }>>({});
  useEffect(() => {
    const ids = mine.map((m) => m.id); if (!ids.length) { setMineStats({}); return; }
    const db = supabase as any;
    void Promise.all([db.from("story_stats").select("story_id,views").in("story_id", ids), db.from("story_reactions").select("story_id").in("story_id", ids).limit(5000), db.from("story_comments").select("story_id").in("story_id", ids).is("deleted_at", null).limit(2000)]).then(([v, r, c]) => {
      const o: Record<string, { views: number; reactions: number; comments: number }> = {}; for (const id of ids) o[id] = { views: 0, reactions: 0, comments: 0 };
      for (const x of (v.data ?? []) as { story_id: string; views: number }[]) if (o[x.story_id]) o[x.story_id].views = Number(x.views);
      for (const x of (r.data ?? []) as { story_id: string }[]) if (o[x.story_id]) o[x.story_id].reactions++;
      for (const x of (c.data ?? []) as { story_id: string }[]) if (o[x.story_id]) o[x.story_id].comments++;
      setMineStats(o);
    }).catch(() => undefined);
  }, [mine]);
  const refresh = () => { load(); loadMine(); };

  const openWriter = () => setWriting(true);
  const closeWriter = () => { setWriting(false); if (params.get("write")) { params.delete("write"); params.delete("year"); setParams(params, { replace: true }); } };

  const categories = useMemo(() => {
    const seen = new Set(stories.map((s) => s.category).filter((c) => c && c !== "Uncategorized"));
    return ["All", ...STORY_CATEGORIES.filter((c) => seen.has(c)), ...[...seen].filter((c) => !STORY_CATEGORIES.includes(c)).sort()];
  }, [stories]);

  const filteredBase = useMemo(() => {
    const term = search.trim().toLowerCase();
    return stories.filter((s) => (category === "All" || s.category === category) && (!year || yearOf(s) === year) && (!term || s.title.toLowerCase().includes(term) || (s.meta_description ?? "").toLowerCase().includes(term) || s.category.toLowerCase().includes(term)));
  }, [stories, search, category, year]);

  const unis = useMemo(() => [...new Set(stories.map((s) => uniFromTags(s.tags)).filter(Boolean))].sort(), [stories]);
  const filtered = useMemo(() => {
    let list = filteredBase.filter((s) => (!uni || uniFromTags(s.tags) === uni) && (!onlySaved || savedIds.includes(s.id)));
    if (sortBy !== "new") list = [...list].sort((a, b) => ((a.reading_time_minutes ?? 99) - (b.reading_time_minutes ?? 99)) * (sortBy === "short" ? 1 : -1));
    return list;
  }, [filteredBase, uni, onlySaved, savedIds, sortBy]);

  const browsing = Boolean(search.trim()) || category !== "All" || year > 0 || Boolean(uni) || onlySaved || sortBy !== "new";
  const [first, ...rest] = filtered;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      {/* Heading: short, so the stories are close to the top */}
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold sm:text-4xl">Student Stories</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">Real experiences from medical school and beyond. Read, then share yours. Your name can stay private.</p>
        </div>
        <button type="button" onClick={openWriter} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-transform active:scale-95"><PenLine className="h-4 w-4" /> Share your story</button>
      </section>

      {mine.length > 0 && (
        <section className="mt-5 rounded-2xl border border-primary/25 bg-primary/5 p-4" aria-label="Your stories">
          <h2 className="font-serif text-lg font-bold">Your stories</h2>
          <ul className="mt-2 divide-y divide-border/70">
            {mine.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <Link to={buildStoryPath(m)} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-primary">{m.title}</Link>
                {mineStats[m.id] && <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">{mineStats[m.id].views} reads · {mineStats[m.id].comments} comments</span>}
                <button type="button" onClick={() => setEditing(m)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold hover:border-primary hover:text-primary"><Pencil className="h-3.5 w-3.5" /> Edit</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Search, with the filters one tap away */}
      <section className="mt-5" aria-label="Find a story">
        <div className="flex items-stretch gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-xl border border-border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <Search className="ml-3.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search stories…" aria-label="Search stories" className="w-full bg-transparent px-3 py-3 text-base placeholder:text-muted-foreground focus:outline-none sm:text-sm" />
          {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="mr-3 rounded-full p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
          <button type="button" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors ${showFilters || browsing ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:border-primary/50"}`}><SlidersHorizontal className="h-4 w-4" /> Filters</button>
        </div>
        {showFilters && (
          <div className="mt-3 space-y-3 rounded-2xl border border-border bg-card/60 p-3 sm:p-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Topic">
            {categories.map((c) => <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${category === c ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50"}`}>{c}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Year">
            <span className="mr-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Year</span>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((y) => <button key={y} type="button" onClick={() => setYear(y)} aria-pressed={year === y} className={`h-9 min-w-[2.75rem] rounded-full border px-3 text-xs font-bold transition-colors ${year === y ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40"}`}>{y === 0 ? "All" : y === 7 ? <span className="inline-flex items-center gap-1"><FinalistBadge className="h-4 w-4" />Finalist</span> : y === 8 ? "Other" : `Y${y}`}</button>)}
          </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {unis.length > 0 && (
            <select value={uni} onChange={(e) => setUni(e.target.value)} aria-label="University" className="h-9 rounded-full border border-border bg-background px-3 text-xs font-bold">
              <option value="">All universities</option>
              {unis.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          )}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "new" | "short" | "long")} aria-label="Sort" className="h-9 rounded-full border border-border bg-background px-3 text-xs font-bold">
            <option value="new">Newest first</option>
            <option value="short">Short reads first</option>
            <option value="long">Long reads first</option>
          </select>
          <button type="button" onClick={() => setOnlySaved((v) => !v)} aria-pressed={onlySaved} className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold transition-colors ${onlySaved ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}><Bookmark className="h-3.5 w-3.5" /> Saved</button>
        </div>
          </div>
        )}
      </section>

      {/* Stories */}
      <section className="mt-5">
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

      {/* Who are you? Each choice opens a page and a link made for that group, so anyone can share it. */}
      <section className="mt-10 rounded-2xl border border-border bg-card/60 p-4" aria-label="Share your story">
        <p className="font-serif text-lg font-bold">Are you a finalist? Year 1? Studying something else?</p>
        <p className="mt-0.5 text-sm text-muted-foreground">Anyone can share a story. Tap yours: it opens the page and the link to share with your group.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Link to="/finalists" className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500/10 px-3.5 py-1.5 text-sm font-bold text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"><FinalistBadge className="h-5 w-5" /> Finalist</Link>
          {[1, 2, 3, 4, 5, 6].map((y) => <Link key={y} to={`/share-your-story/year-${y}`} className="rounded-full border border-border bg-background px-3.5 py-1.5 text-sm font-bold hover:border-primary hover:text-primary">Year {y}</Link>)}
          <Link to="/share-your-story/other" className="rounded-full border border-border bg-background px-3.5 py-1.5 text-sm font-bold hover:border-primary hover:text-primary">Another course</Link>
        </div>
      </section>

      <StoryComposer startYear={Number(params.get("year")) || 0} open={writing || Boolean(editing)} editing={editing} onClose={() => { setEditing(null); closeWriter(); }} onPublished={refresh} />
    </div>
  );
}
