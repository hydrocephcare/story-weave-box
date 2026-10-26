import { useRef, useState } from "react";
import { Camera, Loader2, Check, BadgeCheck, Sparkles, HeartHandshake } from "lucide-react";
import { assistBio } from "@/lib/storyAssist";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { uploadStoryImage } from "@/lib/storyImage";
import { toast } from "@/hooks/use-toast";
import { ABOUT_MAX, cleanAbout } from "@/lib/storyAuthor";
import { INTERESTS, cleanExtra, type AuthorExtra } from "@/lib/storyExtras";

type Props = { name: string; university: string; year: string };

const field = "mt-1 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary";
const thisYear = new Date().getFullYear();

/** The writer's portfolio in the account: photo, note, graduating class, interests, mentor badge, a tip for juniors and links.
 *  Name, university and year come from the study profile above it. Stories pick all of it up, so an author fills it in once.
 *  Kept in the account's own metadata, so nothing else needs to change. */
export default function AuthorProfileCard({ name, university, year }: Props) {
  const { user } = useAuth();
  const meta = (user?.user_metadata ?? {}) as { avatar_url?: string; bio?: string; author_extra?: AuthorExtra };
  const [photo, setPhoto] = useState(meta.avatar_url ?? "");
  const [bio, setBio] = useState(meta.bio ?? "");
  const [extra, setExtra] = useState<AuthorExtra>(cleanExtra(meta.author_extra ?? {}));
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  if (!user) return null;
  const initial = (name.trim()[0] || user.email?.[0] || "?").toUpperCase();
  const level = year ? (year === "7" ? "Finalist" : `Year ${year}`) : "";
  const set = (patch: Partial<AuthorExtra>) => { setExtra((e) => ({ ...e, ...patch })); setSaved(false); };
  const toggleInterest = (i: string) => {
    const cur = extra.ints ?? [];
    if (cur.includes(i)) set({ ints: cur.filter((x) => x !== i) });
    else if (cur.length < 3) set({ ints: [...cur, i] });
    else toast({ title: "Three at most", description: "Remove one to add another." });
  };

  const pick = async (file: File) => {
    setPhotoBusy(true);
    try { setPhoto(await uploadStoryImage(file)); setSaved(false); }
    catch (e) { toast({ title: "Photo not added", description: (e as Error).message, variant: "destructive" }); }
    finally { setPhotoBusy(false); }
  };
  const help = async () => {
    setAiBusy(true);
    try { const t = await assistBio({ name, university, year: Number(year) || 0, notes: bio }); if (t) { setBio(t.slice(0, ABOUT_MAX)); setSaved(false); } }
    catch (e) { toast({ title: "The helper could not help", description: (e as Error).message, variant: "destructive" }); }
    finally { setAiBusy(false); }
  };
  const save = async () => {
    setBusy(true);
    try {
      const clean = cleanExtra(extra);
      const { error } = await supabase.auth.updateUser({ data: { avatar_url: photo || null, bio: cleanAbout(bio) || null, author_extra: Object.keys(clean).length ? clean : null } });
      if (error) throw error;
      setExtra(clean); setSaved(true);
      toast({ title: "Author profile saved", description: "Your next story will use it." });
    } catch (e) { toast({ title: "Could not save", description: (e as Error).message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/[0.06] via-card to-amber-500/[0.05] p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Author profile</p>
      <p className="mt-1 text-sm text-muted-foreground">Your portfolio. It appears at the end of every story you publish.</p>
      <div className="mt-4 flex items-start gap-4">
        <button type="button" onClick={() => input.current?.click()} disabled={photoBusy} className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-primary to-emerald-500 shadow-md ring-4 ring-background" aria-label="Change photo">
          {photo ? <img src={photo} alt="Your photo" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center font-serif text-3xl font-bold text-primary-foreground">{initial}</span>}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{photoBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}</span>
        </button>
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-serif text-lg font-bold text-foreground">{name || "Your name"} {user.email_confirmed_at && <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 font-sans text-[11px] font-bold text-sky-600 dark:text-sky-400"><BadgeCheck className="h-3.5 w-3.5" /> Verified</span>}</p>
          <p className="text-sm text-muted-foreground">{[level, extra.cls ? `Class of ${extra.cls}` : "", university].filter(Boolean).join(" · ") || "Add your university and year in the study profile above"}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 whitespace-nowrap text-xs font-semibold">
            <button type="button" onClick={() => input.current?.click()} className="text-primary hover:underline">{photo ? "Change photo" : "Add a photo"}</button>
            {photo && <button type="button" onClick={() => { setPhoto(""); setSaved(false); }} className="text-muted-foreground hover:text-destructive">Remove</button>}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <label htmlFor="acc-bio" className="block text-xs font-semibold text-muted-foreground">About me</label>
        <button type="button" onClick={() => void help()} disabled={aiBusy} className="inline-flex items-center gap-1 text-xs font-bold text-primary disabled:opacity-50">{aiBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Help me write it</button>
      </div>
      <textarea id="acc-bio" value={bio} onChange={(e) => { setBio(e.target.value.slice(0, ABOUT_MAX)); setSaved(false); }} rows={3} placeholder="Your year, your school, what you love about medicine, what you would tell a junior." className={`${field} leading-relaxed`} />
      <p className="mt-1 text-xs text-muted-foreground">{bio.length}/{ABOUT_MAX}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="acc-class" className="block text-xs font-semibold text-muted-foreground">Graduating class</label>
          <select id="acc-class" value={extra.cls ?? ""} onChange={(e) => set({ cls: e.target.value })} className={field}>
            <option value="">Not shown</option>
            {Array.from({ length: 12 }, (_, i) => thisYear - 4 + i).map((y) => <option key={y} value={String(y)}>Class of {y}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="acc-tip" className="block text-xs font-semibold text-muted-foreground">One tip for juniors</label>
          <input id="acc-tip" value={extra.tip ?? ""} onChange={(e) => set({ tip: e.target.value.slice(0, 140) })} placeholder="e.g. Learn the drugs on the ward, not the night before." className={field} />
        </div>
      </div>

      <p className="mt-4 text-xs font-semibold text-muted-foreground">Interests <span className="font-normal">(up to three)</span></p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {INTERESTS.map((i) => {
          const on = (extra.ints ?? []).includes(i);
          return <button key={i} type="button" onClick={() => toggleInterest(i)} aria-pressed={on} className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}>{i}</button>;
        })}
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background/60 p-3">
        <input type="checkbox" checked={Boolean(extra.mentor)} onChange={(e) => set({ mentor: e.target.checked })} className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" />
        <span className="text-sm"><strong className="inline-flex items-center gap-1.5"><HeartHandshake className="h-4 w-4 text-primary" /> I am happy to help juniors</strong><span className="block text-xs text-muted-foreground">Shows a Mentor badge on your stories so students know they can reach out through your links below.</span></span>
      </label>

      <p className="mt-4 text-xs font-semibold text-muted-foreground">Links <span className="font-normal">(optional, https only)</span></p>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        <input aria-label="LinkedIn" value={extra.li ?? ""} onChange={(e) => set({ li: e.target.value })} placeholder="LinkedIn address" className={field.replace("mt-1 ", "")} />
        <input aria-label="Instagram" value={extra.ig ?? ""} onChange={(e) => set({ ig: e.target.value })} placeholder="Instagram address" className={field.replace("mt-1 ", "")} />
        <input aria-label="X" value={extra.x ?? ""} onChange={(e) => set({ x: e.target.value })} placeholder="X (Twitter) address" className={field.replace("mt-1 ", "")} />
        <input aria-label="Website" value={extra.web ?? ""} onChange={(e) => set({ web: e.target.value })} placeholder="Your website" className={field.replace("mt-1 ", "")} />
      </div>

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={() => void save()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null} {saved ? "Saved" : "Save author profile"}
        </button>
      </div>
    </section>
  );
}
