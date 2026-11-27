import { neon } from "@neondatabase/serverless";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";

const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL || "https://ep-dry-haze-benks3ew.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth/.well-known/jwks.json"));
const out = (res, status, body) => res.status(status).json(body);
const db = () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
  return neon(process.env.DATABASE_URL);
};
const codeKey = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const newCode = () => "OM-" + randomBytes(8).toString("hex").toUpperCase().slice(0, 8);
const phoneNumber = (v) => {
  const d = String(v || "").replace(/\D/g, "");
  return d.length >= 9 && d.length <= 15 ? "+" + d : "";
};
async function userFromRequest(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const result = await jwtVerify(token, jwks);
    const p = result.payload;
    const id = String(p.sub || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const sql = db();
    const account = await sql.query("SELECT email FROM auth.users WHERE id=$1 LIMIT 1", [id]);
    const email = String(p.email || p.user?.email || account[0]?.email || "").trim().toLowerCase();
    if (!email) return null;
    return { id, email, name: String(p.name || p.user?.name || "").slice(0, 120) };
  } catch { return null; }
}
async function verifyWithPaystack(reference, secret) {
  const response = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
    headers: { Authorization: "Bearer " + secret, Accept: "application/json" }
  });
  const body = await response.json().catch(() => ({}));
  return response.ok && body.status === true ? body.data : null;
}
async function initiate(req, res) {
  const user = await userFromRequest(req);
  if (!user) return out(res, 401, { success: false, error: "Sign in again before paying." });
  const secret = process.env.PAYSTACK_SECRET_KEY || "";
  if (!secret) return out(res, 503, { success: false, error: "Paystack server key is not configured." });
  const b = req.body || {};
  const method = String(b.method || "card").toLowerCase();
  const country = String(b.pricing_country || b.country_code || "KE").toUpperCase();
  const countryCode = String(b.country_code || "KE").toUpperCase();
  const phone = phoneNumber(b.phone);
  const planId = String(b.package_type || "annual").slice(0, 80);
  if (!["card", "mpesa", "airtel"].includes(method)) return out(res, 400, { success: false, error: "Choose Card, M-Pesa or Airtel Money." });
  if (!phone) return out(res, 400, { success: false, error: "Enter a valid mobile number with country code." });
  if ((country !== "KE" || countryCode !== "KE") && method !== "card") return out(res, 400, { success: false, error: "International visitors must use card checkout." });
  const sql = db();
  const setting = await sql.query("SELECT value FROM public.app_settings WHERE key = 'access_plans' LIMIT 1");
  let plans = [];
  try { plans = JSON.parse(String(setting[0]?.value || "[]")); } catch {}
  const plan = plans.find((p) => p && p.id === planId);
  if (!plan) return out(res, 400, { success: false, error: "That subscription plan is no longer available. Refresh and try again." });
  const currency = country === "KE" ? "KES" : "USD";
  const amount = currency === "KES" ? Number(plan.price) : Number(plan.internationalPrice ?? 21);
  if (!Number.isInteger(amount) || amount < (currency === "KES" ? 3 : 2) || amount > 1000000) return out(res, 400, { success: false, error: "The configured subscription price is invalid." });
  const enabled = await sql.query("SELECT value FROM public.app_settings WHERE key = 'paystack_enabled' LIMIT 1");
  if (String(enabled[0]?.value || "").toLowerCase() !== "true") return out(res, 503, { success: false, error: "Online payments are temporarily unavailable." });
  const reference = "OMP-" + randomBytes(16).toString("hex").toUpperCase();
  let callback = "https://www.ompathstudy.com/";
  try {
    const u = new URL(String(b.return_url || ""));
    if (u.protocol === "https:" && ["www.ompathstudy.com", "ompathstudy.com"].includes(u.hostname)) callback = u.toString();
  } catch {}
  const callbackUrl = new URL(callback);
  callbackUrl.searchParams.set("paystack_ref", reference);
  callbackUrl.searchParams.set("paystack_plan", planId);
  await sql.query("INSERT INTO public.payments (phone_number,amount,currency,pricing_country,payment_status,transaction_id,provider_txn_id,package_type,buyer_email,buyer_name,user_id) VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10)",
    [phone, amount, currency, country, reference, "paystack:" + reference, planId, user.email, user.name || null, user.id]);
  const card = method === "card";
  const payload = {
    email: user.email, amount: String(amount * 100), currency, reference,
    metadata: { user_id: user.id, package_type: planId, source: "ompathstudy" },
    ...(card ? { channels: ["card"], callback_url: callbackUrl.toString() } : { mobile_money: { phone, provider: method === "mpesa" ? "mpesa" : "atl" } })
  };
  const response = await fetch("https://api.paystack.co/" + (card ? "transaction/initialize" : "charge"), {
    method: "POST", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.status !== true) {
    await sql.query("UPDATE public.payments SET payment_status='failed',updated_at=now() WHERE transaction_id=$1 AND payment_status='pending'", [reference]);
    return out(res, 502, { success: false, error: String(result.message || "Paystack could not start the payment.").slice(0, 240) });
  }
  if (card) {
    const url = String(result.data?.authorization_url || "");
    if (!/^https:\/\/checkout\.paystack\.com\//i.test(url)) {
      await sql.query("UPDATE public.payments SET payment_status='failed',updated_at=now() WHERE transaction_id=$1 AND payment_status='pending'", [reference]);
      return out(res, 502, { success: false, error: "Paystack did not return a valid secure checkout URL." });
    }
    return out(res, 200, { success: true, method, transaction_id: reference, checkout_url: url });
  }
  return out(res, 200, { success: true, method, transaction_id: reference, provider_status: String(result.data?.status || "pending").toLowerCase(), provider_message: String(result.data?.display_text || result.message || "Approve the payment prompt on your phone.").slice(0, 240) });
}
async function checkPayment(req, res) {
  const user = await userFromRequest(req);
  if (!user) return out(res, 401, { success: false, error: "Sign in to check this payment." });
  const reference = String(req.body?.transaction_id || req.query?.transaction_id || "").trim();
  if (!reference) return out(res, 400, { success: false, error: "Transaction ID required." });
  const sql = db();
  const rows = await sql.query("SELECT id,amount,currency,payment_status,transaction_id,provider_txn_id,mpesa_code FROM public.payments WHERE transaction_id=$1 AND user_id=$2 LIMIT 1", [reference, user.id]);
  let payment = rows[0];
  if (!payment || !String(payment.provider_txn_id || "").startsWith("paystack:")) return out(res, 404, { success: false, error: "Payment not found.", status: "not_found" });
  if (payment.payment_status === "pending") {
    const secret = process.env.PAYSTACK_SECRET_KEY || "";
    if (!secret) return out(res, 503, { success: false, error: "Paystack verification is not configured." });
    const txn = await verifyWithPaystack(reference, secret);
    if (txn && String(txn.reference || "") === reference && Number(txn.amount) === Math.round(Number(payment.amount) * 100) && String(txn.currency || "").toUpperCase() === String(payment.currency || "KES").toUpperCase()) {
      const status = String(txn.status || "").toLowerCase();
      if (status === "success" || status === "failed") {
        const updated = await sql.query("UPDATE public.payments SET payment_status=$1,updated_at=now() WHERE id=$2 AND payment_status='pending' RETURNING payment_status,mpesa_code", [status === "success" ? "completed" : "failed", payment.id]);
        if (updated[0]) payment = { ...payment, ...updated[0] };
      }
    }
  }
  return out(res, 200, { success: true, status: payment.payment_status, mpesa_code: payment.mpesa_code, amount: Number(payment.amount || 0), transaction_id: payment.transaction_id });
}
async function findGrant(sql, raw) {
  const key = codeKey(raw);
  if (!key) return null;
  const rows = await sql.query("SELECT * FROM public.access_grants WHERE regexp_replace(upper(code),'[^A-Z0-9]','','g')=$1 LIMIT 1", [key]);
  return rows[0] || null;
}
async function accessCode(req, res) {
  const user = await userFromRequest(req);
  const b = req.body || {};
  const action = String(b.action || "verify");
  const sql = db();
  if (action === "verify") {
    if (!b.code) return out(res, 400, { valid: false, error: "Code required." });
    const g = await findGrant(sql, b.code);
    if (!g) return out(res, 200, { valid: false, error: "That code was not found." });
    if (new Date(g.expires_at).getTime() < Date.now()) return out(res, 200, { valid: false, expired: true, error: "That pass has expired." });
    if ((g.user_id && g.user_id !== user?.id) || (g.email && g.email.toLowerCase() !== (user?.email || ""))) return out(res, 200, { valid: false, error: "That pass belongs to another email account." });
    const updated = await sql.query("UPDATE public.access_grants SET redeem_count=redeem_count+1,last_redeemed_at=now(),email=COALESCE(email,$1),user_id=COALESCE(user_id,$2) WHERE id=$3 RETURNING code,plan,expires_at,allow_download", [user?.email || null,user?.id || null,g.id]);
    const v = updated[0] || g;
    return out(res, 200, { valid: true, code: v.code, plan: v.plan, expires_at: v.expires_at, allow_download: v.allow_download !== false });
  }
  if (action === "account") {
    let g = null;
    if (user?.id) { const a = await sql.query("SELECT * FROM public.access_grants WHERE user_id=$1 ORDER BY expires_at DESC LIMIT 1", [user.id]); g = a[0] || null; }
    if (!g && user?.email) { const a = await sql.query("SELECT * FROM public.access_grants WHERE lower(email)=$1 ORDER BY expires_at DESC LIMIT 1", [user.email]); g = a[0] || null; }
    if (!g && b.code) { const a = await findGrant(sql, b.code); if (a && (!a.user_id || a.user_id === user?.id) && (!a.email || a.email.toLowerCase() === (user?.email || ""))) g = a; }
    if (!g) return out(res, 200, { found: false });
    return out(res, 200, { found: true, code: g.code, plan: g.plan, amount: Number(g.amount || 0), currency: g.currency || "KES", expires_at: g.expires_at, expired: new Date(g.expires_at).getTime() < Date.now(), allow_download: g.allow_download !== false });
  }
  if (action === "issue") {
    if (!user?.id || !user?.email) return out(res, 401, { success: false, error: "Sign in before activating a subscription." });
    const ref = String(b.transaction_id || "").trim();
    if (!ref) return out(res, 400, { success: false, error: "transaction_id required." });
    const p = await sql.query("SELECT * FROM public.payments WHERE transaction_id=$1 AND user_id=$2 LIMIT 1", [ref,user.id]);
    const payment = p[0];
    if (!payment || payment.payment_status !== "completed" || !String(payment.provider_txn_id || "").startsWith("paystack:")) return out(res, 403, { success: false, error: "A verified completed Paystack payment is required." });
    const existing = await sql.query("SELECT * FROM public.access_grants WHERE payment_id=$1 LIMIT 1", [payment.id]);
    if (existing[0]) { const g = existing[0]; if (!g.user_id || !g.email) await sql.query("UPDATE public.access_grants SET user_id=$1,email=$2 WHERE id=$3",[user.id,user.email,g.id]); return out(res,200,{success:true,code:g.code,plan:g.plan,expires_at:g.expires_at,allow_download:g.allow_download!==false}); }
    const s = await sql.query("SELECT value FROM public.app_settings WHERE key='access_plans' LIMIT 1");
    let plans=[]; try { plans=JSON.parse(String(s[0]?.value || "[]")); } catch {}
    const planId = String(b.plan || payment.package_type || "annual");
    const plan = plans.find((x)=>x.id===planId) || plans.find((x)=>Number(x.price)===Number(payment.amount)) || {id:"annual",days:365,download:true};
    for(let i=0;i<5;i++){
      const code=newCode();
      try {
        const inserted=await sql.query("INSERT INTO public.access_grants(code,plan,expires_at,payment_id,phone_number,amount,currency,allow_download,email,user_id) VALUES($1,$2,now()+($3::int * interval '1 day'),$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (payment_id) DO NOTHING RETURNING code,plan,expires_at,allow_download",[code,plan.id,Math.max(1,Number(plan.days)||365),payment.id,payment.phone_number,Number(payment.amount||0),String(payment.currency||"KES").toUpperCase(),plan.download!==false,user.email,user.id]);
        if(inserted[0]) {const g=inserted[0];return out(res,200,{success:true,code:g.code,plan:g.plan,expires_at:g.expires_at,allow_download:g.allow_download!==false});}
        const raced=await sql.query("SELECT code,plan,expires_at,allow_download FROM public.access_grants WHERE payment_id=$1 LIMIT 1",[payment.id]);
        if(raced[0]) {const g=raced[0];return out(res,200,{success:true,code:g.code,plan:g.plan,expires_at:g.expires_at,allow_download:g.allow_download!==false});}
      } catch(e) { if(i===4) throw e; }
    }
    return out(res,500,{success:false,error:"Could not issue a subscription pass."});
  }
  if (action === "rename") {
    if (!user?.id) return out(res,401,{success:false,error:"Sign in to change your pass code."});
    const current=String(b.code||"").trim();
    const next=String(b.new_code||"").trim().toUpperCase().replace(/\s+/g,"-").replace(/[^A-Z0-9-]/g,"").replace(/^-+|-+$/g,"");
    if(!current || next.length<6 || next.length>24) return out(res,400,{success:false,error:"Choose a code between 6 and 24 characters."});
    const g=await findGrant(sql,current);
    if(!g) return out(res,404,{success:false,error:"That pass was not found."});
    if(g.user_id && g.user_id!==user.id) return out(res,403,{success:false,error:"That pass belongs to another account."});
    if(new Date(g.expires_at).getTime()<Date.now()) return out(res,400,{success:false,error:"That pass has expired."});
    const clash=await findGrant(sql,next);
    if(clash && clash.id!==g.id) return out(res,409,{success:false,error:"That code is already taken."});
    const u=await sql.query("UPDATE public.access_grants SET code=$1,user_id=COALESCE(user_id,$2),email=COALESCE(email,$3) WHERE id=$4 RETURNING code,plan,expires_at,allow_download",[next,user.id,user.email,g.id]);
    const v=u[0]; return out(res,200,{success:true,code:v.code,plan:v.plan,expires_at:v.expires_at,allow_download:v.allow_download!==false});
  }
  return out(res,400,{success:false,error:"Unknown access-code action."});
}
export default async function handler(req,res,name) {
  if(req.method==="OPTIONS"){res.setHeader("Access-Control-Allow-Origin","https://www.ompathstudy.com");res.setHeader("Access-Control-Allow-Headers","authorization,content-type");res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");return res.status(204).end();}
  if(req.method!=="POST"){res.setHeader("Allow","POST,OPTIONS");return out(res,405,{success:false,error:"Method not allowed."});}
  try {
    if(name==="initiate-paystack") return await initiate(req,res);
    if(name==="check-payment") return await checkPayment(req,res);
    if(name==="access-code") return await accessCode(req,res);
    return out(res,404,{success:false,error:"Unknown payment function."});
  } catch(e) { console.error("Neon payment API error:",e); return out(res,500,{success:false,error:"The payment service encountered an internal error."}); }
}
