/**
 * OmpathStudy Lite — Africa's Talking USSD adapter.
 * Reads published mcq_sets directly. MCQ JSON remains owned by OmpathStudy.
 */
const mainMenu = "OmpathStudy Lite\n1. Register\n2. Browse medical MCQs\n3. Help\n4. SMS preferences";
const clean = (v, n=180) => String(v ?? "").trim().replace(/[<>]/g, "").slice(0,n);
const reply = (res, message, end=false) => { res.setHeader("Content-Type","text/plain; charset=utf-8"); return res.status(200).send(`${end?"END":"CON"} ${message}`); };
async function db(path, options={}) {
  const base=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key) throw new Error("Missing Supabase server configuration");
  const r=await fetch(`${base.replace(/\/$/,"")}/rest/v1/${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:options.prefer||"return=representation",...options.headers}});
  const body=await r.text(); if(!r.ok) throw new Error(`Supabase request failed (${r.status})`); return body?JSON.parse(body):[];
}
const getSets=()=>db("mcq_sets?select=id,title,category,unit,questions,updated_at&published=eq.true&deleted_at=is.null&order=updated_at.desc&limit=8");
function optionsOf(q){return Array.isArray(q?.options)?q.options:[];}
async function ussd(req,res){
 let payload=req.body||{};
 if(typeof payload==="string") payload=Object.fromEntries(new URLSearchParams(payload));
 else if(!Object.keys(payload).length&&typeof req.rawBody==="string") payload=Object.fromEntries(new URLSearchParams(req.rawBody));
 const phone=clean(payload.phoneNumber,24), session=clean(payload.sessionId,100), text=clean(payload.text,300);
 if(!phone||!session) return reply(res,"Invalid session. Please dial again.",true);
 const parts=text?text.split("*"):[];
 try{
  if(!text) return reply(res,mainMenu);
  if(parts[0]==="1"){
   if(parts.length===1) return reply(res,"Enter your full name:");
   if(parts.length===2) return reply(res,"Select your MBChB year:\n1. Year 1\n2. Year 2\n3. Year 3\n4. Year 4\n5. Year 5\n6. Year 6");
   const name=clean(parts[1],80), year=Number(parts[2]);
   if(!name||year<1||year>6) return reply(res,"Invalid details. Dial again to register.",true);
   await db("lite_students?on_conflict=phone_number",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({phone_number:phone,full_name:name,study_level:`MBChB Year ${year}`,updated_at:new Date().toISOString()})});
   return reply(res,`Welcome to OmpathStudy Lite, ${name}. Your MBChB Year ${year} profile is saved. Dial again to study.`,true);
  }
  if(parts[0]==="2"){
   const sets=await getSets();
   if(!sets.length) return reply(res,"No published MCQs are currently available. Please try again later.",true);
   if(parts.length===1){
    const menu=sets.slice(0,7).map((s,i)=>`${i+1}. ${clean(s.title,55)}`).join("\n");
    return reply(res,`Choose a question set:\n${menu}\n0. Main menu`);
   }
   const setNo=Number(parts[1]);
   if(setNo===0) return reply(res,mainMenu,true);
   const set=sets[setNo-1];
   if(!set) return reply(res,"Invalid set. Dial again and choose a listed number.",true);
   const questions=Array.isArray(set.questions)?set.questions:[];
   if(!questions.length) return reply(res,"This set has no available questions.",true);
   const qIndex=parts.length>=3?Number(parts[2])-1:0;
   const q=questions[qIndex];
   if(!q||!Array.isArray(q.options)||q.options.length<2) return reply(res,"Question unavailable. Please try another set.",true);
   if(parts.length<4){
    const opts=optionsOf(q).slice(0,5).map((o,i)=>`${i+1}. ${clean(o,65)}`).join("\n");
    return reply(res,`${clean(set.title,45)}\nQ${qIndex+1}. ${clean(q.question,210)}\n${opts}\nReply with your answer number.`);
   }
   const selected=Number(parts[3]);
   if(!Number.isInteger(selected)||selected<1||selected>Math.min(5,q.options.length)) return reply(res,"Invalid answer. Choose one of the listed option numbers.",true);
   const students=await db(`lite_students?select=id&phone_number=eq.${encodeURIComponent(phone)}&limit=1`);
   if(!students[0]) return reply(res,"Please register first. Dial again and choose 1.",true);
   const rawCorrect=Number(q.correct_answer);
   const correctIndex=rawCorrect>=0&&rawCorrect<q.options.length?rawCorrect:rawCorrect-1;
   const isCorrect=selected-1===correctIndex;
   await db("lite_attempts",{method:"POST",body:JSON.stringify({student_id:students[0].id,mcq_set_id:set.id,question_index:qIndex,selected_option:selected,is_correct:isCorrect})});
   const answerText=clean(q.options[correctIndex]??"See OmpathStudy",110);
   const explanation=clean(q.explanation||"Review the full explanation on OmpathStudy.",360);
   return reply(res,`${isCorrect?"Correct!":"Not quite."}\nCorrect answer: ${correctIndex+1}. ${answerText}\n${explanation}\nSource: OmpathStudy MCQ library.`,true);
  }
  if(parts[0]==="3") return reply(res,"OmpathStudy Lite gives you access to published medical MCQs through a basic phone. Register, choose a set and answer.",true);
  if(parts[0]==="4"){
   const students=await db(`lite_students?select=id&phone_number=eq.${encodeURIComponent(phone)}&limit=1`);
   if(!students[0]) return reply(res,"Please register first using option 1.",true);
   if(parts.length===1) return reply(res,"SMS preferences\n1. Subscribe to daily MCQs\n2. Unsubscribe");
   if(parts[1]==="1"){await db(`lite_students?id=eq.${students[0].id}`,{method:"PATCH",body:JSON.stringify({sms_opt_in:true,sms_opt_in_at:new Date().toISOString()})});return reply(res,"Subscribed to daily OmpathStudy MCQs. Reply STOP to unsubscribe.",true);}
   if(parts[1]==="2"){await db(`lite_students?id=eq.${students[0].id}`,{method:"PATCH",body:JSON.stringify({sms_opt_in:false,sms_opt_in_at:null})});return reply(res,"You have unsubscribed from SMS learning.",true);}
   return reply(res,"Choose 1 to subscribe or 2 to unsubscribe.",true);
  }
  return reply(res,mainMenu);
 }catch(e){console.error("OmpathStudy Lite USSD:",e);return reply(res,"We could not process your request. Please try again shortly.",true);}
}
export default async function ompathLite(req,res){if(req.method==="GET")return res.status(200).json({name:"OmpathStudy Lite",status:"ok",source:"OmpathStudy published MCQ library"});if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});return ussd(req,res);}
