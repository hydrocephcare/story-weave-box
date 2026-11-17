/**
 * OmpathStudy Lite — Africa's Talking USSD adapter.
 * Published OmpathStudy mcq_sets remain the only MCQ source of truth.
 */
const mainMenu = "OmpathStudy Lite\n1. Register\n2. Study by subject\n3. Help\n4. SMS preferences";
const clean = (v,n=180)=>String(v??"").trim().replace(/[<>]/g,"").slice(0,n);
const reply = (res,message,end=false)=>{res.setHeader("Content-Type","text/plain; charset=utf-8");return res.status(200).send(`${end?"END":"CON"} ${message}`);};
async function db(path,options={}){
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)throw new Error("Missing Supabase server configuration");
 const r=await fetch(`${base.replace(/\/$/,"")}/rest/v1/${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:options.prefer||"return=representation",...options.headers}});
 const body=await r.text();if(!r.ok)throw new Error(`Supabase request failed (${r.status})`);return body?JSON.parse(body):[];
}
const getStudent=phone=>db(`lite_students?select=id,full_name,study_level,preferred_subject&phone_number=eq.${encodeURIComponent(phone)}&limit=1`);
const getSets=()=>db("mcq_sets?select=id,title,category,updated_at&published=eq.true&deleted_at=is.null&order=updated_at.desc&limit=200");
const getSet=id=>db(`mcq_sets?select=id,title,questions&id=eq.${encodeURIComponent(id)}&published=eq.true&deleted_at=is.null&limit=1`);
const subjectOf=s=>{
 const raw=clean(s.category||s.title,120);
 return raw.replace(/^weekly\s+exam\s*:\s*/i,"").replace(/^year\s*[1-6]\s*[:\-–—]?\s*/i,"").replace(/\s+exam\s*[-–—:].*$/i,"").replace(/\s*[-–—]\s*(section\s+[a-z]|november\s+\d+).*$/i,"").trim()||"General medical MCQs";
};
const yearMatches=(s,year)=>new RegExp(`\\bYear\\s*${year}\\b`,"i").test(`${s.title||""} ${s.category||""}`);
function optionsOf(q){return Array.isArray(q?.options)?q.options:[];}
async function ussd(req,res){
 let payload=req.body||{};
 if(typeof payload==="string")payload=Object.fromEntries(new URLSearchParams(payload));
 else if(!Object.keys(payload).length&&typeof req.rawBody==="string")payload=Object.fromEntries(new URLSearchParams(req.rawBody));
 const phone=clean(payload.phoneNumber,24),session=clean(payload.sessionId,100),text=clean(payload.text,300);
 if(!phone||!session)return reply(res,"Invalid session. Please dial again.",true);
 const parts=text?text.split("*"):[];
 try{
  if(!text)return reply(res,mainMenu);
  if(parts[0]==="1"){
   if(parts.length===1)return reply(res,"Enter your full name:");
   if(parts.length===2)return reply(res,"Select your study year:\n1. Year 1\n2. Year 2\n3. Year 3\n4. Year 4\n5. Year 5\n6. Year 6");
   const name=clean(parts[1],80),year=Number(parts[2]);
   if(!name||!Number.isInteger(year)||year<1||year>6)return reply(res,"Invalid details. Dial again to register.",true);
   await db("lite_students?on_conflict=phone_number",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({phone_number:phone,full_name:name,study_level:`Year ${year}`,updated_at:new Date().toISOString()})});
   return reply(res,`Welcome, ${name}. Your Year ${year} profile is saved. Dial again and choose 2 to study.`,true);
  }
  if(parts[0]==="2"){
   const students=await getStudent(phone),student=students[0];
   if(!student)return reply(res,"Please register first. Dial again and choose 1.",true);
   const match=String(student.study_level||"").match(/[1-6]/),year=match?match[0]:null;
   if(!year)return reply(res,"Your study year is missing. Please register again.",true);
   const all=await getSets(),yearSets=all.filter(s=>yearMatches(s,year));
   if(!yearSets.length)return reply(res,`No published Year ${year} MCQs found yet. Please explore OmpathStudy online.`,true);
   const grouped=new Map();
   for(const s of yearSets){const subject=subjectOf(s);if(!grouped.has(subject))grouped.set(subject,[]);grouped.get(subject).push(s);}
   const subjects=[...grouped.keys()].sort((a,b)=>a.localeCompare(b));\n   if(student.preferred_subject&&subjects.includes(student.preferred_subject)){subjects.splice(subjects.indexOf(student.preferred_subject),1);subjects.unshift(student.preferred_subject);}
   const subjectNo=parts.length>1?Number(parts[1]):0;
   if(!subjectNo)return reply(res,`Year ${year} subjects:\n${subjects.slice(0,8).map((s,i)=>`${i+1}. ${clean(s,42)}`).join("\n")}\n0. Main menu`);
   if(subjectNo===0)return reply(res,mainMenu,true);
   const subject=subjects[subjectNo-1];
   if(!subject)return reply(res,"Invalid subject. Dial again and choose a listed number.",true);
   await db(`lite_students?id=eq.${student.id}`,{method:"PATCH",body:JSON.stringify({preferred_subject:subject})});
   const subjectSets=grouped.get(subject)||[];
   const setNo=parts.length>2?Number(parts[2]):0;
   if(!setNo)return reply(res,`${clean(subject,55)}\nChoose a question set:\n${subjectSets.slice(0,7).map((s,i)=>`${i+1}. ${clean(s.title,48)}`).join("\n")}\n0. Back to subjects`);
   if(setNo===0)return reply(res,`Year ${year} subjects:\n${subjects.slice(0,8).map((s,i)=>`${i+1}. ${clean(s,42)}`).join("\n")}`);
   const listed=subjectSets[setNo-1];
   if(!listed)return reply(res,"Invalid question set. Dial again and choose a listed number.",true);
   const full=await getSet(listed.id),set=full[0];
   if(!set)return reply(res,"This MCQ set is no longer published.",true);
   const questions=Array.isArray(set.questions)?set.questions:[];
   const qNo=parts.length>3?Number(parts[3]):1,qIndex=qNo-1,q=questions[qIndex];
   if(!q||!Array.isArray(q.options)||q.options.length<2)return reply(res,"Question unavailable. Choose another set.",true);
   if(parts.length<5){
    const opts=optionsOf(q).slice(0,5).map((o,i)=>`${i+1}. ${clean(o,55)}`).join("\n");
    return reply(res,`${clean(set.title,45)}\nQ${qNo}/${questions.length}: ${clean(q.question,170)}\n${opts}\nReply with answer number.`);
   }
   const selected=Number(parts[4]);
   if(!Number.isInteger(selected)||selected<1||selected>Math.min(5,q.options.length))return reply(res,"Invalid answer. Enter one of the listed option numbers.",true);
   const rawCorrect=Number(q.correct_answer),correctIndex=rawCorrect>=0&&rawCorrect<q.options.length?rawCorrect:rawCorrect-1;
   if(!Number.isInteger(correctIndex)||correctIndex<0||correctIndex>=q.options.length)return reply(res,"This question needs an answer-key review. Please report it on OmpathStudy.",true);
   const isCorrect=selected-1===correctIndex;
   await db("lite_attempts",{method:"POST",body:JSON.stringify({student_id:student.id,mcq_set_id:set.id,question_index:qIndex,selected_option:selected,is_correct:isCorrect})});
   const explanation=clean(q.explanation||"Review the full explanation on OmpathStudy.",300);
   const next=qIndex+1<questions.length? `\nNext: dial again, choose 2, then this subject and set, question ${qNo+1}.`:"\nYou have completed this set.";
   return reply(res,`${isCorrect?"Correct!":"Not quite."}\nAnswer: ${correctIndex+1}. ${clean(q.options[correctIndex],90)}\n${explanation}${next}`,true);
  }
  if(parts[0]==="3")return reply(res,"Study with existing OmpathStudy MCQs by year and subject. Your answers and scores are tracked.",true);
  if(parts[0]==="4"){
   const students=await getStudent(phone),student=students[0];
   if(!student)return reply(res,"Please register first using option 1.",true);
   if(parts.length===1)return reply(res,"SMS preferences\n1. Subscribe to daily MCQs\n2. Unsubscribe");
   if(parts[1]==="1"){await db(`lite_students?id=eq.${student.id}`,{method:"PATCH",body:JSON.stringify({sms_opt_in:true,sms_opt_in_at:new Date().toISOString()})});return reply(res,"Subscribed to daily OmpathStudy MCQs. Reply STOP to unsubscribe.",true);}
   if(parts[1]==="2"){await db(`lite_students?id=eq.${student.id}`,{method:"PATCH",body:JSON.stringify({sms_opt_in:false,sms_opt_in_at:null})});return reply(res,"You have unsubscribed from SMS learning.",true);}
   return reply(res,"Choose 1 to subscribe or 2 to unsubscribe.",true);
  }
  return reply(res,mainMenu);
 }catch(e){console.error("OmpathStudy Lite USSD:",e);return reply(res,"We could not process your request. Please try again shortly.",true);}
}
export default async function ompathLite(req,res){if(req.method==="GET")return res.status(200).json({name:"OmpathStudy Lite",status:"ok",source:"OmpathStudy published MCQ library"});if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});return ussd(req,res);}
