import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BookOpen, Check, ChevronRight, Search, Share2, Star } from "lucide-react";
import DriveFileViewer, { thumbUrl, type DriveFile } from "@/components/DriveFileViewer";
import { startDownload } from "@/lib/driveDownload";
import { updateMetaTags } from "@/lib/seo";
import { addRecentBook, toggleBookRead, toggleSavedBook, useBookShelf, type ShelfBook } from "@/lib/bookShelf";

type Book = [id: string, name: string, type: number];
interface Subject { name: string; b: number[]; units: string[]; also: number[] }
interface Shelf { key: string; label: string; blurb: string; subjects: Subject[] }
interface Data { types: string[]; books: Book[]; shelves: Shelf[]; /** Book ids with a cover rendered into public/covers. */ local?: string[] }

const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const YEAR_KEY = (y: number) => `year-${y}`;
const TYPE_HINT = ["Core reading and deep reference", "Short, exam-focused summaries", "Pocket guides for the wards", "Worked patient cases", "Practice questions and OSCE prep", "Images, atlases and flashcards"];

function useBooks() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let on = true;
    fetch(`${import.meta.env.BASE_URL}data/books.json`).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }).then((d: Data) => { if (on) setData(d); }).catch(() => { if (on) setError(true); });
    return () => { on = false; };
  }, []);
  return { data, error };
}

// A title cover for books Drive cannot preview: one colour per book type so a shelf still reads at a glance.
const TILE = ["from-teal-700 to-teal-900", "from-sky-600 to-indigo-800", "from-amber-600 to-orange-800", "from-rose-600 to-red-900", "from-violet-600 to-purple-900", "from-emerald-600 to-green-900"];

/** The book's cover before you open it: our own rendered cover if we have one, else Drive's preview, else a title tile. */
function Cover({ id, title, type, local }: { id: string; title: string; type: number; local: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = local ? `${import.meta.env.BASE_URL}covers/${encodeURIComponent(id)}.jpg` : thumbUrl(id, 200);
  return (
    <span className={`relative flex h-24 w-[4.2rem] shrink-0 flex-col justify-between overflow-hidden rounded-md border border-border bg-gradient-to-br p-1.5 shadow-sm ${TILE[type % TILE.length]}`}>
      <BookOpen className="h-3.5 w-3.5 text-white/70" aria-hidden />
      <span className="line-clamp-5 text-[9px] font-bold leading-tight text-white">{title}</span>
      {!failed && (
        <img src={src} alt={`Cover of ${title}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover object-top" />
      )}
    </span>
  );
}

function Crumbs({ trail }: { trail: { to?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-semibold text-muted-foreground">
      {trail.map((t, i) => (
        <span key={t.label} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          {t.to ? <Link to={t.to} className="hover:text-primary">{t.label}</Link> : <span className="text-foreground">{t.label}</span>}
        </span>
      ))}
    </nav>
  );
}

function Header({ title, blurb, trail, children }: { title: string; blurb?: string; trail: { to?: string; label: string }[]; children?: React.ReactNode }) {
  return (
    <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background">
      <div className="mx-auto max-w-5xl space-y-2 px-4 py-6 sm:px-5 sm:py-9">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"><BookOpen className="h-4 w-4" /> Reference books</p>
        <Crumbs trail={trail} />
        <h1 className="font-serif text-2xl font-bold text-foreground sm:text-4xl">{title}</h1>
        {blurb && <p className="max-w-2xl text-sm text-muted-foreground">{blurb}</p>}
        {children}
      </div>
    </section>
  );
}

const PATH_STEPS = [
  { type: 1, title: "1 · Get the overview", hint: "A short book to see the whole subject first" },
  { type: 0, title: "2 · Go deep", hint: "The main textbook, read alongside your lectures" },
  { type: 3, title: "3 · See it in patients", hint: "Worked cases to join theory to practice" },
  { type: 4, title: "4 · Test yourself", hint: "Questions to find what you do not know yet" },
];

/** Three or four books in a sensible order for one subject, with a tick for each one you have finished. */
function ReadingPath({ data, subject, onOpen, local }: { data: Data; subject: Subject; onOpen: (bookIndex: number) => void; local: Set<string> }) {
  const { read } = useBookShelf();
  const steps = PATH_STEPS.map((st) => ({ st, i: subject.b.find((i) => data.books[i][2] === st.type) })).filter((x): x is { st: typeof PATH_STEPS[number]; i: number } => x.i !== undefined);
  if (steps.length < 2) return null;
  const done = steps.filter((x) => read.has(data.books[x.i][0])).length;
  return (
    <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg font-bold text-foreground">Reading path</h2>
        <span className="text-xs font-bold text-primary">{done} of {steps.length} done</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">If you do not know where to start, read these in order.</p>
      <ol className="grid gap-2 sm:grid-cols-2">
        {steps.map(({ st, i }) => {
          const b = data.books[i]; const isDone = read.has(b[0]);
          return (
            <li key={st.type} className={`flex items-start gap-3 rounded-xl border p-2.5 ${isDone ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card"}`}>
              <button type="button" onClick={() => onOpen(subject.b.indexOf(i))} className="flex min-w-0 flex-1 items-start gap-3 text-left" aria-label={`Open ${b[1]}`}>
                <Cover id={b[0]} title={b[1]} type={b[2]} local={local.has(b[0])} />
                <span className="min-w-0"><span className="block text-[11px] font-bold uppercase tracking-wide text-primary">{st.title}</span><span className="block text-[13.5px] font-semibold leading-snug text-foreground">{b[1]}</span><span className="block text-[11px] text-muted-foreground">{st.hint}</span></span>
              </button>
              <button type="button" onClick={() => toggleBookRead(b[0])} aria-pressed={isDone} aria-label={isDone ? "Mark as not finished" : "Mark as finished"} className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${isDone ? "border-emerald-600 bg-emerald-600 text-white" : "border-border text-transparent hover:border-primary"}`}><Check className="h-4 w-4" /></button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Saved and recently opened books, shown at the top of the Books page. */
function MyBooks({ local }: { local: Set<string> }) {
  const { saved, recent } = useBookShelf();
  const [view, setView] = useState<{ list: ShelfBook[]; index: number } | null>(null);
  const lists = [{ title: "Saved books", icon: Star, list: saved }, { title: "Recently opened", icon: BookOpen, list: recent }].filter((l) => l.list.length);
  if (!lists.length) return null;
  return (
    <div className="mb-6 space-y-4">
      {lists.map((l) => (
        <section key={l.title}>
          <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><l.icon className="h-3.5 w-3.5 text-primary" /> {l.title} ({l.list.length})</h2>
          <ul className="-mx-4 flex gap-3 no-scrollbar overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {l.list.slice(0, 12).map((b, k) => (
              <li key={b.id} className="w-[4.6rem] shrink-0">
                <button type="button" onClick={() => setView({ list: l.list, index: k })} className="block w-full text-left" aria-label={`Open ${b.name}`}>
                  <Cover id={b.id} title={b.name} type={b.type} local={local.has(b.id)} />
                  <span className="mt-1 line-clamp-2 block text-[10.5px] font-semibold leading-tight text-foreground">{b.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <DriveFileViewer items={(view?.list ?? []).map((b): DriveFile => [b.id, b.name, "pdf"])} index={view ? view.index : null} onIndexChange={(n) => setView((v) => (v && n !== null ? { ...v, index: n } : null))} onDownload={(f) => startDownload(f[0], f[1])} where="Books" />
    </div>
  );
}

/** Books shelved by year, then subject, then type. The year and subject follow the MKU timetable unit codes. */
export default function BooksPage() {
  const { shelf: shelfKey, subject: subjectKey } = useParams();
  const { data, error } = useBooks();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [viewing, setViewing] = useState<number | null>(null);
  const [q, setQ] = useState(params.get("q") ?? "");
  const { saved } = useBookShelf();
  const [shared, setShared] = useState(false);

  useEffect(() => { updateMetaTags({ title: "Medical books by year and subject | Ompath Study", description: "Textbooks, handbooks, atlases and question banks shelved by MBChB year, subject and type." }); }, []);
  useEffect(() => { setViewing(null); window.scrollTo({ top: 0 }); }, [shelfKey, subjectKey]);

  const shelf = data?.shelves.find((s) => s.key === shelfKey);
  const subject = shelf?.subjects.find((s) => slug(s.name) === subjectKey);

  const localCovers = useMemo(() => new Set(data?.local ?? []), [data]);

  const hits = useMemo(() => {
    if (!data || q.trim().length < 2) return null;
    const needles = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out: { book: Book; where: string }[] = [];
    const seen = new Set<string>();
    for (const sh of data.shelves) for (const sub of sh.subjects) for (const i of sub.b) {
      const b = data.books[i];
      if (seen.has(b[0])) continue;
      if (needles.every((w) => `${b[1]} ${sub.name}`.toLowerCase().includes(w))) { seen.add(b[0]); out.push({ book: b, where: `${sh.label} · ${sub.name}` }); }
    }
    return out;
  }, [data, q]);

  const bookList: { book: Book; where?: string }[] = useMemo(() => {
    if (!data) return [];
    if (hits) return hits;
    if (subject) return subject.b.map((i) => ({ book: data.books[i] }));
    return [];
  }, [data, hits, subject]);
  const items: DriveFile[] = bookList.map((r) => [r.book[0], r.book[1], "pdf"]);

  if (error) return <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">The book list could not load. Check your connection and refresh.</div>;
  if (!data) return <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">Loading the shelves…</div>;
  if (shelfKey && !shelf) return <Navigate to="/books" replace />;
  if (subjectKey && shelf && !subject) return <Navigate to={`/books/${shelf.key}`} replace />;

  const searchBox = (
    <div className="relative mt-3 max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input value={q} onChange={(e) => { setQ(e.target.value); setViewing(null); }} placeholder="Search every book, e.g. Kumar, atlas, ECG" aria-label="Search books" className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-3 text-[14.5px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25" />
    </div>
  );

  const viewer = <DriveFileViewer items={items} index={viewing} onIndexChange={setViewing} onDownload={(f) => startDownload(f[0], f[1])} where="Books" />;
  const open = (i: number) => { setViewing(i); const b = bookList[i]?.book; if (b) addRecentBook({ id: b[0], name: b[1], type: b[2] }); };
  const bookRow = (r: { book: Book; where?: string }, i: number) => (
    <li key={r.book[0]} className="relative">
      <button type="button" onClick={() => toggleSavedBook({ id: r.book[0], name: r.book[1], type: r.book[2] })} aria-pressed={saved.some((x) => x.id === r.book[0])} aria-label={saved.some((x) => x.id === r.book[0]) ? "Remove from saved books" : "Save this book"} className="absolute right-2 top-2 z-10 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-amber-500"><Star className={`h-4 w-4 ${saved.some((x) => x.id === r.book[0]) ? "fill-amber-400 text-amber-500" : ""}`} /></button>
      <button type="button" onClick={() => open(i)} className="flex h-full w-full items-start gap-3 rounded-xl border border-border bg-card p-3 pr-10 text-left transition-colors hover:border-primary/50">
        <Cover id={r.book[0]} title={r.book[1]} type={r.book[2]} local={localCovers.has(r.book[0])} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[14.5px] font-semibold leading-snug text-foreground">{r.book[1]}</span>
          <span className="text-[11.5px] text-muted-foreground">{data.types[r.book[2]]}{r.where ? ` · ${r.where}` : ""}</span>
        </span>
      </button>
    </li>
  );

  // Search takes over whichever level you are on.
  if (hits) {
    return (
      <div className="min-h-[65vh] bg-background">
        <Header title="Search results" trail={[{ to: "/books", label: "Books" }, { label: "Search" }]}>{searchBox}</Header>
        <div className="mx-auto max-w-5xl space-y-3 px-4 py-6 sm:px-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{hits.length} {hits.length === 1 ? "book" : "books"} found</p>
          {hits.length === 0 && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No books match. Try a shorter search.</p>}
          <ul className="grid gap-2 sm:grid-cols-2">{bookList.map(bookRow)}</ul>
        </div>
        {viewer}
      </div>
    );
  }

  // Level 3: one subject, books grouped by type.
  if (shelf && subject) {
    const groups = data.types.map((t, ti) => ({ t, ti, ids: subject.b.filter((i) => data.books[i][2] === ti) })).filter((g) => g.ids.length);
    return (
      <div className="min-h-[65vh] bg-background">
        <Header title={subject.name} blurb={`${subject.b.length} books for ${shelf.label}.${subject.units.length ? ` Units: ${subject.units.slice(0, 3).join(", ")}${subject.units.length > 3 ? ` +${subject.units.length - 3}` : ""}.` : ""}`} trail={[{ to: "/books", label: "Books" }, { to: `/books/${shelf.key}`, label: shelf.label }, { label: subject.name }]}>
          {subject.also.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">Also studied in {subject.also.map((y) => <Link key={y} to={`/books/${YEAR_KEY(y)}/${subjectKey}`} className="rounded-full border border-border px-2.5 py-0.5 font-bold text-primary hover:border-primary/50">Year {y}</Link>)}</p>
          )}
          <nav aria-label="Jump to type" className="-mx-4 flex gap-2 no-scrollbar overflow-x-auto px-4 pt-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {groups.map((g) => <a key={g.ti} href={`#type-${g.ti}`} className="shrink-0 rounded-full border border-border bg-card px-3.5 py-1.5 text-[13px] font-bold text-muted-foreground hover:border-primary/50 hover:text-primary">{g.t} <span className="opacity-60">{g.ids.length}</span></a>)}
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={async () => { const url = window.location.href; const text = `${subject.name} books for ${shelf.label} on Ompath Study`; try { if (navigator.share) await navigator.share({ title: text, url }); else { await navigator.clipboard.writeText(`${text}: ${url}`); setShared(true); setTimeout(() => setShared(false), 1800); } } catch { /* share cancelled */ } }} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[13px] font-bold text-muted-foreground hover:border-primary/50 hover:text-primary"><Share2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{shared ? "Link copied" : "Share this shelf"}</span>{shared && <span className="sm:hidden">Copied</span>}</button>
          </div>
          {searchBox}
        </Header>
        <div className="mx-auto max-w-5xl space-y-7 px-4 py-6 sm:px-5">
          <ReadingPath data={data} subject={subject} onOpen={open} local={localCovers} />
          {groups.map((g) => (
            <section key={g.ti} id={`type-${g.ti}`} className="scroll-mt-20">
              <h2 className="font-serif text-lg font-bold text-foreground">{g.t} <span className="text-sm font-semibold text-muted-foreground">({g.ids.length})</span></h2>
              <p className="mb-2 text-xs text-muted-foreground">{TYPE_HINT[g.ti]}</p>
              <ul className="grid gap-2 sm:grid-cols-2">{g.ids.map((i) => bookRow({ book: data.books[i] }, subject.b.indexOf(i)))}</ul>
            </section>
          ))}
        </div>
        {viewer}
      </div>
    );
  }

  // Level 2: one year, subjects as cards.
  if (shelf) {
    return (
      <div className="min-h-[65vh] bg-background">
        <Header title={shelf.label} blurb={shelf.blurb} trail={[{ to: "/books", label: "Books" }, { label: shelf.label }]}>{searchBox}</Header>
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-5">
          <nav aria-label="Years" className="-mx-4 flex gap-2 no-scrollbar overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {data.shelves.map((s) => <button key={s.key} type="button" onClick={() => navigate(`/books/${s.key}`)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors ${s.key === shelf.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-primary"}`}>{s.label}</button>)}
          </nav>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shelf.subjects.map((s) => {
              const byType = data.types.map((t, ti) => ({ t, n: s.b.filter((i) => data.books[i][2] === ti).length })).filter((x) => x.n);
              return (
                <li key={s.name}>
                  <Link to={`/books/${shelf.key}/${slug(s.name)}`} className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50">
                    <span className="flex items-baseline justify-between gap-2"><span className="font-serif text-lg font-bold leading-snug text-foreground">{s.name}</span><span className="shrink-0 text-sm font-bold text-primary">{s.b.length}</span></span>
                    {s.units.length > 0 && <span className="text-[11.5px] font-semibold text-muted-foreground">{s.units.join(" · ")}</span>}
                    <span className="mt-auto flex flex-wrap gap-1.5 pt-1">{byType.map((x) => <span key={x.t} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{x.t.split(" ")[0]} {x.n}</span>)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  // Level 1: choose a year.
  return (
    <div className="min-h-[65vh] bg-background">
      <Header title="Books by year and subject" blurb="Pick your year, then a subject, then the kind of book you need. Shelved to follow the MKU timetable." trail={[{ label: "Books" }]}>{searchBox}</Header>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-5">
        <MyBooks local={localCovers} />
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.shelves.map((s) => {
            const unique = new Set(s.subjects.flatMap((x) => x.b)).size;
            return (
              <li key={s.key}>
                <Link to={`/books/${s.key}`} className="flex h-full flex-col gap-1.5 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50">
                  <span className="flex items-baseline justify-between"><span className="font-serif text-xl font-bold text-foreground">{s.label}</span><span className="text-sm font-bold text-primary">{unique} books</span></span>
                  <span className="text-[13px] text-muted-foreground">{s.blurb}</span>
                  <span className="mt-1 text-[11.5px] font-semibold text-muted-foreground">{s.subjects.slice(0, 6).map((x) => x.name.split(" (")[0]).join(" · ")}{s.subjects.length > 6 ? ` · +${s.subjects.length - 6} more` : ""}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
