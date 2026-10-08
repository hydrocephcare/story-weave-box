import { useEffect, useMemo, useState } from "react";
import LoadMoreButton from "@/components/LoadMoreButton";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, BadgeCheck, ChevronRight, Download, File, FileText, Film, FolderOpen, Image as ImageIcon, Loader2, Presentation, Search, Archive, Eye, EyeOff, Pencil, Star } from "lucide-react";
import registry from "@/data/libraries.json";
import { updateMetaTags, SITE_URL } from "@/lib/seo";
import { startDownload } from "@/lib/driveDownload";
import { countFiles, folderMeta, libraryPath, resolveSlugs } from "@/lib/libraryMeta";
import ShareButton from "@/components/ShareButton";
import FileThumb from "@/components/FileThumb";
import ConnectedLearning from "@/components/ConnectedLearning";
import { useAuth } from "@/hooks/useAuth";
import { updateSiteConfig, useSiteConfig } from "@/lib/siteConfig";
import { addRecent, toggleSaved, useFileShelf } from "@/lib/fileShelf";
import { loadBrokenLinks, loadLibrary } from "@/lib/libraryData";
import DriveFileViewer, { cleanName, canPreview, downloadUrl, reportUrl, thumbUrl, type DriveFile, type DriveKind } from "@/components/DriveFileViewer";
import { getReadingSession, saveReadingSession, clearReadingSession } from "@/lib/reading-session";

type Kind = DriveKind;
export type LibraryDef = (typeof registry.libraries)[number];
interface DriveFolder { n: string; s: string; d?: DriveFolder[]; f?: DriveFile[] }
interface Library { updated: string; d: DriveFolder[] }

const KIND_LABEL: Record<Kind, string> = { pdf: "PDF", ppt: "Slides", doc: "Document", video: "Video", img: "Image", zip: "Archive", file: "File" };
const KIND_ICON: Record<Kind, typeof File> = { pdf: FileText, ppt: Presentation, doc: FileText, video: Film, img: ImageIcon, zip: Archive, file: File };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function searchAll(root: DriveFolder[], q: string): { file: DriveFile; where: string[] }[] {
  const out: { file: DriveFile; where: string[] }[] = [];
  const needles = q.toLowerCase().split(/\s+/).filter(Boolean);
  const walk = (folders: DriveFolder[], trail: string[]) => {
    for (const f of folders) {
      const here = [...trail, f.n];
      for (const file of f.f ?? []) if (needles.every((w) => file[1].toLowerCase().includes(w))) out.push({ file, where: here });
      if (f.d) walk(f.d, here);
    }
  };
  walk(root, []);
  return out;
}

export default function StudyFileLibrary({ def, slugs }: { def: LibraryDef; slugs: string[] }) {
  const [params] = useSearchParams();
  const [lib, setLib] = useState<Library | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const slugKey = slugs.join("/");

  useEffect(() => {
    let cancelled = false;
    setLib(null); setError(false);
    loadLibrary(def.dataFile)
      .then((data) => { if (!cancelled) setLib(data as Library); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [def.dataFile]);

  const [broken, setBroken] = useState<Set<string>>(new Set());
  useEffect(() => { let on = true; loadBrokenLinks().then((s) => { if (on) setBroken(s); }); return () => { on = false; }; }, []);

  const resolved = useMemo(() => (lib ? resolveSlugs(lib.d, slugs) : null), [lib, slugKey]);
  const notFound = Boolean(resolved && !resolved.ok);
  const chain = (resolved?.chain ?? []) as DriveFolder[];
  const node = chain.length ? chain[chain.length - 1] : null;
  const folders = node ? node.d ?? [] : lib?.d ?? []; // keep the curated order (books first, then slides, notes…)
  const files = useMemo(() => [...(node?.f ?? [])].sort((a, b) => collator.compare(a[1], b[1])), [node]);
  const total = lib ? lib.d.reduce((s, f) => s + countFiles(f), 0) : 0;
  const results = useMemo(() => (lib && query.trim().length >= 2 ? searchAll(lib.d, query.trim()).slice(0, 200) : null), [lib, query]);
  const meta = useMemo(() => (lib && !notFound ? folderMeta(registry, def, chain, total) : null), [lib, notFound, slugKey, total]);

  useEffect(() => {
    if (!meta) return;
    updateMetaTags({
      title: meta.title,
      description: meta.description,
      image: `${SITE_URL}${meta.ogImage}`,
      url: `${SITE_URL}${meta.path}`,
      type: "website",
      keywords: meta.keywords,
    });
  }, [meta]);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [slugKey]);

  const heading = meta?.h1 ?? def.title;
  const trailText = [def.label, ...chain.map((n) => n.n)].join(" > ");

  return (
    <div className="min-h-dvh bg-muted/20">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{def.label} · MBChB</p>
              <h1 className="mt-2 font-serif text-2xl font-bold leading-tight text-foreground sm:text-4xl">{heading}</h1>
            </div>
            {meta && <ShareButton url={`${SITE_URL}${meta.path}`} title={meta.title} text={meta.shareText} />}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {def.tagline}. Books, notes, slides, videos and past papers, sorted so they are easy to find. Tap a file to read it here or download it.
            {total > 0 && <> <span className="font-semibold text-foreground">{total.toLocaleString()}</span> files in this year.</>}
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-bold text-primary">
            <BadgeCheck className="h-3.5 w-3.5" /> {registry.credit}
          </p>
          <div className="relative mt-6 max-w-xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search every ${def.label} file by name…`}
              aria-label={`Search the ${def.label} library`}
              className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm text-foreground outline-none ring-primary/30 placeholder:text-muted-foreground focus:ring-2"
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5 py-8">
        {error && (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            The library could not be loaded. Check your connection and refresh the page.
          </p>
        )}
        {!lib && !error && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading library…</p>
        )}

        {lib && notFound && (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            That folder is not in the {def.label} library. <Link to={libraryPath(def)} className="font-semibold text-primary hover:underline">Back to all {def.rootLabel}</Link>
          </p>
        )}

        {lib && results && !notFound && (
          <section aria-live="polite">
            <p className="mb-3 text-sm text-muted-foreground">
              {results.length === 0 ? "No files match" : `${results.length}${results.length === 200 ? "+" : ""} file${results.length === 1 ? "" : "s"} for`} “{query.trim()}”
            </p>
            <FileList rows={results.map((r) => ({ file: r.file, where: r.where.join(" › ") }))} broken={broken} trail={trailText} />
          </section>
        )}

        {lib && !results && !notFound && (
          <>
            <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1 text-sm">
              {chain.length ? <Link to={libraryPath(def)} className="font-semibold text-primary hover:underline">All {def.rootLabel}</Link> : <span className="font-semibold text-foreground">All {def.rootLabel}</span>}
              {chain.map((part, i) => (
                <span key={part.s} className="flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  {i === chain.length - 1
                    ? <span className="font-semibold text-foreground">{part.n}</span>
                    : <Link to={libraryPath(def, slugs.slice(0, i + 1))} className="font-semibold text-primary hover:underline">{part.n}</Link>}
                </span>
              ))}
            </nav>

            {folders.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {folders.map((f) => (
                  <Link
                    key={f.s}
                    to={libraryPath(def, [...slugs, f.s])}
                    className="group flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-elevated)]"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FolderOpen className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">{f.n}</span>
                      <span className="block text-xs text-muted-foreground">{countFiles(f)} file{countFiles(f) === 1 ? "" : "s"}{f.d?.length ? ` · ${f.d.length} folder${f.d.length === 1 ? "" : "s"}` : ""}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            )}

            {files.length > 0 && (
              <section className={folders.length ? "mt-8" : ""}>
                {folders.length > 0 && <h2 className="mb-3 font-serif text-lg font-bold text-foreground">Files in this folder</h2>}
                <FileList rows={files.map((file) => ({ file }))} broken={broken} trail={trailText} />
              </section>
            )}

            {folders.length === 0 && files.length === 0 && (
              <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                Nothing here yet. <Link to={libraryPath(def)} className="font-semibold text-primary hover:underline">Back to all {def.rootLabel}</Link>
              </p>
            )}
          </>
        )}

        {lib && !results && !notFound && chain.length > 0 && (
          <ConnectedLearning className="mt-8" target={{ title: chain.filter((n) => !/lecture slides|notes|handouts|textbooks|reference|questions|past papers|videos|practicals|lab manuals|images|atlas/i.test(n.n)).map((n) => n.n).join(" ") || chain[0].n, where: `${def.label} › ${chain.map((n) => n.n).join(" › ")}`, year: def.year }} />
        )}

        <p className="mt-10 border-t border-border pt-4 text-center text-xs text-muted-foreground">
          {registry.credit} · shared for {registry.audience}. Know a file that is missing? Send it to us and we will add it.
        </p>
      </div>
    </div>
  );
}

const FILTERS: { key: Kind | "all"; label: string }[] = [
  { key: "all", label: "All" }, { key: "pdf", label: "PDFs" }, { key: "ppt", label: "Slides" }, { key: "doc", label: "Documents" },
  { key: "video", label: "Videos" }, { key: "img", label: "Images" }, { key: "zip", label: "Archives" },
];
const IMAGE_PAGE = 48;

type Row = { file: DriveFile; where?: string };

function FileList({ rows: allRows, broken, trail }: { rows: Row[]; broken: Set<string>; trail: string }) {
  const { isAdmin } = useAuth();
  const cfg = useSiteConfig();
  const hidden = useMemo(() => new Set(cfg.hiddenFiles), [cfg.hiddenFiles]);
  const rows = useMemo(() => allRows.filter((r) => isAdmin || !hidden.has(r.file[0])).map((r) => (cfg.renames[r.file[0]] ? { ...r, file: [r.file[0], cfg.renames[r.file[0]], r.file[2]] as DriveFile } : r)), [allRows, hidden, cfg.renames, isAdmin]);
  const toggleHidden = (id: string) => updateSiteConfig((c) => ({ ...c, hiddenFiles: c.hiddenFiles.includes(id) ? c.hiddenFiles.filter((x) => x !== id) : [...c.hiddenFiles, id] })).catch(() => window.alert("Could not save — are you signed in as admin?"));
  const rename = (id: string, current: string) => { const next = window.prompt("New title for this file (leave empty to restore the original):", cleanName(current)); if (next === null) return; updateSiteConfig((c) => { const renames = { ...c.renames }; if (next.trim()) renames[id] = next.trim(); else delete renames[id]; return { ...c, renames }; }).catch(() => window.alert("Could not save — are you signed in as admin?")); };
  const [badImages, setBadImages] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [viewing, setViewing] = useState<number | null>(null);
  const [imageLimit, setImageLimit] = useState(IMAGE_PAGE);
  const signature = rows.length + ":" + (rows[0]?.file[0] ?? "");
  useEffect(() => { setFilter("all"); setViewing(null); setImageLimit(IMAGE_PAGE); }, [signature]);

  const counts = useMemo(() => {
    const c: Partial<Record<Kind, number>> = {};
    for (const r of rows) c[r.file[2]] = (c[r.file[2]] ?? 0) + 1;
    return c;
  }, [rows]);
  const kinds = FILTERS.filter((f) => f.key !== "all" && counts[f.key]);
  const shown = filter === "all" ? rows : rows.filter((r) => r.file[2] === filter);
  const docs = shown.filter((r) => r.file[2] !== "img");
  const images = shown.filter((r) => r.file[2] === "img");
  const ordered = [...docs, ...images]; // viewer order: documents first, then images
  const indexOf = new Map(ordered.map((r, i) => [r.file[0], i]));
  const { isSaved } = useFileShelf();
  const [fileParams] = useSearchParams();
  const openId = fileParams.get("file");
  useEffect(() => { const at = openId ? indexOf.get(openId) : undefined; if (at !== undefined) setViewing(at); }, [openId, signature]); // eslint-disable-line react-hooks/exhaustive-deps
  const scope = typeof window !== "undefined" ? window.location.pathname : trail;
  const [resume, setResume] = useState(() => getReadingSession(scope));
  useEffect(() => {
    if (viewing !== null && ordered[viewing]) {
      addRecent(ordered[viewing].file, trail);
      saveReadingSession(scope, { fileId: ordered[viewing].file[0], name: ordered[viewing].file[1], path: scope });
    } else setResume(getReadingSession(scope));
  }, [viewing]); // eslint-disable-line react-hooks/exhaustive-deps
  const resumeAt = resume ? indexOf.get(resume.fileId) : undefined;

  return (
    <div>
      {resumeAt !== undefined && viewing === null && resume && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="min-w-0 flex-1 truncate text-sm"><span className="font-bold text-primary">Continue reading:</span> {cleanName(resume.name)} <span className="text-muted-foreground">({resumeAt + 1} of {ordered.length})</span></p>
          <button type="button" onClick={() => setViewing(resumeAt)} className="min-h-10 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground">Resume</button>
          <button type="button" aria-label="Dismiss" onClick={() => { clearReadingSession(scope); setResume(null); }} className="min-h-10 px-2 text-muted-foreground">✕</button>
        </div>
      )}
      {(kinds.length > 1 || rows.length > 12) && kinds.length > 1 && (
        <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible" role="group" aria-label="Filter by file type" style={{ scrollbarWidth: "none" }}>
          {[{ key: "all" as const, label: "All" }, ...kinds].map((f) => {
            const n = f.key === "all" ? rows.length : counts[f.key] ?? 0;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => { setFilter(f.key); setImageLimit(IMAGE_PAGE); }}
                aria-pressed={active}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/50"}`}
              >{f.label} <span className={active ? "opacity-80" : "text-muted-foreground"}>{n}</span></button>
            );
          })}
        </div>
      )}

      {docs.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {docs.map(({ file, where }) => {
            const [id, name, kind] = file;
            const saved = isSaved(id);
            const viewable = canPreview(kind);
            if (broken.has(id)) {
              return (
                <li key={id} className="flex items-center gap-3 px-4 py-3 opacity-80">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><AlertTriangle className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold text-muted-foreground line-through decoration-amber-500/60">{cleanName(name)}</span>
                    <span className="block text-[11px] font-semibold text-amber-700">Unavailable right now — the file was moved or removed from Drive</span>
                  </span>
                  <a href={reportUrl(file, trail)} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center rounded-full border border-border px-3 py-1 text-xs font-bold hover:border-primary/50 hover:text-primary">Report</a>
                </li>
              );
            }
            return (
              <li key={id} className={`group flex flex-wrap items-center [content-visibility:auto] [contain-intrinsic-size:auto_76px] gap-x-3 gap-y-2 px-3 py-3 transition-colors hover:bg-primary/5 sm:flex-nowrap sm:px-4 ${hidden.has(id) ? "bg-amber-500/5 opacity-60" : ""}`}>
                <button
                  type="button"
                  onClick={() => { if (viewable) setViewing(indexOf.get(id) ?? null); else { addRecent(file, trail); startDownload(id, name); } }}
                  className="flex w-full min-w-0 items-center gap-3 text-left sm:w-auto sm:flex-1"
                >
                  <FileThumb id={id} kind={kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold text-foreground">{cleanName(name)}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{KIND_LABEL[kind]}{where ? ` · ${where}` : ""}</span>
                  </span>
                </button>
                <span className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:shrink-0">
                  {isAdmin && (
                    <span className="flex shrink-0 gap-0.5">
                      <button type="button" onClick={() => rename(id, name)} aria-label="Rename file" title="Rename (admin)" className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => toggleHidden(id)} aria-label={hidden.has(id) ? "Unhide file" : "Hide file"} title={hidden.has(id) ? "Hidden from learners — tap to show" : "Hide from learners (admin)"} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary">{hidden.has(id) ? <EyeOff className="h-3.5 w-3.5 text-amber-600" /> : <Eye className="h-3.5 w-3.5" />}</button>
                    </span>
                  )}
                  <button type="button" onClick={() => toggleSaved(file, trail)} aria-pressed={saved} aria-label={saved ? `Remove ${cleanName(name)} from saved files` : `Save ${cleanName(name)}`} title={saved ? "Saved — tap to remove" : "Save for later"} className={`shrink-0 rounded-full p-1.5 transition-colors ${saved ? "text-amber-500" : "text-muted-foreground/60 hover:text-amber-500"}`}><Star className={`h-4 w-4 ${saved ? "fill-current" : ""}`} /></button>
                  {viewable && (
                    <button
                      type="button"
                      onClick={() => setViewing(indexOf.get(id) ?? null)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                    ><Eye className="h-3.5 w-3.5" /> View</button>
                  )}
                  <a
                    href={downloadUrl(id)}
                    download={name}
                    onClick={(e) => { e.preventDefault(); addRecent(file, trail); startDownload(id, name); }}
                    aria-label={`Download ${cleanName(name)}`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 px-3 py-1 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground"
                  ><Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">Download</span></a>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {images.length > 0 && (
        <section className={docs.length ? "mt-6" : ""}>
          {docs.length > 0 && <h3 className="mb-3 font-serif text-base font-bold text-foreground">Images</h3>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.slice(0, imageLimit).map(({ file }) => (
              <li key={file[0]} className="group relative overflow-hidden rounded-xl border border-border bg-card">
                <button type="button" onClick={() => setViewing(indexOf.get(file[0]) ?? null)} className="block w-full text-left" aria-label={`View ${cleanName(file[1])}`}>
                  {broken.has(file[0]) || badImages.has(file[0]) ? (
                    <span className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 bg-muted text-[11px] font-semibold text-muted-foreground"><AlertTriangle className="h-5 w-5 text-amber-600" />Preview unavailable</span>
                  ) : (
                  <img
                    src={thumbUrl(file[0], 320)}
                    onError={() => setBadImages((s) => new Set(s).add(file[0]))}
                    referrerPolicy="no-referrer"
                    alt={cleanName(file[1])}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[4/3] w-full bg-muted object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  )}
                  <span className="block truncate px-2.5 py-1.5 text-[11px] font-semibold text-foreground">{cleanName(file[1])}</span>
                </button>
              </li>
            ))}
          </ul>
          {images.length > imageLimit && (
            <LoadMoreButton onMore={() => setImageLimit((n) => n + IMAGE_PAGE)} className="mt-4 rounded-full border border-primary/40 px-5 py-2 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground">Show more images ({images.length - imageLimit} left)</LoadMoreButton>
          )}
        </section>
      )}

      {shown.length === 0 && <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">No files of this type here.</p>}

      <DriveFileViewer items={ordered.map((r) => r.file)} index={viewing} onIndexChange={setViewing} onDownload={(f) => startDownload(f[0], f[1])} broken={broken} where={trail} />
    </div>
  );
}
