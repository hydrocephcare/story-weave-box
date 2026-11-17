/**
 * OmpathStudy Lite — Africa's Talking USSD adapter.
 * Published OmpathStudy mcq_sets remain the only MCQ source of truth.
 */
import { createHealthEncounter, getHealthEncounter, updateHealthEncounter } from "./ompathLiteHealth.js";
import { detectEmergencyLanguage, buildPreliminaryAssessment } from "./ompathLiteClinical.js";
import { adaptPregnancyQuestions } from "./ompathLiteFlow.js";
const mainMenu = "OmpathStudy Lite\n1. Register\n2. Study by subject\n3. Help\n4. SMS preferences\n5. Health support";
const clean = (v,n=180)=>String(v??"").trim().replace(/[<>]/g,"").slice(0,n);
const shortText = (value,max=40) => {
 const text=clean(value,2000).replace(/\s+/g," ");
 max=/[^\x00-\x7F]/.test(text)?Math.min(max,18):max;
 if(text.length<=max)return text;
 const cut=text.slice(0,max+1),boundary=cut.lastIndexOf(" ");
 return (boundary>Math.floor(max*0.55)?cut.slice(0,boundary):text.slice(0,max)).replace(/[.,;: -]+$/,"")+"...";
};
function splitWords(value,max=105){
 const source=String(value??"");
 if(/[^\x00-\x7F]/.test(source))max=Math.min(max,48);
 const words=source.trim().split(/\s+/).filter(Boolean),chunks=[];
 let line="";
 for(const word of words){
  if(!line){line=word;continue;}
  if((line+" "+word).length<=max)line+=" "+word;
  else{chunks.push(line);line=word;}
 }
 if(line)chunks.push(line);
 return chunks.length?chunks:["Question text unavailable."];
}
const setLabel=(set,subject)=>{
 let label=clean(set.title,180).replace(/^weekly\s+year\s*[1-6]\s*[:\-–—]?\s*/i,"").replace(/^year\s*[1-6]\s*[:\-–—]?\s*/i,"").trim();
 if(!label||label.toLowerCase()===subject.toLowerCase())label="Weekly "+subject;
 return shortText(label,22);
};
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
function languagePrompt(language,q){return language==="sw"?q.sw:q.en;}
async function ussd(req,res){
 let payload=req.body||{};
 if(typeof payload==="string")payload=Object.fromEntries(new URLSearchParams(payload));
 else if(!Object.keys(payload).length&&typeof req.rawBody==="string")payload=Object.fromEntries(new URLSearchParams(req.rawBody));
 const phone=clean(payload.phoneNumber,24),session=clean(payload.sessionId,100),text=clean(payload.text,300);
 if(!phone||!session)return reply(res,"Invalid session. Please dial again.",true);
 const parts=text?text.split("*"):[];
 try{
  if(!text)return reply(res,mainMenu);
  if(parts[0]==="5"){
   // Resolve back navigation within this flow. 0 removes one prior selection;
   // 00 clears the health flow and returns to the Lite main menu.
   const flow=[];
   let returnedToIntro=false;
   for(const token of parts.slice(1)){
    if(token==="00")return reply(res,mainMenu);
    if(token==="0"){if(flow.length===1)returnedToIntro=true;flow.pop();continue;}
    flow.push(token);
   }
   if(!flow.length){if(returnedToIntro)return reply(res,"Health support (pilot)\nNot for emergencies. If symptoms are severe, go to hospital now.\n1. Continue\n2. Cancel\n0. Main menu");return reply(res,parts.length>1?mainMenu:"Health support (pilot)\nNot for emergencies. If symptoms are severe, go to hospital now.\n1. Continue\n2. Cancel\n0. Main menu",parts.length>1);}
   if(flow.length===1){
    if(flow[0]==="2")return reply(res,"Health support cancelled. No health information was saved.",true);
    if(flow[0]!=="1")return reply(res,"Choose 1 to continue or 2 to cancel.\n0. Back");
    return reply(res,"Your answers are sensitive health data and may be processed by an automated AI system and stored securely for up to 30 days. SMS is sent only if you opt in. This is not a diagnosis or emergency service. Do not enter your name.\nMajibu yako ni taarifa nyeti za afya; yanaweza kuchakatwa na mfumo wa AI na kuhifadhiwa kwa usalama hadi siku 30. SMS itatumwa tu ukikubali. Huu si utambuzi wala huduma ya dharura. Usiandike jina lako.\n1. I agree / Nakubali\n2. Cancel / Sitaki\n0. Back / Rudi nyuma");
   }
   if(flow.length===2){
    if(flow[1]!=="1")return reply(res,"Consent is required to continue.\n1. I agree\n2. Cancel\n0. Back",true);
    return reply(res,"Choose your preferred language:\n1. English\n2. Kiswahili\n0. Back");
   }
   if(flow.length===3){
    if(!["1","2"].includes(flow[2]))return reply(res,"Choose 1 for English or 2 for Kiswahili.\n0. Back");
    return reply(res,"What is your main concern?\n1. Pregnancy-related concern\n2. Menstrual problem\n3. Lower abdominal pain\n4. Vaginal discharge\n5. Bleeding\n6. Other health concern\n0. Back");
   }
   if(flow.length===4){
    if(!["1","2","3","4","5","6"].includes(flow[3]))return reply(res,"Choose an option from 1 to 6.\n0. Back");
    return reply(res,flow[2]==="2"
     ?"Eleza dalili zako kwa maneno machache (au bonyeza 1 kuruka).\n0. Rudi nyuma"
     :"Briefly describe what is troubling you in your own words, including mixed language if needed. Enter 1 to skip.\n0. Back");
   }
   if(flow.length===5){
    return reply(res,"Would you like OmpathStudy to send you a link by SMS when your guide is available?\n1. Yes, send SMS\n2. No SMS\n0. Back");
   }
   if(flow.length===6){
    if(!["1","2"].includes(flow[5]))return reply(res,"Choose 1 for SMS or 2 for no SMS.\n0. Back");
    const language=flow[2]==="2"?"sw":"en";
    const categories={"1":"Pregnancy-related concern","2":"Menstrual problem","3":"Lower abdominal pain","4":"Vaginal discharge","5":"Bleeding","6":"Other health concern"};
    const description=flow[4]==="1"?"":clean(flow[4],1200);
    // Screen the caller's own words for explicit emergency phrases before AI interpretation.
    const emergencyFlags=detectEmergencyLanguage(description);
    const encounter=await createHealthEncounter({
     sessionId:session,
     phoneNumber:phone,
     consentGiven:true,
     smsConsent:flow[5]==="1",
     preferredLanguage:language,
     channel:"ussd"
    });
    if(encounter?.assessment||encounter?.status==="referred_urgent"){
     return reply(res,language==="sw"
      ?"Tayari ulipokea majibu ya huduma hii. Ikiwa una dalili kali au zinazidi, tafuta huduma ya dharura sasa."
      :"This health enquiry has already been processed. If symptoms are severe or worsening, seek emergency care now.",true);
    }
    await updateHealthEncounter({
     id:encounter.id,
     sessionId:session,
     phoneNumber:phone,
     patch:{
      concern_category:categories[flow[3]],
      original_message:description,
      normalized_summary:"",
      red_flag_results:emergencyFlags,
      status:emergencyFlags.length?"referred_urgent":"intake_started",
      urgency_level:emergencyFlags.length?"emergency":"not_assessed"
     }
    });
    if(emergencyFlags.length)return reply(res,language==="sw"
      ?"Umetaja dalili inayoweza kuashiria dharura. Tafuta huduma ya dharura sasa au nenda hospitali iliyo karibu. Usisubiri ujumbe au tathmini ya mtandaoni."
      :"Your description includes a possible emergency warning sign. Seek emergency medical care now or go to the nearest hospital. Do not wait for an SMS or online assessment.",true);
    return reply(res,language==="sw"
     ?"Kwanza, tujue kama kuna dharura. Je, una shida kali ya kupumua, maumivu ya kifua, kuzimia, degedege, kutokwa damu nyingi, au maumivu makali yanayoongezeka sasa?\n1. Ndiyo  2. Hapana  3. Sina uhakika"
     :"First, let's check for an emergency. Are you having severe difficulty breathing, chest pain, fainting, a seizure, heavy bleeding, or severe/worsening pain right now?\n1. Yes  2. No  3. Not sure");
   }
   if(flow.length>=7&&flow.length<=11){
    const encounter=await getHealthEncounter({sessionId:session,phoneNumber:phone});
    if(!encounter)return reply(res,"Your health session expired. Please start again from the main menu.",true);
    if(["complete","guide_pending"].includes(encounter.status)&&encounter.assessment){
     return reply(res,encounter.preferred_language==="sw"
      ?"Tathmini yako ya awali tayari imekamilika. Tafadhali fuata ushauri uliotolewa na mhudumu wa afya. Ikiwa dalili ni kali au zinazidi, tafuta huduma ya dharura sasa."
      :"Your preliminary assessment has already been completed. Please follow the care advice provided. If symptoms are severe or worsening, seek emergency care now.",true);
    }
    const category=encounter.concern_category||"Other health concern";
    let questions=[
     {id:"emergency_screen",en:"Are you experiencing any emergency symptom now: severe difficulty breathing, chest pain, fainting, seizure, heavy bleeding, or severe/worsening pain?",sw:"Je, una dalili ya dharura sasa: kupumua kwa shida sana, maumivu ya kifua, kuzimia, degedege, kutokwa damu nyingi, au maumivu makali yanayoongezeka?"},
     ...(category==="Pregnancy-related concern"?[
      {id:"pregnancy_status",en:"Are you currently pregnant?",sw:"Je, una ujauzito kwa sasa?"},
      {id:"gestation",en:"If pregnant, do you know how many weeks pregnant you are? Choose: 1. Under 20 weeks  2. 20–27 weeks  3. 28 weeks or more  4. Not sure",sw:"Ikiwa una ujauzito, una wiki ngapi? 1. Chini ya wiki 20  2. Wiki 20–27  3. Wiki 28 au zaidi  4. Sina uhakika"},
      {id:"pregnancy_bleeding_or_fluid",en:"Are you having vaginal bleeding or fluid leaking from the vagina?",sw:"Je, unatoka damu ukeni au maji yanavuja ukeni?"},
      {id:"pregnancy_movement",en:"If you are far enough along to feel movement, are the baby's movements reduced or absent?",sw:"Ikiwa ujauzito umefikia hatua ya kuhisi mtoto akisogea, je, miondoko imepungua au haipo?"}
     ]:category==="Menstrual problem"||category==="Vaginal discharge"?[
      {id:"duration",en:"How long has this problem been present? 1. Less than 1 day  2. 1–7 days  3. More than 7 days",sw:"Tatizo hili limekuwepo kwa muda gani? 1. Chini ya siku 1  2. Siku 1–7  3. Zaidi ya siku 7"},
      {id:"fever",en:"Do you also have fever or chills?",sw:"Je, pia una homa au kutetemeka kwa baridi?"},
      {id:"pregnancy_possibility",en:"Could you be pregnant?",sw:"Je, kuna uwezekano wa kuwa mjamzito?"},
      {id:"severity",en:"Is the problem getting worse? 1. Yes  2. No  3. Not sure",sw:"Je, tatizo linaendelea kuwa baya zaidi? 1. Ndiyo  2. Hapana  3. Sina uhakika"}
     ]:category==="Lower abdominal pain"?[
      {id:"onset",en:"When did the pain start? 1. Today  2. 1–7 days ago  3. More than 7 days ago",sw:"Maumivu yalianza lini? 1. Leo  2. Siku 1–7 zilizopita  3. Zaidi ya siku 7 zilizopita"},
      {id:"pregnancy_possibility",en:"Could you be pregnant?",sw:"Je, kuna uwezekano wa kuwa mjamzito?"},
      {id:"fever_vomiting",en:"Do you have fever or repeated vomiting?",sw:"Je, una homa au kutapika mara kwa mara?"},
      {id:"severity",en:"Is the pain severe or getting worse?",sw:"Je, maumivu ni makali au yanaongezeka?"}
     ]:category==="Bleeding"?[
      {id:"bleeding_amount",en:"Is the bleeding heavy (for example, soaking a pad in an hour), or are you feeling faint?",sw:"Je, damu ni nyingi (kwa mfano, pedi kujaa ndani ya saa moja), au unahisi kuzimia?"},
      {id:"pregnancy_possibility",en:"Could you be pregnant or have you recently given birth?",sw:"Je, unaweza kuwa mjamzito au umejifungua hivi karibuni?"},
      {id:"duration",en:"When did the bleeding start? 1. Today  2. 1–7 days ago  3. More than 7 days ago",sw:"Damu ilianza lini? 1. Leo  2. Siku 1–7 zilizopita  3. Zaidi ya siku 7 zilizopita"},
      {id:"pain",en:"Do you also have significant abdominal or pelvic pain?",sw:"Je, pia una maumivu makubwa ya tumbo au nyonga?"}
     ]:[
      {id:"duration",en:"How long has this concern been present? 1. Less than 1 day  2. 1–7 days  3. More than 7 days",sw:"Tatizo hili limekuwepo kwa muda gani? 1. Chini ya siku 1  2. Siku 1–7  3. Zaidi ya siku 7"},
      {id:"fever",en:"Do you have fever?",sw:"Je, una homa?"},
      {id:"worsening",en:"Are your symptoms getting worse?",sw:"Je, dalili zinaendelea kuwa mbaya zaidi?"},
      {id:"care",en:"Have you already received medical care for this concern?",sw:"Je, tayari umepata huduma ya afya kwa tatizo hili?"}
     ])
    ];
    const priorAnswers=flow.slice(6,-1);
    questions=adaptPregnancyQuestions(questions,category,priorAnswers);
    const answers=priorAnswers.map((value,index)=>({question_id:questions[index]?.id,answer:value})).filter(item=>item.question_id);
    const answerIndex=flow.length-7;
    const currentQuestion=questions[answerIndex];
    if(!currentQuestion)return reply(res,"Your answers have been recorded. No diagnosis or clinical assessment has been generated. Please seek care if symptoms persist or worsen.",true);
    const answer=flow[flow.length-1];
    const allowedAnswers=currentQuestion.id==="gestation"?["1","2","3","4"]:
     ["duration","onset"].includes(currentQuestion.id)?["1","2","3"]:
     ["severity","worsening"].includes(currentQuestion.id)?["1","2","3"]:["1","2","3"];
    if(!allowedAnswers.includes(answer))return reply(res,languagePrompt(encounter.preferred_language,currentQuestion)+"\nChoose one of the numbered options shown.\n0. Back");
    if(answerIndex===0&&answer==="1"){
     await updateHealthEncounter({id:encounter.id,sessionId:session,phoneNumber:phone,patch:{clarification_answers:[...answers,{question_id:currentQuestion.id,answer}],red_flag_results:[{rule:"self_reported_emergency_symptom",positive:true}],status:"referred_urgent",urgency_level:"emergency"}});
     return reply(res,encounter.preferred_language==="sw"?"Tafuta huduma ya dharura sasa au nenda hospitali iliyo karibu. Usisubiri ujumbe au tathmini ya mtandaoni. Ikiwa unaweza, mwombe mtu akusindikize.":"Seek emergency medical care now or go to the nearest hospital. Do not wait for an SMS or online assessment. If possible, ask someone to accompany you.",true);
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
     const guideQueued=encounter.sms_consent===true;
     const urgent=assessment.urgency_level==="urgent";
     const swMessage=urgent
      ?"Majibu yako yamepokelewa. Tafuta tathmini ya afya katika kituo cha afya haraka leo. Huu si utambuzi. Dalili zikizidi au ukitokwa damu nyingi, ukizimia au kupata shida ya kupumua, tafuta huduma ya dharura sasa."
      :"Majibu yako yamepokelewa. Tafadhali panga kuonana na mhudumu wa afya haraka ili uchunguzwe. Huu si utambuzi. Ukipata maumivu makali, damu nyingi, kuzimia au shida ya kupumua, tafuta huduma ya dharura sasa.";
     const enMessage=urgent
      ?"Your answers have been received. Attend a health facility urgently today for an in-person assessment. This is not a diagnosis. If symptoms worsen or you develop heavy bleeding, fainting or breathing difficulty, seek emergency care now."
      :"Your answers have been received. Please arrange an in-person assessment with a health professional promptly. This is not a diagnosis. Seek emergency care now if severe pain, heavy bleeding, fainting or breathing difficulty develops.";
     const deliveryNote=guideQueued
      ?(encounter.preferred_language==="sw"?" Ikiwa mwongozo uliothibitishwa utapatikana, kiungo kitatumwa kwa SMS.":" If an approved patient guide is available, its link will be sent by SMS.")
      :"";
     return reply(res,(encounter.preferred_language==="sw"?swMessage:enMessage)+deliveryNote,true);
    }
    await updateHealthEncounter({id:encounter.id,sessionId:session,phoneNumber:phone,patch:{clarification_answers:nextAnswers,status:"awaiting_clarification"}});
    const nextQuestions=adaptPregnancyQuestions(questions,category,nextAnswers);
    const nextQuestion=nextQuestions[nextIndex];
    if(!nextQuestion)return reply(res,"Your answers have been recorded. Please arrange an in-person health assessment.",true);
    return reply(res,languagePrompt(encounter.preferred_language,nextQuestion)+"\n"+(nextQuestion.id==="gestation"?"1. Under 20 weeks  2. 20–27 weeks  3. 28+ weeks  4. Not sure":nextQuestion.id==="duration"||nextQuestion.id==="onset"?"1. Less than 1 day  2. 1–7 days  3. More than 7 days":"1. Yes  2. No  3. Not sure")+"\n0. Back");
   }
   return reply(res,"Health support session complete. Dial again for the main menu.",true);
  }
  if(parts[0]==="1"){
   if(parts.length===1)return reply(res,`Select your study year:\n1. Year 1\n2. Year 2\n3. Year 3\n4. Year 4\n5. Year 5\n6. Year 6`);
   const choice=parts.slice(1).map(v=>clean(v,30).replace(/\s+/g,"").toLowerCase()).findLast(v=>/^(?:year)?[1-6]$/.test(v));
   const year=choice?Number(choice.replace(/^year/,"")):NaN;
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
   for(const [name,items] of grouped){const seen=new Set();grouped.set(name,items.filter(item=>{const key=String(item.title||"").trim().toLowerCase().replace(/\s+/g," ");if(seen.has(key))return false;seen.add(key);return true;}));}
   const subjects=[...grouped.keys()].sort((a,b)=>a.localeCompare(b));
   if(student.preferred_subject&&subjects.includes(student.preferred_subject)){subjects.splice(subjects.indexOf(student.preferred_subject),1);subjects.unshift(student.preferred_subject);}
   const tokens=parts.slice(1);
   let cursor=0,subjectPage=0;
   while(tokens[cursor]==="9"){subjectPage++;cursor++;}
   const showSubjects=(page)=>reply(res,`Year ${year} subjects ${page+1}:\n${subjects.slice(page*2,page*2+2).map((s,i)=>`${i+1}. ${shortText(s,22)}`).join("\n")}${(page+1)*2<subjects.length?"\n9. More subjects":""}\n0. ${page>0?"Previous":"Main menu"}`);
   if(cursor>=tokens.length)return showSubjects(subjectPage);
   if(tokens[cursor]==="0")return subjectPage>0?showSubjects(subjectPage-1):reply(res,mainMenu,true);
   const subjectNo=Number(tokens[cursor++]);
   if(!Number.isInteger(subjectNo)||subjectNo<1||subjectNo>2)return reply(res,"Choose 1-4, 9 for more or 0 to go back.",true);
   const subject=subjects[subjectPage*2+subjectNo-1];
   if(!subject)return reply(res,"No subject at that position. Go back and choose another.",true);
   await db(`lite_students?id=eq.${student.id}`,{method:"PATCH",body:JSON.stringify({preferred_subject:subject})});
   const subjectSets=grouped.get(subject)||[];
   let setPage=0;
   while(tokens[cursor]==="9"){setPage++;cursor++;}
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
     if(cursor>=tokens.length)return reply(res,`Q${qNo}/${questions.length}\n${chunks[page]}\n1. ${page<chunks.length-1?"More":"Show options"}`);
     if(tokens[cursor++]!=="1")return reply(res,"Enter 1 to continue reading this question.",true);
    }
    const optionList=optionsOf(q).slice(0,4);
    const optionPages=Math.max(1,Math.ceil(optionList.length/2));
    let optionPage=0;
    while(true){
     const optionRows=optionList.slice(optionPage*2,optionPage*2+2)
      .map((option,index)=>String(optionPage*2+index+1)+". "+shortText(option,24)).join("\\n");
     const optionPrompt="Q"+qNo+"/"+questions.length+" options "+(optionPage+1)+"/"+optionPages+":\\n"+optionRows;
     if(cursor>=tokens.length)return reply(res,optionPrompt+(optionPage<optionPages-1?"\\n9. More options":"\\nChoose 1-4")+(optionPage>0?"\\n0. Previous":""));
     const optionAction=tokens[cursor];
     if(optionAction==="9"&&optionPage<optionPages-1){cursor++;optionPage++;continue;}
     if(optionAction==="0"&&optionPage>0){cursor++;optionPage--;continue;}
     break;
    }
    const selected=Number(tokens[cursor++]);
    if(!Number.isInteger(selected)||selected<1||selected>Math.min(4,q.options.length))return reply(res,"Invalid answer. Enter one of the option numbers shown.",true);
    const rawCorrect=Number(q.correct_answer),correctIndex=rawCorrect>=0&&rawCorrect<q.options.length?rawCorrect:rawCorrect-1;
    if(!Number.isInteger(correctIndex)||correctIndex<0||correctIndex>=q.options.length)return reply(res,"Answer key needs review. Please report this question.",true);
    const isCorrect=selected-1===correctIndex;
    await db("lite_attempts",{method:"POST",body:JSON.stringify({student_id:student.id,mcq_set_id:set.id,question_index:qNo-1,selected_option:selected,is_correct:isCorrect})});
    const explanation=shortText(q.explanation||"Review the full explanation on OmpathStudy.",58);
    const feedback=`${isCorrect?"Correct!":"Incorrect."}\nAnswer: ${correctIndex+1}. ${shortText(q.options[correctIndex],30)}\n${explanation}`;
    if(cursor>=tokens.length)return reply(res,`${feedback}\n1. Next question\n0. Finish set`);
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
