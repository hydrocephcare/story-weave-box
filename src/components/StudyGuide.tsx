import { useEffect, useRef, useState } from "react";
import { BookOpen, Loader2, RefreshCw } from "lucide-react";
import { mdToHtml } from "@/lib/miniMarkdown";
import { getGuide, saveGuide } from "@/lib/zone";
import { writeGuide, type Missed } from "@/lib/zoneGuide";

/**
 * A study article about exactly what the player did not know, written by Ompath AI. After a game it appears by itself when the score was low;
 * from the record ("Needs work") it is made on request. When the game belongs to a signed-in player the guide is kept with that game.
 */
export default function StudyGuide({ topic, year, missed, roomCode, auto = false }: { topic: string; year: number | null; missed: Missed[]; roomCode?: string; auto?: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const started = useRef(false);

  const make = async () => {
    setBusy(true); setErr("");
    try {
      const t = await writeGuide(topic, year, missed);
      if (t.length < 80) throw new Error("short");
      setText(t);
      if (roomCode) void saveGuide(roomCode, t);
    } catch { setErr("I could not write the guide just now. Try again in a moment."); }
    setBusy(false);
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // a guide already kept for this game is shown first; otherwise a low score writes one by itself
    void (async () => {
      const kept = roomCode ? await getGuide(roomCode) : null;
      if (kept) { setText(kept); return; }
      if (auto) void make();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section aria-label="Your study guide" className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-serif text-lg font-bold"><BookOpen className="h-5 w-5 text-primary" aria-hidden /> Your study guide: {topic}</h2>
      <p className="text-xs text-muted-foreground">Written from what you got wrong. AI-written: check it against your notes.</p>
      {busy && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> Writing a guide for your weak spots…</p>}
      {err && <p className="mt-3 text-sm text-destructive" role="alert">{err}</p>}
      {text && <article className="note-body mt-3 text-[15px]" dangerouslySetInnerHTML={{ __html: mdToHtml(text).html }} />}
      {!busy && (
        <button type="button" onClick={() => void make()} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-bold hover:border-primary">
          {text ? <><RefreshCw className="h-4 w-4" aria-hidden /> Write it again</> : <><BookOpen className="h-4 w-4" aria-hidden /> Make my study guide</>}
        </button>
      )}
    </section>
  );
}
