import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, Pause, Play, Square, Volume2 } from "lucide-react";
import { readSaved, toggleSaved } from "@/lib/storyExtras";

/** Save for later (kept in this browser) and Listen (the phone or computer reads the story aloud). */
export default function StoryActions({ id, title, text }: { id: string; title: string; text: string }) {
  const [saved, setSaved] = useState(false);
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const spoken = useRef(false);
  useEffect(() => { setSaved(readSaved().includes(id)); }, [id]);
  useEffect(() => () => { if (spoken.current && supported) window.speechSynthesis.cancel(); }, [supported]);

  const listen = () => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    if (state === "playing") { synth.pause(); setState("paused"); return; }
    if (state === "paused") { synth.resume(); setState("playing"); return; }
    synth.cancel();
    const body = `${title}. ${text}`.replace(/\s+/g, " ").slice(0, 30000);
    // long text is read in sentences so a phone does not cut it off
    const chunks = body.match(/[^.!?]+[.!?]*\s*/g) ?? [body];
    spoken.current = true;
    chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c.trim());
      u.rate = 0.98;
      if (i === chunks.length - 1) u.onend = () => setState("idle");
      u.onerror = () => setState("idle");
      synth.speak(u);
    });
    setState("playing");
  };
  const stop = () => { if (supported) window.speechSynthesis.cancel(); setState("idle"); };
  const btn = "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-bold text-foreground/80 transition-colors hover:border-primary hover:text-primary";

  return (
    <div className="not-prose mt-4 flex flex-wrap items-center gap-2 print:hidden">
      {supported && (
        <>
          <button type="button" onClick={listen} className={btn} aria-label={state === "playing" ? "Pause reading" : "Listen to this story"}>
            {state === "playing" ? <Pause className="h-3.5 w-3.5" /> : state === "paused" ? <Play className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            {state === "playing" ? "Pause" : state === "paused" ? "Resume" : "Listen"}
          </button>
          {state !== "idle" && <button type="button" onClick={stop} className={btn} aria-label="Stop reading"><Square className="h-3.5 w-3.5" /> Stop</button>}
        </>
      )}
      <button type="button" onClick={() => setSaved(toggleSaved(id))} aria-pressed={saved} className={`${btn} ${saved ? "border-primary bg-primary/10 text-primary" : ""}`}>
        {saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />} {saved ? "Saved" : "Save for later"}
      </button>
    </div>
  );
}
