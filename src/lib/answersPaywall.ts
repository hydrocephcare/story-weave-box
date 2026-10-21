import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** The admin's answers-payment switch (table site_flags, key answers_paywall). Off until the admin turns it on at /admin/paywall. */
export interface Paywall { enabled: boolean; price: string; message: string; payLink: string; code: string }
export const OFF: Paywall = { enabled: false, price: "", message: "", payLink: "", code: "" };
const PAID = "ompath_answers_paid";
type Db = { from: (t: string) => any };

export const isPaid = () => { try { return localStorage.getItem(PAID) === "1"; } catch { return false; } };
export const markPaid = () => { try { localStorage.setItem(PAID, "1"); } catch { /* private window */ } };

export async function loadPaywall(): Promise<Paywall> {
  try {
    const r = await (supabase as unknown as Db).from("site_flags").select("value").eq("key", "answers_paywall").maybeSingle();
    return { ...OFF, ...(r.data?.value ?? {}) };
  } catch { return OFF; }
}

export function usePaywall(): Paywall {
  const [p, setP] = useState<Paywall>(OFF);
  useEffect(() => { let on = true; void loadPaywall().then((v) => { if (on) setP(v); }); return () => { on = false; }; }, []);
  return p;
}
