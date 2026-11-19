import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, Save, LockKeyhole, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

type LegacyPaywall = { enabled?: boolean; price?: string; message?: string; payLink?: string; code?: string };
const Db = supabase as unknown as { from: (table: string) => any };

/** One control panel for the site's MCQ paywall. */
export default function AdminPaywall() {
  const [enabled, setEnabled] = useState(false);
  const [freePercent, setFreePercent] = useState("25");
  const [mcqSets, setMcqSets] = useState<{ id: string; title: string; category: string | null; slug: string | null }[]>([]);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    Promise.all([
      getSetting("mcq_paywall_enabled"),
      getSetting("paywall_free_ratio"),
      getSetting("mcq_paywall_excluded_ids"),
      Db.from("mcq_sets").select("id,title,category,slug").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
      Db.from("site_flags").select("value").eq("key", "answers_paywall").maybeSingle(),
    ]).then(([enabledRaw, freeRaw, excludedRaw, setsResult, legacy]) => {
      if (!active) return;
      setEnabled(enabledRaw === "true");
      setFreePercent(String(Math.round(Math.min(0.9, Math.max(0.05, Number(freeRaw ?? "0.25"))) * 100)));
      try { const ids = JSON.parse(excludedRaw || "[]"); setExcludedIds(Array.isArray(ids) ? ids.map(String) : []); } catch { setExcludedIds([]); }
      setMcqSets(setsResult?.data || []);
      // The old model-answer popup is intentionally kept off; this page is the single MCQ paywall control.
      const old = (legacy?.data?.value || {}) as LegacyPaywall;
      if (old.enabled) {
        void Db.from("site_flags").upsert({ key: "answers_paywall", value: { ...old, enabled: false }, updated_at: new Date().toISOString() });
      }
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { active = false; };
  }, []);

  const save = async () => {
    const percent = Number(freePercent);
    if (!Number.isInteger(percent) || percent < 5 || percent > 90) {
      toast({ title: "Invalid free preview percentage", description: "Enter a whole percentage from 5 to 90.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        saveSetting("mcq_paywall_enabled", enabled ? "true" : "false"),
        saveSetting("paywall_free_ratio", String(percent / 100)),
        saveSetting("mcq_paywall_excluded_ids", JSON.stringify(excludedIds)),
      ]);
      const { data: old } = await Db.from("site_flags").select("value").eq("key", "answers_paywall").maybeSingle();
      await Db.from("site_flags").upsert({ key: "answers_paywall", value: { ...(old?.value || {}), enabled: false }, updated_at: new Date().toISOString() });
      toast({ title: "Paywall 1 settings saved", description: enabled ? "The unified paywall setting is ON." : "The unified paywall setting is OFF." });
    } catch (error: any) {
      toast({ title: "Could not save paywall settings", description: error?.message || "Please try again.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><LockKeyhole className="h-6 w-6" /></div>
        <div><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Monetisation · Unified control</p><h1 className="mt-1 text-2xl font-bold">Paywall 1</h1><p className="mt-1 text-sm text-muted-foreground">One place to configure the question paywall across OmpathStudy. The MCQ paywall controls free previews and bank exemptions. Subscription prices are managed in Billing.</p></div>
      </div>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div><h2 className="font-semibold">Question access</h2><p className="mt-1 text-sm text-muted-foreground">Master switch for the unified MCQ paywall.</p></div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <label className="text-sm font-medium">Free question preview (%)<Input className="mt-2" type="number" min="5" max="90" step="1" value={freePercent} onChange={e => setFreePercent(e.target.value)} /><span className="mt-1 block text-xs font-normal text-muted-foreground">Default: 25%. Calculated separately for each question bank.</span></label>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">When enabled, the intended rule is that the selected percentage of each question bank remains answerable. Questions after that point appear under a translucent locked preview until the student's account has valid access. When disabled, all questions are open.</p>
        <Button onClick={save} disabled={saving} className="mt-5 gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Paywall 1</Button>
      </section>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="font-semibold">Exempt individual MCQ banks</h2>
        <p className="mt-1 text-sm text-muted-foreground">Selected banks remain completely free even when the global MCQ paywall is enabled. This does not change subscription access elsewhere.</p>
        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
          {mcqSets.map((item) => {
            const excluded = excludedIds.includes(item.id);
            return <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/40">
              <input type="checkbox" checked={excluded} onChange={(e) => setExcludedIds((current) => e.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} className="mt-1 h-4 w-4 accent-primary" />
              <span className="min-w-0"><span className="block text-sm font-semibold">{item.title}</span><span className="block text-xs text-muted-foreground">{item.category || "Uncategorised"} · {excluded ? "Paywall exempt" : "Paywall applies"}</span></span>
            </label>;
          })}
          {mcqSets.length === 0 && <p className="text-sm text-muted-foreground">No published MCQ banks found.</p>}
        </div>
        <Button onClick={save} disabled={saving} className="mt-4 gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save exemptions with Paywall settings</Button>
      </section>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="font-semibold">Subscription prices and payment plans</h2>
        <p className="mt-1 text-sm text-muted-foreground">Set plan names, prices, duration and download access in Billing. The checkout uses those saved prices.</p>
        <Link to="/admin/billing" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Manage prices and plans <ExternalLink className="h-4 w-4" /></Link>
      </section>
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <p className="text-muted-foreground">The admin controls are consolidated here. Secure enforcement across every MCQ source still requires removing public access to raw answer keys and routing question delivery through the protected access check. Do not turn this ON for students until that server-side protection is deployed and tested.</p>
      </div>
    </div>
  );
}
