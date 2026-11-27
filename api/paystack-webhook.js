import { neon } from "@neondatabase/serverless";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const config = { api: { bodyParser: false } };
const send = (res,status,body) => res.status(status).json(body);
async function rawBody(req) {
  const chunks=[];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
  return Buffer.concat(chunks);
}
export default async function handler(req,res) {
  if(req.method==="GET") return send(res,200,{success:true,endpoint:"paystack-webhook",ready:true});
  if(req.method!=="POST") return send(res,405,{success:false,error:"Method not allowed."});
  const secret=process.env.PAYSTACK_SECRET_KEY||"";
  if(!secret || !process.env.DATABASE_URL) return send(res,503,{success:false,error:"Payment webhook is not configured."});
  try {
    const raw=await rawBody(req);
    const signature=String(req.headers["x-paystack-signature"]||"").trim();
    const expected=createHmac("sha512",secret).update(raw).digest();
    let supplied;
    try { supplied=Buffer.from(signature,"hex"); } catch { supplied=Buffer.alloc(0); }
    if(supplied.length!==expected.length || !timingSafeEqual(supplied,expected)) return send(res,401,{success:false,error:"Invalid webhook signature."});
    let event;
    try { event=JSON.parse(raw.toString("utf8")); } catch { return send(res,400,{success:false,error:"Malformed webhook body."}); }
    const eventName=String(event?.event||"");
    if(!["charge.success","charge.failed"].includes(eventName)) return send(res,200,{success:true,ignored:true});
    const reference=String(event?.data?.reference||"").trim();
    if(!reference) return send(res,200,{success:true,ignored:true,reason:"Missing transaction reference."});
    const sql=neon(process.env.DATABASE_URL);
    const rows=await sql.query("SELECT id,amount,currency,payment_status,transaction_id,provider_txn_id,package_type,phone_number,buyer_email,user_id FROM public.payments WHERE transaction_id=$1 LIMIT 1",[reference]);
    const payment=rows[0];
    if(!payment || !String(payment.provider_txn_id||"").startsWith("paystack:")) return send(res,200,{success:true,ignored:true,reason:"No matching Paystack payment."});
    const issueGrant = async () => {
      const existing = await sql.query("SELECT id,code,plan,expires_at FROM public.access_grants WHERE payment_id=$1 LIMIT 1",[payment.id]);
      if(existing[0]) {
        await sql.query("UPDATE public.access_grants SET user_id=COALESCE(user_id,$1),email=COALESCE(email,$2) WHERE id=$3",[payment.user_id||null,payment.buyer_email||null,existing[0].id]);
        return false;
      }
      const setting = await sql.query("SELECT value FROM public.app_settings WHERE key='access_plans' LIMIT 1");
      let plans=[]; try { plans=JSON.parse(String(setting[0]?.value || "[]")); } catch {}
      const planId=String(payment.package_type || "annual");
      const plan=plans.find((p)=>p && p.id===planId) || plans.find((p)=>Number(p.price)===Number(payment.amount)) || {id:"annual",days:365,download:true};
      const code="OM-"+randomBytes(8).toString("hex").toUpperCase().slice(0,8);
      const inserted=await sql.query("INSERT INTO public.access_grants(code,plan,expires_at,payment_id,phone_number,amount,currency,allow_download,email,user_id) VALUES($1,$2,now()+($3::int * interval '1 day'),$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (payment_id) WHERE payment_id IS NOT NULL DO NOTHING RETURNING id",[code,plan.id,Math.max(1,Number(plan.days)||365),payment.id,payment.phone_number,Number(payment.amount||0),String(payment.currency||"KES").toUpperCase(),plan.download!==false,payment.buyer_email||null,payment.user_id||null]);
      return inserted.length>0;
    };
    if(payment.payment_status==="completed") {
      const issued=await issueGrant();
      return send(res,200,{success:true,duplicate:true,grant_issued:issued});
    }
    const verify=await fetch("https://api.paystack.co/transaction/verify/"+encodeURIComponent(reference),{headers:{Authorization:"Bearer "+secret,Accept:"application/json"}});
    const payload=await verify.json().catch(()=>({}));
    const txn=payload?.data;
    if(!verify.ok || payload?.status!==true || !txn) return send(res,502,{success:false,error:"Could not independently verify the transaction."});
    if(String(txn.reference||"")!==reference || Number(txn.amount)!==Math.round(Number(payment.amount)*100) || String(txn.currency||"").toUpperCase()!==String(payment.currency||"KES").toUpperCase()) {
      console.error("Paystack webhook transaction mismatch for reference",reference);
      return send(res,409,{success:false,error:"Verified transaction does not match the local payment."});
    }
    const status=String(txn.status||"").toLowerCase();
    if(status==="success") {
      await sql.query("UPDATE public.payments SET payment_status='completed',updated_at=now() WHERE id=$1 AND payment_status='pending'",[payment.id]);
      const issued=await issueGrant();
      return send(res,200,{success:true,status:"completed",reference,grant_issued:issued});
    }
    if(status==="failed" && eventName==="charge.failed") {
      await sql.query("UPDATE public.payments SET payment_status='failed',updated_at=now() WHERE id=$1 AND payment_status='pending'",[payment.id]);
      return send(res,200,{success:true,status:"failed",reference});
    }
    return send(res,200,{success:true,pending:true,reference});
  } catch(error) {
    console.error("Paystack webhook processing failed:",error);
    return send(res,500,{success:false,error:"Webhook processing failed."});
  }
}
