import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpenCheck, FileText, MessageCircle, Sparkles } from "lucide-react";
import { openAI } from "@/lib/aiEvents";
import { useAccess } from "@/lib/access";

/**
 * Ads for the empty sides of a blog page, on wide screens only. They advertise Ompath's own tools, move gently and give a small wiggle now and then
 * to catch the eye (still, when the reader asked their device for less motion). Never shown to a subscriber, to a crawler, or in print.
 */
interface Ad { key: string; tag: string; head: string; line: string; cta: string; hue: [number, number]; icon: typeof Sparkles }

const ADS = (title: string): Ad[] => [
  { key: "ai", tag: "Ompath AI", head: "Stuck on this page?", line: `Ask Ompath AI to explain ${title.length > 38 ? "it" : `"${title}"`} in plain words.`, cta: "Ask now", hue: [172, 205], icon: Sparkles },
  { key: "review", tag: "Daily review", head: "Remember it for good", line: "Two minutes a day of flashcards that come back just before you forget.", cta: "Start today's review", hue: [262, 300], icon: BookOpenCheck },
  { key: "papers", tag: "Past papers", head: "Do the real thing", line: "Timed past papers with the answers explained, year by year.", cta: "Open past papers", hue: [24, 345], icon: FileText },
  { key: "share", tag: "Share", head: "Send it to a classmate", line: "Notes are better with company. Share this page on WhatsApp in one tap.", cta: "Share on WhatsApp", hue: [140, 178], icon: MessageCircle },
];

function Card({ ad, title, index }: { ad: Ad; title: string; index: number }) {
  const Icon = ad.icon;
  const style = { "--a": `hsl(${ad.hue[0]} 70% 38%)`, "--b": `hsl(${ad.hue[1]} 75% 30%)`, animationDelay: `${index * 0.9}s, ${index * 2.3}s, 0s` } as React.CSSProperties;
  const inner = (
    <>
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/75"><Icon className="h-3.5 w-3.5" aria-hidden /> {ad.tag}</span>
      <span className="mt-2 block font-serif text-[1.35rem] font-bold leading-tight text-white">{ad.head}</span>
      <span className="mt-1.5 block text-[14px] leading-snug text-white/85">{ad.line}</span>
      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-slate-900">{ad.cta} <ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
    </>
  );
  const cls = "side-ad block rounded-3xl p-5 text-left shadow-lg shadow-black/25";
  if (ad.key === "ai") return <button type="button" style={style} className={cls} onClick={() => openAI(`Explain "${title}" simply, then give me the five points an examiner expects.`)}>{inner}</button>;
  if (ad.key === "share") return <a style={style} className={cls} target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${title} | Ompath Study\n${window.location.href}`)}`}>{inner}</a>;
  return <Link style={style} className={cls} to={ad.key === "review" ? "/review" : "/papers"}>{inner}</Link>;
}

export default function SideAds({ title }: { title: string }) {
  const { hasPass, loading } = useAccess();
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1500px)");
    const on = () => setWide(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  if (typeof document === "undefined" || !wide || hasPass || loading || /bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent)) return null;
  const ads = ADS(title);
  // the centre column is about 888px wide; each stack sits in the free space beside it
  const left = { left: "calc(50% - 444px - 24px - 270px)" };
  const right = { left: "calc(50% + 444px + 24px)" };
  return createPortal(
    <div className="print:hidden" aria-label="Advertisements">
      <style>{`
        @keyframes side-ad-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
        @keyframes side-ad-wiggle { 0%,86%,100% { rotate: 0deg } 89% { rotate: -1.6deg } 92% { rotate: 1.6deg } 95% { rotate: -1deg } 98% { rotate: .6deg } }
        @keyframes side-ad-shift { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
        .side-ad { width: 270px; background-image: linear-gradient(120deg, var(--a), var(--b), var(--a)); background-size: 220% 220%; animation: side-ad-float 4.6s ease-in-out infinite, side-ad-wiggle 7s ease-in-out infinite, side-ad-shift 12s ease infinite; transition: filter .2s; }
        .side-ad:hover { filter: brightness(1.12); animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .side-ad { animation: none } }
      `}</style>
      <div className="pointer-events-auto fixed top-36 z-30 space-y-6" style={left}>
        <Card ad={ads[0]} title={title} index={0} />
        <Card ad={ads[1]} title={title} index={1} />
      </div>
      <div className="pointer-events-auto fixed top-[21rem] z-30 space-y-6" style={right}>
        <Card ad={ads[2]} title={title} index={2} />
        <Card ad={ads[3]} title={title} index={3} />
      </div>
    </div>,
    document.body,
  );
}
