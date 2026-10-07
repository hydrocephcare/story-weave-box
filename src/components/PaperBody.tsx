import { useMemo, useState } from "react";
import { ChevronDown, Eye, Lock } from "lucide-react";
import { useAccess } from "@/lib/access";
import { openSubscribePrompt } from "@/lib/subscribe-prompt";
import { SubscribeModal } from "@/components/SubscribeModal";
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
    <div className="not-prose my-1.5 print:hidden">
      <button
        type="button"
        onClick={() => (locked ? openSubscribePrompt("Subscribe or restore your pass to reveal this answer.") : setOpen((v) => !v))}
        aria-expanded={!locked && open}
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/5 px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
      >
        {locked ? <Lock className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {locked ? "Reveal (subscribers)" : open ? "Hide answer" : "Reveal answer"}
        {!locked && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {/* The answer is only put on the page once a subscriber opens it. */}
      {open && !locked && <div className="note-body paper-body mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />}
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
  const access = useAccess();
  return (
    <>
      {/* Reveal asks for the subscribe prompt through a global event; something must be mounted to show it. */}
      <SubscribeModal settings={access.settings} loading={access.loading} onUnlocked={access.applyPass} />
      {parts.map((p, i) => p.hidden
        ? <AnswerReveal key={i} html={p.html} onClick={onClick} />
        : <article key={i} className="note-body paper-body mt-2" onClick={onClick} dangerouslySetInnerHTML={{ __html: p.html }} />)}
    </>
  );
}
