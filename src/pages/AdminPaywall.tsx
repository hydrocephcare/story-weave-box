import { useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, Save, LockKeyhole } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type LegacyPaywall = { enabled?: boolean; price?: string; message?: string; payLink?: string; code?: string };
const Db = supabase as unknown as { from: (table: string) => any };

/** One control panel for the site's MCQ paywall. */
export default function AdminPaywall() {
  const [enabled, setEnabled] = useState(false);
  const [freeLimit, setFreeLimit] = useState("15");
  const [price, setPrice] = useState("15");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    Promise.all([
      getSetting("mcq_paywall_enabled"),
      getSetting("mcq_free_limit"),
      getSetting("mcq_price"),
      Db.from("site_flags").select("value").eq("key", "answers_paywall").maybeSingle(),
    ]).then(([enabledRaw, freeRaw, priceRaw, legacy]) => {
      if (!active) return;
      setEnabled(enabledRaw === "true");
      setFreeLimit(freeRaw || "15");
      setPrice(priceRaw || "15");
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
    const limit = Number(freeLimit);
    const amount = Number(price);
    if (!Number.isInteger(limit) || limit < 0 || limit > 500) {
      toast({ title: "Invalid free-question limit", description: "Enter a whole number from 0 to 500.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
      toast({ title: "Invalid price", description: "Enter a valid amount in KES.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        saveSetting("mcq_paywall_enabled", enabled ? "true" : "false"),
        saveSetting("mcq_free_limit", String(limit)),
        saveSetting("mcq_price", String(amount)),
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
        <div><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Monetisation · Unified control</p><h1 className="mt-1 text-2xl font-bold">Paywall 1</h1><p className="mt-1 text-sm text-muted-foreground">One place to configure the question paywall across OmpathStudy. The older model-answer popup is disabled from this control panel.</p></div>
      </div>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div><h2 className="font-semibold">Question access</h2><p className="mt-1 text-sm text-muted-foreground">Master switch for the unified MCQ paywall.</p></div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <label className="text-sm font-medium">Free questions per set<Input className="mt-2" type="number" min="0" max="500" value={freeLimit} onChange={e => setFreeLimit(e.target.value)} /></label>
          <label className="text-sm font-medium">Unlock price (KES)<Input className="mt-2" type="number" min="1" value={price} onChange={e => setPrice(e.target.value)} /></label>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">When enabled, the intended rule is that the first free questions remain answerable, while later questions remain visible but their answers and explanations are locked until the student's account has valid access. When disabled, all questions are open.</p>
        <Button onClick={save} disabled={saving} className="mt-5 gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Paywall 1</Button>
      </section>
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <p className="text-muted-foreground">The admin controls are consolidated here. Secure enforcement across every MCQ source still requires removing public access to raw answer keys and routing question delivery through the protected access check. Do not turn this ON for students until that server-side protection is deployed and tested.</p>
      </div>
    </div>
  );
}
