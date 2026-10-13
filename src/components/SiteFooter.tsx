import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, BookOpen, Mail, MessageCircle, Phone } from "lucide-react";

const STUDY = [
  { to: "/blog", label: "Study notes" },
  { to: "/topics", label: "Topics A–Z" },
  { to: "/papers", label: "Past papers" },
  { to: "/exams", label: "Timed exams" },
  { to: "/flashcards", label: "Flashcards" },
  { to: "/pharmacology", label: "Pharmacology guide" },
  { to: "/books", label: "Books" },
];
const COMPANY = [
  { to: "/about-us", label: "About Ompath Study" },
  { to: "/partners", label: "Partners" },
  { to: "/contact", label: "Contact us" },
  { to: "/download-app", label: "Get the app" },
  { to: "/stories", label: "Student stories" },
  { to: "/privacy", label: "Privacy, terms and disclaimer" },
];

/** The foot of every page: who we are, where to go, what is new, how to reach us. */
export default function SiteFooter() {
  const location = useLocation();
  // the list of notes is loaded after the page has painted, so the footer never slows the first view
  const [recent, setRecent] = useState<{ slug: string; year: number; title: string }[]>([]);
  useEffect(() => {
    let on = true;
    void import("@/data/staticNotes").then((m) => {
      if (!on) return;
      setRecent(m.STATIC_NOTES.filter((n) => !n.paper).map((n, i) => ({ n, at: Date.parse(n.updated) + i * 1000 })).filter((x) => Number.isFinite(x.at)).sort((a, b) => b.at - a.at).slice(0, 5).map((x) => ({ slug: x.n.slug, year: x.n.year, title: x.n.title })));
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
          <Link to="/" className="inline-flex items-center gap-2.5 font-serif text-xl font-bold text-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><BookOpen className="h-5 w-5" aria-hidden /></span>
            Ompath Study
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
          <ul className="mt-3">{STUDY.map((l) => <li key={l.to}><Link to={l.to} className={link}>{l.label}</Link></li>)}</ul>
          <p className={`${head} mt-6`}>By year</p>
          <ul className="mt-3 flex flex-wrap gap-2">{[1, 2, 3, 4, 5, 6].map((y) => <li key={y}><Link to={`/year/${y}`} className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-bold text-foreground/80 hover:border-primary/60 hover:text-primary">Y{y}</Link></li>)}</ul>
        </nav>

        <div className="order-4 col-span-2 lg:order-none lg:col-span-1">
          <p className={head}>Recently added</p>
          <ul className="mt-3 space-y-0.5">
            {recent.map((n, i) => (
              <li key={n.slug} className={i >= 3 ? "hidden sm:block" : undefined}><Link to={`/notes/${n.slug}`} className="group flex items-baseline gap-2 py-1 text-[15px] leading-snug text-muted-foreground hover:text-primary"><span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">Y{n.year}</span><span className="min-w-0 truncate">{n.title}</span></Link></li>
            ))}
          </ul>
          <Link to="/new-notes" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">See everything new <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>

        <nav aria-label="Company" className="order-3 lg:order-none">
          <p className={head}>Ompath Study</p>
          <ul className="mt-3">{COMPANY.map((l) => <li key={l.to}><Link to={l.to} className={link}>{l.label}</Link></li>)}</ul>
        </nav>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-5 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Ompath Study. Built by <Link to="/about" className="font-semibold text-foreground hover:text-primary">Abongo</Link>.</p>
          <p>For learning only. Not a substitute for medical advice, diagnosis or treatment.</p>
        </div>
      </div>
    </footer>
  );
}
