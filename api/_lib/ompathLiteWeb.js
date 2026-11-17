/** Browser-facing API for the standalone OmpathStudy Lite web experience.
 * All learner writes use the server-side service key; it is never sent to the browser.
 * The existing published mcq_sets table remains the single question source.
 */
const send=(res,status,payload)=>res.status(status).json(payload);
const clean=(v,n=300)=>String(v??"").trim().replace(/[<>]/g,"").slice(0,n);
async function db(path,options={}){
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)throw new Error("Lite server configuration is incomplete.");
 const r=await fetch(`${base.replace(/\/$/,"")}/rest/v1/${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:options.prefer||"return=representation",...options.headers}});
 const body=await r.text();if(!r.ok){console.error("Lite web database error",r.status,body.slice(0,300));throw new Error("The learning service could not complete that request.");}
 return body?JSON.parse(body):[];
}
function normalizePhone(value){
 let p=clean(value,30).replace(/[\s()-]/g,"");
 if(/^0\d{9}$/.test(p))p="+254"+p.slice(1);
 else if(/^254\d{9}$/.test(p))p="+"+p;
 return /^\+[1-9]\d{8,14}$/.test(p)?p:null;
}
const subjectOf=s=>clean(s.category||s.title,120).replace(/^weekly\s+exam\s*:\s*/i,"").replace(/^year\s*[1-6]\s*[:\-–—]?\s*/i,"").replace(/\s+exam\s*[-–—:].*$/i,"").replace(/\s*[-–—]\s*(section\s+[a-z]|november\s+\d+).*$/i,"").trim()||"General medical MCQs";
async function student(phone){
 const rows=await db(`lite_students?select=id,phone_number,full_name,study_level,preferred_subject,sms_opt_in&phone_number=eq.${encodeURIComponent(phone)}&limit=1`);
 return rows[0]||null;
}
async function library(year){
 const yearRows=await db("rpc/lite_sets_for_year",{method:"POST",body:JSON.stringify({p_year:year})});
 const groups=new Map();let questionCount=0;
 for(const s of yearRows){
  const subject=subjectOf(s),count=Number(s.question_count)||0;
  if(!groups.has(subject))groups.set(subject,[]);
  groups.get(subject).push({id:s.id,title:clean(s.title,180),category:clean(s.category,120),subject,question_count:count});
  questionCount+=count;
 }
 return {subjects:[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,sets])=>({name,sets})),totals:{sets:yearRows.length,questions:questionCount}};
}
export default async function liteWeb(req,res){
 if(req.method==="GET")return send(res,200,{name:"OmpathStudy Lite web API",status:"ok"});
 if(req.method!=="POST")return send(res,405,{error:"Method not allowed."});
 const p=typeof req.body==="string"?Object.fromEntries(new URLSearchParams(req.body)):req.body||{};
 const action=clean(p.action,40);
 try{
  if(action==="register"){
   const full_name=clean(p.full_name,90),phone_number=normalizePhone(p.phone_number),study_year=Number(p.study_year);
   if(full_name.length<2)return send(res,400,{error:"Enter your full name."});
   if(!phone_number)return send(res,400,{error:"Enter a valid mobile number with country code, for example +2547XXXXXXXX."});
   if(!Number.isInteger(study_year)||study_year<1||study_year>6)return send(res,400,{error:"Choose a study year from 1 to 6."});
   const rows=await db("lite_students?on_conflict=phone_number",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({phone_number,full_name,study_level:`Year ${study_year}`,updated_at:new Date().toISOString()})});
   const s=rows[0]||await student(phone_number);
   return send(res,200,{profile:s});
  }
  const phone=normalizePhone(p.phone);
  if(!phone)return send(res,400,{error:"A valid registered mobile number is required."});
  const s=await student(phone);
  if(!s)return send(res,404,{error:"Learner profile not found. Please register first."});
  if(action==="library"){
   const y=Number(p.year||String(s.study_level).match(/[1-6]/)?.[0]);
   if(!Number.isInteger(y)||y<1||y>6)return send(res,400,{error:"Invalid study year."});
   const data=await library(y);
   if(s.preferred_subject&&data.subjects.some(x=>x.name===s.preferred_subject))data.subjects.sort((a,b)=>a.name===s.preferred_subject?-1:b.name===s.preferred_subject?1:0);
   return send(res,200,data);
  }
  if(action==="set"){
   const id=clean(p.set_id,64),y=Number(p.year||String(s.study_level).match(/[1-6]/)?.[0]);
   if(!/^[0-9a-f-]{36}$/i.test(id))return send(res,400,{error:"Invalid question set."});
   const rows=await db(`mcq_sets?select=id,title,category,questions&id=eq.${id}&published=eq.true&deleted_at=is.null&limit=1`);
   const set=rows[0];if(!set)return send(res,404,{error:"This question set is no longer published."});
   if(!new RegExp(`\\bYear\\s*${y}\\b`,"i").test(`${set.title||""} ${set.category||""}`))return send(res,403,{error:"This set is not listed for your selected study year."});
   const questions=Array.isArray(set.questions)?set.questions:[];
   return send(res,200,{set:{id:set.id,title:clean(set.title,180),subject:subjectOf(set),question_count:questions.length,questions:questions.map(q=>({question:clean(q.question,2500),options:Array.isArray(q.options)?q.options.slice(0,5).map(o=>clean(o,500)):[],explanation:clean(q.explanation,1800)}))}});
  }
  if(action==="answer"){
   const setId=clean(p.set_id,64),question_index=Number(p.question_index),selected=Number(p.selected_option);
   if(!/^[0-9a-f-]{36}$/i.test(setId)||!Number.isInteger(question_index)||question_index<0||!Number.isInteger(selected)||selected<1||selected>5)return send(res,400,{error:"Invalid answer details."});
   const rows=await db(`mcq_sets?select=id,title,questions&id=eq.${setId}&published=eq.true&deleted_at=is.null&limit=1`);
   const set=rows[0],q=set?.questions?.[question_index];
   if(!q||!Array.isArray(q.options)||selected>q.options.length)return send(res,404,{error:"This question is no longer available."});
   const raw=Number(q.correct_answer),correctIndex=raw>=0&&raw<q.options.length?raw:raw-1;
   if(!Number.isInteger(correctIndex)||correctIndex<0||correctIndex>=q.options.length)return send(res,422,{error:"This question's answer key needs review. Please report it to OmpathStudy."});
   const correct=selected-1===correctIndex;
   await db("lite_attempts",{method:"POST",body:JSON.stringify({student_id:s.id,mcq_set_id:set.id,question_index,selected_option:selected,is_correct:correct})});
   return send(res,200,{correct,correctIndex,explanation:clean(q.explanation||"Review the answer and continue practising.",1800)});
  }
  if(action==="progress"){
   const attempts=await db(`lite_attempts?select=id,mcq_set_id,question_index,selected_option,is_correct,attempted_at&student_id=eq.${s.id}&order=attempted_at.desc&limit=100`);
   const ids=[...new Set(attempts.map(a=>a.mcq_set_id))];
   const titles=new Map();
   if(ids.length){const sets=await db(`mcq_sets?select=id,title&id=in.(${ids.join(",")})`);for(const x of sets)titles.set(x.id,x.title);}
   return send(res,200,{attempts:attempts.map(a=>({title:clean(titles.get(a.mcq_set_id)||"OmpathStudy MCQ set",180),correct:a.is_correct,attempted_at:a.attempted_at}))});
  }
  if(action==="sms-preference"){
   if(typeof p.enabled!=="boolean")return send(res,400,{error:"Choose whether to enable SMS."});
   const rows=await db(`lite_students?id=eq.${s.id}`,{method:"PATCH",body:JSON.stringify({sms_opt_in:p.enabled,sms_opt_in_at:p.enabled?new Date().toISOString():null,updated_at:new Date().toISOString()})});
   return send(res,200,{profile:rows[0]||{...s,sms_opt_in:p.enabled}});
  }
  return send(res,400,{error:"Unknown Lite action."});
 }catch(e){console.error("OmpathStudy Lite web API:",e);return send(res,500,{error:e instanceof Error?e.message:"The Lite service is temporarily unavailable."});}
}
