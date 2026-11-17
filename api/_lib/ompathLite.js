/**
 * OmpathStudy Lite — Africa's Talking USSD adapter.
 * Published OmpathStudy mcq_sets remain the only MCQ source of truth.
 */
import { createHealthEncounter, getHealthEncounter, updateHealthEncounter } from "./ompathLiteHealth.js";
import { detectEmergencyLanguage, buildPreliminaryAssessment } from "./ompathLiteRules.js";
import { adaptPregnancyQuestions } from "./ompathLiteFlow.js";
import { shortUssdText, splitUssdWords } from "./ompathLiteUssdFormat.js";
const mainMenu = "OmpathStudy Lite\n1. Health support\n2. Help and information";
const clean = (v,n=180)=>String(v??"").replace(/<br\s*\/?>/gi," ").replace(/<\/(?:p|div|li|h[1-6])\s*>/gi," ").replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g," ").trim().slice(0,n);
const shortText=(value,max)=>shortUssdText(clean(value,2000),max);
const splitWords=splitUssdWords;
const setLabel=(set,subject)=>{
 let label=clean(set.title,180).replace(/^weekly\s+year\s*[1-6]\s*[:\-–—]?\s*/i,"").replace(/^year\s*[1-6]\s*[:\-–—]?\s*/i,"").trim();
 if(!label||label.toLowerCase()===subject.toLowerCase())label="Weekly "+subject;
 return shortText(label,34);
};
const reply = (res,message,end=false)=>{res.setHeader("Content-Type","text/plain; charset=utf-8");return res.status(200).send(`${end?"END":"CON"} ${message}`);};
async function db(path,options={}){
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)throw new Error("Missing Supabase server configuration");
 const r=await fetch(`${base.replace(/\/$/,"")}/rest/v1/${path}`,{...options,signal:options.signal||AbortSignal.timeout(6000),headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:options.prefer||"return=representation",...options.headers}});
 const body=await r.text();if(!r.ok)throw new Error(`Supabase request failed (${r.status})`);return body?JSON.parse(body):[];
}
const queryCache=new Map();
async function cachedQuery(key,ttl,loader){
 const now=Date.now(),hit=queryCache.get(key);
 if(hit&&hit.expiresAt>now)return hit.value;
 const value=await loader();
 queryCache.set(key,{value,expiresAt:now+ttl});
 if(queryCache.size>150)queryCache.delete(queryCache.keys().next().value);
 return value;
}
const getStudent=phone=>cachedQuery("student:"+phone,5000,()=>db(`lite_students?select=id,full_name,study_level,preferred_subject&phone_number=eq.${encodeURIComponent(phone)}&limit=1`));
const getSets=year=>cachedQuery("sets:"+year,30000,()=>db("mcq_sets?select=id,title,category,updated_at&published=eq.true&deleted_at=is.null&order=updated_at.desc&or="+encodeURIComponent(`(title.ilike.*Year ${year}*,category.ilike.*Year ${year}*)`)+"&limit=500"));
const getSet=id=>cachedQuery("set:"+id,60000,()=>db(`mcq_sets?select=id,title,questions&id=eq.${encodeURIComponent(id)}&published=eq.true&deleted_at=is.null&limit=1`));
const subjectOf=s=>{
 const raw=clean(s.category||s.title,120);
 return raw.replace(/^weekly\s+exam\s*:\s*/i,"").replace(/^year\s*[1-6]\s*[:\-–—]?\s*/i,"").replace(/\s+exam\s*[-–—:].*$/i,"").replace(/\s*[-–—]\s*(section\s+[a-z]|november\s+\d+).*$/i,"").trim()||"General medical MCQs";
};
const yearMatches=(s,year)=>new RegExp(`\\bYear\s*${year}\\b`,"i").test(`${s.title||""} ${s.category||""}`);
function optionsOf(q){return Array.isArray(q?.options)?q.options:[];}
function languagePrompt(language,q){return language==="sw"?q.sw:q.en;}
function assessmentReply(assessment, language) {
 const impression=shortText(assessment?.provisional_diagnosis||"Cause not yet clear; clinical assessment is needed.",105);
 const level=assessment?.urgency_level;
 if(language==="sw") {
  const heading=level==="emergency"?"DHARURA: Nenda hospitali sasa. ":level==="urgent"?"HARAKA: Tafuta huduma ya afya leo. ":"Tathmini ya awali: ";
  return heading+impression+". Si utambuzi wa mwisho.";
 }
 const heading=level==="emergency"?"EMERGENCY: Go to hospital now. ":level==="urgent"?"URGENT: Attend a health facility today. ":"Preliminary impression: ";
 return heading+impression+". Not a confirmed diagnosis; clinician assessment is required.";
}
async function ussd(req,res){
 let payload=req.body||{};
 if(typeof payload==="string")payload=Object.fromEntries(new URLSearchParams(payload));
 else if(!Object.keys(payload).length&&typeof req.rawBody==="string")payload=Object.fromEntries(new URLSearchParams(req.rawBody));
 const phone=clean(payload.phoneNumber,24),session=clean(payload.sessionId,100),text=clean(payload.text,300);
 if(!phone||!session)return reply(res,"Invalid session. Please dial again.",true);
 const parts=text?text.split("*"):[];
 try{
  if(!text)return reply(res,mainMenu);
  if(parts[0]==="2")return reply(res,"OmpathStudy Lite provides health support and preliminary symptom assessment. For medical notes, MCQs, past papers and full learning resources, visit https://www.ompathstudy.com",true);
  if(parts[0]!=="1")return reply(res,mainMenu,true);
  if(parts[0]==="1"){
   // Resolve back navigation within this flow. 0 removes one prior selection;
   // 00 clears the health flow and returns to the Lite main menu.
   const flow=[];
   let returnedToIntro=false;
   for(const token of parts.slice(1)){
    if(token==="00")return reply(res,mainMenu);
    if(token==="0"){if(flow.length===1)returnedToIntro=true;flow.pop();continue;}
    flow.push(token);
   }
   if(!flow.length){if(returnedToIntro)return reply(res,"Health support\nNot for emergencies. If symptoms are severe, go to hospital now.\n1. Continue\n2. Cancel\n0. Main menu");return reply(res,parts.length>1?mainMenu:"Health support\nNot for emergencies. If symptoms are severe, go to hospital now.\n1. Continue\n2. Cancel\n0. Main menu",parts.length>1);}
   if(flow.length===1){
    if(flow[0]==="2")return reply(res,"Health support cancelled. No health information was saved.",true);
    if(flow[0]!=="1")return reply(res,"Choose 1 to continue or 2 to cancel.\n0. Back");
    return reply(res,"Choose language:\n1. English\n2. Kiswahili\n0. Back");
   }
   if(flow.length===2){
    if(!["1","2"].includes(flow[1]))return reply(res,"Choose 1 for English or 2 for Kiswahili.\n0. Back");
    return reply(res,flow[1]==="2"
     ?"Nambari na majibu ya afya huhifadhiwa salama kwa siku 30. Hakuna SMS itakayotumwa. Si huduma ya dharura wala utambuzi wa mwisho. Usiandike jina.\n1. Nakubali\n2. Sitaki\n0. Rudi"
     :"Your phone number and health answers are stored securely for 30 days. No SMS will be sent. Not emergency care or a confirmed diagnosis. Do not enter names.\n1. Agree\n2. Cancel\n0. Back");
   }
   if(flow.length===3){
    if(flow[2]==="2")return reply(res,"Cancelled. No health information was saved.",true);
    if(flow[2]!=="1")return reply(res,flow[1]==="2"?"Chagua 1 kukubali au 2 kukataa.\n0. Rudi":"Choose 1 to agree or 2 to cancel.\n0. Back");
    return reply(res,flow[1]==="2"
     ?"Chagua tatizo kuu:\n1. Ujauzito\n2. Hedhi\n3. Maumivu ya tumbo la chini\n4. Uchafu ukeni\n5. Kutokwa damu\n6. Nyingine"
     :"Choose your main concern:\n1. Pregnancy\n2. Period problem\n3. Lower tummy pain\n4. Vaginal discharge\n5. Bleeding\n6. Other");
   }
   if(flow.length===4){
    if(!["1","2","3","4","5","6"].includes(flow[3]))return reply(res,flow[1]==="2"?"Chagua namba 1 hadi 6.\n0. Rudi":"Choose a number from 1 to 6.\n0. Back");
    return reply(res,flow[1]==="2"
     ?"Eleza dalili kwa kifupi. Andika 1 kuruka.\n0. Rudi"
     :"Briefly describe your symptoms. Enter 1 to skip.\n0. Back");
   }
   if(flow.length===5){
    return reply(res,flow[1]==="2"
     ?"Dharura sasa: shida kali ya kupumua, maumivu ya kifua, kuzimia, degedege, damu nyingi au maumivu makali?\n1. Ndiyo  2. Hapana  3. Sina uhakika\n0. Rudi"
     :"Emergency signs right now: severe breathing trouble, chest pain, fainting, seizure, heavy bleeding or severe pain?\n1. Yes  2. No  3. Not sure\n0. Back");
   }
   if(flow.length===6){
    if(!["1","2","3"].includes(flow[5]))return reply(res,flow[1]==="2"?"Chagua 1, 2 au 3.\n0. Rudi":"Choose 1, 2 or 3.\n0. Back");
    const language=flow[1]==="2"?"sw":"en";
    const categories={"1":"Pregnancy-related concern","2":"Menstrual problem","3":"Lower abdominal pain","4":"Vaginal discharge","5":"Bleeding","6":"Other health concern"};
    const description=flow[4]==="1"?"":clean(flow[4],1200);
    const emergencyAnswer=flow[5];
    const emergencyFlags=detectEmergencyLanguage(description);
    if(emergencyAnswer==="1")emergencyFlags.push({rule:"self_reported_emergency_symptom",positive:true});
    const encounter=await createHealthEncounter({
     sessionId:session,
     phoneNumber:phone,
     consentGiven:true,
     smsConsent:false,
     preferredLanguage:language,
     channel:"ussd"
    });
    if(encounter?.assessment||["complete","referred_urgent"].includes(encounter?.status)){
     return reply(res,language==="sw"
      ?"Tathmini hii tayari ilikamilishwa. Ikiwa dalili zimezidi, nenda hospitali sasa."
      :"This enquiry has already been assessed. If symptoms are worsening, seek care now.",true);
    }
    const emergencyAnswers=[{question_id:"emergency_screen",answer:emergencyAnswer}];
    const preliminary=buildPreliminaryAssessment({
     encounter:{concern_category:categories[flow[3]],original_message:description},
     answers:emergencyAnswers,
     emergencyFlags
    });
    const needsUrgentCare=emergencyAnswer!=="2"||emergencyFlags.length>0;
    await updateHealthEncounter({
     id:encounter.id,
     sessionId:session,
     phoneNumber:phone,
     patch:{
      concern_category:categories[flow[3]],
      original_message:description,
      normalized_summary:"",
      clarification_answers:emergencyAnswers,
      red_flag_results:emergencyFlags,
      ...(needsUrgentCare?{assessment:preliminary,urgency_level:preliminary.urgency_level,status:"referred_urgent"}:{urgency_level:"not_assessed",status:"awaiting_clarification"})
     }
    });
    if(needsUrgentCare)return reply(res,assessmentReply(preliminary,language,true),true);
    const firstQuestion=flow[3]==="1"
     ?"Are you pregnant?\n1. Yes  2. No  3. Not sure"
     :flow[3]==="2"||flow[3]==="4"
      ?"How long has this been happening?\n1. Under 1 day  2. 1-7 days  3. Over 7 days"
      :flow[3]==="3"
       ?"When did the pain start?\n1. Under 1 day  2. 1-7 days  3. Over 7 days"
       :flow[3]==="5"
        ?"Is the bleeding heavy (one pad/hour) or have you felt faint?\n1. Yes  2. No  3. Not sure"
        :"How long has this been happening?\n1. Under 1 day  2. 1-7 days  3. Over 7 days";
    return reply(res,language==="sw"?"Tafadhali jibu swali lifuatalo kwa kuchagua nambari.\n"+firstQuestion:"Please answer the next question by choosing a number.\n"+firstQuestion+"\n0. Back");
   }
   if(flow.length>=7&&flow.length<=11){
    const encounter=await getHealthEncounter({sessionId:session,phoneNumber:phone});
    if(!encounter)return reply(res,"Your health session expired. Please start again from the main menu.",true);
    if(["complete","guide_pending","referred_urgent"].includes(encounter.status)&&encounter.assessment){
     return reply(res,encounter.preferred_language==="sw"
      ?"Tathmini yako ya awali tayari imekamilika. Tafadhali fuata ushauri uliotolewa na mhudumu wa afya. Ikiwa dalili ni kali au zinazidi, tafuta huduma ya dharura sasa."
      :"Your preliminary assessment has already been completed. Please follow the care advice provided. If symptoms are severe or worsening, seek emergency care now.",true);
    }
    const category=encounter.concern_category||"Other health concern";
    let questions=[
     {id:"emergency_screen",en:"Emergency signs now: severe breathing trouble, chest pain, fainting, seizure, heavy bleeding or severe pain?",sw:"Dharura sasa: shida ya kupumua, maumivu ya kifua, kuzimia, degedege au damu nyingi?"},
     ...(category==="Pregnancy-related concern"?[
      {id:"pregnancy_status",en:"Are you pregnant?",sw:"Una ujauzito?"},
      {id:"gestation",en:"How many weeks pregnant?",sw:"Una ujauzito wa wiki ngapi?"},
      {id:"pregnancy_bleeding_or_fluid",en:"Any vaginal bleeding or fluid leak?",sw:"Unatoka damu au maji ukeni?"},
      {id:"pregnancy_movement",en:"At 20+ weeks, are baby movements reduced or absent?",sw:"Wiki 20 au zaidi: mtoto anasogea kidogo au hasogei?"}
     ]:category==="Menstrual problem"||category==="Vaginal discharge"?[
      {id:"duration",en:"How long? ",sw:"Kwa muda gani?"},
      {id:"fever",en:"Fever or chills?",sw:"Una homa au baridi?"},
      {id:"pregnancy_possibility",en:"Could you be pregnant?",sw:"Unaweza kuwa mjamzito?"},
      {id:"severity",en:"Is it getting worse?",sw:"Hali inazidi kuwa mbaya?"}
     ]:category==="Lower abdominal pain"?[
      {id:"onset",en:"When did the pain start?",sw:"Maumivu yalianza lini?"},
      {id:"pregnancy_possibility",en:"Could you be pregnant?",sw:"Unaweza kuwa mjamzito?"},
      {id:"fever_vomiting",en:"Fever or repeated vomiting?",sw:"Homa au kutapika mara kwa mara?"},
      {id:"severity",en:"Is the pain severe or worsening?",sw:"Maumivu ni makali au yanaongezeka?"}
     ]:category==="Bleeding"?[
      {id:"bleeding_amount",en:"Heavy bleeding (pad/hour) or faint?",sw:"Damu nyingi (pedi kwa saa) au kuzimia?"},
      {id:"pregnancy_possibility",en:"Pregnant or recently gave birth?",sw:"Mjamzito au umejifungua hivi karibuni?"},
      {id:"duration",en:"When did bleeding start?",sw:"Damu ilianza lini?"},
      {id:"pain",en:"Severe abdominal or pelvic pain?",sw:"Maumivu makali ya tumbo au nyonga?"}
     ]:[
      {id:"duration",en:"How long has this been happening?",sw:"Tatizo limekuwepo kwa muda gani?"},
      {id:"fever",en:"Do you have fever?",sw:"Una homa?"},
      {id:"worsening",en:"Are symptoms getting worse?",sw:"Dalili zinazidi kuwa mbaya?"},
      {id:"care",en:"Have you received medical care?",sw:"Umepata huduma ya afya?"}
     ])
    ];
    const priorAnswers=flow.slice(5,-1);
    questions=adaptPregnancyQuestions(questions,category,priorAnswers);
    const answers=priorAnswers.map((value,index)=>({question_id:questions[index]?.id,answer:value})).filter(item=>item.question_id);
    const answerIndex=flow.length-6;
    const currentQuestion=questions[answerIndex];
    if(!currentQuestion)return reply(res,"Your answers have been recorded. No diagnosis or clinical assessment has been generated. Please seek care if symptoms persist or worsen.",true);
    const answer=flow[flow.length-1];
    const allowedAnswers=currentQuestion.id==="gestation"?["1","2","3","4"]:
     ["duration","onset"].includes(currentQuestion.id)?["1","2","3"]:
     ["severity","worsening"].includes(currentQuestion.id)?["1","2","3"]:["1","2","3"];
    if(!allowedAnswers.includes(answer))return reply(res,languagePrompt(encounter.preferred_language,currentQuestion)+"\nChoose one of the numbered options shown.\n0. Back");
    if(answerIndex===0&&answer==="1"){
     const emergencyAnswers=[...answers,{question_id:currentQuestion.id,answer}];
     const emergencyAssessment=buildPreliminaryAssessment({encounter,answers:emergencyAnswers,emergencyFlags:[...(encounter.red_flag_results||[]),{rule:"self_reported_emergency_symptom",positive:true}]});
     await updateHealthEncounter({id:encounter.id,sessionId:session,phoneNumber:phone,patch:{clarification_answers:emergencyAnswers,red_flag_results:[{rule:"self_reported_emergency_symptom",positive:true}],assessment:emergencyAssessment,status:"referred_urgent",urgency_level:"emergency"}});
     return reply(res,assessmentReply(emergencyAssessment,encounter.preferred_language,true),true);
    }
    if(answerIndex===0&&answer==="3"){
     const uncertainAnswers=[...answers,{question_id:currentQuestion.id,answer}];
     const assessment=buildPreliminaryAssessment({encounter,answers:uncertainAnswers,emergencyFlags:encounter.red_flag_results||[]});
     await updateHealthEncounter({id:encounter.id,sessionId:session,phoneNumber:phone,patch:{
      clarification_answers:uncertainAnswers,
      assessment,
      urgency_level:"urgent",
      status:"referred_urgent"
     }});
     return reply(res,assessmentReply(assessment,encounter.preferred_language,true),true);
    }
    const nextAnswers=[...answers,{question_id:currentQuestion.id,answer}];
    const nextIndex=answerIndex+1;
    if(nextIndex>=questions.length){
     const assessment=buildPreliminaryAssessment({encounter,answers:nextAnswers,emergencyFlags:encounter.red_flag_results||[]});
     await updateHealthEncounter({id:encounter.id,sessionId:session,phoneNumber:phone,patch:{
      clarification_answers:nextAnswers,
      assessment,
      urgency_level:assessment.urgency_level,
      status:encounter.sms_consent===true?"guide_pending":"complete"
     }});
     const emergency=assessment.urgency_level==="emergency";
     return reply(res,assessmentReply(assessment,encounter.preferred_language,emergency),true);
    }
    await updateHealthEncounter({id:encounter.id,sessionId:session,phoneNumber:phone,patch:{clarification_answers:nextAnswers,status:"awaiting_clarification"}});
    const nextQuestions=adaptPregnancyQuestions(questions,category,nextAnswers);
    const nextQuestion=nextQuestions[nextIndex];
    if(!nextQuestion)return reply(res,"Your answers have been recorded. Please arrange an in-person health assessment.",true);
    const optionText=nextQuestion.id==="gestation"
     ?(encounter.preferred_language==="sw"?"1. Chini ya 20  2. 20-27  3. 28+  4. Sina uhakika":"1. Under 20  2. 20-27  3. 28+  4. Not sure")
     :["duration","onset"].includes(nextQuestion.id)
      ?(encounter.preferred_language==="sw"?"1. Chini ya siku 1  2. Siku 1-7  3. Zaidi ya 7":"1. Under 1 day  2. 1-7 days  3. Over 7 days")
      :(encounter.preferred_language==="sw"?"1. Ndiyo  2. Hapana  3. Sina uhakika":"1. Yes  2. No  3. Not sure");
    return reply(res,languagePrompt(encounter.preferred_language,nextQuestion)+"\n"+optionText+"\n0. Back");
   }
   return reply(res,"Health support session complete. Dial again for the main menu.",true);
  }
  if(parts[0]==="1"){
   if(parts.length===1)return reply(res,`Select your study year:\n1. Year 1\n2. Year 2\n3. Year 3\n4. Year 4\n5. Year 5\n6. Year 6`);
   const choice=parts.slice(1).map(v=>clean(v,30).replace(/\s+/g,"").toLowerCase()).findLast(v=>/^(?:year)?[1-6]$/.test(v));
   const year=choice?Number(choice.replace(/^year/,"")):NaN;
   if(!Number.isInteger(year)||year<1||year>6)return reply(res,"Invalid choice. Select a year from 1 to 6. Dial again and choose 1.",true);
   await db("lite_students?on_conflict=phone_number",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({phone_number:phone,full_name:"Student",study_level:`Year ${year}`,updated_at:new Date().toISOString()})});
   queryCache.delete("student:"+phone);
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
   for(const [name,items] of grouped){const seen=new Set();grouped.set(name,items.filter(item=>{const key=String(item.title||"").trim().toLowerCase().replace(/\s+/g," ");if(seen.has(key))return false;seen.add(key);return true;}));}
   const subjects=[...grouped.keys()].sort((a,b)=>a.localeCompare(b));
   if(student.preferred_subject&&subjects.includes(student.preferred_subject)){subjects.splice(subjects.indexOf(student.preferred_subject),1);subjects.unshift(student.preferred_subject);}
   const tokens=parts.slice(1);
   let cursor=0,subjectPage=0;
   while(tokens[cursor]==="9"){subjectPage=Math.min(subjectPage+1,Math.max(0,Math.ceil(subjects.length/2)-1));cursor++;}
   const showSubjects=(page)=>reply(res,`Year ${year} subjects ${page+1}:\n${subjects.slice(page*2,page*2+2).map((s,i)=>`${i+1}. ${shortText(s,22)}`).join("\n")}${(page+1)*2<subjects.length?"\n9. More subjects":""}\n0. ${page>0?"Previous":"Main menu"}`);
   if(cursor>=tokens.length)return showSubjects(subjectPage);
   if(tokens[cursor]==="0")return subjectPage>0?showSubjects(subjectPage-1):reply(res,mainMenu,true);
   const subjectNo=Number(tokens[cursor++]);
   if(!Number.isInteger(subjectNo)||subjectNo<1||subjectNo>2)return reply(res,"Choose 1-4, 9 for more or 0 to go back.",true);
   const subject=subjects[subjectPage*2+subjectNo-1];
   if(!subject)return reply(res,"No subject at that position. Go back and choose another.",true);
   await db(`lite_students?id=eq.${student.id}`,{method:"PATCH",body:JSON.stringify({preferred_subject:subject})});
   queryCache.delete("student:"+phone);
   const subjectSets=grouped.get(subject)||[];
   let setPage=0;
   while(tokens[cursor]==="9"){setPage=Math.min(setPage+1,Math.max(0,Math.ceil(subjectSets.length/2)-1));cursor++;}
   const showSets=(page)=>reply(res,`${shortText(subject,22)} sets ${page+1}:\n${subjectSets.slice(page*2,page*2+2).map((s,i)=>`${i+1}. ${setLabel(s,subject)}`).join("\n")}${(page+1)*2<subjectSets.length?"\n9. More sets":""}\n0. ${page>0?"Previous":"Subjects"}`);
   if(cursor>=tokens.length)return showSets(setPage);
   if(tokens[cursor]==="0")return setPage>0?showSets(setPage-1):showSubjects(subjectPage);
   const setNo=Number(tokens[cursor++]);
   if(!Number.isInteger(setNo)||setNo<1||setNo>2)return reply(res,"Choose 1-4, 9 for more or 0 to go back.",true);
   const listed=subjectSets[setPage*2+setNo-1];
   if(!listed)return reply(res,"No question set at that position. Go back and choose another.",true);
   const full=await getSet(listed.id),set=full[0];
   if(!set)return reply(res,"This MCQ set is no longer published.",true);
   const questions=Array.isArray(set.questions)?set.questions:[];
   const qNoRaw=tokens[cursor]!==undefined?Number(tokens[cursor++]):1;
   let qNo=qNoRaw;
   if(!Number.isInteger(qNo)||qNo<1||qNo>questions.length)return reply(res,"Question number unavailable. Select this set again.",true);
   while(qNo<=questions.length){
    const q=questions[qNo-1];
    if(!q||!Array.isArray(q.options)||q.options.length<2)return reply(res,"This question is unavailable. Please report it on OmpathStudy.",true);
    const stem=clean(q.question,2000);
    const chunks=splitWords(stem,105);
    for(let page=0;page<chunks.length;page++){
     if(cursor>=tokens.length)return reply(res,`Q${qNo}/${questions.length}\n${chunks[page]}\n1. ${page<chunks.length-1?"Continue":"Show options"}`);
     if(tokens[cursor++]!=="1")return reply(res,"Enter 1 to continue reading this question.",true);
    }
    const optionList=optionsOf(q).slice(0,4);
    const optionPageSize=/[^\x00-\x7F]/.test(optionList.join(" "))?1:2;
    const optionPages=Math.max(1,Math.ceil(optionList.length/optionPageSize));
    let optionPage=0;
    while(true){
     const optionRows=optionList.slice(optionPage*optionPageSize,optionPage*optionPageSize+optionPageSize)
      .map((option,index)=>String(optionPage*optionPageSize+index+1)+". "+shortText(option,24)).join("\n");
     const optionPrompt="Q"+qNo+"/"+questions.length+" options "+(optionPage+1)+"/"+optionPages+":\n"+optionRows;
     if(cursor>=tokens.length)return reply(res,optionPrompt+(optionPage<optionPages-1?"\n9. More options":"\nChoose 1-4")+(optionPage>0?"\n0. Previous":""));
     const optionAction=tokens[cursor];
     if(optionAction==="9"&&optionPage<optionPages-1){cursor++;optionPage++;continue;}
     if(optionAction==="0"&&optionPage>0){cursor++;optionPage--;continue;}
     break;
    }
    const selected=Number(tokens[cursor++]);
    if(!Number.isInteger(selected)||selected<1||selected>Math.min(4,q.options.length))return reply(res,"Invalid answer. Enter one of the option numbers shown.",true);
    if(q.correct_answer===null||q.correct_answer===undefined||String(q.correct_answer).trim()==="")return reply(res,"Answer key needs review. Please report this question.",true);
    const rawCorrect=Number(q.correct_answer),correctIndex=rawCorrect>=0&&rawCorrect<q.options.length?rawCorrect:rawCorrect-1;
    if(!Number.isInteger(correctIndex)||correctIndex<0||correctIndex>=q.options.length)return reply(res,"Answer key needs review. Please report this question.",true);
    const isCorrect=selected-1===correctIndex;
    try{
     await db("lite_attempts",{method:"POST",signal:AbortSignal.timeout(1200),body:JSON.stringify({student_id:student.id,mcq_set_id:set.id,question_index:qNo-1,selected_option:selected,is_correct:isCorrect})});
    }catch{
     // Feedback uses the stored answer key; analytics must not block it.
    }
    const explanation=clean(q.explanation||"Review the full explanation on OmpathStudy.",1200);
    const explanationLimit=/[^\x00-\x7F]/.test(explanation)?22:60;
    const explanationChunks=splitWords(explanation,explanationLimit);
    let explanationPage=0;
    while(true){
     const pageText=explanationPage===0
      ?`${isCorrect?"Correct!":"Incorrect."}
Answer: ${correctIndex+1}. ${shortText(q.options[correctIndex],30)}
${explanationChunks[0]}`
      :"Explanation "+(explanationPage+1)+"/"+explanationChunks.length+":\n"+explanationChunks[explanationPage];
     if(cursor>=tokens.length)return reply(res,pageText+(explanationPage<explanationChunks.length-1?"\n9. More explanation\n1. Next question\n0. Finish set":"\n1. Next question\n0. Finish set"));
     if(tokens[cursor]==="9"&&explanationPage<explanationChunks.length-1){cursor++;explanationPage++;continue;}
     break;
    }
    const action=tokens[cursor++];
    if(action==="0")return reply(res,"Set finished. Thank you for studying with OmpathStudy Lite.",true);
    if(action!=="1")return reply(res,"Enter 1 for the next question or 0 to finish.",true);
    qNo++;
   }
   return reply(res,"You have completed this question set. Thank you!",true);
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
