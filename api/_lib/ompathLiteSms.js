/** OmpathStudy Lite patient-guide SMS only. No learning or MCQ messaging is supported. */
import { createHash, timingSafeEqual } from "node:crypto";
import { createHealthGuideToken } from "./ompathLiteHealth.js";
import { searchReviewedPatientResources } from "./ompathLiteResources.js";

const clean=(value,max=500)=>String(value??"").trim().replace(/[<>]/g,"").slice(0,max);
function normalizePhone(value){
 let phone=clean(value,32).replace(/[\s()-]/g,"");
 if(/^0\d{9}$/.test(phone))phone="+254"+phone.slice(1);
 else if(/^254\d{9}$/.test(phone))phone="+"+phone;
 return /^\+[1-9]\d{8,14}$/.test(phone)?phone:null;
}
async function db(path,options={}){
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)throw new Error("Missing Supabase server configuration");
 const response=await fetch(`${base.replace(/\/$/,"")}/rest/v1/${path}`,{
  ...options,
  signal:options.signal||AbortSignal.timeout(7000),
  headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:options.prefer||"return=representation",...options.headers},
 });
 const body=await response.text();
 if(!response.ok){console.error("Lite health SMS database error:",response.status);throw new Error("Patient guide SMS storage failed.");}
 return body?JSON.parse(body):[];
}
function authorized(req){
 const expected=process.env.CRON_SECRET||"";
 const provided=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
 if(!expected||!provided)return false;
 const a=Buffer.from(expected),b=Buffer.from(provided);
 return a.length===b.length&&timingSafeEqual(a,b);
}
async function sendSms(to,message,settings){
 const username=process.env.AT_LIVE_USERNAME,apiKey=process.env.AT_LIVE_API_KEY;
 if(!username||!apiKey)throw new Error("Live Africa's Talking credentials are not configured.");
 const form=new URLSearchParams({username,to,message});
 const sender=settings?.sender_id||process.env.AT_SENDER_ID;
 if(sender)form.set("from",sender);
 const response=await fetch("https://api.africastalking.com/version1/messaging",{
  method:"POST",
  signal:AbortSignal.timeout(8000),
  headers:{"apiKey":apiKey,Accept:"application/json","Content-Type":"application/x-www-form-urlencoded"},
  body:form,
 });
 const body=await response.text();
 if(!response.ok)throw new Error(`Africa's Talking ${response.status}: ${body.slice(0,160)}`);
 const data=JSON.parse(body),recipient=data?.SMSMessageData?.Recipients?.[0];
 if(!recipient||Number(recipient.statusCode)>=400)throw new Error(recipient?.status||data?.SMSMessageData?.Message||"Provider did not accept the SMS.");
 return recipient;
}

export async function sendHealthGuideLink({to,link,language="en",smsConsent=false}){
 if(smsConsent!==true)throw new Error("Explicit SMS consent is required.");
 const phone=normalizePhone(to);
 if(!phone||typeof link!=="string"||!/^https:\/\/lite\.ompathstudy\.com\/api\/ompath-lite-guide\?token=[A-Za-z0-9_-]{40,60}&welcome=1$/.test(link))throw new Error("Invalid private guide delivery details.");
 const rows=await db("lite_sms_settings?select=enabled,environment,sender_id&id=eq.1&limit=1");
 const settings=rows[0]||{enabled:false,environment:"sandbox",sender_id:null};
 if(!settings.enabled||settings.environment!=="production")return {sent:false,reason:"sms_not_live"};
 const message=language==="sw"
  ?"OmpathStudy: Uliomba taarifa za afya. Mwongozo unaweza kuwa kwa Kiingereza. Fungua kiungo hiki kwa usalama: "+link+" Kiungo kitaisha baada ya siku 7. Usishiriki kiungo hiki. Jibu STOP kujiondoa."
  :"OmpathStudy: Your requested health information is ready. Open your private link: "+link+" This link expires in 7 days. Do not share it. Reply STOP to opt out.";
 const recipient=await sendSms(phone,message,settings);
 return {sent:true,status:recipient.status||"Accepted",messageId:recipient.messageId||null};
}

/** Called only by the authenticated scheduled job; sends only explicitly requested guides. */
export async function processPendingHealthGuideSms(limit=10){
 const pending=await db("lite_health_encounters?select=id,phone_number,preferred_language,concern_category,original_message,sms_consent,status,sms_sent_at&status=eq.guide_pending&sms_consent=eq.true&sms_sent_at=is.null&order=created_at.asc&limit="+Math.min(20,Math.max(1,Number(limit)||10)));
 let sent=0,waiting=0,failed=0;
 if(!pending.length)return {checked:0,sent,waiting,failed};
 const settingsRows=await db("lite_sms_settings?select=enabled,environment&id=eq.1&limit=1");
 const settings=settingsRows[0];
 if(!settings?.enabled||settings.environment!=="production"||!process.env.AT_LIVE_USERNAME||!process.env.AT_LIVE_API_KEY)return {checked:pending.length,sent,waiting:pending.length,failed,disabled:true};
 for(const encounter of pending){
  let tokenHash=null,providerAccepted=false,claimed=false;
  try{
   const claim=await db("lite_health_encounters?id=eq."+encodeURIComponent(encounter.id)+"&status=eq.guide_pending&sms_consent=eq.true&sms_sent_at=is.null",{
    method:"PATCH",body:JSON.stringify({status:"complete"}),
   });
   if(!claim.length)continue;
   claimed=true;
   const guides=await searchReviewedPatientResources({
    query:[encounter.concern_category||"",encounter.original_message||""].join(" "),
    language:"en",limit:1,
   });
   if(!guides.length||!guides[0].slug){
    await db("lite_health_encounters?id=eq."+encodeURIComponent(encounter.id),{method:"PATCH",body:JSON.stringify({status:"guide_pending"})});
    waiting++;
    continue;
   }
   const issued=await createHealthGuideToken({encounterId:encounter.id,resourceSlug:guides[0].slug});
   tokenHash=createHash("sha256").update(issued.token).digest("hex");
   const current=await db("lite_health_encounters?select=sms_consent&id=eq."+encodeURIComponent(encounter.id)+"&limit=1");
   if(current[0]?.sms_consent!==true){
    await db("lite_health_guide_tokens?token_hash=eq."+tokenHash,{method:"PATCH",body:JSON.stringify({revoked_at:new Date().toISOString()})});
    continue;
   }
   const link="https://lite.ompathstudy.com/api/ompath-lite-guide?token="+issued.token+"&welcome=1";
   const delivery=await sendHealthGuideLink({to:encounter.phone_number,link,language:encounter.preferred_language||"en",smsConsent:encounter.sms_consent});
   if(!delivery.sent){
    await db("lite_health_guide_tokens?token_hash=eq."+tokenHash,{method:"PATCH",body:JSON.stringify({revoked_at:new Date().toISOString()})});
    await db("lite_health_encounters?id=eq."+encodeURIComponent(encounter.id),{method:"PATCH",body:JSON.stringify({status:"guide_pending"})});
    waiting++;
    continue;
   }
   providerAccepted=true;
   const updated=await db("lite_health_encounters?id=eq."+encodeURIComponent(encounter.id)+"&sms_consent=eq.true&status=eq.complete&sms_sent_at=is.null",{
    method:"PATCH",body:JSON.stringify({sms_sent_at:new Date().toISOString()}),
   });
   if(updated.length)sent++;
   else waiting++;
  }catch(error){
   failed++;
   if(tokenHash&&!providerAccepted){
    try{await db("lite_health_guide_tokens?token_hash=eq."+tokenHash,{method:"PATCH",body:JSON.stringify({revoked_at:new Date().toISOString()})});}catch{}
   }
   if(claimed&&!providerAccepted){
    try{await db("lite_health_encounters?id=eq."+encodeURIComponent(encounter.id),{method:"PATCH",body:JSON.stringify({status:"guide_pending"})});}catch{}
   }
   console.error("Background patient-guide delivery failed.");
  }
 }
 return {checked:pending.length,sent,waiting,failed};
}

async function inbound(req,res){
 const supplied=String(req.query?.key||""),expected=process.env.AT_INBOUND_SECRET||"";
 if(!expected||!supplied||supplied!==expected)return res.status(401).send("Unauthorized");
 const payload=typeof req.body==="string"?Object.fromEntries(new URLSearchParams(req.body)):req.body||{};
 const phone=normalizePhone(payload.from||payload.phoneNumber);
 const text=clean(payload.text,100).toUpperCase();
 if(!phone||!text)return res.status(200).send("Missing sender or message.");
 if(["STOP","UNSUBSCRIBE","CANCEL"].includes(text)){
  const encounters=await db("lite_health_encounters?select=id&phone_number=eq."+encodeURIComponent(phone)+"&sms_consent=eq.true&limit=100");
  const ids=encounters.map(row=>row.id).filter(id=>/^[0-9a-f-]{36}$/i.test(String(id)));
  if(ids.length){
   const filter="in.("+ids.join(",")+")";
   await db("lite_health_encounters?id="+filter,{method:"PATCH",body:JSON.stringify({sms_consent:false,updated_at:new Date().toISOString()})});
   await db("lite_health_guide_tokens?encounter_id="+filter+"&revoked_at=is.null",{method:"PATCH",body:JSON.stringify({revoked_at:new Date().toISOString()})});
  }
  return res.status(200).send("You have opted out of OmpathStudy Lite health-information SMS. Active private guide links have been revoked.");
 }
 return res.status(200).send("OmpathStudy Lite no longer processes learning or MCQ replies. Reply STOP to opt out of health-information SMS.");
}

export default async function handler(req,res){
 if(req.method==="GET")return res.status(200).json({name:"OmpathStudy Lite patient-guide SMS",status:"ok"});
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed."});
 const mode=String(req.query?.mode||"");
 try{
  if(mode==="inbound")return await inbound(req,res);
  if(mode==="send"){
   if(!authorized(req))return res.status(401).json({error:"Unauthorized."});
   return res.status(200).json(await processPendingHealthGuideSms(10));
  }
  if(mode==="test")return res.status(410).json({error:"MCQ SMS testing has been retired. Lite sends only consented patient-guide links."});
  return res.status(400).json({error:"Use mode=inbound or authenticated mode=send."});
 }catch(error){
  console.error("Lite patient-guide SMS handler failed:",error instanceof Error?error.message:"unknown error");
  return res.status(500).json({error:"Patient-guide SMS processing failed."});
 }
}
