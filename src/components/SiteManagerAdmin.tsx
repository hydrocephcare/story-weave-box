import { useEffect, useState } from "react";
import { Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { OFFICIAL_2026_SCHEDULES, type OfficialScheduleTable } from "@/lib/timetable2026";
import { DEFAULT_UNIT_NAMES, loadSiteConfig, saveSiteConfig, type SiteConfig } from "@/lib/siteConfig";
import { WEEKDAYS } from "@/lib/revisionPlan";
import { FEATURES, tierOf } from "@/lib/features";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h3 className="font-serif text-lg font-bold text-foreground">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

/** Admin → Site manager: announcement, key dates, timetables, unit names and hidden / renamed library files. */
export default function SiteManagerAdmin() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<SiteConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [year, setYear] = useState(1);

  useEffect(() => { loadSiteConfig(true).then((c) => setCfg(clone(c))); }, []);
  if (!cfg) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;

  const patch = (fn: (c: SiteConfig) => void) => setCfg((c) => { const n = clone(c as SiteConfig); fn(n); return n; });
  const save = async () => {
    setSaving(true);
    try { await saveSiteConfig(cfg); toast({ title: "Saved", description: "Changes are live for everyone." }); }
    catch (e) { toast({ title: "Could not save", description: e instanceof Error ? e.message : "Only admins can change the site settings.", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const tables: OfficialScheduleTable[] = cfg.timetable[String(year)] ?? clone(OFFICIAL_2026_SCHEDULES[year] ?? []);
  const edited = Boolean(cfg.timetable[String(year)]);
  const setTables = (fn: (t: OfficialScheduleTable[]) => void) => patch((c) => { const t = clone(tables); fn(t); c.timetable[String(year)] = t; });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Everything below is saved in one place and applies to every visitor immediately.</p>
        <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save all changes</Button>
      </div>

      <Section title="Free or Pro features" hint="Switch any feature between everyone (Free) and subscribers only (Pro). Press Save all changes and it applies to every visitor straight away.">
        {FEATURES.map((feat) => {
          const tier = tierOf(feat.key, cfg);
          return (
            <div key={feat.key} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0"><p className="text-sm font-semibold text-foreground">{feat.label}</p><p className="text-xs text-muted-foreground">{feat.blurb}</p></div>
              <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border text-xs font-bold" role="group" aria-label={`${feat.label}: free or pro`}>
                {(["free", "pro"] as const).map((t) => (
                  <button key={t} type="button" aria-pressed={tier === t} onClick={() => patch((c) => { c.proFeatures = { ...(c.proFeatures ?? {}), [feat.key]: t }; })}
                    className={`px-3.5 py-2 ${tier === t ? (t === "pro" ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground") : "text-muted-foreground hover:bg-muted"}`}>{t === "free" ? "Free" : "Pro"}</button>
                ))}
              </div>
            </div>
          );
        })}
      </Section>

      <Section title="Announcement banner" hint="Shows at the very top of every page. Learners can dismiss it; changing the text shows it to everyone again.">
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={cfg.announcement.enabled} onChange={(e) => patch((c) => { c.announcement.enabled = e.target.checked; })} /> Show the banner</label>
        <Input placeholder="Message, e.g. New Year 3 pharmacology slides added" value={cfg.announcement.text} onChange={(e) => patch((c) => { c.announcement.text = e.target.value; })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="Link (optional) — /year/3 or https://…" value={cfg.announcement.link} onChange={(e) => patch((c) => { c.announcement.link = e.target.value; })} />
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={cfg.announcement.tone} onChange={(e) => patch((c) => { c.announcement.tone = e.target.value as SiteConfig["announcement"]["tone"]; })}>
            <option value="info">Info (green)</option><option value="success">Good news</option><option value="warning">Important (amber)</option>
          </select>
        </div>
      </Section>

      <Section title="Key dates & countdowns" hint="The study desk counts down to the next dates here (CATs, exams, resumption…).">
        {cfg.keyDates.map((d, i) => (
          <div key={d.id} className="flex flex-wrap gap-2">
            <Input className="min-w-[180px] flex-1" value={d.label} onChange={(e) => patch((c) => { c.keyDates[i].label = e.target.value; })} />
            <Input className="w-44" type="date" value={d.date} onChange={(e) => patch((c) => { c.keyDates[i].date = e.target.value; })} />
            <Button type="button" variant="outline" size="icon" aria-label="Remove date" onClick={() => patch((c) => { c.keyDates.splice(i, 1); })}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => patch((c) => { c.keyDates.push({ id: `d${Date.now()}`, label: "", date: "" }); })}><Plus className="mr-1 h-4 w-4" /> Add a date</Button>
      </Section>

      <Section title="Timetable" hint="Edit any row, add or remove sessions. One session per line, written like “MBHA 1112 · Auditorium”. The text timetable, study desk and Smart revision all use your version.">
        <div className="flex flex-wrap items-center gap-2">
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm font-semibold" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>Year {y}</option>)}</select>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${edited ? "bg-amber-500/15 text-amber-700" : "bg-muted text-muted-foreground"}`}>{edited ? "Edited by you" : "Official timetable"}</span>
          {edited && <Button type="button" variant="outline" size="sm" onClick={() => patch((c) => { delete c.timetable[String(year)]; })}><RotateCcw className="mr-1 h-4 w-4" /> Back to official</Button>}
        </div>
        {tables.length === 0 && <p className="text-sm text-muted-foreground">No timetable for this year yet. Add a table to start one.</p>}
        {tables.map((t, ti) => (
          <div key={ti} className="rounded-xl border border-border p-3">
            <Input className="mb-3 font-semibold" value={t.label} onChange={(e) => setTables((all) => { all[ti].label = e.target.value; })} />
            <div className="space-y-2">
              {t.rows.map((r, ri) => (
                <div key={ri} className="grid gap-2 sm:grid-cols-[130px_70px_minmax(0,1fr)_auto]">
                  <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={r.day} onChange={(e) => setTables((all) => { all[ti].rows[ri].day = e.target.value; })}>{WEEKDAYS.map((d) => <option key={d}>{d}</option>)}</select>
                  <Input placeholder="Group" value={r.group ?? ""} onChange={(e) => setTables((all) => { all[ti].rows[ri].group = e.target.value; })} />
                  <Textarea rows={Math.max(2, r.entries.length)} value={r.entries.join("\n")} onChange={(e) => setTables((all) => { all[ti].rows[ri].entries = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean); })} />
                  <Button type="button" variant="outline" size="icon" aria-label="Delete row" onClick={() => setTables((all) => { all[ti].rows.splice(ri, 1); })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setTables((all) => { all[ti].rows.push({ day: "Monday", group: "", entries: [] }); })}><Plus className="mr-1 h-4 w-4" /> Add a row</Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setTables((all) => { all.push({ label: "Weekly teaching timetable", timeBands: [], rows: [] }); })}><Plus className="mr-1 h-4 w-4" /> Add a table</Button>
      </Section>

      <Section title="Unit code names" hint="Tells Smart revision what a code means, one per line: MBHA = Human Anatomy. Built-in names are used for any code you leave out.">
        <Textarea rows={6} value={Object.entries({ ...DEFAULT_UNIT_NAMES, ...cfg.unitNames }).map(([k, v]) => `${k} = ${v}`).join("\n")} onChange={(e) => patch((c) => {
          const next: Record<string, string> = {};
          for (const line of e.target.value.split("\n")) { const [k, ...v] = line.split("="); if (k.trim() && v.join("=").trim()) next[k.trim().toUpperCase()] = v.join("=").trim(); }
          c.unitNames = next;
        })} />
      </Section>

      <Section title="Library files" hint="Hide and rename files straight from the library: while signed in as admin, every file row has Hide and Rename buttons.">
        <p className="text-sm text-muted-foreground">{cfg.hiddenFiles.length} hidden · {Object.keys(cfg.renames).length} renamed.</p>
        {cfg.hiddenFiles.length > 0 && <Button type="button" variant="outline" size="sm" onClick={() => patch((c) => { c.hiddenFiles = []; })}>Unhide all files</Button>}
        {Object.keys(cfg.renames).length > 0 && <Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => patch((c) => { c.renames = {}; })}>Clear all renames</Button>}
      </Section>
    </div>
  );
}
