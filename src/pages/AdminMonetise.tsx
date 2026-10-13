import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { DEFAULT_MONETISE, loadMonetise, saveMonetise, type MonetiseConfig } from "@/lib/monetise";

const field = "h-11 w-full rounded-lg border border-border bg-background px-3 text-[15px] outline-none focus:border-primary";
const check = "h-5 w-5 accent-[hsl(var(--primary))]";

/** Admin: switch on the ways the site can pay for itself. Everything starts off. */
export default function AdminMonetise() {
  const [c, setC] = useState<MonetiseConfig>(DEFAULT_MONETISE);
  const [msg, setMsg] = useState("");
  useEffect(() => { void loadMonetise(true).then(setC); }, []);
  const save = async () => { try { await saveMonetise(c); setMsg("Saved."); } catch (e) { setMsg((e as Error).message || "Could not save."); } };

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Admin</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Monetise</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">Everything here is off until you switch it on. Subscribers and the admin never see ads, and nothing appears in exams or quizzes.</p>

      <section className="mt-10">
        <h2 className="font-serif text-2xl font-bold">Display ads (Google AdSense)</h2>
        <p className="mt-1 text-sm text-muted-foreground">One quiet slot on blog pages. You need an approved AdSense account first; add a cookie notice if you have readers in Europe.</p>
        <label className="mt-4 flex items-center gap-3 font-semibold"><input type="checkbox" className={check} checked={c.ads.enabled} onChange={(e) => setC({ ...c, ads: { ...c.ads, enabled: e.target.checked } })} /> Show ads on blog pages</label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Publisher id<input className={field} placeholder="ca-pub-1234567890123456" value={c.ads.client} onChange={(e) => setC({ ...c, ads: { ...c.ads, client: e.target.value.trim() } })} /></label>
          <label className="text-sm font-semibold">Ad slot id<input className={field} placeholder="1234567890" value={c.ads.slot} onChange={(e) => setC({ ...c, ads: { ...c.ads, slot: e.target.value.trim() } })} /></label>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl font-bold">Sponsor</h2>
        <p className="mt-1 text-sm text-muted-foreground">A university, society or publisher named in one quiet line on pages.</p>
        <label className="mt-4 flex items-center gap-3 font-semibold"><input type="checkbox" className={check} checked={c.sponsor.enabled} onChange={(e) => setC({ ...c, sponsor: { ...c.sponsor, enabled: e.target.checked } })} /> Show the sponsor line</label>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-semibold">Name<input className={field} value={c.sponsor.name} onChange={(e) => setC({ ...c, sponsor: { ...c.sponsor, name: e.target.value } })} /></label>
          <label className="text-sm font-semibold">Line<input className={field} placeholder="Supported by" value={c.sponsor.line} onChange={(e) => setC({ ...c, sponsor: { ...c.sponsor, line: e.target.value } })} /></label>
          <label className="text-sm font-semibold">Link (https)<input className={field} value={c.sponsor.url} onChange={(e) => setC({ ...c, sponsor: { ...c.sponsor, url: e.target.value.trim() } })} /></label>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl font-bold">Books and courses</h2>
        <p className="mt-1 text-sm text-muted-foreground">Shown at the end of any page that mentions one of the words you give (separate words with commas).</p>
        <ul className="mt-4 space-y-4">
          {c.affiliates.map((a) => (
            <li key={a.id} className="space-y-2">
              <div className="flex gap-2"><input className={field} placeholder="Title" value={a.title} onChange={(e) => setC({ ...c, affiliates: c.affiliates.map((x) => (x.id === a.id ? { ...x, title: e.target.value } : x)) })} /><button type="button" aria-label="Remove" onClick={() => setC({ ...c, affiliates: c.affiliates.filter((x) => x.id !== a.id) })} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></div>
              <div className="grid gap-2 sm:grid-cols-3">
                <input className={field} placeholder="Link (https)" value={a.url} onChange={(e) => setC({ ...c, affiliates: c.affiliates.map((x) => (x.id === a.id ? { ...x, url: e.target.value.trim() } : x)) })} />
                <input className={field} placeholder="Label, e.g. Textbook" value={a.label} onChange={(e) => setC({ ...c, affiliates: c.affiliates.map((x) => (x.id === a.id ? { ...x, label: e.target.value } : x)) })} />
                <input className={field} placeholder="Words: anaemia, haemoglobin" value={a.keywords} onChange={(e) => setC({ ...c, affiliates: c.affiliates.map((x) => (x.id === a.id ? { ...x, keywords: e.target.value } : x)) })} />
              </div>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setC({ ...c, affiliates: [...c.affiliates, { id: `a${Date.now()}`, title: "", url: "", label: "", keywords: "" }] })} className="mt-4 h-10 rounded-full border border-border px-5 text-sm font-bold hover:border-primary/60">Add a book or course</button>
      </section>

      <div className="mt-10 flex items-center gap-4"><button type="button" onClick={save} className="h-12 rounded-full bg-primary px-8 font-bold text-primary-foreground">Save</button>{msg && <span className="text-sm font-semibold text-primary" role="status">{msg}</span>}</div>
    </main>
  );
}
