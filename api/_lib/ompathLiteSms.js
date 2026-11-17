/** OmpathStudy Lite SMS channel.
 * Daily questions and explanations are read from the existing published MCQ bank.
 * POST /api/ompath-lite-sms?mode=send (Cloudflare Cron Worker; CRON_SECRET)
 * POST /api/ompath-lite-sms?mode=inbound&key=<AT_INBOUND_SECRET> (Africa's Talking inbox callback)
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createHealthGuideToken } from "./ompathLiteHealth.js";
import { searchReviewedPatientResources } from "./ompathLiteResources.js";

const clean=(v,n=500)=>String(v??"").trim().replace(/[<>]/g,"").slice(0,n);
const today=()=>new Date().toISOString().slice(0,10);
function normalizePhone(v){let p=clean(v,32).replace(/[\s()-]/g,"");if(/^0\d{9}$/.test(p))p="+254"+p.slice(1);else if(/^254\d{9}$/.test(p))p="+"+p;return /^\+[1-9]\d{8,14}$/.test(p)?p:null;}
async function db(path,options={}){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error("Missing Supabase server configuration");
 const r=await fetch(`${url.replace(/\/$/,"")}/rest/v1/${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:options.prefer||"return=representation",...options.headers}});
 const body=await r.text();if(!r.ok){console.error("Lite SMS database error",r.status,body.slice(0,250));throw new Error("SMS database request failed");}return body?JSON.parse(body):[];
}
async function sendSms(to,message,settings){
 const sandbox=settings?.environment!=="production";
 const username=sandbox?process.env.AT_USERNAME:process.env.AT_LIVE_USERNAME;
 const apiKey=sandbox?process.env.AT_API_KEY:process.env.AT_LIVE_API_KEY;
 if(!username||!apiKey)throw new Error(sandbox?"Sandbox credentials are not configured in Cloudflare.":"Live credentials are not configured in Cloudflare.");
 const form=new URLSearchParams({username,to,message});
 const sender=settings?.sender_id||process.env.AT_SENDER_ID;
 if(sender)form.set("from",sender);
 const r=await fetch(sandbox?"https://api.sandbox.africastalking.com/version1/messaging":"https://api.africastalking.com/version1/messaging",{method:"POST",headers:{"apiKey":apiKey,Accept:"application/json","Content-Type":"application/x-www-form-urlencoded"},body:form});
 const body=await r.text();if(!r.ok)throw new Error(`Africa's Talking ${r.status}: ${body.slice(0,200)}`);
 const data=JSON.parse(body),recipient=data?.SMSMessageData?.Recipients?.[0];
 if(!recipient||Number(recipient.statusCode)>=400)throw new Error(recipient?.status||data?.SMSMessageData?.Message||"Africa's Talking did not accept the SMS");
 return recipient;
}
const matchesYear=(s,year)=>new RegExp(`\\bYear\\s*${year}\\b`,"i").test(`${s.title||""} ${s.category||""}`);
async function pickQuestion(year,sets){
 const pool=[];
 for(const set of sets.filter(s=>matchesYear(s,year))){
  const questions=Array.isArray(set.questions)?set.questions:[];
  questions.forEach((q,index)=>{
   if(Array.isArray(q.options)&&q.options.length>=2&&q.options.length<=4){
    const correct=Number(q.correct_answer);
    if(Number.isInteger(correct)&&correct>=0&&correct<q.options.length)pool.push({set,index,q,correct});
   }
  });
 }
 if(!pool.length)return null;
 return pool[Math.floor(Date.now()/86400000)%pool.length];
}
function authorized(req){
 const expected=process.env.CRON_SECRET||"",provided=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
 if(!expected||!provided)return false;
 const a=Buffer.from(expected),b=Buffer.from(provided);
 return a.length===b.length&&timingSafeEqual(a,b);
}
async function sendDaily(req,res){
 if(!authorized(req))return res.status(401).json({error:"Unauthorized"});
 const settingRows=await db("lite_sms_settings?select=enabled,environment,sender_id&id=eq.1&limit=1");
 const settings=settingRows[0]||{enabled:false,environment:"sandbox",sender_id:null};
 if(!settings.enabled||settings.environment!=="production")return res.status(200).json({sent:0,skipped:0,failed:0,date:today(),disabled:true,reason:settings.environment!=="production"?"sandbox":"paused"});
 const students=await db("lite_students?select=id,phone_number,study_level&sms_opt_in=eq.true&sms_opt_in_at=not.is.null&limit=500");
 const sets=await db("mcq_sets?select=id,title,category,questions&published=eq.true&deleted_at=is.null&order=updated_at.desc&limit=1000");
 const delivered=await db(`lite_sms_deliveries?select=student_id&delivery_date=eq.${today()}&limit=1000`);
 const already=new Set(delivered.map(x=>x.student_id));
 let sent=0,skipped=0,failed=0;
 for(const s of students){
  if(already.has(s.id)){skipped++;continue;}
  const year=String(s.study_level||"").match(/[1-6]/)?.[0];
  if(!year){skipped++;continue;}
  try{
   const item=await pickQuestion(year,sets);if(!item){skipped++;continue;}
   const code=randomBytes(4).toString("hex").toUpperCase();
   const options=item.q.options.map((o,i)=>`${i+1}) ${clean(o,55)}`).join("\n");
   const message=`OmpathStudy Lite | Daily MCQ\n${clean(item.q.question,170)}\n${options}\nReply: ${code} 1-${item.q.options.length}. STOP to unsubscribe.`;
   const recipient=await sendSms(s.phone_number,message,settings);
   await db("lite_sms_deliveries",{method:"POST",body:JSON.stringify({student_id:s.id,mcq_set_id:item.set.id,question_index:item.index,delivery_date:today(),short_code:code,provider_status:recipient.status||"Accepted",provider_message_id:recipient.messageId||null})});
   sent++;
  }catch(e){failed++;console.error("Lite SMS send failed",s.id,e.message);}
 }
 return res.status(200).json({sent,skipped,failed,date:today()});
}
async function sendTest(req,res){
 if(!authorized(req))return res.status(401).json({error:"Unauthorized"});
 if(process.env.AT_ENV!=="sandbox")return res.status(403).json({error:"Test SMS is disabled outside Africa's Talking sandbox."});
 const p=req.body&&typeof req.body==="object"?req.body:{};
 const to=normalizePhone(p.to);
 if(!to)return res.status(400).json({error:"Provide a valid international phone number."});
 const sets=await db("mcq_sets?select=id,title,category,questions&published=eq.true&deleted_at=is.null&order=updated_at.desc&limit=1000");
 const item=await pickQuestion("4",sets);
 if(!item)return res.status(404).json({error:"No eligible published Year 4 MCQ was found."});
 const options=item.q.options.map((o,i)=>`${i+1}) ${clean(o,55)}`).join("\n");
 const message=`OmpathStudy Lite | SMS TEST\n${clean(item.q.question,170)}\n${options}\nThis is a sandbox test. Reply is not recorded.`;
 const recipient=await sendSms(to,message);
 return res.status(200).json({ok:true,environment:"sandbox",to,status:recipient.status||"Accepted",messageId:recipient.messageId||null});
}
/** One fixed-recipient sandbox test, callable only after the Lite admin API verifies an administrator. */
export async function sendAdminSandboxTest(){
 const rows=await db("lite_sms_settings?select=enabled,environment,sender_id&id=eq.1&limit=1");
 const settings=rows[0]||{enabled:false,environment:"sandbox",sender_id:null};
 if(settings.environment!=="sandbox")throw new Error("Sandbox test is available only when the Lite SMS environment is set to Sandbox.");
 const to="+254115475543";
 const sets=await db("mcq_sets?select=id,title,category,questions&published=eq.true&deleted_at=is.null&order=updated_at.desc&limit=1000");
 const item=await pickQuestion("4",sets);
 if(!item)throw new Error("No eligible published Year 4 MCQ was found.");
 const options=item.q.options.map((o,i)=>`${i+1}) ${clean(o,55)}`).join("\n");
 const message=`OmpathStudy Lite | SMS TEST\n${clean(item.q.question,170)}\n${options}\nThis is a sandbox test. Reply is not recorded.`;
 const recipient=await sendSms(to,message,settings);
 return {ok:true,environment:"sandbox",to,status:recipient.status||"Accepted",messageId:recipient.messageId||null};
}
function parseBody(req){if(typeof req.body==="string")return Object.fromEntries(new URLSearchParams(req.body));if(req.body&&typeof req.body==="object")return req.body;if(typeof req.rawBody==="string")return Object.fromEntries(new URLSearchParams(req.rawBody));return {};}
async function inbound(req,res){
 const secret=String(req.query?.key||"");
 const expected=process.env.AT_INBOUND_SECRET||"";
 if(!expected||!secret||secret!==expected)return res.status(401).send("Unauthorized");
 const p=parseBody(req),from=normalizePhone(p.from||p.phoneNumber),raw=clean(p.text,100).toUpperCase();
 if(!from||!raw)return res.status(200).send("Missing sender or message.");
 const students=await db(`lite_students?select=id,sms_opt_in&phone_number=eq.${encodeURIComponent(from)}&limit=1`);
 if(raw==="STOP"||raw==="UNSUBSCRIBE"||raw==="CANCEL"){
  if(students[0])await db(\`lite_students?id=eq.\${students[0].id}\`,{method:"PATCH",body:JSON.stringify({sms_opt_in:false,sms_opt_in_at:null,updated_at:new Date().toISOString()})});
  const encounters=await db(\`lite_health_encounters?select=id&phone_number=eq.\${encodeURIComponent(from)}&sms_consent=eq.true&limit=100\`);
  const ids=encounters.map(row=>row.id).filter(id=>/^[0-9a-f-]{36}$/i.test(String(id)));
  if(ids.length){
   const idFilter="in.("+ids.join(",")+")";
   await db("lite_health_encounters?id="+idFilter,{method:"PATCH",body:JSON.stringify({sms_consent:false,updated_at:new Date().toISOString()})});
   await db("lite_health_guide_tokens?encounter_id="+idFilter+"&revoked_at=is.null",{method:"PATCH",body:JSON.stringify({revoked_at:new Date().toISOString()})});
  }
  return res.status(200).send("You have been unsubscribed from OmpathStudy Lite SMS. Any active private health-guide links have been revoked.");
 }
 if(raw==="START"||raw==="SUBSCRIBE"){
  if(!students[0])return res.status(200).send("Register through OmpathStudy Lite first, then opt in to SMS.");
  await db(`lite_students?id=eq.${students[0].id}`,{method:"PATCH",body:JSON.stringify({sms_opt_in:true,sms_opt_in_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
  return res.status(200).send("SMS learning enabled. Reply STOP any time to unsubscribe.");
 }
 const match=raw.match(/^([A-F0-9]{8})\s+([1-4])$/);
 if(!match)return res.status(200).send("Reply with the 8-character question code, a space, and your answer. Example: A1B2C3D4 2. Reply STOP to unsubscribe.");
 if(!students[0])return res.status(200).send("Please register through OmpathStudy Lite before answering.");
 if(!students[0].sms_opt_in)return res.status(200).send("SMS is currently disabled. Opt in through OmpathStudy Lite first.");
 const [,code,choice]=match;
 const deliveries=await db(`lite_sms_deliveries?select=mcq_set_id,question_index&student_id=eq.${students[0].id}&short_code=eq.${code}&delivery_date=eq.${today()}&limit=1`);
 if(!deliveries[0])return res.status(200).send("That question code has expired. Please answer today's message.");
 const d=deliveries[0],sets=await db(`mcq_sets?select=id,title,questions&id=eq.${d.mcq_set_id}&published=eq.true&deleted_at=is.null&limit=1`);
 const set=sets[0],q=set?.questions?.[d.question_index];
 if(!q||!Array.isArray(q.options))return res.status(200).send("That question is no longer available.");
 const selected=Number(choice),correctIndex=Number(q.correct_answer);
 if(selected<1||selected>q.options.length)return res.status(200).send(`Choose a number from 1 to ${q.options.length}.`);
 const correct=selected-1===correctIndex;
 await db("lite_attempts",{method:"POST",body:JSON.stringify({student_id:students[0].id,mcq_set_id:set.id,question_index:d.question_index,selected_option:selected,is_correct:correct})});
 return res.status(200).send(`${correct?"Correct!":"Not quite. Correct answer: "+(correctIndex+1)+"."} ${clean(q.explanation||"Review the answer on OmpathStudy.",300)}`);
}
export default async function handler(req,res){
 if(req.method==="GET")return res.status(200).json({name:"OmpathStudy Lite SMS",status:"ok",provider:"Africa's Talking"});
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const mode=String(req.query?.mode||"");
 try{if(mode==="send")return await sendDaily(req,res);if(mode==="test")return await sendTest(req,res);if(mode==="inbound")return await inbound(req,res);return res.status(400).json({error:"Set mode=send, mode=test, or mode=inbound"});}
 catch(e){console.error("Lite SMS error",e);return res.status(500).json({error:"SMS processing failed"});}
}

/** Send a discreet private guide link only after explicit encounter SMS consent. */
export async function sendHealthGuideLink({ to, link, language = "en", smsConsent = false }) {
 if (smsConsent !== true) throw new Error("SMS consent is required.");
 const phone = normalizePhone(to);
 if (!phone || typeof link !== "string" || !/^https:\/\/lite\.ompathstudy\.com\/api\/ompath-lite-guide\?token=[A-Za-z0-9_-]{40,60}$/.test(link)) {
  throw new Error("Invalid private guide delivery details.");
 }
 const rows = await db("lite_sms_settings?select=enabled,environment,sender_id&id=eq.1&limit=1");
 const settings = rows[0] || { enabled: false, environment: "sandbox", sender_id: null };
 // Never send patient links through sandbox or while the administrator has paused SMS.
 if (!settings.enabled || settings.environment !== "production") return { sent: false, reason: "sms_not_live" };
 if (!process.env.AT_LIVE_USERNAME || !process.env.AT_LIVE_API_KEY) return { sent: false, reason: "live_provider_not_configured" };
 const message = language === "sw"
  ? "OmpathStudy: Uliomba taarifa za afya. Fungua kiungo hiki kwa usalama: " + link + " Kiungo kitaisha baada ya siku 7. Usishiriki kiungo hiki. Jibu STOP kujiondoa."
  : "OmpathStudy: Your requested health information is ready. Open your private link: " + link + " This link expires in 7 days. Do not share it. Reply STOP to opt out.";
 const recipient = await sendSms(phone, message, settings);
 return { sent: true, status: recipient.status || "Accepted", messageId: recipient.messageId || null };
}

/**
 * Background queue processor. This is deliberately called by the scheduled
 * worker, never from the interactive USSD request.
 */
export async function processPendingHealthGuideSms(limit = 10) {
 const pending = await db("lite_health_encounters?select=id,phone_number,preferred_language,concern_category,original_message,sms_consent,status,sms_sent_at&status=eq.guide_pending&sms_consent=eq.true&sms_sent_at=is.null&order=created_at.asc&limit=" + Math.min(20, Math.max(1, Number(limit) || 10)));
 let sent = 0, waiting = 0, failed = 0;
 for (const encounter of pending) {
  try {
   // Only English patient guides have been approved for delivery so far.
   if (encounter.preferred_language !== "en") { waiting++; continue; }
   const guides = await searchReviewedPatientResources({
    query: [encounter.concern_category || "", encounter.original_message || ""].join(" "),
    language: "en",
    limit: 1,
   });
   if (!guides.length || !guides[0].slug) { waiting++; continue; }
   const issued = await createHealthGuideToken({ encounterId: encounter.id, resourceSlug: guides[0].slug });
   const link = "https://lite.ompathstudy.com/api/ompath-lite-guide?token=" + issued.token;
   const delivery = await sendHealthGuideLink({
    to: encounter.phone_number,
    link,
    language: "en",
    smsConsent: encounter.sms_consent,
   });
   if (!delivery.sent) { waiting++; continue; }
   const updated = await db("lite_health_encounters?id=eq." + encodeURIComponent(encounter.id) +
    "&status=eq.guide_pending&sms_sent_at=is.null", {
     method: "PATCH",
     body: JSON.stringify({ sms_sent_at: new Date().toISOString(), status: "complete" }),
    });
   if (updated.length) sent++;
   else waiting++;
  } catch {
   failed++;
   console.error("Background patient-guide delivery failed.");
  }
 }
 return { checked: pending.length, sent, waiting, failed };
}
