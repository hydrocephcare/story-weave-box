import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ChevronDown, Download, FolderOpen, Loader2, RefreshCw, Search } from "lucide-react";
import DriveFileViewer, { cleanName, downloadUrl, type DriveFile } from "@/components/DriveFileViewer";
import FileThumb, { KIND_LABEL } from "@/components/FileThumb";
import { useAuth } from "@/hooks/useAuth";
import { startDownload } from "@/lib/driveDownload";
import { countFiles, flattenDrive, loadDriveIndex, loadDriveNotes, type DriveIndex, type DriveNotes, type DriveRow } from "@/lib/driveNotes";

const isNew = (r: DriveRow) => !r.cat || Date.now() - new Date(r.cat.firstSeen).getTime() < 7 * 86400000;

/** /new-notes: the notes folder on Google Drive, live. Add a file to the folder and it shows up here by itself. */
export default function NewNotes() {
  const { isAdmin } = useAuth();
  const [params] = useSearchParams();
  const [data, setData] = useState<DriveNotes | null>(null);
  const [index, setIndex] = useState<DriveIndex>({});
  const [q, setQ] = useState("");
  const [shut, setShut] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<{ items: DriveFile[]; index: number | null }>({ items: [], index: null });

  const load = (force = false) => { setData(null); void Promise.all([loadDriveNotes(force), loadDriveIndex()]).then(([d, i]) => { setIndex(i); setData(d); }); };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => (data?.ok ? flattenDrive(data.tree, [], index) : []), [data, index]);
  const term = q.trim().toLowerCase();
  const shown = useMemo(() => rows.filter((r) => !term || `${r.file[1]} ${r.where.join(" ")}`.toLowerCase().includes(term)), [rows, term]);
  const groups = useMemo(() => {
    const m = new Map<string, DriveRow[]>();
    for (const r of shown) { const k = r.cat?.sorted ? r.where.join(" · ") : r.where[0] ?? "Just added"; (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
    return [...m.entries()].sort((a, b) => (a[0] === "Just added" ? -1 : b[0] === "Just added" ? 1 : a[0].localeCompare(b[0], undefined, { numeric: true })));
  }, [shown]);

  // a link like /new-notes?file=ID (from search or Ompath AI) opens that file straight away
  useEffect(() => {
    const id = params.get("file");
    if (!id || !rows.length) return;
    const i = rows.findIndex((r) => r.file[0] === id);
    if (i >= 0) setViewer({ items: rows.map((r) => r.file), index: i });
  }, [params, rows]);

  const open = (r: DriveRow) => setViewer({ items: shown.map((x) => x.file), index: Math.max(0, shown.indexOf(r)) });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <Helmet><title>Latest notes | Ompath Study</title><meta name="description" content="The newest study notes added to Ompath Study, straight from our notes folder." /></Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-serif text-3xl font-bold sm:text-4xl">Latest notes</h1>
        <button type="button" onClick={() => load(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:border-primary hover:text-primary"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">Straight from the Ompath notes folder. When new notes are added, they appear here on their own, usually within a few minutes.</p>

      {data === null ? (
        <p className="mt-12 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading the notes…</p>
      ) : !data.ok ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <FolderOpen className="mx-auto h-9 w-9 text-muted-foreground/40" />
          <p className="mt-3 font-serif text-lg font-bold">{(data as { reason?: string }).reason === "private" ? "The notes folder is not shared yet" : "The notes could not be loaded"}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{isAdmin && (data as { reason?: string }).reason === "private" ? "Open the folder in Google Drive, choose Share, then General access: “Anyone with the link” as Viewer. The notes appear here by themselves a minute later." : "Please try again in a moment. If it keeps happening, tell us on the contact page."}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-8 text-center"><p className="font-serif text-lg font-bold">No notes in the folder yet</p><p className="mt-1 text-sm text-muted-foreground">New files will show up here as soon as they are added.</p></div>
      ) : (
        <>
          <div className="mt-6 flex items-center rounded-xl border border-border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <Search className="ml-3.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${countFiles(data.tree)} notes…`} aria-label="Search the latest notes" className="w-full bg-transparent px-3 py-3 text-base outline-none placeholder:text-muted-foreground sm:text-sm" />
          </div>
          {data.partial && <p className="mt-3 text-xs text-muted-foreground">The folder is large, so the newest part is shown. Use search to find an older note.</p>}

          <div className="mt-6 space-y-4">
            {groups.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nothing matches “{q}”.</p>}
            {groups.map(([name, list]) => {
              const closed = shut.has(name) && !term;
              return (
                <section key={name} className="overflow-hidden rounded-2xl border border-border bg-card">
                  <button type="button" onClick={() => setShut((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; })} aria-expanded={!closed} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50">
                    <span className="flex min-w-0 items-center gap-2"><FolderOpen className="h-5 w-5 shrink-0 text-primary" /><span className="truncate font-serif text-lg font-bold">{name}</span></span>
                    <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-muted-foreground">{list.length}<ChevronDown className={`h-4 w-4 transition-transform ${closed ? "" : "rotate-180"}`} /></span>
                  </button>
                  {!closed && (
                    <ul className="divide-y divide-border border-t border-border">
                      {list.map((r) => (
                        <li key={r.file[0]} className="flex items-center gap-3 px-4 py-3">
                          <button type="button" onClick={() => open(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                            <FileThumb id={r.file[0]} kind={r.file[2]} className="h-12 w-10" />
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 block text-sm font-semibold hover:text-primary">{r.cat?.title || cleanName(r.file[1])}</span>
                              <span className="block truncate text-xs text-muted-foreground">{KIND_LABEL[r.file[2]]}{r.cat?.sorted ? ` · ${r.cat.type}` : r.where.length > 1 ? ` · ${r.where.slice(1).join(" › ")}` : ""}{isNew(r) ? " · New" : ""}</span>
                              {r.cat?.summary && <span className="line-clamp-2 block text-xs text-muted-foreground/90">{r.cat.summary}</span>}
                            </span>
                          </button>
                          <a href={downloadUrl(r.file[0])} onClick={(e) => { e.preventDefault(); startDownload(r.file[0], r.file[1]); }} aria-label={`Download ${cleanName(r.file[1])}`} className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary"><Download className="h-4 w-4" /></a>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      <DriveFileViewer items={viewer.items} index={viewer.index} onIndexChange={(i) => setViewer((v) => ({ ...v, index: i }))} onDownload={(f) => startDownload(f[0], f[1])} where="Latest notes" />
    </main>
  );
}
