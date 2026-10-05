import { useMemo, useState } from "react";
import { ChevronDown, Eye, Lock } from "lucide-react";
import { useAccess } from "@/lib/access";
import { openSubscribePrompt } from "@/lib/subscribe-prompt";
import { mdToHtml } from "@/lib/miniMarkdown";
import { splitPaper } from "@/lib/paperAnswers";
import { linkDrugs } from "@/lib/noteLinks";
import drugIndex from "@/data/drugIndex.json";

interface DrugEntry { id: string; name: string; terms: string[] }
const DRUGS = drugIndex as DrugEntry[];

/** The answer to one question, behind the site's usual Reveal button: locked for guests, open to subscribers. */
function AnswerReveal({ html, onClick }: { html: string; onClick: React.MouseEventHandler }) {
  const [open, setOpen] = useState(false);
  const access = useAccess();
  const locked = !access.canReveal;
  return (
    <div className="not-prose my-4 overflow-hidden rounded-xl border border-primary/25 bg-primary/5 print:hidden">
      <button
        type="button"
        onClick={() => (locked ? openSubscribePrompt("Subscribe or restore your pass to reveal this answer.") : setOpen((v) => !v))}
        aria-expanded={!locked && open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-primary"
      >
        <span className="inline-flex items-center gap-2">
          {locked ? <Lock className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {locked ? "Reveal answer (subscribers)" : open ? "Hide answer" : "Reveal answer"}
        </span>
        {!locked && <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {/* The answer is only put on the page once a subscriber opens it. */}
      {open && !locked && <div className="note-body border-t border-primary/20 px-4 py-3" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />}
    </div>
  );
}

/** A past paper: every question is always visible, every answer sits behind Reveal. */
export default function PaperBody({ text, onClick }: { text: string; onClick: React.MouseEventHandler }) {
  const parts = useMemo(
    () => splitPaper(text).map((s, i) => {
      const html = mdToHtml(s.text, { skipTitle: i === 0 && !s.hidden }).html;
      return { hidden: s.hidden, html: s.hidden ? linkDrugs(html, DRUGS).html : html };
    }),
    [text],
  );
  return (
    <>
      {parts.map((p, i) => p.hidden
        ? <AnswerReveal key={i} html={p.html} onClick={onClick} />
        : <article key={i} className="note-body mt-4" onClick={onClick} dangerouslySetInnerHTML={{ __html: p.html }} />)}
    </>
  );
}
