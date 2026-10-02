import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Search } from "lucide-react";
import DriveFileViewer, { type DriveFile } from "@/components/DriveFileViewer";
import { startDownload } from "@/lib/driveDownload";
import { updateMetaTags } from "@/lib/seo";

type BookFile = [id: string, name: string, kind: "pdf", type: number];
interface Subject { name: string; files: BookFile[] }
interface Shelf { key: string; label: string; blurb: string; subjects: Subject[] }
interface Books { updated: string; types: string[]; shelves: Shelf[] }

const chip = (on: boolean) => `shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-primary"}`;

/** Every book from the shared Drive, shelved by year, subject and type. */
export default function BooksPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Books | null>(null);
  const [error, setError] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const q = params.get("q") ?? "";
  const shelfKey = params.get("shelf") ?? "year-1";
  const subject = params.get("subject") ?? "";
  const type = params.get("type") ?? "";

  useEffect(() => {
    updateMetaTags({ title: "Medical books by year and subject | Ompath Study", description: "Textbooks, handbooks, atlases and question banks shelved by MBChB year, subject and type." });
    let on = true;
    fetch(`${import.meta.env.BASE_URL}data/books.json`).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }).then((d: Books) => { if (on) setData(d); }).catch(() => { if (on) setError(true); });
    return () => { on = false; };
  }, []);

  const set = (next: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k); }
    setParams(p, { replace: true });
    setViewing(null);
  };

  const searching = q.trim().length > 1;
  const shelf = data?.shelves.find((s) => s.key === shelfKey) ?? data?.shelves[0];

  const rows = useMemo(() => {
    if (!data) return [];
    const needles = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out: { file: BookFile; shelf: string; subject: string }[] = [];
    for (const sh of searching ? data.shelves : shelf ? [shelf] : []) {
      for (const sub of sh.subjects) {
        if (!searching && subject && sub.name !== subject) continue;
        for (const f of sub.files) {
          if (type !== "" && String(f[3]) !== type) continue;
          if (searching && !needles.every((w) => `${f[1]} ${sub.name}`.toLowerCase().includes(w))) continue;
          out.push({ file: f, shelf: sh.label, subject: sub.name });
        }
      }
    }
    return out;
  }, [data, shelf, subject, type, q, searching]);

  const items: DriveFile[] = rows.map((r) => [r.file[0], r.file[1], "pdf"]);
  const total = data?.shelves.reduce((n, s) => n + s.subjects.reduce((m, x) => m + x.files.length, 0), 0) ?? 0;

  return (
    <div className="min-h-[65vh] bg-background">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="mx-auto max-w-5xl px-4 py-7 sm:px-5 sm:py-10">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"><BookOpen className="h-4 w-4" /> Reference books</p>
          <h1 className="mt-1 font-serif text-2xl font-bold text-foreground sm:text-4xl">Books by year and subject</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{total ? `${total} books` : "Textbooks"} shelved to follow the MKU timetable: pick your year, then a subject, then the kind of book you need.</p>
          <div className="relative mt-4 max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => set({ q: e.target.value })} placeholder="Search every book, e.g. Kumar, atlas, ECG" aria-label="Search books" className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-3 text-[14.5px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25" />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-5">
        {error && <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">The book list could not load. Check your connection and refresh.</p>}
        {!data && !error && <p className="text-sm text-muted-foreground">Loading the shelves…</p>}
        {data && shelf && (
          <>
            {!searching && (
              <>
                <nav aria-label="Years" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
                  {data.shelves.map((s) => <button key={s.key} type="button" onClick={() => set({ shelf: s.key, subject: "" })} className={chip(s.key === shelf.key)}>{s.label}</button>)}
                </nav>
                <p className="text-sm text-muted-foreground">{shelf.blurb}</p>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Subjects">
                  <button type="button" onClick={() => set({ subject: "" })} className={chip(!subject)}>All subjects</button>
                  {shelf.subjects.map((s) => <button key={s.name} type="button" onClick={() => set({ subject: s.name })} className={chip(s.name === subject)}>{s.name} <span className="opacity-60">{s.files.length}</span></button>)}
                </div>
              </>
            )}
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Book type">
              <button type="button" onClick={() => set({ type: "" })} className={chip(type === "")}>Every type</button>
              {data.types.map((t, i) => <button key={t} type="button" onClick={() => set({ type: String(i) })} className={chip(type === String(i))}>{t}</button>)}
            </div>

            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{rows.length} {rows.length === 1 ? "book" : "books"}{searching ? " across all shelves" : ""}</p>
            {rows.length === 0 && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No books match. Try a shorter search or clear the type filter.</p>}
            <ul className="grid gap-2 sm:grid-cols-2">
              {rows.map((r, i) => (
                <li key={r.file[0]}>
                  <button type="button" onClick={() => setViewing(i)} className="flex h-full w-full flex-col items-start gap-1 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-primary/50">
                    <span className="text-[14.5px] font-semibold leading-snug text-foreground">{r.file[1]}</span>
                    <span className="text-[11.5px] text-muted-foreground">{data.types[r.file[3]]} · {searching ? `${r.shelf} · ` : ""}{r.subject}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <DriveFileViewer items={items} index={viewing} onIndexChange={setViewing} onDownload={(f) => startDownload(f[0], f[1])} where="Books" />
    </div>
  );
}
