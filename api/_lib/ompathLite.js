/** OmpathStudy Lite — Health Support only, delivered through Africa's Talking USSD. */
import { timingSafeEqual } from "node:crypto";
import { createHealthEncounter, getHealthEncounter, getResumableHealthEncounter, resumeHealthEncounter, updateHealthEncounter } from "./ompathLiteHealth.js";
import { detectEmergencyLanguage, buildPreliminaryAssessment } from "./ompathLiteRules.js";
import { adaptPregnancyQuestions } from "./ompathLiteFlow.js";
import { shortUssdText } from "./ompathLiteUssdFormat.js";
const mainMenu = "OmpathStudy Lite\n1. Health support\n2. Help and information";
const clean = (v,n=180)=>String(v??"").replace(/<br\s*\/?>/gi," ").replace(/<\/(?:p|div|li|h[1-6])\s*>/gi," ").replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g," ").trim().slice(0,n);
const shortText=(value,max)=>shortUssdText(clean(value,2000),max);
const reply = (res,message,end=false)=>{res.setHeader("Content-Type","text/plain; charset=utf-8");res.setHeader("Cache-Control","private, no-store");res.setHeader("Pragma","no-cache");return res.status(200).send(`${end?"END":"CON"} ${message}`);};
function languagePrompt(language,q){return language==="sw"?q.sw:q.en;}
function assessmentReply(assessment, language) {
 const impression=assessment?.provisional_diagnosis||"Cause not yet clear; clinical assessment is needed.";
 const level=assessment?.urgency_level;
 if(language==="sw") {
  const translations={
   "Pregnancy with vaginal bleeding or possible rupture of membranes":"Ujauzito wenye kutokwa damu ukeni au kuvuja kwa maji ya uzazi",
   "Reduced fetal movement after 20 weeks":"Kupungua kwa miondoko ya mtoto baada ya wiki 20",
   "Pregnancy-related symptom requiring obstetric assessment":"Dalili zinazohusiana na ujauzito zinazohitaji tathmini ya uzazi",
   "Pregnancy is not confirmed; the reported symptom needs assessment for a non-pregnancy-related cause":"Ujauzito haujathibitishwa; dalili zinahitaji uchunguzi wa sababu nyingine",
   "Possible pregnancy-related symptom — pregnancy status is uncertain":"Dalili zinaweza kuhusiana na ujauzito; hali ya ujauzito haijulikani",
   "Lower abdominal pain with fever or vomiting":"Maumivu ya tumbo la chini pamoja na homa au kutapika",
   "Lower abdominal pain with possible pregnancy":"Maumivu ya tumbo la chini; ujauzito unawezekana",
   "Lower abdominal pain — cause not yet established":"Maumivu ya tumbo la chini — chanzo bado hakijabainika",
   "Vaginal discharge with fever — pelvic infection must be excluded":"Uchafu ukeni pamoja na homa — maambukizi ya nyonga lazima yaondolewe",
   "Vaginal discharge — infection or inflammation needs assessment":"Uchafu ukeni — maambukizi au uvimbe unahitaji uchunguzi",
   "Menstrual problem with possible pregnancy":"Tatizo la hedhi na uwezekano wa ujauzito",
   "Menstrual problem — abnormal uterine bleeding or cycle disturbance":"Tatizo la hedhi — kutokwa damu kusiko kawaida au mabadiliko ya mzunguko",
   "Bleeding with possible pregnancy":"Kutokwa damu na uwezekano wa ujauzito",
   "Bleeding requiring assessment":"Kutokwa damu kunahitaji uchunguzi",
   "Reduced fetal movements in pregnancy (possible fetal compromise)":"Kupungua kwa miondoko ya mtoto tumboni; tathmini ya dharura ya uzazi inahitajika",
   "Lower abdominal pain with possible pregnancy — ectopic pregnancy must be excluded":"Maumivu ya tumbo la chini na uwezekano wa ujauzito; mimba nje ya kizazi lazima iondolewe",
   "Lower abdominal pain with systemic symptoms; infection or acute abdominal pathology is possible":"Maumivu ya tumbo la chini pamoja na dalili za mwili mzima; maambukizi au tatizo la dharura la tumbo linawezekana",
   "Undifferentiated lower abdominal pain":"Maumivu ya tumbo la chini; chanzo bado hakijabainika",
   "Vaginal discharge with fever — pelvic inflammatory disease (PID) must be considered":"Uchafu ukeni pamoja na homa; maambukizi ya nyonga yanapaswa kuchunguzwa",
   "Vaginitis or cervicitis causing vaginal discharge":"Uchafu ukeni unaoweza kusababishwa na maambukizi au uvimbe wa uke au mlango wa kizazi",
   "Menstrual disturbance (abnormal uterine bleeding or dysmenorrhoea, depending on the symptom)":"Mabadiliko ya hedhi au maumivu ya hedhi; uchunguzi zaidi unahitajika",
   "Abnormal bleeding of undetermined source; pregnancy-related bleeding must be excluded where relevant":"Kutokwa damu kusiko kawaida; sababu zinazohusiana na ujauzito lazima zichunguzwe inapofaa",
   "Undifferentiated pregnancy-related concern; more clinical information is needed to narrow the cause":"Dalili zinazoweza kuhusiana na ujauzito; taarifa zaidi za kitabibu zinahitajika",
   "Unclassified symptom presentation — provisional cause cannot yet be narrowed":"Dalili hazijaainishwa — chanzo bado hakijabainika",
  };
  const translated=translations[impression]||"Dalili zinahitaji tathmini ya mhudumu wa afya.";
  const heading=level==="emergency"?"DHARURA: Nenda hospitali sasa. ":level==="urgent"?"HARAKA: Tafuta huduma ya afya leo. ":"Tathmini ya awali: ";
  return heading+shortText(translated,100)+". Si utambuzi wa mwisho; tathmini ya mhudumu wa afya inahitajika.";
 }
 const heading=level==="emergency"?"EMERGENCY: Go to hospital now. ":level==="urgent"?"URGENT: Attend a health facility today. ":"Preliminary impression: ";
 return heading+shortText(impression,105)+". Not a confirmed diagnosis; clinician assessment is required.";
}

function trustedResumeCallback(req) {
 const expected=process.env.USSD_CALLBACK_SECRET||"";
 const provided=String(req.query?.key||"");
 if(!expected||!provided||expected.length!==provided.length)return false;
 try{return timingSafeEqual(Buffer.from(expected),Buffer.from(provided));}catch{return false;}
}
function resumeQuestions(category, language, baseAnswers) {
 const sets={
  "Pregnancy-related concern":[{id:"pregnancy_status",en:"Are you pregnant?",sw:"Una ujauzito?"},{id:"gestation",en:"How many weeks pregnant?",sw:"Una ujauzito wa wiki ngapi?"},{id:"pregnancy_bleeding_or_fluid",en:"Any vaginal bleeding or fluid leak?",sw:"Unatoka damu au maji ukeni?"},{id:"pregnancy_movement",en:"At 20+ weeks, are baby movements reduced or absent?",sw:"Wiki 20 au zaidi: mtoto anasogea kidogo au hasogei?"}],
  "Menstrual problem":[{id:"duration",en:"How long?",sw:"Kwa muda gani?"},{id:"fever",en:"Fever or chills?",sw:"Una homa au baridi?"},{id:"pregnancy_possibility",en:"Could you be pregnant?",sw:"Unaweza kuwa mjamzito?"},{id:"severity",en:"Is it getting worse?",sw:"Hali inazidi kuwa mbaya?"}],
  "Vaginal discharge":[{id:"duration",en:"How long?",sw:"Kwa muda gani?"},{id:"fever",en:"Fever or chills?",sw:"Una homa au baridi?"},{id:"pregnancy_possibility",en:"Could you be pregnant?",sw:"Unaweza kuwa mjamzito?"},{id:"severity",en:"Is it getting worse?",sw:"Hali inazidi kuwa mbaya?"}],
  "Lower abdominal pain":[{id:"onset",en:"When did the pain start?",sw:"Maumivu yalianza lini?"},{id:"pregnancy_possibility",en:"Could you be pregnant?",sw:"Unaweza kuwa mjamzito?"},{id:"fever_vomiting",en:"Fever or repeated vomiting?",sw:"Homa au kutapika mara kwa mara?"},{id:"severity",en:"Is the pain severe or worsening?",sw:"Maumivu ni makali au yanaongezeka?"}],
  "Bleeding":[{id:"bleeding_amount",en:"Heavy bleeding (soaking a pad each hour)?",sw:"Damu nyingi (kulowanisha pedi moja kwa saa)?"},{id:"pregnancy_possibility",en:"Pregnant or recently gave birth?",sw:"Mjamzito au umejifungua hivi karibuni?"},{id:"faintness",en:"Have you felt faint or nearly passed out?",sw:"Umehisi kuzimia au karibu kupoteza fahamu?"},{id:"pain",en:"Severe abdominal or pelvic pain?",sw:"Maumivu makali ya tumbo au nyonga?"}]
 };
 const fallback=[{id:"duration",en:"How long has this been happening?",sw:"Tatizo limekuwepo kwa muda gani?"},{id:"fever",en:"Do you have fever?",sw:"Una homa?"},{id:"worsening",en:"Are symptoms getting worse?",sw:"Dalili zinazidi kuwa mbaya?"},{id:"care",en:"Have you received medical care?",sw:"Umepata huduma ya afya?"}];
 return adaptPregnancyQuestions([{id:"emergency_screen",en:"Emergency signs now?",sw:"Dalili za dharura sasa?"},...(sets[category]||fallback)],category,baseAnswers.map(x=>x.answer));
}
function resumeOptions(question, language) {
 if(question.id==="gestation")return language==="sw"?"1. Chini ya 20\n2. 20-27\n3. 28+\n4. Sina uhakika":"1. Under 20\n2. 20-27\n3. 28+\n4. Not sure";
 if(["duration","onset"].includes(question.id))return language==="sw"?"1. Chini ya siku 1\n2. Siku 1-7\n3. Zaidi ya 7":"1. Under 1 day\n2. 1-7 days\n3. Over 7 days";
 return language==="sw"?"1. Ndiyo\n2. Hapana\n3. Sina uhakika":"1. Yes\n2. No\n3. Not sure";
}

async function ussd(req,res){
 let payload=req.body||{};
 if(typeof payload==="string")payload=Object.fromEntries(new URLSearchParams(payload));
 else if(!Object.keys(payload).length&&typeof req.rawBody==="string")payload=Object.fromEntries(new URLSearchParams(req.rawBody));
 const phone=clean(payload.phoneNumber,24),session=clean(payload.sessionId,100),text=clean(payload.text,1800);
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
   if(!flow.length){
    if(returnedToIntro)return reply(res,"Health support\nNot for emergencies. If symptoms are severe, go to hospital now.\n1. New enquiry\n2. Resume previous\n0. Main menu");
    if(parts.length===1){
     if(trustedResumeCallback(req)){
      const pending=await getResumableHealthEncounter(phone);
      if(pending)return reply(res,"Health support\nYou have an unfinished enquiry.\n1. Start a new enquiry\n2. Resume previous enquiry\n0. Main menu");
     }
     return reply(res,"Health support\nNot for emergencies. If symptoms are severe, go to hospital now.\n1. Continue\n2. Cancel\n0. Main menu");
    }
    return reply(res,parts.length>1?mainMenu:"Health support\nNot for emergencies. If symptoms are severe, go to hospital now.\n1. Continue\n2. Cancel\n0. Main menu",parts.length>1);
   }
   if(flow.length===1 && flow[0]==="2"){
    if(!trustedResumeCallback(req))return reply(res,"Health support cancelled. No health information was saved.",true);
    const alreadyBound=await getHealthEncounter({sessionId:session,phoneNumber:phone});
    const resumed=alreadyBound||await resumeHealthEncounter({phoneNumber:phone,newSessionId:session});
    if(!resumed)return reply(res,"Health support cancelled. No new health information was saved.",true);
    const base=resumed.resume_base_answers||[];
    const questions=resumeQuestions(resumed.concern_category||"Other health concern",resumed.preferred_language,base);
    const current=questions[1+base.length];
    if(!current)return reply(res,"Your previous answers are saved. Please seek care if symptoms are worsening.",true);
    return reply(res,resumed.preferred_language==="sw"?"Enquiry imerejeshwa. Jibu swali lililobaki:\n"+current.sw+"\n"+resumeOptions(current,"sw")+"\n0. Rudi":"Your previous enquiry has been restored. Continue with this question:\n"+current.en+"\n"+resumeOptions(current,"en")+"\n0. Back");
   }
   if(flow[0]==="2" && flow.length>=2){
    if(!trustedResumeCallback(req))return reply(res,"Session recovery is not enabled on this callback. Please start a new enquiry.",true);
    const encounter=await getHealthEncounter({sessionId:session,phoneNumber:phone});
    if(!encounter)return reply(res,"Your saved enquiry could not be restored. Please dial again.",true);
    const base=Array.isArray(encounter.resume_base_answers)?encounter.resume_base_answers:[];
    const questions=resumeQuestions(encounter.concern_category||"Other health concern",encounter.preferred_language,base);
    const submitted=flow.slice(1);
    const questionCount=questions.length-1;
    const remainingQuestions=Math.max(0,questionCount-base.length);
    if(submitted.length>remainingQuestions){
     const choice=submitted[remainingQuestions];
     if(!["1","2"].includes(choice))return reply(res,encounter.preferred_language==="sw"?"Pokea mwongozo wa afya kwa SMS?\\n1. Ndiyo\\n2. Hapana\\n0. Rudi":"Receive a health guide by SMS?\\n1. Yes\\n2. No\\n0. Back");
     if(choice==="1")await updateHealthEncounter({id:encounter.id,sessionId:session,phoneNumber:phone,patch:{sms_consent:true,status:"guide_pending"}});
     else await updateHealthEncounter({id:encounter.id,sessionId:session,phoneNumber:phone,patch:{sms_consent:false,status:encounter.urgency_level==="urgent"?"referred_urgent":"complete"}});
     return reply(res,choice==="1"?"Assessment saved. A health guide will be sent by SMS if an approved guide is available.":"Assessment saved. No SMS will be sent.",true);
    }
    for(let index=0;index<submitted.length;index++){
     const question=questions[1+base.length+index];
     const allowed=question?.id==="gestation"?["1","2","3","4"]:["1","2","3"];
     if(!allowed.includes(submitted[index])){
      const prompt=languagePrompt(encounter.preferred_language,question);
      return reply(res,prompt+"\\n"+resumeOptions(question,encounter.preferred_language)+"\\n0. Back");
     }
    }
    const newAnswers=submitted.map((answer,index)=>({question_id:questions[1+base.length+index]?.id,answer})).filter(x=>x.question_id);
    const allAnswers=[...base,...newAnswers];
    if(allAnswers.length>=questionCount){
     const assessment=buildPreliminaryAssessment({encounter,answers:allAnswers,emergencyFlags:encounter.red_flag_results||[]});
     await updateHealthEncounter({id:encounter.id,sessionId:session,phoneNumber:phone,patch:{clarification_answers:allAnswers,assessment,urgency_level:assessment.urgency_level,status:assessment.urgency_level==="emergency"||assessment.urgency_level==="urgent"?"referred_urgent":"complete"}});
     const prompt=encounter.preferred_language==="sw"?"Pokea mwongozo wa afya kwa SMS?\n1. Ndiyo\n2. Hapana":"Receive a health guide by SMS?\n1. Yes\n2. No";
     return reply(res,assessmentReply(assessment,encounter.preferred_language)+"\n"+prompt);
    }
    await updateHealthEncounter({id:encounter.id,sessionId:session,phoneNumber:phone,patch:{clarification_answers:allAnswers,status:"awaiting_clarification"}});
    const current=questions[1+allAnswers.length];
    if(!current)return reply(res,"Your answers have been saved. Please seek an in-person assessment.",true);
    return reply(res,languagePrompt(encounter.preferred_language,current)+"\n"+resumeOptions(current,encounter.preferred_language)+"\n0. Back");
   }
   if(flow.length===1){
    if(flow[0]==="2")return reply(res,"Health support cancelled. No health information was saved.",true);
    if(flow[0]!=="1")return reply(res,"Choose 1 to continue or 2 to cancel.\n0. Back");
    return reply(res,"Choose language:\n1. English\n2. Kiswahili\n0. Back");
   }
   if(flow.length===2){
    if(!["1","2"].includes(flow[1]))return reply(res,"Choose 1 for English or 2 for Kiswahili.\n0. Back");
    return reply(res,flow[1]==="2"
     ?"Nambari na majibu huhifadhiwa salama siku 30. SMS itatumwa tu ukikubali baadaye. Si huduma ya dharura wala utambuzi wa mwisho. Usiandike jina.\n1. Nakubali\n2. Sitaki\n0. Rudi"
     :"Your number and health answers are stored securely for 30 days. SMS is sent only if you opt in later. Not emergency care or a diagnosis. Do not enter names.\n1. Agree\n2. Cancel\n0. Back");
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
    const categories={"1":"Pregnancy-related concern","2":"Menstrual problem","3":"Lower abdominal pain","4":"Vaginal discharge","5":"Bleeding","6":"Other health concern"};
    const description=flow[4]==="1"?"":clean(flow[4],1200);
    const immediateFlags=detectEmergencyLanguage(description);
    // Interrupt routine intake before another menu when a recognised danger
    // symptom is already present in the caller's own description.
    if(immediateFlags.length){
     const language=flow[1]==="2"?"sw":"en";
     const encounter=await createHealthEncounter({sessionId:session,phoneNumber:phone,consentGiven:true,smsConsent:false,preferredLanguage:language,channel:"ussd"});
     const emergencyAnswers=[{question_id:"emergency_screen",answer:"1"}];
     const assessment=buildPreliminaryAssessment({encounter:{concern_category:categories[flow[3]],original_message:description},answers:emergencyAnswers,emergencyFlags:immediateFlags});
     await updateHealthEncounter({id:encounter.id,sessionId:session,phoneNumber:phone,patch:{
      concern_category:categories[flow[3]],original_message:description,normalized_summary:"",
      clarification_answers:emergencyAnswers,red_flag_results:immediateFlags,
      assessment,urgency_level:"emergency",status:"referred_urgent"
     }});
     return reply(res,assessmentReply(assessment,language),true);
    }
    return reply(res,flow[1]==="2"
     ?"Dharura sasa: shida kali ya kupumua, maumivu ya kifua, kuzimia, degedege, damu nyingi au maumivu makali?\n1. Ndiyo\n2. Hapana\n3. Sina uhakika\n0. Rudi"
     :"Emergency signs right now: severe breathing trouble, chest pain, fainting, seizure, heavy bleeding or severe pain?\n1. Yes\n2. No\n3. Not sure\n0. Back");
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
     ?"Are you pregnant?\n1. Yes\n2. No\n3. Not sure"
     :flow[3]==="2"||flow[3]==="4"
      ?"How long has this been happening?\n1. Under 1 day\n2. 1-7 days\n3. Over 7 days"
      :flow[3]==="3"
       ?"When did the pain start?\n1. Under 1 day\n2. 1-7 days\n3. Over 7 days"
       :flow[3]==="5"
        ?"Is the bleeding heavy (one pad/hour) or have you felt faint?\n1. Yes\n2. No\n3. Not sure"
        :"How long has this been happening?\n1. Under 1 day\n2. 1-7 days\n3. Over 7 days";
    return reply(res,language==="sw"?"Tafadhali jibu swali lifuatalo kwa kuchagua nambari.\n"+firstQuestion+"\n0. Rudi":"Please answer the next question by choosing a number.\n"+firstQuestion+"\n0. Back");
   }
   if(flow.length>=8){
    const completed=await getHealthEncounter({sessionId:session,phoneNumber:phone});
    const expectedConsentLength=6+(completed?.clarification_answers?.length||0);
    if(completed?.assessment&&flow.length===expectedConsentLength-1){
     const prompt=completed.preferred_language==="sw"?"Pokea mwongozo kwa SMS?\n1. Ndiyo\n2. Hapana":"Receive a health guide by SMS?\n1. Yes\n2. No";
     return reply(res,assessmentReply(completed.assessment,completed.preferred_language)+"\n"+prompt);
    }
    if(completed?.assessment&&flow.length===expectedConsentLength){
     const choice=flow[flow.length-1];
     if(choice==="1"){
      await updateHealthEncounter({id:completed.id,sessionId:session,phoneNumber:phone,patch:{sms_consent:true,status:"guide_pending"}});
      return reply(res,completed.preferred_language==="sw"
       ?"Tathmini imehifadhiwa. Mwongozo wa afya utatumwa kwa SMS ikiwa mwongozo uliopitiwa upo. Fuata ushauri wa kwenda hospitali ikiwa umeelekezwa."
       :"Assessment saved. A health guide will be sent by SMS if an approved guide is available. Follow the urgent care advice above.",true);
     }
     if(choice==="2"){
      await updateHealthEncounter({id:completed.id,sessionId:session,phoneNumber:phone,patch:{sms_consent:false,status:completed.urgency_level==="urgent"?"referred_urgent":"complete"}});
      return reply(res,completed.preferred_language==="sw"?"Tathmini imehifadhiwa. Hakuna SMS itakayotumwa.":"Assessment saved. No SMS will be sent.",true);
     }
     return reply(res,completed.preferred_language==="sw"?"Pokea mwongozo kwa SMS?\n1. Ndiyo\n2. Hapana\n0. Rudi":"Receive a health guide by SMS?\n1. Yes\n2. No\n0. Back");
    }
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
      {id:"bleeding_amount",en:"Heavy bleeding (soaking a pad each hour)?",sw:"Damu nyingi (kulowanisha pedi moja kwa saa)?"},
      {id:"pregnancy_possibility",en:"Pregnant or recently gave birth?",sw:"Mjamzito au umejifungua hivi karibuni?"},
      {id:"faintness",en:"Have you felt faint or nearly passed out?",sw:"Umehisi kuzimia au karibu kupoteza fahamu?"},
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
    if(!allowedAnswers.includes(answer))return reply(res,languagePrompt(encounter.preferred_language,currentQuestion)+(encounter.preferred_language==="sw"?"\nChagua nambari moja kati ya zilizoonyeshwa.\n0. Rudi":"\nChoose one of the numbered options shown.\n0. Back"));
    const nextAnswers=[...answers,{question_id:currentQuestion.id,answer}];
    const nextIndex=answerIndex+1;
    if(nextIndex>=questions.length){
     const assessment=buildPreliminaryAssessment({encounter,answers:nextAnswers,emergencyFlags:encounter.red_flag_results||[]});
     await updateHealthEncounter({id:encounter.id,sessionId:session,phoneNumber:phone,patch:{
      clarification_answers:nextAnswers,
      assessment,
      urgency_level:assessment.urgency_level,
      status:assessment.urgency_level==="emergency"?"referred_urgent":assessment.urgency_level==="urgent"?"referred_urgent":"complete"
     }});
     if(assessment.urgency_level==="emergency")return reply(res,assessmentReply(assessment,encounter.preferred_language),true);
     const prompt=encounter.preferred_language==="sw"
      ?"Pokea mwongozo wa afya kwa SMS?\n1. Ndiyo\n2. Hapana"
      :"Receive a health guide by SMS?\n1. Yes\n2. No";
     return reply(res,assessmentReply(assessment,encounter.preferred_language)+"\n"+prompt);
    }
    await updateHealthEncounter({id:encounter.id,sessionId:session,phoneNumber:phone,patch:{clarification_answers:nextAnswers,status:"awaiting_clarification"}});
    const nextQuestions=adaptPregnancyQuestions(questions,category,nextAnswers);
    const nextQuestion=nextQuestions[nextIndex];
    if(!nextQuestion)return reply(res,"Your answers have been recorded. Please arrange an in-person health assessment.",true);
    const optionText=nextQuestion.id==="gestation"
     ?(encounter.preferred_language==="sw"?"1. Chini ya 20\n2. 20-27\n3. 28+\n4. Sina uhakika":"1. Under 20\n2. 20-27\n3. 28+\n4. Not sure")
     :["duration","onset"].includes(nextQuestion.id)
      ?(encounter.preferred_language==="sw"?"1. Chini ya siku 1\n2. Siku 1-7\n3. Zaidi ya 7":"1. Under 1 day\n2. 1-7 days\n3. Over 7 days")
      :(encounter.preferred_language==="sw"?"1. Ndiyo\n2. Hapana\n3. Sina uhakika":"1. Yes\n2. No\n3. Not sure");
    return reply(res,languagePrompt(encounter.preferred_language,nextQuestion)+"\n"+optionText+"\n0. Back");
   }
   return reply(res,"Health support session complete. Dial again for the main menu.",true);
  }
  return reply(res,mainMenu);
 }catch(e){console.error("OmpathStudy Lite USSD:",e);return reply(res,"We could not process your request. Please try again shortly.",true);}
}
export default async function ompathLite(req,res){if(req.method==="GET")return res.status(200).json({name:"OmpathStudy Lite",status:"ok",source:"Health Support"});if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});return ussd(req,res);}
