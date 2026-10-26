import { useEffect, useState } from "react";
import { BadgeCheck, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { authorFromContent, isVerifiedStory, photoFromTags, uniFromTags } from "@/lib/storyAuthor";
import { ownerOf } from "@/lib/storyExtras";

/** The author at the top of a story: photo, name, verified tick, level and university, and a link down to their card and other stories. */
export default function AuthorChip({ storyId, content, tags }: { storyId: string; content: string; tags?: string[] | null }) {
  const author = authorFromContent(content);
  const anonymous = !author || /^a medical student$/i.test(author.name);
  const owner = !anonymous ? ownerOf(tags) : "";
  const [more, setMore] = useState(0);
  useEffect(() => {
    if (!owner) { setMore(0); return; }
    let live = true;
    supabase.from("stories").select("id", { count: "exact", head: true }).contains("tags", [owner]).neq("id", storyId).eq("published", true).is("deleted_at", null)
      .then(({ count }) => { if (live) setMore(count ?? 0); }, () => undefined);
    return () => { live = false; };
  }, [owner, storyId]);
  if (!author) return null;
  const photo = photoFromTags(tags);
  const verified = isVerifiedStory(tags);
  const uni = uniFromTags(tags);
  const initial = (author.name.replace(/^an?\s+/i, "").trim()[0] || "?").toUpperCase();
  const first = author.name.split(" ")[0];
  const go = () => document.getElementById("about-author")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="mt-4 flex items-center gap-3">
      <button type="button" onClick={go} aria-label={`About ${author.name}`} className="relative shrink-0">
        {photo
          ? <img src={photo} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-background" />
          : <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-500 font-serif text-lg font-bold text-primary-foreground ring-2 ring-background">{initial}</span>}
        {verified && <BadgeCheck className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background text-sky-500" aria-label="Verified" />}
      </button>
      <div className="min-w-0 text-sm leading-tight">
        <p className="flex flex-wrap items-center gap-x-1.5 font-bold text-foreground">{author.name}{verified && <BadgeCheck className="h-4 w-4 text-sky-500" aria-label="Verified" />}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>{author.level}</span>
          {uni && <span className="inline-flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" /> {uni}</span>}
          {more > 0 && <button type="button" onClick={go} className="font-bold text-primary hover:underline">More by {first} ({more})</button>}
        </p>
      </div>
    </div>
  );
}
