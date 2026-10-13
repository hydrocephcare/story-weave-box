import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, BookOpenCheck, ClipboardCheck, FileText, Layers, MessageCircle, Pill, Smartphone, Sparkles, Timer } from "lucide-react";
import { openAI } from "@/lib/aiEvents";
import { useAccess } from "@/lib/access";

/**
 * Ads for the empty sides of a page, for people at a desktop or laptop only (never on a phone or a tablet, even one showing the desktop site).
 * They advertise Ompath's own tools. Like real ads they come and go: each one slides in, stays a while, fades out, and a different one follows.
 *  - mode "rail": inside a page's own side column, under what is already there (study blogs)
 *  - mode "gutters": in the free space left and right of the content, measured from the element marked data-ad-anchor. They stay out of the
 *    page's top section, appear once the content starts, and keep beside it down the page until the footer.
 */
type Icon = typeof Sparkles;
interface Ad { key: string; tag: string; head: string; line: string; cta: string; hue: [number, number, number]; icon: Icon; to?: string; ask?: string; share?: boolean }

const ADS: Record<string, (title: string) => Ad> = {
  ai: (t) => ({ key: "ai", tag: "Ompath AI", head: "Stuck on this page?", line: `Ask Ompath AI to explain ${t.length > 34 ? "it" : `"${t}"`} in plain words.`, cta: "Ask now", hue: [172, 205, 250], icon: Sparkles, ask: `Explain "${t}" simply, then give me the five points an examiner expects.` }),
  quiz: (t) => ({ key: "quiz", tag: "Quiz me", head: "Think you know it?", line: `Five exam-style questions on ${t.length > 30 ? "this page" : `"${t}"`}, marked as you go.`, cta: "Test me", hue: [18, 340, 285], icon: ClipboardCheck, ask: `Ask me 5 exam-style MCQs on "${t}", one at a time, and mark my answers.` }),
  review: () => ({ key: "review", tag: "Daily review", head: "Remember it for good", line: "Two minutes a day of flashcards that come back just before you forget.", cta: "Start today's review", hue: [265, 305, 230], icon: BookOpenCheck, to: "/review" }),
  papers: () => ({ key: "papers", tag: "Past papers", head: "Do the real thing", line: "Past papers with the answers explained, year by year.", cta: "Open past papers", hue: [8, 345, 28], icon: FileText, to: "/papers" }),
  flash: () => ({ key: "flash", tag: "Flashcards", head: "Flip. Recall. Repeat.", line: "Flashcards for every unit. Free to start.", cta: "Open flashcards", hue: [95, 150, 185], icon: Layers, to: "/flashcards" }),
  exams: () => ({ key: "exams", tag: "Timed exams", head: "Practise the clock", line: "Sit a timed exam that feels like the real hall.", cta: "Start a timed exam", hue: [215, 245, 190], icon: Timer, to: "/exams" }),
  topics: () => ({ key: "topics", tag: "Topics A–Z", head: "A page on every topic", line: "From aponeurosis to zoster, with pictures and tests.", cta: "Browse topics", hue: [150, 48, 175], icon: BookOpen, to: "/topics" }),
  pharm: () => ({ key: "pharm", tag: "Pharmacology", head: "Drugs, made simple", line: "One clear card for each drug: use, dose, danger.", cta: "Open the guide", hue: [320, 275, 350], icon: Pill, to: "/pharmacology" }),
  share: (t) => ({ key: "share", tag: "Share", head: "Send it to a classmate", line: "Notes are better with company. One tap to WhatsApp.", cta: "Share on WhatsApp", hue: [140, 178, 120], icon: MessageCircle, share: true, ask: t }),
  app: () => ({ key: "app", tag: "Get the app", head: "Study on the bus", line: "Install Ompath Study on your phone and keep your notes close.", cta: "Get the app", hue: [255, 200, 310], icon: Smartphone, to: "/download-app" }),
};

// each slot cycles through its own ads, so no two on screen are the same
const SLOTS: string[][] = [["ai", "flash", "app"], ["review", "exams", "pharm"], ["papers", "topics", "quiz"], ["share", "quiz", "ai"]];

const MOTION = `
  @keyframes ad-in { from { opacity: 0; transform: translateX(var(--from, 40px)) scale(.94); filter: blur(6px) } to { opacity: 1; transform: none; filter: none } }
  @keyframes ad-out { from { opacity: 1; transform: none } to { opacity: 0; transform: translateY(10px) scale(.96); filter: blur(5px) } }
  @keyframes ad-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
  @keyframes ad-wiggle { 0%,84%,100% { rotate: 0deg } 87% { rotate: -1.8deg } 90% { rotate: 1.8deg } 93% { rotate: -1.1deg } 96% { rotate: .6deg } }
  @keyframes ad-drift-a { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(34px,22px) scale(1.25) } }
  @keyframes ad-drift-b { 0%,100% { transform: translate(0,0) scale(1.1) } 50% { transform: translate(-30px,-18px) scale(.9) } }
  @keyframes ad-shine { 0% { transform: translateX(-130%) skewX(-18deg) } 55%,100% { transform: translateX(260%) skewX(-18deg) } }
  .ad-wrap { width: 270px; }
  .ad-wrap.fluid { width: 100%; }
  .ad { position: relative; overflow: hidden; isolation: isolate; border-radius: 1.5rem; padding: 1.25rem; color: #fff; text-align: left; display: block; width: 100%;
    background: radial-gradient(120% 90% at 0% 0%, var(--c1), transparent 60%), radial-gradient(120% 100% at 100% 100%, var(--c3), transparent 62%), linear-gradient(135deg, var(--c2), var(--c1));
    box-shadow: 0 14px 34px -14px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.14); transition: filter .2s; }
  .ad[data-state="in"] { animation: ad-in .75s cubic-bezier(.2,.8,.2,1) both; }
  .ad[data-state="show"] { animation: ad-float 5s ease-in-out infinite, ad-wiggle 8s ease-in-out infinite; }
  .ad[data-state="out"] { animation: ad-out .6s ease-in both; }
  .ad:hover { filter: brightness(1.1); animation-play-state: paused; }
  .ad .blob { position: absolute; border-radius: 9999px; filter: blur(22px); opacity: .55; z-index: -1; }
  .ad .b1 { width: 120px; height: 120px; right: -30px; top: -34px; background: var(--c3); animation: ad-drift-a 9s ease-in-out infinite; }
  .ad .b2 { width: 100px; height: 100px; left: -26px; bottom: -30px; background: var(--c2); animation: ad-drift-b 11s ease-in-out infinite; }
  .ad .shine { position: absolute; inset: 0; z-index: -1; background: linear-gradient(100deg, transparent 35%, rgba(255,255,255,.28) 50%, transparent 65%); animation: ad-shine 5.5s ease-in-out infinite; }
  .ad .glyph { position: absolute; right: -10px; bottom: -12px; width: 6.5rem; height: 6.5rem; opacity: .16; rotate: -14deg; z-index: -1; }
  @media (prefers-reduced-motion: reduce) { .ad, .ad .blob, .ad .shine { animation: none !important } }
`;

function AdCard({ ad, state, fluid }: { ad: Ad; state: "in" | "show" | "out"; fluid?: boolean }) {
  const Icon = ad.icon;
  const [h1, h2, h3] = ad.hue;
  const style = { "--c1": `hsl(${h1} 78% 40%)`, "--c2": `hsl(${h2} 80% 33%)`, "--c3": `hsl(${h3} 82% 46%)` } as React.CSSProperties;
  const inner = (
    <>
      <span className="blob b1" aria-hidden /><span className="blob b2" aria-hidden /><span className="shine" aria-hidden /><Icon className="glyph" aria-hidden />
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/80"><Icon className="h-3.5 w-3.5" aria-hidden /> {ad.tag}</span>
      <span className="mt-2 block font-serif text-[1.45rem] font-bold leading-[1.1] text-white drop-shadow-sm">{ad.head}</span>
      <span className="mt-1.5 block text-[14px] leading-snug text-white/90">{ad.line}</span>
      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-slate-900 shadow-sm">{ad.cta} <ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
    </>
  );
  const common = { className: "ad", style, "data-state": state } as const;
  void fluid;
  if (ad.ask && !ad.share) return <button type="button" {...common} onClick={() => openAI(ad.ask)}>{inner}</button>;
  if (ad.share) return <a {...common} target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${ad.ask} | Ompath Study\n${window.location.href}`)}`}>{inner}</a>;
  return <Link {...common} to={ad.to ?? "/"}>{inner}</Link>;
}

/** One place on the page where ads come and go: slide in, stay a while, fade out, rest, and a different ad follows. */
function Slot({ keys, title, offset, fluid, from, reserve }: { keys: string[]; title: string; offset: number; fluid?: boolean; from: number; reserve?: number }) {
  const [i, setI] = useState(offset % keys.length);
  const [phase, setPhase] = useState<"gap" | "in" | "show" | "out">("gap");
  const hover = useRef(false);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wait = phase === "gap" ? (i === offset % keys.length && offset >= 0 ? 700 + offset * 1300 : 2200) : phase === "in" ? (reduced ? 0 : 750) : phase === "show" ? 9500 : 600;
    const t = window.setTimeout(() => {
      if (phase === "show" && hover.current) return setPhase("show"); // someone is reading it: keep it
      if (phase === "gap") setPhase("in");
      else if (phase === "in") setPhase("show");
      else if (phase === "show") setPhase("out");
      else { setI((n) => (n + 1) % keys.length); setPhase("gap"); }
    }, wait);
    return () => window.clearTimeout(t);
  }, [phase, i, keys.length, offset]);
  const ad = ADS[keys[i]](title);
  return (
    <div className={`ad-wrap ${fluid ? "fluid" : ""}`} style={{ minHeight: reserve, ["--from" as string]: `${from}px` }} onMouseEnter={() => { hover.current = true; }} onMouseLeave={() => { hover.current = false; }}>
      {phase !== "gap" && <AdCard ad={ad} state={phase} fluid={fluid} />}
    </div>
  );
}

/** Desktop and laptop only: a mouse (hover and a fine pointer) and a wide window, never a phone or a tablet, even in "desktop site" mode. */
function useDesktop(minWidth: number) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const check = () => setOk(
      window.matchMedia("(hover: hover) and (pointer: fine)").matches && window.innerWidth >= minWidth &&
      !/Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(navigator.userAgent) && (navigator.maxTouchPoints ?? 0) <= 1,
    );
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [minWidth]);
  return ok;
}

const crawler = () => typeof navigator === "undefined" || /bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent);

export default function SideAds({ title, mode = "gutters" }: { title: string; mode?: "rail" | "gutters" }) {
  const { hasPass, loading } = useAccess();
  const desktop = useDesktop(mode === "rail" ? 1280 : 1500);
  const [room, setRoom] = useState<{ left: number | null; right: number | null; on: boolean }>({ left: null, right: null, on: false });

  // gutters: where the free space is, and whether the reader has reached the content (and not yet the footer)
  useEffect(() => {
    if (mode !== "gutters" || !desktop) return;
    const AD = 270, GAP = 28;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = document.querySelector("[data-ad-anchor]");
      if (!el) return setRoom({ left: null, right: null, on: false });
      const r = el.getBoundingClientRect();
      const foot = document.querySelector("footer")?.getBoundingClientRect().top ?? Infinity;
      const rightFree = window.innerWidth - r.right - GAP - 16;
      const leftFree = r.left - GAP - 16;
      setRoom({ right: rightFree >= AD ? r.right + GAP : null, left: leftFree >= AD ? r.left - GAP - AD : null, on: r.top < 260 && foot > 420 });
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    const t = window.setTimeout(measure, 700);
    window.addEventListener("resize", queue); window.addEventListener("scroll", queue, { passive: true });
    return () => { window.clearTimeout(t); cancelAnimationFrame(frame); window.removeEventListener("resize", queue); window.removeEventListener("scroll", queue); };
  }, [mode, desktop, title]);

  if (!desktop || hasPass || loading || crawler()) return null;

  if (mode === "rail") {
    return (
      <div className="sticky top-24 mt-6 hidden space-y-4 print:hidden xl:block" aria-label="Advertisements">
        <style>{MOTION}</style>
        <Slot keys={SLOTS[0]} title={title} offset={0} fluid from={30} reserve={196} />
        <Slot keys={SLOTS[1]} title={title} offset={1} fluid from={30} reserve={196} />
        <Slot keys={SLOTS[2]} title={title} offset={2} fluid from={30} reserve={196} />
      </div>
    );
  }

  if (typeof document === "undefined" || !room.on || (room.left === null && room.right === null)) return null;
  return createPortal(
    <div className="print:hidden" aria-label="Advertisements">
      <style>{MOTION}</style>
      {room.left !== null && (
        <div className="fixed top-28 z-30 space-y-5" style={{ left: room.left }}>
          <Slot keys={SLOTS[0]} title={title} offset={0} from={-40} reserve={196} />
          <Slot keys={SLOTS[1]} title={title} offset={2} from={-40} reserve={196} />
        </div>
      )}
      {room.right !== null && (
        <div className="fixed top-28 z-30 space-y-5" style={{ left: room.right }}>
          <Slot keys={SLOTS[2]} title={title} offset={1} from={40} reserve={196} />
          <Slot keys={SLOTS[3]} title={title} offset={3} from={40} reserve={196} />
        </div>
      )}
    </div>,
    document.body,
  );
}
