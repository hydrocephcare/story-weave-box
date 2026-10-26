import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, GraduationCap, HeartHandshake, Lightbulb, Linkedin, Instagram, Globe, PenLine } from "lucide-react";
import FinalistBadge from "@/components/FinalistBadge";
import { supabase } from "@/integrations/supabase/client";
import { buildStoryPath } from "@/lib/seo";
import { aboutFromTags, authorFromContent, isVerifiedStory, photoFromTags, uniFromTags } from "@/lib/storyAuthor";
import { extraFromTags, ownerOf } from "@/lib/storyExtras";

type Other = { id: string; title: string };

/** "About the author" at the end of a story: photo, name, level, class, university, interests, a mentor badge,
 *  a tip for juniors, links, the writer's own words and their other stories. */
export default function AuthorCard({ storyId, content, tags }: { storyId?: string; content: string; tags?: string[] | null }) {
  const author = authorFromContent(content);
  const owner = author && !/^a medical student$/i.test(author.name) ? ownerOf(tags) : ""; // an anonymous writer is never linked to their other stories
  const [others, setOthers] = useState<Other[]>([]);
  useEffect(() => {
    if (!owner || !storyId) return;
    let live = true;
    supabase.from("stories").select("id,title").contains("tags", [owner]).neq("id", storyId).eq("published", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(4)
      .then(({ data }) => { if (live) setOthers((data ?? []) as Other[]); }, () => undefined);
    return () => { live = false; };
  }, [owner, storyId]);
  if (!author) return null;
  const about = aboutFromTags(tags);
  const verified = isVerifiedStory(tags);
  const uni = uniFromTags(tags);
  const photo = photoFromTags(tags);
  const x = extraFromTags(tags);
  const finalist = /finalist/i.test(author.level);
  const initial = (author.name.replace(/^an?\s+/i, "").trim()[0] || "?").toUpperCase();
  const links = [
    x.li && { href: x.li, label: "LinkedIn", icon: <Linkedin className="h-4 w-4" /> },
    x.ig && { href: x.ig, label: "Instagram", icon: <Instagram className="h-4 w-4" /> },
    x.x && { href: x.x, label: "X", icon: <span className="text-[13px] font-black leading-none">X</span> },
    x.web && { href: x.web, label: "Website", icon: <Globe className="h-4 w-4" /> },
  ].filter(Boolean) as { href: string; label: string; icon: JSX.Element }[];

  return (
    <aside id="about-author" aria-label="About the author" className="not-prose mt-12 scroll-mt-20 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/[0.07] via-card to-amber-500/[0.06] p-5 shadow-sm sm:p-7">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary">About the author</p>
      <div className="mt-4 flex items-start gap-4">
        <div className="relative shrink-0">
          {photo
            ? <img src={photo} alt={author.name} loading="lazy" className="h-16 w-16 rounded-full object-cover shadow-md ring-4 ring-background sm:h-20 sm:w-20" />
            : <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-500 font-serif text-3xl font-bold text-primary-foreground shadow-md ring-4 ring-background sm:h-20 sm:w-20">{initial}</div>}
          {verified && <BadgeCheck className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-background text-sky-500" aria-label="Verified" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="font-serif text-xl font-bold leading-tight text-foreground">{author.name}</h2>
            {verified && <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-bold text-sky-600 dark:text-sky-400"><BadgeCheck className="h-3.5 w-3.5" /> Verified</span>}
            {x.mentor && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400"><HeartHandshake className="h-3.5 w-3.5" /> Mentor</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-muted-foreground">
            {finalist ? <FinalistBadge className="h-5 w-5" label /> : <span>{author.level}</span>}
            {x.cls && <span>Class of {x.cls}</span>}
            {uni && <span className="inline-flex items-center gap-1 font-medium text-foreground/75"><GraduationCap className="h-4 w-4 text-primary" /> {uni}</span>}
          </div>
          {x.ints && x.ints.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{x.ints.map((i) => <span key={i} className="rounded-full border border-primary/25 bg-primary/5 px-2.5 py-0.5 text-[11px] font-semibold text-primary">{i}</span>)}</div>}
        </div>
      </div>

      {about
        ? <p className="mt-4 border-l-4 border-primary/40 pl-4 font-serif text-[1.02rem] italic leading-relaxed text-foreground/85">{about}</p>
        : <p className="mt-4 text-sm text-muted-foreground">This writer has not added a note about themselves yet.</p>}

      {x.tip && (
        <div className="mt-4 flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-3.5">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
          <p className="text-sm leading-relaxed text-foreground/90"><strong className="mr-1">Tip for juniors:</strong>{x.tip}</p>
        </div>
      )}

      {links.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {links.map((l) => <a key={l.label} href={l.href} target="_blank" rel="nofollow noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground/80 hover:border-primary hover:text-primary">{l.icon} {l.label}</a>)}
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">More from {author.name.split(" ")[0]}</p>
          <ul className="mt-2 space-y-1.5">{others.map((o) => <li key={o.id}><Link to={buildStoryPath(o)} className="text-sm font-semibold text-primary hover:underline">{o.title}</Link></li>)}</ul>
        </div>
      )}

      <Link to="/share-your-story" className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"><PenLine className="h-4 w-4" /> Share your own story</Link>
    </aside>
  );
}
