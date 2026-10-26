import { Link } from "react-router-dom";
import { BadgeCheck, PenLine } from "lucide-react";
import FinalistBadge from "@/components/FinalistBadge";
import { aboutFromTags, authorFromContent, isVerifiedStory } from "@/lib/storyAuthor";

/** "About the author" at the end of a story: name, level, a verified tick and the writer's own words. */
export default function AuthorCard({ content, tags }: { content: string; tags?: string[] | null }) {
  const author = authorFromContent(content);
  if (!author) return null;
  const about = aboutFromTags(tags);
  const verified = isVerifiedStory(tags);
  const finalist = /finalist/i.test(author.level);
  const initial = (author.name.replace(/^an?\s+/i, "").trim()[0] || "?").toUpperCase();
  return (
    <aside aria-label="About the author" className="not-prose mt-12 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/[0.07] via-card to-amber-500/[0.06] p-5 shadow-sm sm:p-7">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary">About the author</p>
      <div className="mt-4 flex items-start gap-4">
        <div className="relative shrink-0">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-500 font-serif text-3xl font-bold text-primary-foreground shadow-md ring-4 ring-background">{initial}</div>
          {verified && <BadgeCheck className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-background text-sky-500" aria-label="Verified" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="font-serif text-xl font-bold leading-tight text-foreground">{author.name}</h2>
            {verified && <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-bold text-sky-600 dark:text-sky-400"><BadgeCheck className="h-3.5 w-3.5" /> Verified</span>}
          </div>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            {finalist ? <FinalistBadge className="h-5 w-5" label /> : author.level}
          </p>
        </div>
      </div>
      {about
        ? <p className="mt-4 border-l-4 border-primary/40 pl-4 font-serif text-[1.02rem] italic leading-relaxed text-foreground/85">{about}</p>
        : <p className="mt-4 text-sm text-muted-foreground">This writer has not added a note about themselves yet.</p>}
      <Link to="/share-your-story" className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"><PenLine className="h-4 w-4" /> Share your own story</Link>
    </aside>
  );
}
