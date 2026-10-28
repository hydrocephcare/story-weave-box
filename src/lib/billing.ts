// Admin billing: money overview, prices, access passes. The database functions only answer an administrator, so nothing here needs trusting in the browser.
import { supabase } from "@/integrations/supabase/client";
import { getSetting, saveSetting } from "@/lib/store";
import { resetPaymentSettings, type AccessPlan } from "@/lib/access";
import { loadSubscriptionMode, setSubscriptionMode } from "@/lib/subscriptionMode";

type Db = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>; from: (t: string) => any };
const db = () => supabase as unknown as Db;

export interface Overview { today: number; d7: number; d30: number; total: number; completed: number; failed: number; pending: number; active_passes: number; by_plan: { plan: string; n: number; total: number }[]; daily: { d: string; total: number }[] }
export interface Pass { id: string; code: string; plan: string; email: string | null; expires_at: string; amount: number; redeem_count: number; created_at: string }
export interface PaymentRow { id: string; created_at: string; amount: number; payment_status: string; package_type: string | null; buyer_name: string | null; buyer_email: string | null; phone_number: string | null; mpesa_code: string | null }
export interface Prices { subscriptions: boolean; revealPrice: number; accessPrice: number; freePercent: number; downloads: boolean; plans: AccessPlan[]; examPrice: number; mcqPrice: number; mcqFreeLimit: number }

const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

export async function loadOverview(): Promise<Overview> { const r = await db().rpc("admin_billing_overview"); fail(r.error); return r.data as Overview; }
export async function loadPasses(limit = 100): Promise<Pass[]> { const r = await db().rpc("admin_list_passes", { p_limit: limit }); fail(r.error); return (r.data ?? []) as Pass[]; }
export async function loadPayments(limit = 60): Promise<PaymentRow[]> {
  const r = await db().from("payments").select("id,created_at,amount,payment_status,package_type,buyer_name,buyer_email,phone_number,mpesa_code").order("created_at", { ascending: false }).limit(limit);
  fail(r.error); return (r.data ?? []) as PaymentRow[];
}
export async function grantPass(email: string, days: number, plan = "gift"): Promise<string> { const r = await db().rpc("admin_grant_pass", { p_email: email, p_days: days, p_plan: plan }); fail(r.error); return String(r.data); }
export async function revokePass(args: { id?: string; email?: string }): Promise<number> { const r = await db().rpc("admin_revoke_pass", { p_id: args.id ?? null, p_email: args.email ?? null }); fail(r.error); return num(r.data); }

export async function loadPrices(): Promise<Prices> {
  const [on, reveal, access, ratio, pdf, plans, exam, mcq, free] = await Promise.all([loadSubscriptionMode(true), getSetting("reveal_price_kes"), getSetting("access_price_kes"), getSetting("paywall_free_ratio"), getSetting("pdf_download_enabled"), getSetting("access_plans"), getSetting("exam_price"), getSetting("mcq_price"), getSetting("mcq_free_limit")]);
  let parsed: AccessPlan[] = [];
  try { const p = JSON.parse(String(plans ?? "[]")); if (Array.isArray(p)) parsed = p.map((x: any) => ({ id: String(x.id || "").trim() || `plan-${Math.random().toString(36).slice(2, 6)}`, label: String(x.label || ""), price: num(x.price), days: num(x.days, 30), download: x.download !== false })); } catch { /* keep empty */ }
  return { subscriptions: on, revealPrice: num(reveal), accessPrice: num(access), freePercent: Math.round((1 - 0) * 0 + num(ratio, 0.25) * 100), downloads: pdf !== "false", plans: parsed, examPrice: num(exam, 5), mcqPrice: num(mcq, 10), mcqFreeLimit: num(free, 10) };
}

/** Saves only what is given, so the admin and the AI can change one price at a time. */
export async function savePrices(p: Partial<Prices>): Promise<void> {
  if (p.revealPrice !== undefined) await saveSetting("reveal_price_kes", String(Math.max(0, Math.round(p.revealPrice))));
  if (p.accessPrice !== undefined) await saveSetting("access_price_kes", String(Math.max(0, Math.round(p.accessPrice))));
  if (p.freePercent !== undefined) await saveSetting("paywall_free_ratio", String(Math.min(0.9, Math.max(0.05, p.freePercent / 100))));
  if (p.downloads !== undefined) await saveSetting("pdf_download_enabled", p.downloads ? "true" : "false");
  if (p.plans !== undefined) await saveSetting("access_plans", JSON.stringify(p.plans.filter((x) => x.label.trim() && x.price >= 0 && x.days >= 1).map((x) => ({ id: x.id, label: x.label.trim(), price: Math.round(x.price), days: Math.round(x.days), download: x.download !== false }))));
  if (p.examPrice !== undefined) await saveSetting("exam_price", String(Math.max(0, Math.round(p.examPrice))));
  if (p.mcqPrice !== undefined) await saveSetting("mcq_price", String(Math.max(0, Math.round(p.mcqPrice))));
  if (p.mcqFreeLimit !== undefined) await saveSetting("mcq_free_limit", String(Math.max(0, Math.round(p.mcqFreeLimit))));
  if (p.subscriptions !== undefined) await setSubscriptionMode(p.subscriptions, false);
  resetPaymentSettings();
}

export const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

/** One short text of the money position, for the admin assistant. */
export async function billingReport(): Promise<string> {
  const [o, pr] = await Promise.all([loadOverview(), loadPrices()]);
  const plans = pr.plans.map((p) => `${p.label}: ${kes(p.price)} for ${p.days} days`).join("; ") || "none set";
  return [
    `Subscriptions are ${pr.subscriptions ? "ON" : "OFF (everything is free)"}.`,
    `Income: today ${kes(o.today)}, last 7 days ${kes(o.d7)}, last 30 days ${kes(o.d30)}, all time ${kes(o.total)} from ${o.completed} payments (${o.failed} failed, ${o.pending} pending). ${o.active_passes} access passes are active.`,
    `Plans: ${plans}. Reveal ${kes(pr.revealPrice)}, exam ${kes(pr.examPrice)}, MCQ pack ${kes(pr.mcqPrice)} after ${pr.mcqFreeLimit} free; ${pr.freePercent}% of locked pages stay free.`,
  ].join("\n");
}
