import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { openAI } from "@/lib/aiEvents";

/**
 * Select any words in a note and a small bar offers to have Ompath AI explain them (mechanism, why it matters, a clinical example).
 * One listener for the whole site; it only appears for text inside a page's main content, never in boxes where you type.
 */
export default function SelectionAsk() {
  const [text, setText] = useState("");

  useEffect(() => {
    let timer = 0;
    const read = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const sel = window.getSelection();
        const t = (sel?.toString() || "").replace(/\s+/g, " ").trim();
        const node = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
        if (!sel || sel.isCollapsed || t.length < 6 || t.length > 400 || !node || !node.closest("main, article") || node.closest("input, textarea, [contenteditable=true], [data-no-ask], [role=dialog]")) { setText(""); return; }
        setText(t);
      }, 250);
    };
    document.addEventListener("selectionchange", read);
    return () => { window.clearTimeout(timer); document.removeEventListener("selectionchange", read); };
  }, []);

  if (!text) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4" data-no-ask>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { openAI(`Explain this simply, with the mechanism and one clinical example: "${text}"`); setText(""); window.getSelection()?.removeAllRanges(); }}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-lg">
        <Sparkles className="h-4 w-4" aria-hidden /> Ask Ompath AI about this
      </button>
    </div>
  );
}
