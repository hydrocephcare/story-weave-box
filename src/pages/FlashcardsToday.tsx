import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { starredKeys } from "@/lib/deckStats";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import FlashcardDeck, { type DeckCard } from "@/components/FlashcardDeck";
import { KeywordLinkProvider } from "@/lib/keyword-link";
import { cardKey, isDue, loadStates } from "@/lib/deckSrs";
import { loadMyDecks } from "@/lib/myDecks";
import { updateMetaTags } from "@/lib/seo";

const NEW_PER_DAY = 10, MAX_DUE = 40;

/** Today's flashcards: the cards that are due for you (across every deck), plus a few new ones from the notes you have read. */
export default function FlashcardsToday() {
  const { user, loading } = useAuth();
  const [cards, setCards] = useState<DeckCard[] | null>(null);
  const starred = useSearchParams()[0].get("starred") === "1";
  useEffect(() => { updateMetaTags({ title: "Today's flashcards", description: "The flashcards due for you today, scheduled so that you remember them." }); }, []);
  useEffect(() => {
    if (loading) return;
    let on = true;
    void (async () => {
      const states = await loadStates(user?.id ?? null);
      const stars = starredKeys();
      const dueKeys = starred ? [...stars].slice(0, 60) : Object.entries(states).filter(([, s]) => isDue(s)).sort((a, b) => a[1].due - b[1].due).slice(0, MAX_DUE).map(([k]) => k);
      const mine = starred ? [] : await loadMyDecks(user?.id ?? null, 12);
      const setIds = [...new Set([...dueKeys.map((k) => k.split(":")[0]), ...mine.map((d) => d.id)])].slice(0, 24);
      if (!setIds.length) { if (on) setCards([]); return; }
      const { data } = await (supabase as any).from("flashcard_sets").select("id,title,cards").in("id", setIds);
      const byId = new Map<string, { question: string; answer: string }[]>((data || []).map((d: { id: string; cards: { question: string; answer: string }[] }) => [d.id, Array.isArray(d.cards) ? d.cards : []]));
      const out: DeckCard[] = [];
      for (const k of dueKeys) { const [sid, i] = k.split(":"); const c = byId.get(sid)?.[Number(i)]; if (c) out.push({ ...c, setId: sid, idx: Number(i) }); }
      let fresh = 0;
      for (const d of mine) {
        for (const [i, c] of (byId.get(d.id) || []).entries()) {
          if (fresh >= NEW_PER_DAY) break;
          if (!states[cardKey(d.id, i)]) { out.push({ ...c, setId: d.id, idx: i }); fresh += 1; }
        }
      }
      if (on) setCards(out);
    })();
    return () => { on = false; };
  }, [user?.id, loading, starred]);

  if (cards === null) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" /></div>;
  if (cards.length === 0) {
    return (
      <div className="mx-auto max-w-md px-5 py-20 text-center">
        <h1 className="font-serif text-3xl font-bold">Nothing due today</h1>
        <p className="mt-3 text-[15px] text-muted-foreground">Flashcards appear here when you have studied a deck and the cards come due, and a few new ones are added from every note you finish reading.</p>
        <Link to="/flashcards" className="mt-6 inline-block rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground">Choose a deck</Link>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-xl px-3 pb-16 pt-1 sm:px-6">
      <KeywordLinkProvider currentPath="/flashcards/today" currentTitle="Today's flashcards">
        <FlashcardDeck cards={cards} title={starred ? "Starred cards" : "Today's flashcards"} category="" mode="today" />
      </KeywordLinkProvider>
    </div>
  );
}
