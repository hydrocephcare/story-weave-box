import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { isNeonAdmin, verifyNeonToken } from "./neonAdmin.js";

const db = () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  return neon(process.env.DATABASE_URL);
};
const safeText = (v, max=200) => typeof v === "string" ? v.slice(0,max) : "";
const normalizePhone = (value) => {
  const digits=String(value||"").replace(/\D/g,"");
  if (/^254\d{9}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return "254"+digits.slice(1);
  if (/^\d{9}$/.test(digits)) return "254"+digits;
  return "";
};
const send = (res,status,body) => res.status(status).json(body);
const providerBase = "https://apisalticon.onekitty.co.ke";

async function requireAdmin(req) {
  const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
  const user=await verifyNeonToken(token);
  if (!user) return { error: "Sign in required.", status: 401 };
  if (!(await isNeonAdmin(token))) return { error: "Administrator access required.", status: 403 };
  const account=await db().query('SELECT email,name FROM neon_auth."user" WHERE id=$1 LIMIT 1',[user.id]);
  const email=String(user.email||account[0]?.email||"").trim().toLowerCase();
  if (!email) return { error: "A verified Neon Auth email is required.", status: 401 };
  await db().query("SELECT public.ensure_neon_user($1,$2)",[user.id,email]);
  return { user:{...user,email,name:String(account[0]?.name||"").slice(0,120)} };
}

async function providerJson(url,init={}) {
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({}));
  return {response,data};
}

export async function initiate(req,res) {
  if (req.method==="OPTIONS") return res.status(204).end();
  if (req.method!=="POST") return send(res,405,{success:false,error:"Method not allowed."});
  try {
    const auth=await requireAdmin(req);
    if (auth.error) return send(res,auth.status,{success:false,error:auth.error});
    const body=req.body||{};
    if (body.action==="status") {
      const payments=await db().query(`SELECT id,external_ref,amount,currency,phone_number,payment_mode,requested_channel_code,
        provider_payment_ref,request_reference,checkout_url,callback_status,callback_result_code,callback_result_desc,
        callback_channel_code,callback_transaction_code,callback_received_at,callback_verified,created_at
        FROM public.onekitty_test_payments ORDER BY created_at DESC LIMIT 25`);
      const developerKey=String(process.env.ONEKITTY_DEVELOPER_API_KEY||"");
      const kittyId=Number(process.env.ONEKITTY_KITTY_ID||0);
      let kitty=null,providerTransactions=[];
      if (developerKey && Number.isInteger(kittyId) && kittyId>0) {
        const headers={Authorization:"Bearer "+developerKey,Accept:"application/json"};
        const [k,t]=await Promise.all([
          providerJson(`${providerBase}/developer/v1/kitties/?kitty_id=${kittyId}`,{headers}),
          providerJson(`${providerBase}/developer/v1/transactions/?kitty_id=${kittyId}&page=0&page_size=25&sort=-id`,{headers}),
        ]);
        if(k.response.ok&&k.data?.status===true) kitty=k.data.data;
        if(t.response.ok&&t.data?.status===true) providerTransactions=t.data.data?.items||[];
      }
      return send(res,200,{success:true,payments,kitty,provider_transactions:providerTransactions,
        configured:Boolean(process.env.ONEKITTY_AUTH_CODE&&kittyId>0&&developerKey),
        initiation_configured:Boolean(process.env.ONEKITTY_AUTH_CODE&&kittyId>0),verification_configured:Boolean(developerKey)});
    }

    const authCode=String(process.env.ONEKITTY_AUTH_CODE||"");
    const kittyId=Number(process.env.ONEKITTY_KITTY_ID||0);
    const developerKey=String(process.env.ONEKITTY_DEVELOPER_API_KEY||"");
    if(!authCode||!developerKey||!Number.isInteger(kittyId)||kittyId<=0) return send(res,503,{success:false,error:"OneKitty is not ready. Configure ONEKITTY_AUTH_CODE, ONEKITTY_KITTY_ID and ONEKITTY_DEVELOPER_API_KEY in Cloudflare Production."});
    const amount=Number(body.amount),phone=normalizePhone(body.phone_number);
    const mode=body.mode==="checkout"?"CHECKOUT":body.mode==="stk"?"STK_REQUEST":"";
    const channel=String(body.channel_code||"63902");
    if(!Number.isInteger(amount)||amount<1||amount>1000000) return send(res,400,{success:false,error:"Enter a whole-number amount between KES 1 and KES 1,000,000."});
    if(!phone) return send(res,400,{success:false,error:"Enter a valid Kenyan mobile number."});
    if(!mode) return send(res,400,{success:false,error:"Choose hosted checkout or STK push."});
    if(mode==="STK_REQUEST"&&!["63902","63903","63907"].includes(channel)) return send(res,400,{success:false,error:"Choose M-Pesa, Airtel Money or T-Kash for STK push."});

    const externalRef=randomUUID();
    const paymentRef="OMPATH-TEST-"+externalRef.slice(0,8).toUpperCase();
    const redirectUrl="https://www.ompathstudy.com/admin/onekitty?onekitty_return=1&ref="+encodeURIComponent(externalRef);
    const payload={
      auth_code:authCode,kitty_id:kittyId,amount,phone_number:phone,country_code:"KE",currency_code:"KES",
      channel_code:mode==="CHECKOUT"?0:Number(channel),
      first_name:safeText(auth.user.name.split(" ")[0]||"Ompath",80),
      second_name:safeText(auth.user.name.split(" ").slice(1).join(" ")||"Admin",80),
      payer_email:auth.user.email,payment_ref:paymentRef,external_ref:externalRef,
      show_names:false,show_number:false,is_checkout:mode==="CHECKOUT",
    };
    if(mode==="CHECKOUT") {
      payload.redirect_url=redirectUrl;
      payload.callback_url="https://www.ompathstudy.com/api/neon-functions?name=onekitty-callback";
    }
    const {response,data}=await providerJson(`${providerBase}/kitty/api/contribute/`,{
      method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(payload),
    });
    if(!response.ok||data?.status===false) return send(res,502,{success:false,error:safeText(data?.message,300)||"OneKitty could not start this payment.",provider_status:response.status});
    const result=data?.data||{};
    const checkoutUrl=String(result.checkout_url||data?.checkout_url||data?.checkoutUrl||"").trim();
    if(mode==="CHECKOUT"&&(!checkoutUrl||!/^https:\/\//i.test(checkoutUrl))) return send(res,502,{success:false,error:"OneKitty did not return a valid hosted checkout URL.",provider_message:safeText(data?.message,240)});
    await db().query(`INSERT INTO public.onekitty_test_payments
      (user_id,external_ref,kitty_id,amount,currency,phone_number,payment_mode,requested_channel_code,provider_payment_ref,request_reference,checkout_url)
      VALUES($1,$2,$3,$4,'KES',$5,$6,$7,$8,$9,$10)`,
      [auth.user.id,externalRef,kittyId,amount,phone,mode,mode==="STK_REQUEST"?channel:"checkout-selected",
        safeText(result.payment_ref,120)||null,safeText(result.request_reference,160)||null,checkoutUrl||null]);
    return send(res,200,{success:true,external_ref:externalRef,mode,checkout_url:checkoutUrl||null,
      provider_message:safeText(data?.message,250)||"Payment request accepted by OneKitty.",
      next_step:mode==="CHECKOUT"?"Open the hosted checkout and select an available payment method.":"Approve the payment prompt on your phone."});
  } catch(error) {
    console.error("[onekitty-initiate]",error instanceof Error?error.message:String(error));
    return send(res,500,{success:false,error:"OneKitty request failed. Check the provider configuration and try again."});
  }
}

export async function callback(req,res) {
  if(req.method!=="POST") return send(res,405,{success:false,error:"Method not allowed."});
  try {
    const developerKey=String(process.env.ONEKITTY_DEVELOPER_API_KEY||"");
    if(!developerKey) return send(res,503,{success:false,error:"ONEKITTY_DEVELOPER_API_KEY is required to verify payment callbacks."});
    const body=req.body||{};
    const externalRef=String(body.third_party_reference||"").trim();
    const resultCode=String(body.result_code??"").trim();
    const kittyId=Number(body.kitty_id),amount=Number(body.amount),currency=String(body.currency||"KES").toUpperCase();
    if(!externalRef||!Number.isInteger(kittyId)||!Number.isFinite(amount)||!["0","00"].includes(resultCode)) {
      return send(res,400,{success:false,error:"Invalid or unsuccessful OneKitty callback."});
    }
    const sql=db();
    const rows=await sql.query("SELECT id,amount,kitty_id,currency,callback_verified FROM public.onekitty_test_payments WHERE external_ref=$1 LIMIT 1",[externalRef]);
    const row=rows[0];
    if(!row||Number(row.amount)!==amount||Number(row.kitty_id)!==kittyId||String(row.currency).toUpperCase()!==currency) {
      return send(res,409,{success:false,error:"Callback amount, kitty or currency mismatch."});
    }
    if(row.callback_verified===true) return send(res,200,{success:true,duplicate:true,verified:true});
    const query=new URLSearchParams({kitty_id:String(kittyId),reference:externalRef,page:"0",page_size:"20",sort:"-id"});
    const {response,data}=await providerJson(`https://apisalticon.onekitty.co.ke/developer/v1/transactions/?${query.toString()}`,{
      headers:{Authorization:"Bearer "+developerKey,Accept:"application/json"},
    });
    const items=Array.isArray(data?.data?.items)?data.data.items:[];
    const verified=items.find(item=>
      String(item.external_ref||"")===externalRef &&
      Number(item.kitty_id)===kittyId &&
      Number(item.amount)===amount &&
      String(item.currency||"").toUpperCase()===currency &&
      String(item.status||"").toUpperCase()==="SUCCESS" &&
      String(item.type_in_out||"").toUpperCase()==="IN"
    );
    if(!response.ok||data?.status!==true||!verified) {
      console.error("[onekitty-callback] independent verification failed",response.status);
      return send(res,502,{success:false,error:"OneKitty transaction could not be independently verified."});
    }
    const updated=await sql.query(`UPDATE public.onekitty_test_payments SET
      callback_status='callback_reported_success',callback_result_code=$1,callback_result_desc=$2,
      callback_channel_code=$3,callback_transaction_code=$4,provider_payment_ref=$5,
      request_reference=$6,callback_received_at=now(),callback_verified=true,updated_at=now()
      WHERE id=$7 AND callback_verified=false RETURNING id`,
      [resultCode,safeText(body.result_desc,500),safeText(verified.channel_code||body.channel_code,30),
        safeText(verified.transaction_code||body.transaction_code,100),
        safeText(verified.reference||body.payment_ref,120)||null,
        safeText(body.request_reference,160)||null,row.id]);
    if(!updated.length) return send(res,200,{success:true,duplicate:true,verified:true});
    return send(res,200,{success:true,verified:true,external_ref:externalRef});
  } catch(error) {
    console.error("[onekitty-callback]",error instanceof Error?error.message:String(error));
    return send(res,500,{success:false,error:"Callback processing failed."});
  }
}
