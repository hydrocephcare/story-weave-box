import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Accessibility, Languages, Minus, Plus, RotateCcw, Square, Volume2, X } from "lucide-react";

/**
 * Reading tools for everyone, especially readers with low vision or dyslexia: bigger text, spacing, an easy-to-read font, high contrast,
 * read aloud and a one-tap translate. It sits on the left edge as a faint tab, so it never gets in the way, and opens on tap or from the keyboard.
 * Settings are remembered on this device and applied to every page.
 */
interface Prefs { size: number; spacing: 0 | 1 | 2; easyFont: boolean; contrast: boolean; links: boolean; calm: boolean; rate: number }
const DEFAULTS: Prefs = { size: 100, spacing: 0, easyFont: false, contrast: false, links: false, calm: false, rate: 1 };
const KEY = "ompath_a11y";

const LANGS: [string, string][] = [["sw", "Kiswahili"], ["fr", "Français"], ["ar", "العربية"], ["es", "Español"], ["pt", "Português"], ["hi", "हिन्दी"], ["zh-CN", "中文"], ["am", "አማርኛ"], ["ha", "Hausa"], ["yo", "Yorùbá"], ["ig", "Igbo"], ["zu", "isiZulu"], ["de", "Deutsch"], ["ru", "Русский"], ["bn", "বাংলা"], ["ur", "اردو"], ["id", "Bahasa Indonesia"], ["tr", "Türkçe"], ["fil", "Filipino"]];

function load(): Prefs {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>) }; } catch { return DEFAULTS; }
}

function apply(p: Prefs) {
  const el = document.documentElement;
  el.style.fontSize = p.size === 100 ? "" : `${p.size}%`;
  el.classList.toggle("a11y-lh1", p.spacing === 1);
  el.classList.toggle("a11y-lh2", p.spacing === 2);
  el.classList.toggle("a11y-font", p.easyFont);
  el.classList.toggle("a11y-contrast", p.contrast);
  el.classList.toggle("a11y-links", p.links);
  el.classList.toggle("a11y-calm", p.calm);
}

export default function AccessibilityTools() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(load);
  const [speaking, setSpeaking] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const tab = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => { apply(prefs); }, [prefs]);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage blocked */ } }, [prefs]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); tab.current?.focus(); } };
    const onDown = (e: MouseEvent | TouchEvent) => { const t = e.target as Node; if (panel.current && !panel.current.contains(t) && !tab.current?.contains(t)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
  }, [open]);
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch { /* not supported */ } }, []);

  const set = useCallback(<K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v })), []);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  const speak = (text: string) => {
    if (!canSpeak || !text.trim()) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/\s+/g, " ").trim().slice(0, 14000);
    // long text is read in sentences so it can be stopped at any point and does not stall on some phones
    const parts = clean.match(/[^.!?]+[.!?]*\s*/g) ?? [clean];
    setSpeaking(true);
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      u.rate = prefs.rate;
      u.lang = document.documentElement.lang || "en";
      if (i === parts.length - 1) { u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false); }
      window.speechSynthesis.speak(u);
    });
  };
  const stop = () => { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } setSpeaking(false); };
  const readSelection = () => speak(window.getSelection()?.toString() || "");
  const readPage = () => speak((document.querySelector("main") as HTMLElement | null)?.innerText || document.body.innerText);
  const translate = (code: string) => {
    if (!code) return;
    window.open(`https://translate.google.com/translate?sl=auto&tl=${encodeURIComponent(code)}&u=${encodeURIComponent(window.location.href)}`, "_blank", "noopener,noreferrer");
  };

  const btn = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-bold hover:border-primary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";
  const on = "border-primary bg-primary/10 text-primary";
  const row = "flex items-center justify-between gap-2";

  return (
    <div className="print:hidden">
      <button
        ref={tab}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="a11y-panel"
        aria-label="Reading and accessibility tools"
        className="fixed bottom-24 left-0 z-[60] flex h-11 w-9 items-center justify-center rounded-r-xl border border-l-0 border-border bg-card/70 text-foreground opacity-40 shadow-md backdrop-blur transition hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary data-[open=true]:opacity-100"
        data-open={open}
      >
        <Accessibility className="h-5 w-5" aria-hidden />
      </button>

      {open && (
        <div ref={panel} id="a11y-panel" role="dialog" aria-label="Reading and accessibility tools" className="fixed bottom-24 left-11 z-[60] max-h-[75dvh] w-[min(19rem,calc(100vw-3.5rem))] overflow-y-auto rounded-2xl border border-border bg-card p-4 text-sm shadow-2xl">
          <div className={row}>
            <p className="font-serif text-base font-bold">Reading tools</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Text size · {prefs.size}%</p>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" className={btn} onClick={() => set("size", Math.max(80, prefs.size - 10))} aria-label="Smaller text"><Minus className="h-3.5 w-3.5" /> A</button>
                <button type="button" className={btn} onClick={() => set("size", 100)}>Normal</button>
                <button type="button" className={btn} onClick={() => set("size", Math.min(200, prefs.size + 10))} aria-label="Larger text"><Plus className="h-3.5 w-3.5" /> A</button>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Line spacing</p>
              <div className="grid grid-cols-3 gap-2">
                {(["Normal", "Roomy", "Wide"] as const).map((l, i) => <button key={l} type="button" aria-pressed={prefs.spacing === i} className={`${btn} ${prefs.spacing === i ? on : ""}`} onClick={() => set("spacing", i as 0 | 1 | 2)}>{l}</button>)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={prefs.easyFont} className={`${btn} ${prefs.easyFont ? on : ""}`} onClick={() => set("easyFont", !prefs.easyFont)}>Easy-read font</button>
              <button type="button" aria-pressed={prefs.contrast} className={`${btn} ${prefs.contrast ? on : ""}`} onClick={() => set("contrast", !prefs.contrast)}>High contrast</button>
              <button type="button" aria-pressed={prefs.links} className={`${btn} ${prefs.links ? on : ""}`} onClick={() => set("links", !prefs.links)}>Underline links</button>
              <button type="button" aria-pressed={prefs.calm} className={`${btn} ${prefs.calm ? on : ""}`} onClick={() => set("calm", !prefs.calm)}>Stop motion</button>
            </div>

            {canSpeak && (
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Read aloud</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={btn} onClick={readPage}><Volume2 className="h-3.5 w-3.5" /> This page</button>
                  <button type="button" className={btn} onClick={readSelection}>Selected text</button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="flex flex-1 items-center gap-2 text-xs font-semibold">Speed
                    <input type="range" min={0.6} max={1.6} step={0.1} value={prefs.rate} onChange={(e) => set("rate", Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" aria-label="Reading speed" />
                  </label>
                  <button type="button" className={`${btn} ${speaking ? on : ""}`} onClick={stop} disabled={!speaking}><Square className="h-3 w-3" /> Stop</button>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground" htmlFor="a11y-lang"><Languages className="h-3.5 w-3.5" /> Translate this page</label>
              <select id="a11y-lang" defaultValue="" onChange={(e) => { translate(e.target.value); e.target.value = ""; }} className="min-h-9 w-full rounded-lg border border-border bg-background px-2 text-xs font-semibold">
                <option value="" disabled>Choose a language…</option>
                {LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">Opens Google Translate in a new tab.</p>
            </div>

            <button type="button" className={`${btn} w-full`} onClick={() => { stop(); setPrefs(DEFAULTS); }}><RotateCcw className="h-3.5 w-3.5" /> Reset everything</button>
          </div>
        </div>
      )}
    </div>
  );
}
