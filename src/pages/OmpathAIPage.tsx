import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Brain, Search, Sparkles } from "lucide-react";
import { openAI } from "@/lib/aiEvents";
import { updateMetaTags } from "@/lib/seo";

/** /ai: a page you can link to or bookmark. It opens Ompath AI straight away (with ?q= it asks that question). */
export default function OmpathAIPage() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  useEffect(() => {
    updateMetaTags({ title: "Ompath AI — ask your study notes | Ompath Study", description: "Ask for notes, past papers or files and get answers from every note on Ompath Study." });
    const t = window.setTimeout(() => openAI(q), 150);
    return () => window.clearTimeout(t);
  }, [q]);
  return (
    <div className="mx-auto max-w-2xl px-5 py-16 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Brain className="h-7 w-7" /></span>
      <h1 className="mt-4 font-serif text-3xl font-bold">Ompath AI</h1>
      <p className="mt-2 text-muted-foreground">Type what you need, like “I need notes on psychiatry”. I search every note, past paper and file on Ompath Study and answer from them.</p>
      <button type="button" onClick={() => openAI()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground"><Sparkles className="h-4 w-4" /> Open Ompath AI</button>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><Search className="h-3.5 w-3.5" /> Shortcut: Ctrl + J</p>
    </div>
  );
}
