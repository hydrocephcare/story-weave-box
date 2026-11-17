/**
 * OmpathStudy Lite SMS channel.
 *
 * POST /api/ompath-lite-sms?mode=send — Vercel Cron (CRON_SECRET required)
 * POST /api/ompath-lite-sms?mode=inbound — Africa's Talking SMS callback
 *
 * Required server env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * AT_USERNAME, AT_API_KEY, CRON_SECRET.
 */
const clean=(v,n=500)=>String(v??"").trim().replace(/[<>]/g,"").slice(0,n);
async function db(path,options={}){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error("Missing Supabase server configuration");
 const r=await fetch(`${url.replace(/\/$/,"")}/rest/v1/${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:options.prefer||"return=representation",...options.headers}});
 const body=await r.text();if(!r.ok)throw new Error(`Supabase ${r.status}: ${body.slice(0,220)}`);return body?JSON.parse(body):[];
}
async function sendSms(to,message){
 const username=process.env.AT_USERNAME,apiKey=process.env.AT_API_KEY;
 if(!username||!apiKey)throw new Error("Missing AT_USERNAME or AT_API_KEY");
 const form=new URLSearchParams({username,to,message});
 const r=await fetch("https://api.africastalking.com/version1/messaging",{method:"POST",headers:{"apiKey":apiKey,Accept:"application/json","Content-Type":"application/x-www-form-urlencoded"},body:form});
 const body=await r.text();if(!r.ok)throw new Error(`Africa's Talking ${r.status}: ${body.slice(0,220)}`);
 return JSON.parse(body);
}
const today=()=>new Date().toISOString().slice(0,10);
async function sendDaily(req,res){
 const secret=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
 if(!process.env.CRON_SECRET||secret!==process.env.CRON_SECRET)return res.status(401).json({error:"Unauthorized"});
 const questions=await db("lite_questions?select=id,question,option_a,option_b,option_c,option_d&is_active=eq.true&order=created_at.desc&limit=1");
 if(!questions[0])return res.status(200).json({sent:0,message:"No active question"});
 const q=questions[0],short=String(q.id).replace(/-/g,"").slice(0,8);
 const students=await db("lite_students?select=id,phone_number&sms_opt_in=eq.true&sms_opt_in_at=not.is.null&limit=500");
 let sent=0,skipped=0,failed=0;
 for(const s of students){
  const existing=await db(`lite_sms_deliveries?select=id&student_id=eq.${s.id}&question_id=eq.${q.id}&delivery_date=eq.${today()}&limit=1`);
  if(existing.length){skipped++;continue;}
  const message=`OmpathStudy Daily MCQ: ${clean(q.question,180)}\n1) ${clean(q.option_a,70)}\n2) ${clean(q.option_b,70)}\n3) ${clean(q.option_c,70)}\n4) ${clean(q.option_d,70)}\nReply: ${short} 1, 2, 3 or 4. STOP to opt out.`;
  try{
   const result=await sendSms(s.phone_number,message);
   const recipient=result?.SMSMessageData?.Recipients?.[0];
   const status=recipient?.status||"Sent";
   await db("lite_sms_deliveries",{method:"POST",body:JSON.stringify({student_id:s.id,question_id:q.id,delivery_date:today(),short_code:short,provider_status:status,provider_message_id:recipient?.messageId||null})});
   sent++;
  }catch(e){
   failed++;console.error("Lite SMS send failed",s.id,e.message);
  }
 }
 return res.status(200).json({sent,skipped,failed,question:short});
}
async function inbound(req,res){
 const p=req.body||{},from=clean(p.from||p.phoneNumber,32),raw=clean(p.text,80).toUpperCase();
 if(!from||!raw)return res.status(200).send("Missing sender or message");
 if(raw==="STOP"||raw==="UNSUBSCRIBE"){
  await db(`lite_students?phone_number=eq.${encodeURIComponent(from)}`,{method:"PATCH",body:JSON.stringify({sms_opt_in:false,sms_opt_in_at:null})});
  return res.status(200).send("You have been unsubscribed from OmpathStudy Lite SMS.");
 }
 if(raw==="START"||raw==="SUBSCRIBE"){
  const s=await db(`lite_students?select=id&phone_number=eq.${encodeURIComponent(from)}&limit=1`);
  if(!s[0])return res.status(200).send("Register through OmpathStudy Lite USSD first, then opt in to SMS.");
  await db(`lite_students?id=eq.${s[0].id}`,{method:"PATCH",body:JSON.stringify({sms_opt_in:true,sms_opt_in_at:new Date().toISOString()})});
  return res.status(200).send("SMS learning enabled. Reply STOP any time to unsubscribe.");
 }
 const match=raw.match(/^([A-F0-9]{6,8})\s+([1-4])$/);
 if(!match)return res.status(200).send("Reply with the 8-character question code, a space, and your answer (1-4). Example: ABC12345 2. Reply STOP to unsubscribe.");
 const [,short,choice]=match;
 const students=await db(`lite_students?select=id&phone_number=eq.${encodeURIComponent(from)}&limit=1`);
 if(!students[0])return res.status(200).send("Please register through OmpathStudy Lite USSD before answering.");
 const qs=await db(`lite_questions?select=id,correct_option,explanation&id=like.${short.slice(0,8)}*&limit=1`);
 if(!qs[0])return res.status(200).send("That question code has expired. Please wait for the next daily question.");
 const q=qs[0],correct=Number(choice)===Number(q.correct_option);
 await db("lite_attempts?on_conflict=student_id,question_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({student_id:students[0].id,question_id:q.id,selected_option:Number(choice),is_correct:correct})});
 return res.status(200).send(`${correct?"Correct!":"Not quite. Correct answer: "+q.correct_option+"."} ${clean(q.explanation,300)}`);
}
export default async function handler(req,res){
 if(req.method==="GET")return res.status(200).json({name:"OmpathStudy Lite SMS",status:"ok"});
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const mode=String(req.query?.mode||"");
 try{
  if(mode==="send")return await sendDaily(req,res);
  if(mode==="inbound")return await inbound(req,res);
  return res.status(400).json({error:"Set mode=send or mode=inbound"});
 }catch(e){console.error("Lite SMS error",e);return res.status(500).json({error:"SMS processing failed"});}
}
