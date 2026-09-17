import { useEffect, useState } from "react";
import { X, Send, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reader-facing "this label looks wrong" form for a single slide/plate.
 * Suggestions land in `slide_corrections` as `pending` and only show on the
 * page once an admin approves them.
 */
export function SlideCorrectionModal({
  articleId,
  slideNumber,
  slidePrompt,
  open,
  onClose,
}: {
  articleId: string;
  slideNumber: string;
  slidePrompt?: string;
  open: boolean;
  onClose: () => void;
}) {
  const [suggestion, setSuggestion] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  useEffect(() => {
    if (open) { setSuggestion(""); setState("idle"); setMessage(""); }
  }, [open, slideNumber]);

  if (!open) return null;

  const submit = async () => {
    const text = suggestion.trim();
    if (text.length < 3) { setState("error"); setMessage("Please type the correct answer first."); return; }
    setState("saving");
    const { error } = await supabase.from("slide_corrections").insert({
      article_id: articleId,
      slide_number: slideNumber,
      slide_prompt: slidePrompt || null,
      suggestion: text.slice(0, 2000),
      submitter_name: name.trim() ? name.trim().slice(0, 80) : null,
      status: "pending",
    });
    if (error) { setState("error"); setMessage("Could not send that — please try again."); return; }
    setState("done");
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-background/80 p-3 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Suggest a correction</p>
            <h2 className="mt-1 font-serif text-lg font-bold leading-snug text-foreground">
              Plate {slideNumber}
            </h2>
            {slidePrompt && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{slidePrompt}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {state === "done" ? (
          <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm leading-relaxed text-foreground">
              Thank you — your correction was sent for review. It appears on the plate once verified.
            </p>
          </div>
        ) : (
          <>
            <label className="block text-xs font-semibold text-foreground" htmlFor="slide-correction">
              What is the correct answer / label?
            </label>
            <textarea
              id="slide-correction"
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              rows={4}
              placeholder="e.g. B is the zona pellucida, not the corona radiata"
              className="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <label className="mt-3 block text-xs font-semibold text-foreground" htmlFor="slide-correction-name">
              Your name <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              id="slide-correction-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            {state === "error" && <p className="mt-2 text-xs font-semibold text-destructive">{message}</p>}
            <button
              type="button"
              onClick={submit}
              disabled={state === "saving"}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {state === "saving" ? "Sending…" : "Send correction"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}