import StoryCoverArt from "@/components/StoryCoverArt";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildStoryPath } from "@/lib/seo";\nimport { authorFromContent, photoFromTags, uniFromTags } from "@/lib/storyAuthor";

interface Row { id: string; title: string; category: string; created_at: string; cover_image_url: string | null; meta_description: string | null; tags: string[] | null; content?: string | null }

function HomeStoryAuthor({ story }: { story: Row }) {
  const author = authorFromContent(story.content || "");
  const year = Number(story.tags?.find((tag) => /^year-[1-8]$/.test(tag))?.slice(5)) || 0;
  if (!author) return year > 0 ? <p className="mt-2 text-[11px] font-medium text-muted-foreground">{year === 7 ? "Finalist" : year === 8 ? "Another course" : `Year ${year}`}</p> : null;
  const photo = photoFromTags(story.tags);
  const uni = uniFromTags(story.tags);
  const initial = author.name.replace(/^an?\s+/i, "").trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="mt-3 flex min-w-0 items-center gap-2.5">
      <span className="relative h-8 w-8 shrink-0">
        {photo
          ? <img src={photo} alt="" loading="lazy" className="h-8 w-8 rounded-full object-cover ring-1 ring-border" />
          : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initial}</span>}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background text-rose-500"><span className="text-[9px] leading-none">♥</span></span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-foreground">{author.name}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{author.level}{uni ? ` · ${uni}` : ""}</span>
      </span>
    </div>
  );
}

/** The newest student stories, on the homepage, with a one-tap way to write one. */
export default function HomeStories() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let on = true;
    supabase.from("stories").select("id,title,slug,category,created_at,cover_image_url,meta_description,tags,content").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(3)
      .then(({ data }) => { if (on) setRows((data ?? []) as unknown as Row[]); }, () => { if (on) setRows([]); });
    return () => { on = false; };
  }, []);

  return (
    <section className="mx-auto max-w-6xl px-5 py-10 sm:py-14" aria-labelledby="home-stories">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="home-stories" className="font-serif text-xl font-bold text-foreground sm:text-2xl">Student stories</h2>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">Real experiences and advice from medical school, first year to final year</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/stories?write=1" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"><PenLine className="h-4 w-4" /> Share yours</Link>
          <Link to="/stories" className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover:border-primary hover:text-primary">All stories <ChevronRight className="h-4 w-4" /></Link>
        </div>
      </div>

      {rows === null ? (
        <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : rows.length === 0 ? (
        <Link to="/stories?write=1" className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center hover:border-primary/50">
          <BookOpen className="h-8 w-8 text-muted-foreground/40" />
          <strong className="font-serif text-lg">Be the first to share a story</strong>
          <span className="text-sm text-muted-foreground">What has medical school been like for you?</span>
        </Link>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {rows.map((s) => {
            const y = Number(s.tags?.find((t) => /^year-[1-6]$/.test(t))?.slice(5)) || 0;
            return (
              <Link key={s.id} to={buildStoryPath(s)} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-md">
                {s.cover_image_url
                  ? <img src={s.cover_image_url} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover object-center" />
                  : <StoryCoverArt title={s.title} className="aspect-[16/9] w-full" />}
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.category && s.category !== "Uncategorized" && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">{s.category}</span>}
                  </div>
                  <h3 className="mt-2 line-clamp-2 font-serif text-base font-bold leading-snug group-hover:text-primary">{s.title}</h3>
                  <HomeStoryAuthor story={s} />
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{s.meta_description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
