import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
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
type SmsSettings = { enabled: boolean; environment: "sandbox" | "production"; sender_id: string | null; updated_at?: string };
type Data = {
  healthEncounters: Encounter[];
  smsSettings: SmsSettings;
  smsCredentials: { production: boolean };
  stats: { encounters: number; emergency: number; urgent: number; awaiting: number; completed: number };
};

export default function OmpathLiteAdmin() {
  const { session } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [settings, setSettings] = useState<SmsSettings>({ enabled: false, environment: "sandbox", sender_id: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (!session?.access_token) throw new Error("Sign in as an administrator.");
      const response = await fetch("/api/ompath-lite-admin", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load Health Support data.");
      setData(payload);
      setSettings(payload.smsSettings || { enabled: false, environment: "sandbox", sender_id: "" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load Health Support data.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void refresh(); }, [refresh]);

  const saveSettings = async () => {
    if (!session?.access_token) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/ompath-lite-admin", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-settings", ...settings }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save settings.");
      setSettings(payload.settings);
      setMessage("Patient guide SMS settings saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
      <div>
        <Link to="/admin" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Main admin</Link>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">OmpathStudy · Lite Health Support</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-foreground sm:text-4xl">Health Support operations</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Monitor de-identified intake activity and control delivery of reviewed patient information. Clinical details and phone numbers are not shown in this dashboard.</p>
      </div>
      <button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm"><RefreshCw className="h-4 w-4" /> Refresh</button>
    </div>

    {error && <div role="alert" className="mb-5 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
    {message && <div role="status" className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-700">{message}</div>}

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

      <section className="mb-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Patient information SMS</h2></div>
        <p className="mt-1 text-sm text-muted-foreground">Only send a private link when the caller explicitly consents. Links are generated from reviewed patient-facing OmpathStudy resources, expire after seven days and can be revoked through STOP.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Provider environment
            <select value={settings.environment} onChange={(event) => setSettings((current) => ({ ...current, environment: event.target.value as "sandbox" | "production", enabled: false }))} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5">
              <option value="sandbox">Sandbox / paused</option><option value="production">Live / Production</option>
            </select>
          </label>
          <label className="block text-sm font-medium">Sender ID (optional)
            <input value={settings.sender_id || ""} onChange={(event) => setSettings((current) => ({ ...current, sender_id: event.target.value }))} maxLength={32} placeholder="Approved sender ID" className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5" />
          </label>
        </div>
        <div className="mt-4 rounded-xl border border-border p-4">
          <p className="text-sm font-semibold">Live credentials</p>
          <p className="mt-1 text-sm text-muted-foreground">{data.smsCredentials.production ? "Live Africa's Talking credentials are configured." : "Live credentials are not configured. Add AT_LIVE_USERNAME and AT_LIVE_API_KEY as Cloudflare Pages production secrets before enabling SMS."}</p>
        </div>
        <label className="mt-4 flex items-start gap-3 rounded-xl border border-border p-4">
          <input type="checkbox" checked={settings.enabled} disabled={settings.environment !== "production" || !data.smsCredentials.production} onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))} className="mt-1 h-4 w-4 disabled:opacity-40" />
          <span><span className="block text-sm font-semibold">Enable consented patient-guide SMS</span><span className="mt-1 block text-xs text-muted-foreground">When enabled, the background queue can deliver reviewed guide links to users who explicitly requested SMS. No marketing or MCQ messages are sent by Lite.</span></span>
        </label>
        <button type="button" disabled={saving || !session?.access_token} onClick={() => void saveSettings()} className="mt-4 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Saving…" : "Save SMS settings"}</button>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-4"><h2 className="font-semibold">Recent de-identified enquiries</h2><p className="mt-1 text-xs text-muted-foreground">Only category, urgency, channel and timestamps are shown. No phone number or symptom narrative is exposed here.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3">Concern</th><th className="p-3">Urgency</th><th className="p-3">Status</th><th className="p-3">Channel</th><th className="p-3">Received</th></tr></thead>
            <tbody>{data.healthEncounters.map((item) => <tr key={item.id} className="border-t border-border">
              <td className="p-3 font-medium">{item.concern_category || "Not specified"}</td>
              <td className="p-3"><span className={item.urgency_level === "emergency" ? "font-semibold text-destructive" : item.urgency_level === "urgent" ? "font-semibold text-amber-700" : "text-muted-foreground"}>{item.urgency_level}</span></td>
              <td className="p-3">{item.status.replaceAll("_", " ")}</td>
              <td className="p-3 uppercase text-xs">{item.channel}</td>
              <td className="p-3 text-muted-foreground">{new Date(item.created_at).toLocaleString()}</td>
            </tr>)}</tbody>
          </table>
          {!data.healthEncounters.length && <p className="p-6 text-sm text-muted-foreground">No health enquiries have been recorded yet.</p>}
        </div>
      </section>
    </>}
    <div className="mt-8 text-xs text-muted-foreground">OmpathStudy Lite is a health-support intake channel. All medical learning remains on the main OmpathStudy website.</div>
  </div>;
}
