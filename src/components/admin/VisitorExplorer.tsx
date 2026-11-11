import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, UserRound, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type JourneyRow = { at: string; path: string; device?: string | null; referrer?: string | null };
type Visitor = {
  person: string; visitor_id: string; email?: string | null; display_name?: string | null;
  signed_in: boolean; is_admin: boolean; views: number; active_days: number;
  first_seen: string; last_seen: string; last_path: string; device?: string | null; referrer?: string | null;
};
type SessionRow = { started: string; ended: string; views: number };
type Detail = {
  sessions: SessionRow[];
  profile: { visitor_id: string; email?: string | null; display_name?: string | null; signed_in: boolean; is_admin: boolean; views: number; active_days: number; first_seen: string; last_seen: string; device?: string | null };
  journey: JourneyRow[];
  events: { at: string; event: string; path: string; properties: Record<string, unknown> }[];
};
type VisitorFilter = "all" | "accounts" | "guests";
type Engagement = { counts: { searches: number; courseOpens: number; resourceOpens: number; mcqAnswers: number; flashcardReviews: number; examStarts: number; examCompletes: number }; topSearches: { term: string; searches: number }[]; topResources: { path: string; opens: number }[] };
const dateTime = (value?: string) => value ? new Date(value).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" }) : "—";
const rpc = async <T,>(name: string, args: Record<string, unknown>) => {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw error;
  return data as T;
};

export default function VisitorExplorer() {
  const [tab, setTab] = useState<"visitors" | "mine">("mine");
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [total, setTotal] = useState(0);
  const [includeAdmins, setIncludeAdmins] = useState(false);
  const [visitorFilter, setVisitorFilter] = useState<VisitorFilter>("all");
  const [selected, setSelected] = useState<Detail | null>(null);
  const [mine, setMine] = useState<{ profile: Record<string, unknown>; journey: JourneyRow[]; sessions?: SessionRow[] } | null>(null);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadEngagement = useCallback(async () => {
    try { setEngagement(await rpc<Engagement>("admin_site_engagement", { p_days: 30 })); }
    catch { /* engagement is supplementary; keep the rest of analytics available */ }
  }, []);

  const loadVisitors = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await rpc<{ total: number; items: Visitor[] }>("admin_visitor_list", { p_days: 30, p_limit: 50, p_offset: 0, p_include_admins: includeAdmins });
      setVisitors(data.items ?? []); setTotal(data.total ?? 0);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load visitor profiles."); }
    finally { setLoading(false); }
  }, [includeAdmins]);

  const loadMine = useCallback(async () => {
    setLoading(true); setError("");
    try { setMine(await rpc("my_site_activity", { p_days: 90 })); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load your activity."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadEngagement(); }, [loadEngagement]);
  useEffect(() => { if (tab === "visitors") void loadVisitors(); else void loadMine(); }, [tab, loadVisitors, loadMine]);

  const openVisitor = async (person: string) => {
    setLoading(true); setError("");
    try { setSelected(await rpc<Detail>("admin_visitor_detail", { p_person: person, p_days: 90 })); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load this visitor."); }
    finally { setLoading(false); }
  };

  const Journey = ({ rows }: { rows: JourneyRow[] }) => rows.length ? (
    <ol className="mt-3 divide-y divide-border rounded-xl border border-border">
      {rows.map((v, i) => <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-3 text-sm">
        <span className="w-full text-xs text-muted-foreground sm:w-36">{dateTime(v.at)}</span>
        <a className="min-w-0 flex-1 break-all font-semibold text-primary hover:underline" href={v.path} target="_blank" rel="noreferrer">{v.path}</a>
        <span className="text-xs text-muted-foreground">{v.device || "Device unknown"}</span>
        {v.referrer && <span className="text-xs text-muted-foreground">via {v.referrer}</span>}
        <a href={v.path} target="_blank" rel="noreferrer" aria-label={`Open ${v.path}`} className="text-muted-foreground hover:text-primary"><ExternalLink className="h-4 w-4" /></a>
      </li>)}
    </ol>
  ) : <p className="mt-3 text-sm text-muted-foreground">No page activity is recorded for this period yet. Your next tracked visit will appear here.</p>;

  return <section className="mt-10 rounded-2xl border border-border p-4 sm:p-5" aria-label="Visitor profiles and personal activity">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Visitor intelligence</p><h2 className="mt-1 font-serif text-2xl font-bold">People and browsing journeys</h2></div>
      <button type="button" onClick={() => tab === "visitors" ? void loadVisitors() : void loadMine()} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:border-primary"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh</button>
    </div>
    <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Activity view">
      <button type="button" role="tab" aria-selected={tab === "mine"} onClick={() => { setTab("mine"); setSelected(null); }} className={cn("rounded-full border px-4 py-2 text-sm font-semibold", tab === "mine" ? "border-primary bg-primary text-primary-foreground" : "border-border")}>My activity</button>
      <button type="button" role="tab" aria-selected={tab === "visitors"} onClick={() => { setTab("visitors"); setSelected(null); }} className={cn("rounded-full border px-4 py-2 text-sm font-semibold", tab === "visitors" ? "border-primary bg-primary text-primary-foreground" : "border-border")}>All visitors</button>
    </div>
    {engagement && <div className="mt-5 rounded-xl bg-muted/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-serif text-lg font-bold">Student study engagement</h3><span className="text-xs text-muted-foreground">Last 30 days · new event tracking</span></div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><p className="font-serif text-2xl font-bold">{engagement.counts.searches.toLocaleString("en-US")}</p><p className="text-xs text-muted-foreground">Submitted searches</p></div>
        <div><p className="font-serif text-2xl font-bold">{engagement.counts.courseOpens.toLocaleString("en-US")}</p><p className="text-xs text-muted-foreground">Course opens</p></div>
        <div><p className="font-serif text-2xl font-bold">{engagement.counts.resourceOpens.toLocaleString("en-US")}</p><p className="text-xs text-muted-foreground">Resource opens</p></div>
        <div><p className="font-serif text-2xl font-bold">{engagement.counts.mcqAnswers.toLocaleString("en-US")}</p><p className="text-xs text-muted-foreground">MCQ answers</p></div>
        <div><p className="font-serif text-2xl font-bold">{engagement.counts.flashcardReviews.toLocaleString("en-US")}</p><p className="text-xs text-muted-foreground">Flashcard reviews</p></div>
        <div><p className="font-serif text-2xl font-bold">{engagement.counts.examStarts.toLocaleString("en-US")}</p><p className="text-xs text-muted-foreground">Exam starts</p></div>
        <div><p className="font-serif text-2xl font-bold">{engagement.counts.examCompletes.toLocaleString("en-US")}</p><p className="text-xs text-muted-foreground">Exam completions</p></div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Top searches</p>{engagement.topSearches.length ? <ul className="mt-2 space-y-1 text-sm">{engagement.topSearches.slice(0,5).map(x => <li key={x.term} className="flex justify-between gap-2"><span className="truncate">{x.term}</span><span className="text-muted-foreground">{x.searches}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Search data will appear after students submit searches on the updated site.</p>}</div>
        <div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Most opened resources</p>{engagement.topResources.length ? <ul className="mt-2 space-y-1 text-sm">{engagement.topResources.slice(0,5).map(x => <li key={x.path} className="flex justify-between gap-2"><a className="truncate text-primary hover:underline" href={x.path} target="_blank" rel="noreferrer">{x.path}</a><span className="text-muted-foreground">{x.opens}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Resource engagement will populate as students use the updated site.</p>}</div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Search terms are recorded only when submitted and truncated to 100 characters. MCQ question and answer text is not copied into this analytics event stream. Historical interaction events are not reconstructed.</p>
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {tab === "mine" && <div className="mt-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><p className="font-serif text-2xl font-bold">{Number(mine?.profile?.views ?? 0).toLocaleString("en-US")}</p><p className="text-xs text-muted-foreground">My page views · 90 days</p></div>
        <div><p className="font-serif text-2xl font-bold">{Number(mine?.profile?.active_days ?? 0).toLocaleString("en-US")}</p><p className="text-xs text-muted-foreground">Days active</p></div>
        <div><p className="text-sm font-semibold">{dateTime(mine?.profile?.first_seen as string)}</p><p className="text-xs text-muted-foreground">First recorded visit</p></div>
        <div><p className="text-sm font-semibold">{dateTime(mine?.profile?.last_seen as string)}</p><p className="text-xs text-muted-foreground">Last recorded visit</p></div>
      </div>
      <h3 className="mt-6 font-serif text-lg font-bold">Your page-by-page history (latest 250 records)</h3>
      <Journey rows={mine?.journey ?? []} />
      <h3 className="mt-6 font-serif text-lg font-bold">Your sessions (latest 100)</h3>
      {(mine?.sessions ?? []).length ? <ol className="mt-3 divide-y divide-border rounded-xl border border-border">{mine!.sessions!.map((s,i) => <li key={i} className="flex flex-wrap justify-between gap-2 px-3 py-3 text-sm"><span>{dateTime(s.started)} – {dateTime(s.ended)}</span><span className="text-muted-foreground">{s.views} page views</span></li>)}</ol> : <p className="mt-2 text-sm text-muted-foreground">No sessions recorded yet.</p>}
      <p className="mt-3 text-xs text-muted-foreground">This view is tied to your signed-in account. Visits made while signed out are joined only after that browser signs in; unrelated guest browsing is not attributed to you.</p>
    </div>}
    {tab === "visitors" && !selected && <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{total.toLocaleString("en-US")} visitor identities in the last 30 days · latest activity first</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeAdmins} onChange={(e) => setIncludeAdmins(e.target.checked)} /> Include admin traffic</label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter visitor type">{(["all","accounts","guests"] as VisitorFilter[]).map(k => <button key={k} type="button" onClick={() => setVisitorFilter(k)} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold capitalize", visitorFilter===k ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{k === "all" ? "Everyone" : k === "accounts" ? "Signed-in accounts" : "Guest browsers"}</button>)}</div>
      {(visitors.filter(v => visitorFilter === "all" || (visitorFilter === "accounts" ? v.signed_in : !v.signed_in)).length > 0) ? <div className="mt-3 divide-y divide-border rounded-xl border border-border">
        {visitors.filter(v => visitorFilter === "all" || (visitorFilter === "accounts" ? v.signed_in : !v.signed_in)).map(v => <button key={v.person} type="button" onClick={() => void openVisitor(v.person)} className="grid w-full grid-cols-[1fr_auto] gap-2 px-3 py-3 text-left hover:bg-muted/50 sm:grid-cols-[1.2fr_1fr_auto_auto] sm:items-center">
          <span className="min-w-0"><span className="block truncate font-semibold">{v.display_name || v.email || v.visitor_id}</span><span className="text-xs text-muted-foreground">{v.signed_in ? "Signed-in account" : "Guest browser"}{v.is_admin ? " · Admin" : ""}</span></span>
          <span className="min-w-0 truncate text-sm text-muted-foreground">{v.last_path}</span>
          <span className="text-sm font-semibold">{v.views} views · {v.active_days} days</span>
          <span className="text-xs text-muted-foreground">{dateTime(v.last_seen)}</span>
        </button>)}
      </div> : <p className="mt-3 text-sm text-muted-foreground">No visitor records found for this filter.</p>}
      <p className="mt-3 text-xs text-muted-foreground">Guest identities are browser-based, not verified human identities. Signed-in accounts can be linked across devices. Older records may have less reliable identity mapping. We do not collect IP addresses or precise location.</p>
    </div>}
    {tab === "visitors" && selected && <div className="mt-5">
      <button type="button" onClick={() => setSelected(null)} className="text-sm font-semibold text-primary hover:underline">← Back to visitors</button>
      <div className="mt-3 flex items-start gap-3">
        <span className="rounded-full bg-muted p-3"><UserRound className="h-5 w-5" /></span>
        <div className="min-w-0"><h3 className="break-all font-serif text-xl font-bold">{selected.profile.display_name || selected.profile.email || selected.profile.visitor_id}</h3><p className="text-sm text-muted-foreground">{selected.profile.signed_in ? "Signed-in account" : "Guest browser"}{selected.profile.is_admin ? " · Admin" : ""}</p></div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><p className="font-serif text-2xl font-bold">{selected.profile.views}</p><p className="text-xs text-muted-foreground">Page views</p></div>
        <div><p className="font-serif text-2xl font-bold">{selected.profile.active_days}</p><p className="text-xs text-muted-foreground">Active days</p></div>
        <div><p className="text-sm font-semibold">{dateTime(selected.profile.first_seen)}</p><p className="text-xs text-muted-foreground">First seen in range</p></div>
        <div><p className="text-sm font-semibold">{dateTime(selected.profile.last_seen)}</p><p className="text-xs text-muted-foreground">Last seen</p></div>
      </div>
      <h4 className="mt-6 font-serif text-lg font-bold">Browsing journey (latest 200 records)</h4>
      <Journey rows={selected.journey} />
      <h4 className="mt-6 font-serif text-lg font-bold">Session history (latest 100)</h4>
      {selected.sessions?.length ? <ol className="mt-3 divide-y divide-border rounded-xl border border-border">{selected.sessions.map((s,i) => <li key={i} className="flex flex-wrap justify-between gap-2 px-3 py-3 text-sm"><span>{dateTime(s.started)} – {dateTime(s.ended)}</span><span className="text-muted-foreground">{s.views} page views</span></li>)}</ol> : <p className="mt-2 text-sm text-muted-foreground">No sessions recorded.</p>}
      {selected.events?.length > 0 && <><h4 className="mt-6 font-serif text-lg font-bold">Study interactions</h4><ul className="mt-3 divide-y divide-border rounded-xl border border-border">{selected.events.filter(e => e.event !== "page_view").map((e,i) => <li key={i} className="px-3 py-3 text-sm"><span className="font-semibold">{e.event.replaceAll("_"," ")}</span><span className="ml-2 text-xs text-muted-foreground">{dateTime(e.at)}</span><p className="mt-1 text-muted-foreground">{e.path}</p>{Object.keys(e.properties ?? {}).length > 0 && <p className="mt-1 break-words text-xs text-muted-foreground">{Object.entries(e.properties).filter(([k,v]) => k !== "device" && k !== "referrer" && v !== null && v !== "").map(([k,v]) => `${k}: ${String(v)}`).join(" · ")}</p>}</li>)}</ul></>}
    </div>}
    {loading && <p className="mt-3 text-xs text-muted-foreground">Loading activity…</p>}
    <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-4 w-4" /> Admin browsing is excluded from the student traffic totals; use “My activity” to inspect your own visits.</div>
  </section>;
}
