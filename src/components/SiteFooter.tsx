import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Mail, MessageCircle, Phone } from "lucide-react";
import { useScopedYear, yearOfCategory } from "@/hooks/useMyYear";
import { supabase } from "@/integrations/supabase/client";
import { buildBlogPath } from "@/lib/store";
import { useTrack } from "@/lib/courseTrack";

const STUDY = [
  { to: "/blog", label: "Study notes" },
  { to: "/topics", label: "Topics A–Z" },
  { to: "/papers", label: "Past papers" },
  { to: "/mcqs", label: "MCQ banks" },
  { to: "/exams", label: "Timed exams" },
  { to: "/flashcards", label: "Flashcards" },
  { to: "/review", label: "Daily review" },
  { to: "/pharmacology", label: "Pharmacology guide" },
  { to: "/books", label: "Books" },
  { to: "/dental", label: "Dental & allied health papers" },
];
const DENTAL_STUDY = [
  { to: "/dental", label: "Dental home" },
  { to: "/dental/papers", label: "Past papers" },
  { to: "/library/year-1/oral-biology-and-dental-bds", label: "MBChB notes: oral biology" },
  { to: "/topics", label: "Topics A–Z (MBChB)" },
];
const COMPANY = [
  { to: "/about-us", label: "About Ompath Study" },
  { to: "/about", label: "Behind the site" },
  { to: "/partners", label: "Partners" },
  { to: "/contact", label: "Contact us" },
  { to: "/download-app", label: "Get the app" },
  { to: "/stories", label: "Student stories" },
  { to: "/privacy", label: "Privacy, terms and disclaimer" },
];

/** The foot of every page: who we are, where to go, what is new, how to reach us. */
export default function SiteFooter() {
  const { year: myYearFooter } = useScopedYear();
  const track = useTrack(); const dental = track !== "medicine";
  const location = useLocation();
  // the list of notes is loaded after the page has painted, so the footer never slows the first view
  const [recent, setRecent] = useState<{ slug: string; year: number; title: string; to: string; at: number }[]>([]);
  useEffect(() => {
    let on = true;
    void import("@/data/staticNotes").then((m) => {
      if (!on) return;
      const fixed = m.STATIC_NOTES.filter((n) => !n.paper).map((n, i) => ({ n, at: Date.parse(n.updated) + i * 1000 })).filter((x) => Number.isFinite(x.at)).map((x) => ({ slug: x.n.slug, year: x.n.year, title: x.n.title, to: `/notes/${x.n.slug}`, at: x.at }));
      setRecent(fixed.sort((a, b) => b.at - a.at).slice(0, 5));
      // notes added through the editor or the admin AI live in the database; merge the newest in
      void Promise.resolve(supabase.rpc("home_recent", { limit_n: 12 })).then(({ data }) => {
        if (!on || !data) return;
        const live = (data as { id: string; title: string; category: string; created_at: string; slug: string | null; kind: string }[])
          .filter((r) => r.kind === "article").map((r) => ({ slug: r.id, year: yearOfCategory(r.category) ?? 0, title: r.title, to: buildBlogPath({ id: r.id, title: r.title, slug: r.slug }), at: Date.parse(r.created_at) }))
          .filter((x) => x.year > 0 && Number.isFinite(x.at));
        setRecent([...fixed, ...live].sort((a, b) => b.at - a.at).slice(0, 12));
      }, () => {});
    });
    return () => { on = false; };
  }, []);
  if (/^\/exams\/[^/]+\/start/.test(location.pathname)) return null;

  const icon = "flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary";
  const head = "text-[11px] font-bold uppercase tracking-[0.16em] text-foreground";
  const link = "block py-1 text-[15px] text-muted-foreground transition-colors hover:text-primary";
  return (
    <footer className="mt-16 border-t border-border bg-muted/30 pb-24 sm:pb-8">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-5 py-9 lg:grid-cols-[1.3fr_1fr_1.4fr_1fr] lg:gap-10 lg:py-12">
        <div className="col-span-2 lg:col-span-1">
          <Link to="/" aria-label="Ompath Study" className="inline-flex items-center gap-2.5">
            <img src="/brand/mark-light.png" alt="" width="44" height="44" className="h-11 w-auto object-contain" decoding="async" />
            <span className="brand-word text-2xl leading-none text-[#0b2a5b] dark:text-white">Ompath<span className="text-[#0f8f82] dark:text-[#5eead4]">Study</span></span>
          </Link>
          <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-muted-foreground">Free medical notes, past papers, MCQs and a page on every topic.</p>
          <div className="mt-4 flex items-center gap-2">
            <a href="mailto:ompathstudy@gmail.com" aria-label="Email us" className={icon}><Mail className="h-[18px] w-[18px]" /></a>
            <a href="https://wa.me/254115475543" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className={icon}><MessageCircle className="h-[18px] w-[18px]" /></a>
            <a href="tel:+254115475543" aria-label="Call" className={icon}><Phone className="h-[18px] w-[18px]" /></a>
          </div>
        </div>

        <nav aria-label="Study" className="order-2 lg:order-none">
          <p className={head}>Study</p>
          <ul className="mt-3">{(dental ? [{ to: `/${track}`, label: "Papers home" }, { to: `/${track}/papers`, label: "All past papers" }, ...(track === "dental" ? DENTAL_STUDY.slice(2) : [{ to: "/topics", label: "Topics A–Z (MBChB)" }])] : STUDY).map((l) => <li key={l.to}><Link to={l.to} className={link}>{l.label}</Link></li>)}</ul>
          {!myYearFooter && <p className={`${head} mt-6`}>By year</p>}
          <ul className={`mt-3 flex flex-wrap gap-2 ${myYearFooter || dental ? "hidden" : ""}`}>{[1, 2, 3, 4, 5, 6].map((y) => <li key={y}><Link to={`/year/${y}`} className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-bold text-foreground/80 hover:border-primary/60 hover:text-primary">Y{y}</Link></li>)}</ul>
        </nav>

        {!dental && <div className="order-4 col-span-2 lg:order-none lg:col-span-1">
          <p className={head}>Recently added</p>
          <ul className="mt-3 space-y-0.5">
            {recent.filter((n) => !myYearFooter || n.year === myYearFooter).slice(0, 5).map((n, i) => (
              <li key={n.slug} className={i >= 3 ? "hidden sm:block" : undefined}><Link to={n.to} className="group flex items-baseline gap-2 py-1 text-[15px] leading-snug text-muted-foreground hover:text-primary"><span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">Y{n.year}</span><span className="min-w-0 truncate">{n.title}</span></Link></li>
            ))}
          </ul>
          <Link to="/recent" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">See everything new <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>}

        <nav aria-label="Company" className="order-3 lg:order-none">
          <p className={head}>Ompath Study</p>
          <ul className="mt-3">{COMPANY.map((l) => <li key={l.to}><Link to={l.to} className={link}>{l.label}</Link></li>)}</ul>
        </nav>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-5 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Ompath Study.</p>
          <p>For learning only. Not a substitute for medical advice, diagnosis or treatment.</p>
        </div>
      </div>
    </footer>
  );
}
