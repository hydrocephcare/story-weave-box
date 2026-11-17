/** OmpathStudy Lite SMS channel.
 * Daily questions and explanations are read from the existing published MCQ bank.
 * POST /api/ompath-lite-sms?mode=send (Vercel Cron; CRON_SECRET)
 * POST /api/ompath-lite-sms?mode=inbound&key=<AT_INBOUND_SECRET> (Africa's Talking inbox callback)
 */
import { randomBytes, timingSafeEqual } from "node:crypto";

const clean=(v,n=500)=>String(v??"").trim().replace(/[<>]/g,"").slice(0,n);
const today=()=>new Date().toISOString().slice(0,10);
function normalizePhone(v){let p=clean(v,32).replace(/[\s()-]/g,"");if(/^0\d{9}$/.test(p))p="+254"+p.slice(1);else if(/^254\d{9}$/.test(p))p="+"+p;return /^\+[1-9]\d{8,14}$/.test(p)?p:null;}
async function db(path,options={}){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error("Missing Supabase server configuration");
 const r=await fetch(`${url.replace(/\/$/,"")}/rest/v1/${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:options.prefer||"return=representation",...options.headers}});
 const body=await r.text();if(!r.ok){console.error("Lite SMS database error",r.status,body.slice(0,250));throw new Error("SMS database request failed");}return body?JSON.parse(body):[];
}
async function sendSms(to,message){
 const username=process.env.AT_USERNAME,apiKey=process.env.AT_API_KEY;
 if(!username||!apiKey)throw new Error("Africa's Talking SMS credentials are not configured");
 const sandbox=process.env.AT_ENV==="sandbox";
 const form=new URLSearchParams({username,to,message});
 if(process.env.AT_SENDER_ID)form.set("from",process.env.AT_SENDER_ID);
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
   const recipient=await sendSms(s.phone_number,message);
   await db("lite_sms_deliveries",{method:"POST",body:JSON.stringify({student_id:s.id,mcq_set_id:item.set.id,question_index:item.index,delivery_date:today(),short_code:code,provider_status:recipient.status||"Accepted",provider_message_id:recipient.messageId||null})});
   sent++;
  }catch(e){failed++;console.error("Lite SMS send failed",s.id,e.message);}
 }
 return res.status(200).json({sent,skipped,failed,date:today()});
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
  if(students[0])await db(`lite_students?id=eq.${students[0].id}`,{method:"PATCH",body:JSON.stringify({sms_opt_in:false,sms_opt_in_at:null,updated_at:new Date().toISOString()})});
  return res.status(200).send("You have been unsubscribed from OmpathStudy Lite SMS.");
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
 try{if(mode==="send")return await sendDaily(req,res);if(mode==="inbound")return await inbound(req,res);return res.status(400).json({error:"Set mode=send or mode=inbound"});}
 catch(e){console.error("Lite SMS error",e);return res.status(500).json({error:"SMS processing failed"});}
}
