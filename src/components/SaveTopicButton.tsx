import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { isTopicSaved, toggleTopicSaved } from "@/lib/savedPages";

/** The "Save" button on a topic page: one tap keeps it on the Saved page of this device. */
export default function SaveTopicButton({ slug, name }: { slug: string; name: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(() => isTopicSaved(user?.id, slug));
  return (
    <button
      type="button"
      aria-pressed={saved}
      onClick={() => {
        const now = toggleTopicSaved(user?.id, slug, name);
        setSaved(now);
        if (now) toast.success(`Saved “${name}”`, { action: { label: "View saved", onClick: () => navigate("/saved") } });
        else toast(`Removed “${name}” from saved`);
      }}
      className="inline-flex h-12 items-center gap-2 rounded-full border border-border/70 bg-background/85 px-5 text-[15px] font-bold transition hover:border-primary/60 hover:bg-background active:scale-[.97]"
    >
      {saved ? <BookmarkCheck className="h-4 w-4 text-primary" aria-hidden /> : <Bookmark className="h-4 w-4" aria-hidden />}
      {saved ? "Saved" : "Save"}
    </button>
  );
}
