import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, ChevronDown } from "lucide-react";
import { buildBlogPath, getCategoryDisplayName, getContentKind, type Article } from "@/lib/store";
import { getYear3Semester } from "@/lib/year3Semesters";

/** Same look as the Year 4 "Study notes" card: units in timetable order, each split into Notes / MCQs / CATs / Past papers. */

const GROUPS = ["Notes", "MCQs", "Essays & SAQs", "CATs", "Past papers"] as const;
type Group = (typeof GROUPS)[number];

const UNIT_ALIAS: Record<string, string> = {
  "Head and Neck Pathology": "Head & Neck Pathology",
  "Chemical Pathology": "Chemical Pathology I",
  "Exam Hematology": "Hematopathology",
  "EXAM: MEDICAL MICROBIOLOGY III": "Medical Microbiology and Parasitology",
};

function groupOf(a: Article): Group {
  const kind = getContentKind(a.title, a.category, a.content_type || "");
  if (kind === "CAT") return "CATs";
  if (kind === "Exam") return "Past papers";
  if (kind === "MCQ") return "MCQs";
  if (kind === "Essay / SAQ") return "Essays & SAQs";
  return "Notes";
}

function unitOf(a: Article): string {
  const raw = getCategoryDisplayName(a.category).replace(/\s+/g, " ").trim();
  return UNIT_ALIAS[raw] ?? raw;
}

interface UnitBlock { unit: string; total: number; groups: { group: Group; items: Article[] }[] }

function buildUnits(list: Article[]): UnitBlock[] {
  const by = new Map<string, Article[]>();
  for (const a of list) {
    const u = unitOf(a);
    if (!u || u === "Reference" || /aponeurosis/i.test(u)) continue;
    by.set(u, [...(by.get(u) ?? []), a]);
  }
  return [...by.entries()]
    .map(([unit, items]) => ({
      unit,
      total: items.length,
      groups: GROUPS.map((group) => ({
        group,
        items: items.filter((a) => groupOf(a) === group).sort((x, y) => x.title.localeCompare(y.title, undefined, { numeric: true })),
      })).filter((g) => g.items.length),
    }))
    .sort((a, b) => a.unit.localeCompare(b.unit));
}

function UnitCard({ block, from }: { block: UnitBlock; from: string }) {
  return (
    <details className="group mt-2 rounded-xl border border-border bg-background first:mt-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="text-[11px] font-bold uppercase tracking-wide text-primary">{block.unit}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">{block.total}<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></span>
      </summary>
      <div className="px-4 pb-3">
        {block.groups.map((g) => (
          <div key={g.group} className="mt-1.5">
            <p className="text-xs font-semibold text-muted-foreground">{g.group}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {g.items.map((a) => (
                <Link key={a.id} to={buildBlogPath(a)} state={{ from }} className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary">
                  {a.title.replace(/\s+[—-]\s+(Past Paper Questions & Answers|CAT)$/i, "")}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

export default function YearUnitNotes({ year, articles }: { year: 2 | 3; articles: Article[] }) {
  const location = useLocation();
  const from = `${location.pathname}${location.search}`;
  const sections = useMemo(() => {
    const own = articles.filter((a) => a.category.startsWith(`Year ${year}`));
    if (year === 2) return [{ heading: "", units: buildUnits(own) }];
    const sems: { heading: string; units: UnitBlock[] }[] = [];
    for (const s of [1, 2, 3] as const) {
      const inSem = own.filter((a) => (getYear3Semester(unitOf(a)) ?? getYear3Semester(getCategoryDisplayName(a.category))) === s);
      sems.push({ heading: `Semester ${s}`, units: buildUnits(inSem) });
    }
    const placed = new Set(sems.flatMap((s) => s.units.map((u) => u.unit)));
    const rest = buildUnits(own.filter((a) => !placed.has(unitOf(a))));
    if (rest.length) sems.push({ heading: "Other", units: rest });
    return sems;
  }, [articles, year]);

  if (!sections.some((s) => s.units.length)) return null;
  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-bold text-foreground"><BookOpen className="h-4 w-4 text-primary" /> Study notes for Year {year}</h2>
      {sections.filter((s) => s.units.length).map((s) => (
        <div key={s.heading || "all"} className="mt-4 first:mt-0">
          {s.heading && <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{s.heading}</p>}
          {s.units.map((u) => <UnitCard key={u.unit} block={u} from={from} />)}
        </div>
      ))}
    </section>
  );
}
