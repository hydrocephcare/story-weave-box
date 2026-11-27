import { neon } from "@neondatabase/serverless";
import { createHmac, timingSafeEqual } from "node:crypto";

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
    const rows=await sql.query("SELECT id,amount,currency,payment_status,transaction_id,provider_txn_id FROM public.payments WHERE transaction_id=$1 LIMIT 1",[reference]);
    const payment=rows[0];
    if(!payment || !String(payment.provider_txn_id||"").startsWith("paystack:")) return send(res,200,{success:true,ignored:true,reason:"No matching Paystack payment."});
    if(payment.payment_status==="completed") return send(res,200,{success:true,duplicate:true});
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
      return send(res,200,{success:true,status:"completed",reference});
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
