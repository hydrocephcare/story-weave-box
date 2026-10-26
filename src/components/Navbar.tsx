import { useTrack, type Track } from "@/lib/courseTrack";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, GraduationCap, Home, LayoutDashboard, Network, Stethoscope, Menu, Trophy, ChevronRight, UserRound, Target, Database, Smartphone, ListChecks, Pill, Flame, ChevronDown, ChevronLeft, BookMarked, PenLine } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import ThemeToggle from "./ThemeToggle";
import NotificationsBell from "./NotificationsBell";
import HeaderSearch from "./HeaderSearch";
import TrackSwitch from "./TrackSwitch";
import paperCategories from "@/data/dentalCategories.json";
import { SECTIONS } from "@/lib/sections";
import { useAuth } from "@/hooks/useAuth";
import { useAllYears, useMyYear } from "@/hooks/useMyYear";

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

type Leaf = { to: string; label: string; icon: typeof Home; children?: { to: string; label: string }[] };
type Group = { label: string; items: Leaf[] };

/** The whole menu as a tree: hover a heading for its list, hover an item with an arrow for its own list. On phones the same tree folds open in the side menu. */
function buildMenu(isAdmin: boolean, years: readonly number[] = YEAR_OPTIONS, track: Track = "medicine"): Group[] {
  // the dental section is a separate site: its own short menu, none of the medical menus
  if (track !== "medicine") {
    const sec = SECTIONS.find((s) => s.slug === track) ?? SECTIONS[0];
    const cats = (paperCategories as { slug: string; name: string }[]).filter((c) => sec.categories.includes(c.slug) && c.slug !== "other-units");
    const more: Leaf[] = [{ to: "/account", label: "Account", icon: UserRound }];
    if (isAdmin) more.push({ to: "/admin", label: "Admin", icon: Database });
    return [
      { label: sec.name, items: [{ to: `/${sec.slug}`, label: `${sec.name} home`, icon: Home }, { to: `/${sec.slug}/papers`, label: "All past papers", icon: ListChecks }] },
      ...(cats.length > 1 ? [{ label: "Subjects", items: cats.map((c) => ({ to: `/${sec.slug}/category/${c.slug}`, label: c.name, icon: BookOpen })) }] : []),
      { label: "More", items: more },
    ];
  }
  const groups: Group[] = [
    { label: "Study", items: [
      { to: "/blog", label: "Notes", icon: BookOpen, children: [{ to: "/blog", label: "All notes" }, ...years.map((y) => ({ to: `/year/${y}`, label: `Year ${y}` }))] },
      { to: "/topics", label: "Topics A–Z", icon: Network },
      { to: "/pharmacology", label: "Pharmacology", icon: Pill },
      { to: "/papers", label: "Past papers", icon: ListChecks },
      { to: "/books", label: "Books", icon: BookMarked },
    ] },
    { label: "Practice", items: [
      { to: "/mcqs", label: "MCQs", icon: ListChecks },
      { to: "/exams", label: "Exams", icon: Trophy },
      { to: "/flashcards", label: "Flashcards", icon: GraduationCap },
      { to: "/flashcards/today", label: "Daily review", icon: Flame },
      { to: "/pharmacology/quiz", label: "Drug quiz", icon: Pill },
      { to: "/must-knows", label: "Must-Knows", icon: ListChecks },
      { to: "/clinical", label: "Clinical Sim", icon: Stethoscope },
      { to: "/daily", label: "Daily Dose", icon: Flame },
    ] },
    { label: "My study", items: [
      { to: "/my-revision", label: "Revision", icon: Target },
      { to: "/dashboard", label: "My Day", icon: LayoutDashboard },
      { to: "/study-map", label: "Study Map", icon: Network },
    ] },
    { label: "Community", items: [
      { to: "/stories", label: "Stories", icon: PenLine },
      { to: "/contests", label: "Mega Contest", icon: Trophy },
    ] },
  ];
  const more: Leaf[] = [
    { to: "/account", label: "Account", icon: UserRound },
    { to: "/download-app", label: "Download APK", icon: Smartphone },
  ];
  if (isAdmin) more.push({ to: "/admin", label: "Admin", icon: Database, children: [{ to: "/admin", label: "Dashboard" }, { to: "/admin/study-system", label: "Study System" }, { to: "/admin/contests", label: "Contest Admin" }] });
  groups.push({ label: "More", items: more });
  return groups;
}

const panel = "rounded-xl border border-white/10 bg-[hsl(174,62%,18%)] p-1.5 shadow-xl";
const row = (on: boolean) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${on ? "bg-white/20" : "text-white/80 hover:bg-white/10 hover:text-white"}`;

function HoverMenu({ group, isActive, last }: { group: Group; isActive: (to: string) => boolean; last?: boolean }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number>();
  const ref = useRef<HTMLDivElement>(null);
  const enter = () => { window.clearTimeout(timer.current); setOpen(true); };
  const leave = () => { timer.current = window.setTimeout(() => setOpen(false), 140); };
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const anyActive = group.items.some((i) => isActive(i.to) || i.children?.some((c) => c.to !== i.to && isActive(c.to)));
  return (
    <div className="relative" ref={ref} onMouseEnter={enter} onMouseLeave={leave}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${anyActive || open ? "bg-white/20" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>{group.label} <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} /></button>
      {open && (
        <div className={`absolute top-full z-50 pt-1.5 ${last ? "right-0" : "left-0"}`}>
          <ul role="menu" className={`w-56 ${panel}`}>
            {group.items.map((i) => i.children ? (
              <li key={i.to} className="group/sub relative">
                <Link to={i.to} role="menuitem" onClick={() => setOpen(false)} className={row(isActive(i.to))}><i.icon className="h-4 w-4 shrink-0 opacity-80" /> {i.label} {last ? <ChevronLeft className="ml-auto h-3.5 w-3.5 opacity-60" /> : <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" />}</Link>
                <div className={`invisible absolute top-0 opacity-0 group-hover/sub:visible group-hover/sub:opacity-100 group-focus-within/sub:visible group-focus-within/sub:opacity-100 ${last ? "right-full pr-1.5" : "left-full pl-1.5"}`}>
                  <ul role="menu" className={`w-44 ${panel}`}>{i.children.map((c) => <li key={c.label}><Link to={c.to} role="menuitem" onClick={() => setOpen(false)} className={row(false)}>{c.label}</Link></li>)}</ul>
                </div>
              </li>
            ) : (
              <li key={i.to}><Link to={i.to} role="menuitem" onClick={() => setOpen(false)} className={row(isActive(i.to))}><i.icon className="h-4 w-4 shrink-0 opacity-80" /> {i.label}</Link></li>
            ))}
          </ul>
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

  const { year: myYear } = useMyYear();
  const [allYears, setAllYears] = useAllYears();
  // a student with a chosen year sees only that year in the menu, unless "All years" is switched on
  const scopedYear = myYear && !allYears ? myYear : null;
  const track = useTrack();
  const menu = useMemo(() => buildMenu(isAdmin, scopedYear ? [scopedYear] : YEAR_OPTIONS, track), [isAdmin, scopedYear, track]);

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
        <div className="mx-auto flex w-full max-w-[1680px] min-w-0 items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-6">
          <Link to="/" className="flex min-w-0 shrink items-center gap-1.5 overflow-hidden text-lg font-bold text-white sm:shrink-0 sm:gap-2">
            <img src="/brand/mark-dark.png" alt="" width="40" height="40" className="h-8 w-8 shrink-0 object-contain sm:h-10 sm:w-10" decoding="async" />
            <span className="brand-word whitespace-nowrap text-[clamp(0.95rem,4.6vw,1.2rem)] leading-none sm:text-xl">Ompath<span className="text-[#5eead4]">Study</span></span>
          </Link>

          <div className="hidden min-w-0 items-center gap-1 lg:flex">
            <div className="mr-2 flex items-center gap-0.5 rounded-lg bg-white/10 p-0.5">
              {(scopedYear ? [scopedYear] : YEAR_OPTIONS).map((yr) => (
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
              {myYear && (
                <button type="button" onClick={() => setAllYears(!allYears)} className="ml-0.5 rounded-md px-2 py-1 text-[11px] font-semibold text-white/80 underline-offset-2 hover:bg-white/10 hover:text-white hover:underline" title={allYears ? `Show only Year ${myYear}` : "Browse every year"}>
                  {allYears ? `Only Y${myYear}` : "All years"}
                </button>
              )}
            </div>

            <HeaderSearch variant="desktop" />
            <TrackSwitch />

            {menu.map((g, i) => <HoverMenu key={g.label} group={g} isActive={isActive} last={i === menu.length - 1} />)}
            <NotificationsBell />
            <ThemeToggle />
          </div>

          <div className="flex shrink-0 items-center gap-0.5 lg:hidden sm:gap-2">
            <HeaderSearch variant="desktop" />
            <NotificationsBell />
            <ThemeToggle />
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <button className="shrink-0 rounded-md p-1.5 text-white" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="!w-[min(86vw,20rem)] !max-w-none bg-[hsl(174,62%,16%)] border-r-0 p-0 text-white [&>button]:text-white">
                <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4">
                  <img src="/brand/mark-dark.png" alt="" width="40" height="40" className="h-10 w-auto object-contain" decoding="async" />
                  <span className="brand-word text-xl leading-none">Ompath<span className="text-[#5eead4]">Study</span></span>
                </div>

                <div className="flex flex-col overflow-y-auto overscroll-contain pb-24 h-[calc(100dvh-65px)]">
                  <div className="border-b border-white/10 px-3 py-3">
                    <TrackSwitch className="mb-3" onSwitch={() => setSidebarOpen(false)} />
                    <HeaderSearch variant="mobile" onNavigate={() => setSidebarOpen(false)} />
                  </div>

                  <div className="border-b border-white/10 px-3 py-3">
                    <Link to="/" onClick={() => setSidebarOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${location.pathname === "/" ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}><Home className="h-4 w-4" /> Home</Link>
                    {menu.map((g) => (
                      <details key={g.label} className="group" open={g.items.some((i) => isActive(i.to))}>
                        <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10 [&::-webkit-details-marker]:hidden">{g.label}<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary>
                        <div className="ml-3 border-l border-white/10 pl-2">
                          {g.items.map((l) => (
                            <Link key={l.to} to={l.to} onClick={() => setSidebarOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive(l.to) ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}><l.icon className="h-4 w-4" /> {l.label}</Link>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>

                  <div className="border-b border-white/10 px-3 py-3">
                    <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-white/40">{scopedYear ? "Your year" : "Academic years"}</p>
                    <div className={scopedYear ? "grid grid-cols-1 gap-1.5" : "grid grid-cols-6 gap-1.5"}>
                      {(scopedYear ? [scopedYear] : YEAR_OPTIONS).map((yr) => (
                        <Link
                          key={yr}
                          to={`/year/${yr}`}
                          onClick={() => setSidebarOpen(false)}
                          aria-label={`Year ${yr}`}
                          className={`rounded-lg py-2 text-center text-sm font-bold transition-colors ${activeYear === yr ? "bg-white/20 text-white" : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"}`}
                        >
                          {scopedYear ? `Year ${yr}` : yr}
                        </Link>
                      ))}
                    </div>
                    {myYear && (
                      <button type="button" onClick={() => setAllYears(!allYears)} className="mt-2 w-full rounded-lg bg-white/5 py-2 text-center text-xs font-bold text-white/80 hover:bg-white/10">
                        {allYears ? `Show only Year ${myYear}` : "Browse all years"}
                      </button>
                    )}
                  </div>

                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

      </nav>
    </>
  );
}
