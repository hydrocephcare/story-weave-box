import { useEffect, useState } from "react";
import { Check, Copy, Sparkles, Volume2, VolumeX } from "lucide-react";

const clean = (md: string) => md.replace(/\\n/g, "\n").replace(/\*\*/g, "").replace(/^\s*[-•*]\s+/gm, "").replace(/\n+/g, ". ").replace(/\.\s*\./g, ".").trim();

/**
 * A model answer: lines starting with "- " become bullets, **bold** is kept. Underneath: listen to it, copy it, and (only once you have read it) ask the AI
 * to explain it when it does not make sense.
 */
export default function DentalAnswer({ text, label = "Model answer", onAsk }: { text: string; label?: string; onAsk?: () => void }) {
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch { /* no speech */ } }, []);
  const bold = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((x, i) => (x.startsWith("**") && x.endsWith("**") ? <strong key={i}>{x.slice(2, -2)}</strong> : x));
  const bullet = /^\s*[-•*]\s+/;
  const listen = () => {
    try {
      const s = window.speechSynthesis; if (!s) return;
      if (speaking) { s.cancel(); setSpeaking(false); return; }
      const u = new SpeechSynthesisUtterance(clean(text)); u.rate = 0.98; u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false);
      s.cancel(); s.speak(u); setSpeaking(true);
    } catch { /* speech not available */ }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(text.replace(/\\n/g, "\n")); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } };
  const btn = "inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary";
  return (
    <div className="mt-2 space-y-1.5 border-l-2 border-emerald-500/60 pl-4 text-[15.5px] leading-relaxed">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">{label}</p>
      {text.replace(/\\n/g, "\n").split("\n").filter((l) => l.trim()).map((l, i) => (bullet.test(l) ? <p key={i} className="flex gap-2"><span className="text-primary">•</span><span>{bold(l.replace(bullet, ""))}</span></p> : <p key={i} className="font-semibold">{bold(l)}</p>))}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 print:hidden">
        <button type="button" onClick={listen} className={btn}>{speaking ? <VolumeX className="h-3.5 w-3.5" aria-hidden /> : <Volume2 className="h-3.5 w-3.5" aria-hidden />}{speaking ? "Stop" : "Listen"}</button>
        <button type="button" onClick={copy} className={btn}>{copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{copied ? "Copied" : "Copy"}</button>
        {onAsk && <button type="button" onClick={onAsk} className={btn}><Sparkles className="h-3.5 w-3.5" aria-hidden />Still unclear? Ask AI to explain</button>}
      </p>
    </div>
  );
}
