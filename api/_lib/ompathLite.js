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
const getSets=year=>db("mcq_sets?select=id,title,category,updated_at&published=eq.true&deleted_at=is.null&order=updated_at.desc&or="+encodeURIComponent(`(title.ilike.*Year ${year}*,category.ilike.*Year ${year}*)`)+"&limit=500");
const getSet=id=>db(`mcq_sets?select=id,title,questions&id=eq.${encodeURIComponent(id)}&published=eq.true&deleted_at=is.null&limit=1`);
const subjectOf=s=>{
 const raw=clean(s.category||s.title,120);
 return raw.replace(/^weekly\s+exam\s*:\s*/i,"").replace(/^year\s*[1-6]\s*[:\-–—]?\s*/i,"").replace(/\s+exam\s*[-–—:].*$/i,"").replace(/\s*[-–—]\s*(section\s+[a-z]|november\s+\d+).*$/i,"").trim()||"General medical MCQs";
};
const yearMatches=(s,year)=>new RegExp(`\\bYear\s*${year}\\b`,"i").test(`${s.title||""} ${s.category||""}`);
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
   if(parts.length===1)return reply(res,"Select your study year:\n1. Year 1\n2. Year 2\n3. Year 3\n4. Year 4\n5. Year 5\n6. Year 6");
   const choice=parts.slice(1).findLast(v=>/^\s*(?:year\s*)?[1-6]\s*$/i.test(v));
   const yearMatch=choice?.match(/[1-6]/);
   const year=yearMatch?Number(yearMatch[0]):NaN;
   if(!Number.isInteger(year)||year<1||year>6)return reply(res,"Invalid choice. Select a year from 1 to 6. Dial again and choose 1.",true);
   await db("lite_students?on_conflict=phone_number",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({phone_number:phone,full_name:"Student",study_level:`Year ${year}`,updated_at:new Date().toISOString()})});
   return reply(res,`Registration successful. Year ${year} selected. Dial again and choose 2 to study.`,true);
  }
  if(parts[0]==="2"){
   const students=await getStudent(phone),student=students[0];
   if(!student)return reply(res,"Please register first. Dial again and choose 1.",true);
   const match=String(student.study_level||"").match(/[1-6]/),year=match?match[0]:null;
   if(!year)return reply(res,"Your study year is missing. Please register again.",true);
   const yearSets=await getSets(year);
   if(!yearSets.length)return reply(res,`No published Year ${year} MCQs found yet. Please explore OmpathStudy online.`,true);
   const grouped=new Map();
   for(const s of yearSets){const subject=subjectOf(s);if(!grouped.has(subject))grouped.set(subject,[]);grouped.get(subject).push(s);}
   const subjects=[...grouped.keys()].sort((a,b)=>a.localeCompare(b));
   if(student.preferred_subject&&subjects.includes(student.preferred_subject)){subjects.splice(subjects.indexOf(student.preferred_subject),1);subjects.unshift(student.preferred_subject);}
   const tokens=parts.slice(1);
   let cursor=0,subjectPage=0;
   while(tokens[cursor]==="9"){subjectPage++;cursor++;}
   const showSubjects=(page)=>reply(res,`Year ${year} subjects (page ${page+1}):\n${subjects.slice(page*7,page*7+7).map((s,i)=>`${i+1}. ${clean(s,38)}`).join("\n")}${(page+1)*7<subjects.length?"\n9. Next page":""}\n0. ${page>0?"Previous page":"Main menu"}`);
   if(cursor>=tokens.length)return showSubjects(subjectPage);
   if(tokens[cursor]==="0")return subjectPage>0?showSubjects(subjectPage-1):reply(res,mainMenu,true);
   const subjectNo=Number(tokens[cursor++]);
   if(!Number.isInteger(subjectNo)||subjectNo<1||subjectNo>7)return reply(res,"Choose a listed subject number, 9 for next page or 0 to go back.",true);
   const subject=subjects[subjectPage*7+subjectNo-1];
   if(!subject)return reply(res,"No subject at that position. Go back and choose another.",true);
   await db(`lite_students?id=eq.${student.id}`,{method:"PATCH",body:JSON.stringify({preferred_subject:subject})});
   const subjectSets=grouped.get(subject)||[];
   let setPage=0;
   while(tokens[cursor]==="9"){setPage++;cursor++;}
   const showSets=(page)=>reply(res,`${clean(subject,42)} (page ${page+1}):\nChoose a question set:\n${subjectSets.slice(page*7,page*7+7).map((s,i)=>`${i+1}. ${clean(s.title,42)}`).join("\n")}${(page+1)*7<subjectSets.length?"\n9. Next page":""}\n0. ${page>0?"Previous page":"Back to subjects"}`);
   if(cursor>=tokens.length)return showSets(setPage);
   if(tokens[cursor]==="0")return setPage>0?showSets(setPage-1):showSubjects(subjectPage);
   const setNo=Number(tokens[cursor++]);
   if(!Number.isInteger(setNo)||setNo<1||setNo>7)return reply(res,"Choose a listed set number, 9 for next page or 0 to go back.",true);
   const listed=subjectSets[setPage*7+setNo-1];
   if(!listed)return reply(res,"No question set at that position. Go back and choose another.",true);
   const full=await getSet(listed.id),set=full[0];
   if(!set)return reply(res,"This MCQ set is no longer published.",true);
   const questions=Array.isArray(set.questions)?set.questions:[];
   const qNo=tokens[cursor]!==undefined?Number(tokens[cursor++]):1,qIndex=qNo-1,q=questions[qIndex];
   if(!Number.isInteger(qNo)||qNo<1||!q||!Array.isArray(q.options)||q.options.length<2)return reply(res,"Question unavailable. Choose another question set.",true);
   if(cursor>=tokens.length){
    const opts=optionsOf(q).slice(0,5).map((o,i)=>`${i+1}. ${clean(o,48)}`).join("\n");
    return reply(res,`${clean(set.title,40)}\nQ${qNo}/${questions.length}: ${clean(q.question,145)}\n${opts}\nReply with answer number.`);
   }
   const selected=Number(tokens[cursor]);
   if(!Number.isInteger(selected)||selected<1||selected>Math.min(5,q.options.length))return reply(res,"Invalid answer. Enter one of the listed option numbers.",true);
   const rawCorrect=Number(q.correct_answer),correctIndex=rawCorrect>=0&&rawCorrect<q.options.length?rawCorrect:rawCorrect-1;
   if(!Number.isInteger(correctIndex)||correctIndex<0||correctIndex>=q.options.length)return reply(res,"This question needs an answer-key review. Please report it on OmpathStudy.",true);
   const isCorrect=selected-1===correctIndex;
   await db("lite_attempts",{method:"POST",body:JSON.stringify({student_id:student.id,mcq_set_id:set.id,question_index:qIndex,selected_option:selected,is_correct:isCorrect})});
   const explanation=clean(q.explanation||"Review the full explanation on OmpathStudy.",260);
   const next=qIndex+1<questions.length?`\nNext question: dial again, choose 2, then repeat this subject and set; enter question ${qNo+1}.`:"\nYou have completed this set.";
   return reply(res,`${isCorrect?"Correct!":"Not quite."}\nAnswer: ${correctIndex+1}. ${clean(q.options[correctIndex],75)}\n${explanation}${next}`,true);
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
