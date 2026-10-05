import { BookOpen } from "lucide-react";

const SPINES = [
  { h: 72, c: "from-teal-600 to-teal-800" },
  { h: 88, c: "from-sky-500 to-indigo-700" },
  { h: 64, c: "from-amber-500 to-orange-700" },
  { h: 96, c: "from-rose-500 to-red-800" },
  { h: 78, c: "from-violet-500 to-purple-800" },
  { h: 84, c: "from-emerald-500 to-green-800" },
  { h: 68, c: "from-cyan-500 to-blue-800" },
  { h: 92, c: "from-fuchsia-500 to-pink-800" },
  { h: 76, c: "from-lime-500 to-green-700" },
];

/** Shown while the book list loads: a row of books setting themselves on a shelf, over a shimmering outline of the page. */
export default function ShelvesLoading() {
  return (
    <div className="min-h-[65vh] bg-background" role="status" aria-live="polite" aria-label="Loading the shelves">
      <section className="border-b border-border bg-gradient-to-br from-primary/8 via-background to-background">
        <div className="mx-auto max-w-6xl space-y-3 px-4 py-6 sm:px-5 sm:py-8">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary"><BookOpen className="h-3.5 w-3.5" /> Reference books</p>
          <div className="h-8 w-2/3 max-w-md animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-1/2 max-w-sm animate-pulse rounded bg-muted/70" />
          <div className="h-11 max-w-xl animate-pulse rounded-lg bg-muted/70" />
        </div>
      </section>

      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 pb-6 pt-10 sm:px-5">
        <div className="flex h-28 items-end gap-1.5">
          {SPINES.map((s, i) => (
            <span
              key={i}
              className={`block w-5 rounded-t-[3px] bg-gradient-to-b shadow-sm sm:w-6 ${s.c}`}
              style={{ height: s.h, animation: "shelf-rise 1.6s ease-in-out infinite", animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>
        <div className="h-2 w-72 max-w-full rounded-full bg-gradient-to-r from-amber-900/70 via-amber-700/70 to-amber-900/70 shadow" />
        <p className="mt-4 text-sm font-semibold text-foreground">Setting out the shelves…</p>
        <p className="mt-1 text-xs text-muted-foreground">Years, subjects and thousands of books, sorted for you.</p>
      </div>

      <div className="mx-auto grid max-w-6xl gap-3 px-4 pb-10 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-card" style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    </div>
  );
}
