import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft } from "lucide-react";
import FlashcardDeck, { type DeckCard } from "@/components/FlashcardDeck";
import { KeywordLinkProvider } from "@/lib/keyword-link";
import { getGeneratedFlashcardDeck } from "@/lib/generatedFlashcards";

export default function GeneratedFlashcardStudy() {
  const { id = "" } = useParams();
  const [deck, setDeck] = useState(() => getGeneratedFlashcardDeck(id));

  useEffect(() => {
    setDeck(getGeneratedFlashcardDeck(id));
  }, [id]);

  if (!deck) {
    return (
      <main className="mx-auto max-w-xl px-5 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold">Generated flashcards not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">These cards may have been cleared from this browser. Generate them again from the topic page.</p>
        <Link to="/flashcards" className="mt-5 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-bold hover:border-primary/60">
          <ArrowLeft className="h-4 w-4" /> Back to flashcards
        </Link>
      </main>
    );
  }

  const path = `/generated-flashcards/${encodeURIComponent(deck.id)}`;
  const cards: DeckCard[] = deck.cards.map((card, idx) => ({
    question: card.q,
    answer: card.a,
    setId: `generated-${deck.id}`,
    idx,
  }));

  return (
    <>
      <Helmet>
        <title>{deck.title} – Flashcards | Ompath Study</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="mx-auto max-w-2xl px-3 pb-16 pt-2 sm:px-6">
        <p className="mb-2 text-xs text-muted-foreground">Generated from your study page · {cards.length} cards</p>
        <KeywordLinkProvider currentPath={path} currentTitle={deck.title}>
          <FlashcardDeck cards={cards} title={deck.title} category="Generated medical revision" />
        </KeywordLinkProvider>
      </div>
    </>
  );
}
