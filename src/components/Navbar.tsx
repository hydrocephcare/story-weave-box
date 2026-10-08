import { Link, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, GraduationCap, Home, LayoutDashboard, Network, Stethoscope, Menu, Trophy, ChevronRight, UserRound, Target, Database, Smartphone, ListChecks, Pill, Flame, ChevronDown, BookMarked } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import ThemeToggle from "./ThemeToggle";
import NotificationsBell from "./NotificationsBell";
import HeaderSearch from "./HeaderSearch";
import { useAuth } from "@/hooks/useAuth";

const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
const STORAGE_KEY = "nav_year_filter";

const YEAR_SECTIONS = [
  { label: "Blog", path: "blog", icon: BookOpen },
  { label: "Flashcards", path: "flashcards", icon: GraduationCap },
  { label: "Exams", path: "exams", icon: Trophy },
];

function getActiveYear(pathname: string, search: string): number | null {
  const yearRoute = pathname.match(/^\/year\/(\d)$/);
  if (yearRoute) return Number(yearRoute[1]);
  const qp = new URLSearchParams(search).get("year");
  if (qp) {
    const m = qp.match(/Year\s(\d)/);
    if (m) return Number(m[1]);
  }
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored && stored !== "All") {
    const m = stored.match(/Year\s(\d)/);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Secondary links live in a dropdown so the bar never overflows on laptop screens. */
function MoreMenu({ links, isActive }: { links: { to: string; label: string; icon: typeof Home }[]; isActive: (to: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const anyActive = links.some((l) => isActive(l.to));
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${anyActive || open ? "bg-white/20" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>More <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} /></button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-white/10 bg-[hsl(174,62%,18%)] p-1.5 shadow-xl">
          {links.map((l) => <Link key={l.to} to={l.to} role="menuitem" onClick={() => setOpen(false)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${isActive(l.to) ? "bg-white/20" : "text-white/80 hover:bg-white/10 hover:text-white"}`}><l.icon className="h-4 w-4 shrink-0 opacity-80" /> {l.label}</Link>)}
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);

  const links = useMemo(() => {
    const base: { to: string; label: string; icon: typeof Home; more?: boolean; /** also shown in the phone menu's main list */ pin?: boolean }[] = [
      { to: "/", label: "Home", icon: Home },
      { to: "/blog", label: "Notes", icon: BookOpen },
      { to: "/exams", label: "Exams", icon: Trophy },
      { to: "/flashcards", label: "Flashcards", icon: GraduationCap },
      { to: "/my-revision", label: "Revision", icon: Target, more: true },
      { to: "/dashboard", label: "My Day", icon: LayoutDashboard, more: true },
      { to: "/study-map", label: "Study Map", icon: Network, more: true },
      { to: "/clinical", label: "Clinical Sim", icon: Stethoscope, more: true },
      { to: "/pharmacology", label: "Pharmacology", icon: Pill, more: true },
      { to: "/must-knows", label: "Must-Knows", icon: ListChecks, more: true },
      { to: "/daily", label: "Daily Dose", icon: Flame, more: true },
      { to: "/books", label: "Books", icon: BookMarked },
      { to: "/papers", label: "Past papers", icon: ListChecks, more: true, pin: true },
      { to: "/revision-index", label: "Exam Revision", icon: ListChecks, more: true },
      { to: "/contests", label: "Mega Contest", icon: Trophy, more: true },
      { to: "/account", label: "Account", icon: UserRound, more: true },
      { to: "/download-app", label: "Download APK", icon: Smartphone, more: true },
    ];
    if (isAdmin) {
      base.push({ to: "/admin", label: "Dashboard", icon: LayoutDashboard, more: true });
      base.push({ to: "/admin/study-system", label: "Study System", icon: Database, more: true });
      base.push({ to: "/admin/contests", label: "Contest Admin", icon: Trophy, more: true });
    }
    return base;
  }, [isAdmin]);

  const isExamPage = /^\/exams\/[^/]+\/start/.test(location.pathname);

  const activeYear = useMemo(
    () => getActiveYear(location.pathname, location.search),
    [location.pathname, location.search]
  );

  useEffect(() => {
    if (activeYear) setExpandedYear(activeYear);
  }, [activeYear]);

  useEffect(() => {
    if (activeYear) {
      sessionStorage.setItem(STORAGE_KEY, `Year ${activeYear}`);
    }
  }, [activeYear]);

  useEffect(() => {
    let lastY = Math.max(0, window.scrollY);
    let direction: "up" | "down" | null = null;
    let distance = 0;
    let ticking = false;

    const updateHeader = () => {
      const nextY = Math.max(0, window.scrollY);
      const delta = nextY - lastY;
      const nextDirection = delta > 0 ? "down" : delta < 0 ? "up" : direction;

      if (nextY <= 32 || sidebarOpen) {
        setHidden(false);
        distance = 0;
      } else if (nextDirection) {
        if (nextDirection !== direction) distance = 0;
        direction = nextDirection;
        distance += Math.abs(delta);
        if (distance >= 12) {
          setHidden(direction === "down");
          distance = 0;
        }
      }

      lastY = nextY;
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateHeader);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sidebarOpen]);

  const selectYear = (yr: number | null) => {
    if (!yr) {
      sessionStorage.setItem(STORAGE_KEY, "All");
      navigate("/");
    } else {
      sessionStorage.setItem(STORAGE_KEY, `Year ${yr}`);
      navigate(`/year/${yr}`);
    }
  };

  const activeSection = useMemo(() => {
    for (const s of YEAR_SECTIONS) {
      if (location.pathname.startsWith(`/${s.path}`)) return s.path;
    }
    if (location.pathname.match(/^\/blog\//)) return "blog";
    return null;
  }, [location.pathname]);

  const isActive = (to: string) => location.pathname === to || location.pathname.startsWith(`${to}/`);

  if (isExamPage) return null;

  return (
    <>
      <nav className={`sticky top-0 z-40 border-b border-border bg-[hsl(174,62%,22%)] text-white transition-[transform,opacity] duration-300 ease-out will-change-transform ${hidden ? "-translate-y-full opacity-0 pointer-events-none" : "translate-y-0 opacity-100 pointer-events-auto"}`}>
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2 text-lg font-bold text-white">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg">
              <img src="/brand/ompath-study.svg" alt="Ompath Study logo" width="32" height="32" className="h-full w-full object-contain" decoding="async" />
            </div>
            <span className="font-serif">Ompath Study</span>
          </Link>

          <div className="hidden min-w-0 items-center gap-1 lg:flex">
            <div className="mr-2 flex items-center gap-0.5 rounded-lg bg-white/10 p-0.5">
              {YEAR_OPTIONS.map((yr) => (
                <button
                  key={yr}
                  onClick={() => selectYear(activeYear === yr ? null : yr)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                    activeYear === yr
                      ? "bg-white text-[hsl(174,62%,22%)] shadow-sm"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  Y{yr}
                </button>
              ))}
            </div>

            <HeaderSearch variant="desktop" />

            {links.filter((l) => !l.more && l.to !== "/").map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive(l.to) ? "bg-white/20" : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <MoreMenu links={links.filter((l) => l.more)} isActive={isActive} />
            <NotificationsBell />
            <ThemeToggle />
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <HeaderSearch variant="desktop" />
            <NotificationsBell />
            <ThemeToggle />
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <button className="p-1 text-white" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-[hsl(174,62%,16%)] border-r-0 p-0 text-white [&>button]:text-white">
                <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4">
                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg">
                    <img src="/brand/ompath-study.svg" alt="Ompath Study logo" width="32" height="32" className="h-full w-full object-contain" decoding="async" />
                  </div>
                  <span className="font-serif text-lg font-bold">Ompath Study</span>
                </div>

                <div className="flex flex-col overflow-y-auto h-[calc(100%-65px)]">
                  <div className="border-b border-white/10 px-3 py-3">
                    <HeaderSearch variant="mobile" onNavigate={() => setSidebarOpen(false)} />
                  </div>

                  <div className="border-b border-white/10 px-3 py-3">
                    {links.filter((l) => !l.more || l.pin).map((l) => (
                      <Link
                        key={l.to}
                        to={l.to}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive(l.to) ? "bg-white/15 text-white" : "text-white/70 hover:text-white hover:bg-white/10"}`}
                      >
                        <l.icon className="h-4 w-4" />
                        {l.label}
                      </Link>
                    ))}
                  </div>

                  <div className="border-b border-white/10 px-3 py-3">
                    <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-white/40">Academic years</p>
                    <div className="grid grid-cols-6 gap-1.5">
                      {YEAR_OPTIONS.map((yr) => (
                        <Link
                          key={yr}
                          to={`/year/${yr}`}
                          onClick={() => setSidebarOpen(false)}
                          aria-label={`Year ${yr}`}
                          className={`rounded-lg py-2 text-center text-sm font-bold transition-colors ${activeYear === yr ? "bg-white/20 text-white" : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"}`}
                        >
                          {yr}
                        </Link>
                      ))}
                    </div>
                  </div>

                  <details className="group px-3 py-3" open={links.some((l) => l.more && !l.pin && isActive(l.to))}>
                    <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-1 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40 [&::-webkit-details-marker]:hidden">
                      More tools
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="mt-2">
                      {links.filter((l) => l.more && !l.pin).map((l) => (
                      <Link
                        key={l.to}
                        to={l.to}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive(l.to) ? "bg-white/15 text-white" : "text-white/70 hover:text-white hover:bg-white/10"}`}
                      >
                        <l.icon className="h-4 w-4" />
                        {l.label}
                      </Link>
                      ))}
                    </div>
                  </details>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

      </nav>
    </>
  );
}
