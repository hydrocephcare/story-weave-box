import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadPaywall, OFF, type Paywall } from "@/lib/answersPaywall";

type Db = { from: (t: string) => any };
const field = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

/** /admin/paywall: the payment pop-up that appears when a reader opens model answers. Saved switched off; nothing changes for readers until you turn it on. */
export default function AdminPaywall() {
  const [p, setP] = useState<Paywall>(OFF);
  const [msg, setMsg] = useState("");
  useEffect(() => { void loadPaywall().then(setP); }, []);
  const save = async () => {
    const { error } = await (supabase as unknown as Db).from("site_flags").upsert({ key: "answers_paywall", value: p, updated_at: new Date().toISOString() });
    setMsg(error ? error.message : p.enabled ? "Saved. The payment pop-up is ON for readers." : "Saved. The payment pop-up is OFF.");
  };
  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <h1 className="font-serif text-3xl font-bold">Answers payment</h1>
      <p className="mt-2 text-sm text-muted-foreground">When on, a reader who opens model answers on a past paper sees a payment pop-up first. Questions stay free to read. It is off by default.</p>
      <label className="mt-6 flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={p.enabled} onChange={(e) => setP({ ...p, enabled: e.target.checked })} className="h-4 w-4" />Turn the payment pop-up on</label>
      <label className="mt-4 block text-sm font-semibold">Price shown<input className={field} value={p.price} onChange={(e) => setP({ ...p, price: e.target.value })} placeholder="e.g. KES 200 per month" /></label>
      <label className="mt-4 block text-sm font-semibold">Message<textarea className={field} rows={3} value={p.message} onChange={(e) => setP({ ...p, message: e.target.value })} /></label>
      <label className="mt-4 block text-sm font-semibold">Payment link<input className={field} value={p.payLink} onChange={(e) => setP({ ...p, payLink: e.target.value })} placeholder="https://..." /></label>
      <label className="mt-4 block text-sm font-semibold">Unlock code (given after payment)<input className={field} value={p.code} onChange={(e) => setP({ ...p, code: e.target.value })} /></label>
      <button type="button" onClick={save} className="mt-6 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">Save</button>
      {msg && <p className="mt-3 text-sm">{msg}</p>}
    </div>
  );
}
