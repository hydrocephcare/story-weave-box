import { Link, useLocation } from "react-router-dom";
import { BookOpen, Phone, MessageCircle, Mail } from "lucide-react";

const links = [
  { to: "/year/1", label: "Y1" },
  { to: "/year/2", label: "Y2" },
  { to: "/year/3", label: "Y3" },
  { to: "/year/4", label: "Y4" },
  { to: "/year/5", label: "Y5" },
  { to: "/year/6", label: "Y6" },
  { to: "/about", label: "About" },
  { to: "/download-app", label: "Get the app" },
];

/** One quiet row: who we are, where to go, how to reach us. */
export default function SiteFooter() {
  const location = useLocation();
  if (/^\/exams\/[^/]+\/start/.test(location.pathname)) return null;

  const icon = "flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary";
  return (
    <footer className="mt-12 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/" className="flex items-center gap-2 font-serif text-base font-semibold text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><BookOpen className="h-4 w-4" /></span>
          Ompath Study
        </Link>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {links.map((l) => <Link key={l.to} to={l.to} className="transition-colors hover:text-primary">{l.label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <a href="tel:+254115475543" aria-label="Call" className={icon}><Phone className="h-4 w-4" /></a>
          <a href="https://wa.me/254115475543" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className={icon}><MessageCircle className="h-4 w-4" /></a>
          <a href="mailto:hello@ompathstudy.com" aria-label="Email" className={icon}><Mail className="h-4 w-4" /></a>
        </div>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">Built by <span className="font-medium text-foreground">Abongo</span> · © {new Date().getFullYear()} Ompath Study</p>
      <p className="pb-5 pt-1 text-center text-[10px] text-muted-foreground/70">Made for medical students.</p>
    </footer>
  );
}
