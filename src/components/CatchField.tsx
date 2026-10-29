import { useMemo } from "react";
import { Check, X } from "lucide-react";

// Word Catch: the answers drift across the screen in lanes, each at its own speed and from its own place, and the player taps the right word.
// Tapping fades the question out and the next one in. With "reduce motion" on, the words sit still in their lanes.

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rand = (seed: number) => { let x = seed || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };

export default function CatchField({ options, picked, correct, locked, onPick, seed }: { options: string[]; picked: number | null; correct: number | null; locked: boolean; onPick: (i: number) => void; seed: string }) {
  // lanes, speeds and starting places depend on the question, so the right word is never in a predictable place or at a predictable speed
  const plan = useMemo(() => {
    const r = rand(hash(seed));
    const lanes = options.map((_, i) => i);
    for (let i = lanes.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [lanes[i], lanes[j]] = [lanes[j], lanes[i]]; }
    return options.map((_, i) => ({ lane: lanes[i], dur: 8 + r() * 6, delay: -r() * 12, reverse: r() < 0.5 }));
  }, [options, seed]);
  const laneH = 100 / options.length;
  return (
    <div className="relative mt-3 overflow-hidden rounded-xl bg-muted/40" style={{ height: options.length * 54 }} role="group" aria-label="Words to tap">
      {options.map((o, i) => {
        const p = plan[i];
        const right = correct !== null && i === correct, bad = correct !== null && picked === i && i !== correct;
        return (
          <button
            key={i}
            type="button"
            disabled={locked}
            onClick={() => onPick(i)}
            className={`zone-tile absolute flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 px-4 py-2 text-[15px] font-semibold shadow-sm transition-colors disabled:cursor-default ${right ? "border-emerald-500 bg-emerald-500/15" : bad ? "border-rose-500 bg-rose-500/15" : picked === i ? "border-primary bg-primary/10" : "border-border bg-card active:border-primary"}`}
            style={{
              top: `calc(${p.lane * laneH}% + ${laneH / 2}% - 20px)`,
              animation: `zone-drift ${p.dur}s linear ${p.delay}s infinite ${p.reverse ? "reverse" : "normal"}`,
              animationPlayState: locked ? "paused" : "running",
              zIndex: right || bad ? 2 : 1,
            }}
          >
            {right && <Check className="h-4 w-4 text-emerald-600" aria-label="Correct" />}
            {bad && <X className="h-4 w-4 text-rose-600" aria-label="Your answer" />}
            {o}
          </button>
        );
      })}
    </div>
  );
}
