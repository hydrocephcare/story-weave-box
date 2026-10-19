// Flashcard decks that follow what you read: when you properly finish a note, the deck for it is made (if it is not there yet) and shows up
// for you on the home page, on the Flashcards page and in the bell.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildFlashcardPath } from "@/lib/store";
import { loadReadIds } from "@/lib/readingTrail";
import { isDue, loadStates } from "@/lib/deckSrs";

const db = supabase as unknown as { from: (t: string) => any };

export interface MyDeck { id: string; title: string; slug: string | null; category: string; created_at: string; path: string; note: string }

/** Asks for the deck of one note (a signed-in reader who just finished it); resolves with the deck's page when it exists. */
export async function requestDeck(articleId: string): Promise<string | null> {
  try {
    await supabase.functions.invoke("note-flashcards", { body: { article_id: articleId } });
  } catch { /* the schedule will make it anyway */ }
  try {
    const { data } = await db.from("flashcard_sets").select("id,title,slug").eq("source_reference", articleId).eq("published", true).is("deleted_at", null).limit(1);
    const d = (data || [])[0];
    return d ? buildFlashcardPath(d) : null;
  } catch { return null; }
}

/** The decks of the notes this reader has read, newest first. */
export async function loadMyDecks(userId: string | null, limit = 24): Promise<MyDeck[]> {
  const read = [...(await loadReadIds(userId))];
  if (!read.length) return [];
  try {
    const { data } = await db.from("flashcard_sets").select("id,title,slug,category,created_at,source_reference").in("source_reference", read.slice(0, 200)).eq("published", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(limit);
    return ((data || []) as { id: string; title: string; slug: string | null; category: string; created_at: string; source_reference: string }[]).map((d) => ({ ...d, path: buildFlashcardPath(d), note: d.source_reference }));
  } catch { return []; }
}

/** How many flashcards are due for this reader right now. */
export function useDueCount(): number {
  const { user, loading } = useAuth();
  const [n, setN] = useState(0);
  useEffect(() => { if (loading) return; let on = true; void loadStates(user?.id ?? null).then((m) => { if (on) setN(Object.values(m).filter((s) => isDue(s)).length); }); return () => { on = false; }; }, [user?.id, loading]);
  return n;
}

export function useMyDecks(): MyDeck[] | null {
  const { user, loading } = useAuth();
  const [decks, setDecks] = useState<MyDeck[] | null>(null);
  useEffect(() => {
    if (loading) return;
    let on = true;
    void loadMyDecks(user?.id ?? null).then((d) => { if (on) setDecks(d); });
    const again = () => { void loadMyDecks(user?.id ?? null).then((d) => { if (on) setDecks(d); }); };
    window.addEventListener("ompath:deck-ready", again);
    return () => { on = false; window.removeEventListener("ompath:deck-ready", again); };
  }, [user?.id, loading]);
  return decks;
}
