import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Layers } from "lucide-react";
import { getFlashcardSetBySlugOrId, getCategoryDisplayName, buildFlashcardPath, type FlashcardSet } from "@/lib/store";
import { Button } from "@/components/ui/button";
import FlashcardDeck from "@/components/FlashcardDeck";
import ShareButtons from "@/components/ShareButtons";
import StudyControls from "@/components/StudyControls";
import HelpfulVote from "@/components/HelpfulVote";
import { KeywordLinkProvider } from "@/lib/keyword-link";
import { useHashFlash } from "@/lib/deep-link";
import { markFlashcardVisited } from "@/lib/progress-store";
import { SITE_URL, stripRichText, updateMetaTags } from "@/lib/seo";
import { useTopicThumbnail } from "@/lib/topicThumbnail";


export default function FlashcardStudy() {
  const { id: param } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  useHashFlash();
  const [loading, setLoading] = useState(true);
  const [set, setSet] = useState<FlashcardSet | null>(null);

  useEffect(() => {
    if (!param) return;
    getFlashcardSetBySlugOrId(param)
      .then((s) => {
        setSet(s);
        if (s) {
          markFlashcardVisited(s.id);
          const canonical = buildFlashcardPath(s);
          if (location.pathname !== canonical) navigate(canonical, { replace: true });
          const metaTitle = s.meta_title?.trim() || s.title;
          const metaDesc = s.meta_description?.trim()
            || `Study ${s.title} flashcards. Interactive medical study cards for health students.`;
          updateMetaTags({
            title: `${metaTitle} – Flashcards`,
            description: metaDesc,
            image: s.og_image_url || `${SITE_URL}/og-default.png`,
            url: `${SITE_URL}${canonical}`,
            type: "article",
          });
        }
      })
      .finally(() => setLoading(false));
    // Deliberately keyed on `param` alone: `location.pathname` is read only to
    // decide whether a canonical-URL redirect is needed, and including it (or
    // `navigate`) here would re-run this fetch on every redirect it triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!set) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="mb-4 font-serif text-3xl font-bold text-foreground">Set not found</h1>
        <Button asChild variant="outline">
          <Link to="/flashcards">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Flashcards
          </Link>
        </Button>
      </div>
    );
  }

  return <FlashcardStudyInner set={set} />;
}

function FlashcardStudyInner({ set }: { set: FlashcardSet }) {
  const unitName = getCategoryDisplayName(set.category);
  const shareUrl = `${SITE_URL}${buildFlashcardPath(set)}`;
  const date = new Date(set.updated_at || set.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const shortTitle = set.title.replace(/\s*[:—–-]?\s*Flashcards?$/i, "");
  const cards = useMemo(() => set.cards.map((c, idx) => ({ question: c.question, answer: c.answer, setId: set.id, idx })), [set]);

  return (
    <div className="mx-auto max-w-xl px-3 pb-16 pt-1 sm:px-6">
      {/* the deck is the first thing on the page: nothing to scroll past */}
      <KeywordLinkProvider currentPath={buildFlashcardPath(set)} currentTitle={set.title}>
        <FlashcardDeck cards={cards} title={set.title} category={set.category} mcqSource={(set as unknown as { source_reference?: string | null }).source_reference ?? null} />
      </KeywordLinkProvider>

      <section className="mt-10 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">{set.cards.length} cards{unitName && unitName !== "Uncategorized" ? ` · ${unitName}` : ""} · updated {date}</p>
        <div className="mt-4"><StudyControls resourceType="flashcard" resourceId={set.id} title={shortTitle} /></div>
        <ShareButtons url={shareUrl} title={shortTitle} description={`Flashcards: ${shortTitle}`} variant="full" className="mt-5" />
        <div className="mt-6"><HelpfulVote resourceType="flashcard" resourceId={set.id} /></div>
      </section>
    </div>
  );
}

function ReviewedBadge({ reviewer, date, onDark, count }: { reviewer: string; date: string; onDark?: boolean; count: number }) {
  const text = onDark ? "text-white/90" : "text-foreground";
  const sub = onDark ? "text-white/70" : "text-muted-foreground";
  return (
    <div className={`mt-4 flex items-start gap-2.5 text-sm ${text}`}>
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor"><path d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z"/></svg>
      </span>
      <div className="leading-tight">
        <p className="font-semibold">Last updated {date}</p>
        <p className={`text-xs ${sub}`}>{count} cards</p>
      </div>
    </div>
  );
}
