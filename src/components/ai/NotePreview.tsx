import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import PaperBody from "@/components/PaperBody";
import { supabase } from "@/integrations/supabase/client";
import { loadStaticNoteText } from "@/data/staticNotes";
import { mdToHtml } from "@/lib/miniMarkdown";
import type { SiteHit } from "@/lib/siteSearch";

/** Escape for a regex, then wrap each search word in <mark> (only outside tags). */
function markTerms(html: string, terms: string[]): string {
  const words = [...new Set(terms.filter((t) => t.length >= 3))].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return html;
  const re = new RegExp(`(${words.join("|")})`, "gi");
  return html.replace(/(<[^>]+>)|([^<]+)/g, (_m, tag, text) => (tag ? tag : String(text).replace(re, "<mark>$1</mark>")));
}

/**
 * A note opened inside a pop-up: the text is shown here, so closing it lands you back in the chat exactly where you were.
 * "Open full page" goes to the real page for everything the preview leaves out (answers, images, quizzes).
 */
export default function NotePreview({ hit, terms, onClose, onOpenFull }: { hit: SiteHit | null; terms: string[]; onClose: () => void; onOpenFull: (hit: SiteHit) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isPaper = hit?.kind === "paper";

  useEffect(() => {
    setText(null); setFailed(false);
    if (!hit) return;
    let on = true;
    (async () => {
      try {
        if (hit.key.startsWith("static-")) { const t = await loadStaticNoteText(hit.key.slice(7)); if (on) setText(t); return; }
        if (hit.key.startsWith("article-")) {
          const { data, error } = await supabase.from("articles").select("content").eq("id", hit.key.slice(8)).maybeSingle();
          if (error || !data) throw error ?? new Error("missing");
          if (on) setText(String(data.content ?? ""));
          return;
        }
        if (on) setFailed(true);
      } catch { if (on) setFailed(true); }
    })();
    return () => { on = false; };
  }, [hit]);

  const html = useMemo(() => {
    if (text === null || isPaper) return "";
    const body = text.length > 60000 ? `${text.slice(0, 60000)}\n\n…` : text;
    return markTerms(mdToHtml(body, { skipTitle: true }).html, terms);
  }, [text, terms, isPaper]);

  return (
    <Dialog open={Boolean(hit)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex h-[88dvh] w-[96vw] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogTitle className="truncate border-b border-border px-4 py-3 pr-12 text-base font-semibold">{hit?.title}</DialogTitle>
        <DialogDescription className="sr-only">Preview of {hit?.title}. Close it to go back to Ompath AI.</DialogDescription>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {hit?.subtitle && <p className="mb-3 text-xs text-muted-foreground">{hit.subtitle}</p>}
          {failed ? (
            <p className="rounded-lg border border-border bg-muted px-3 py-3 text-sm text-muted-foreground">This one is best read on its own page. Use “Open full page” below.</p>
          ) : text === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
          ) : isPaper ? (
            <PaperBody text={text} onClick={() => undefined} />
          ) : (
            <article className="note-body" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">Close</button>
          {hit && <button type="button" onClick={() => onOpenFull(hit)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"><ExternalLink className="h-4 w-4" /> Open full page</button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
