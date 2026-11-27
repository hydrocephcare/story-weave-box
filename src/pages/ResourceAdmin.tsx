import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Loader2, Trash2, Upload } from "lucide-react";
import { uploadFileToR2, deleteFilesFromR2 } from "@/lib/r2";
import {
  RESOURCE_BUCKET,
  RESOURCE_CATEGORIES,
  classifyResource,
  deleteResource,
  fileTypeLabel,
  formatFileSize,
  listAllYearResources,
  saveResource,
  type StudyResource,
} from "@/lib/studyResources";

const YEARS = [1, 2, 3, 4, 5, 6];

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export default function ResourceAdmin() {
  const [year, setYear] = useState(1);
  const [rows, setRows] = useState<StudyResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState<string>("Notes");
  const [description, setDescription] = useState("");

  async function reload(y = year) {
    setLoading(true);
    try {
      setRows(await listAllYearResources(y));
    } catch (e) {
      setStatus(`Could not load the catalogue: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(year); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [year]);

  function onPickFile(f: File | null) {
    setFile(f);
    if (!f) return;
    const base = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    if (!title) setTitle(base);
    setCategory(classifyResource(f.name, [unit]));
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim() || !unit.trim()) {
      setStatus("Choose a file and fill in the title and unit.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `year-${year}/${slugify(unit)}/${slugify(title)}-${Date.now().toString(36)}.${ext}`;
      const uploaded = await uploadFileToR2(file, RESOURCE_BUCKET, path);
      await saveResource({
        year,
        unit: unit.trim(),
        title: title.trim(),
        description: description.trim() || null,
        category,
        file_name: file.name,
        file_path: uploaded.key,
        storage_url: uploaded.url,
        file_type: ext,
        file_size: file.size,
        download_enabled: true,
      });
      setStatus(`“${title.trim()}” is now available to students.`);
      setFile(null); setTitle(""); setDescription("");
      await reload(year);
    } catch (e) {
      setStatus(`Upload failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: StudyResource) {
    try {
      await saveResource({ id: row.id, download_enabled: !row.download_enabled });
      await reload(year);
    } catch (e) {
      setStatus(`Could not update: ${(e as Error).message}`);
    }
  }

  async function updateMeta(row: StudyResource, patch: Partial<StudyResource>) {
    try {
      await saveResource({ id: row.id, ...patch });
      await reload(year);
    } catch (e) {
      setStatus(`Could not save: ${(e as Error).message}`);
    }
  }

  async function remove(row: StudyResource) {
    if (!window.confirm(`Remove “${row.title}” from the library?`)) return;
    try {
      if (!/^https?:\/\//i.test(row.file_path)) {
        await deleteFilesFromR2(RESOURCE_BUCKET, [row.file_path]);
      }
      await deleteResource(row.id);
      await reload(year);
    } catch (e) {
      setStatus(`Could not remove: ${(e as Error).message}`);
    }
  }

  const input = "w-full rounded-lg border border-border bg-card px-3 py-2 text-[14px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/25";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Helmet><title>Study resources | Admin</title><meta name="robots" content="noindex" /></Helmet>
      <h1 className="font-serif text-2xl font-bold text-foreground">Downloadable study resources</h1>
      <p className="mt-1 text-[14px] text-muted-foreground">Upload files students can download inside OmpathStudy.</p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label htmlFor="admin-year" className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Year</label>
        <select id="admin-year" value={year} onChange={(e) => setYear(Number(e.target.value))} className={`${input} w-auto`}>
          {YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
        </select>
      </div>

      {status && <p role="status" className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13.5px] text-foreground">{status}</p>}

      <form onSubmit={handleUpload} className="mt-6 space-y-3 rounded-lg border border-border bg-card p-4 sm:p-5">
        <h2 className="font-serif text-[17px] font-semibold text-foreground">Add a resource</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="res-file" className="mb-1 block text-[12.5px] font-semibold text-foreground">File</label>
            <input id="res-file" type="file" onChange={(e) => onPickFile(e.target.files?.[0] || null)} className={input} />
          </div>
          <div>
            <label htmlFor="res-title" className="mb-1 block text-[12.5px] font-semibold text-foreground">Title</label>
            <input id="res-title" value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor="res-unit" className="mb-1 block text-[12.5px] font-semibold text-foreground">Unit / subject</label>
            <input id="res-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Anatomy" className={input} />
          </div>
          <div>
            <label htmlFor="res-cat" className="mb-1 block text-[12.5px] font-semibold text-foreground">Category</label>
            <select id="res-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
              {RESOURCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="res-desc" className="mb-1 block text-[12.5px] font-semibold text-foreground">Description (optional)</label>
            <textarea id="res-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={input} />
          </div>
        </div>
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
          {busy ? "Uploading…" : "Save resource"}
        </button>
      </form>

      <h2 className="mt-8 font-serif text-[17px] font-semibold text-foreground">Year {year} catalogue</h2>
      {loading ? (
        <p className="mt-3 text-[13.5px] text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-muted-foreground">Nothing catalogued for this year yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0 flex-1">
                <input
                  defaultValue={r.title}
                  onBlur={(e) => e.target.value !== r.title && updateMeta(r, { title: e.target.value })}
                  aria-label={`Title of ${r.title}`}
                  className="w-full bg-transparent text-[14.5px] font-semibold text-foreground outline-none focus:underline"
                />
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted-foreground">
                  <input
                    defaultValue={r.unit}
                    onBlur={(e) => e.target.value !== r.unit && updateMeta(r, { unit: e.target.value })}
                    aria-label={`Unit of ${r.title}`}
                    className="w-28 bg-transparent outline-none focus:underline"
                  />
                  <select
                    value={r.category}
                    onChange={(e) => updateMeta(r, { category: e.target.value })}
                    aria-label={`Category of ${r.title}`}
                    className="bg-transparent outline-none"
                  >
                    {RESOURCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <span>{fileTypeLabel(r)}</span>
                  {formatFileSize(r.file_size) && <span>{formatFileSize(r.file_size)}</span>}
                </div>
              </div>
              <button type="button" onClick={() => toggle(r)} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold text-foreground">
                {r.download_enabled ? "Visible" : "Hidden"}
              </button>
              <button type="button" onClick={() => remove(r)} aria-label={`Remove ${r.title}`} className="rounded-lg border border-destructive/40 px-3 py-1.5 text-destructive">
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
