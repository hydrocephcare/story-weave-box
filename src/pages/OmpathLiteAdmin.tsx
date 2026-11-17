import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Encounter = {
  id: string;
  concern_category: string | null;
  status: string;
  urgency_level: string;
  channel: string;
  created_at: string;
  updated_at: string;
};
type Data = {
  healthEncounters: Encounter[];
  stats: { encounters: number; emergency: number; urgent: number; awaiting: number; completed: number };
};

export default function OmpathLiteAdmin() {
  const { session } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (!session?.access_token) throw new Error("Sign in as an administrator.");
      const response = await fetch("/api/ompath-lite-admin", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load Health Support data.");
      setData(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load Health Support data.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void refresh(); }, [refresh]);

  return <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
      <div>
        <Link to="/admin" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Main admin</Link>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">OmpathStudy · Lite Health Support</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-foreground sm:text-4xl">Health Support operations</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Monitor de-identified intake activity. Phone numbers, symptom narratives and clinical assessment details are not exposed in this dashboard.</p>
      </div>
      <button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm"><RefreshCw className="h-4 w-4" /> Refresh</button>
    </div>

    {error && <div role="alert" className="mb-5 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}

    {loading ? <div className="flex min-h-48 items-center justify-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading Health Support activity…</div> : data && <>
      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Recent enquiries", value: data.stats.encounters, icon: Clock3 },
          { label: "Emergency", value: data.stats.emergency, icon: AlertTriangle },
          { label: "Urgent", value: data.stats.urgent, icon: AlertTriangle },
          { label: "Awaiting action", value: data.stats.awaiting, icon: Clock3 },
          { label: "Completed", value: data.stats.completed, icon: CheckCircle2 },
        ].map((item) => <div key={item.label} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 text-muted-foreground"><span className="text-xs">{item.label}</span><item.icon className="h-4 w-4" /></div>
          <p className="mt-3 text-3xl font-bold tabular-nums">{item.value}</p>
        </div>)}
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-4"><h2 className="font-semibold">Recent de-identified enquiries</h2><p className="mt-1 text-xs text-muted-foreground">The latest 200 encounters, showing category, urgency, channel and timestamp only.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3">Concern</th><th className="p-3">Urgency</th><th className="p-3">Status</th><th className="p-3">Channel</th><th className="p-3">Received</th></tr></thead>
            <tbody>{data.healthEncounters.map((item) => <tr key={item.id} className="border-t border-border">
              <td className="p-3 font-medium">{item.concern_category || "Not specified"}</td>
              <td className="p-3"><span className={item.urgency_level === "emergency" ? "font-semibold text-destructive" : item.urgency_level === "urgent" ? "font-semibold text-amber-700" : "text-muted-foreground"}>{item.urgency_level}</span></td>
              <td className="p-3">{item.status.replace(/_/g, " ")}</td>
              <td className="p-3 uppercase text-xs">{item.channel}</td>
              <td className="p-3 text-muted-foreground">{new Date(item.created_at).toLocaleString()}</td>
            </tr>)}</tbody>
          </table>
          {!data.healthEncounters.length && <p className="p-6 text-sm text-muted-foreground">No health enquiries have been recorded yet.</p>}
        </div>
      </section>
    </>}
    <div className="mt-8 text-xs text-muted-foreground">OmpathStudy Lite is a health-support intake channel. Medical learning remains on the main OmpathStudy website.</div>
  </div>;
}
