import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { requestDeck } from "@/lib/myDecks";

/**
 * Listens for "you have properly finished this note" and makes sure its flashcard deck exists, then tells the reader where it is.
 * Signed-in readers only (the deck is kept for them); nothing happens for a quick scroll-past.
 */
export default function ReadNotifier() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!user) return;
    const onRead = async (e: Event) => {
      const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail || ({} as { id: string; title: string });
      if (!id) return;
      const path = await requestDeck(id);
      window.dispatchEvent(new Event("ompath:deck-ready"));
      const name = String(title || "this note").replace(/\s*[—–-]\s*Notes$/i, "");
      toast({
        title: path ? "Flashcards ready" : "Flashcards are being prepared",
        description: path ? `Revise "${name}" as flashcards.` : `They will be in Flashcards shortly for "${name}".`,
        action: path ? <ToastAction altText="Open the flashcards" onClick={() => navigate(path)}>Study</ToastAction> : undefined,
      });
    };
    window.addEventListener("ompath:note-read", onRead);
    return () => window.removeEventListener("ompath:note-read", onRead);
  }, [user?.id, navigate]);
  return null;
}
