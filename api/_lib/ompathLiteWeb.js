/** Browser-facing API for OmpathStudy Lite Health Support.
 * The Lite public channel is health support only. Learning resources live on the main site.
 * All health records are written server-side; the Supabase service key is never exposed.
 */
import { createHealthEncounter, updateHealthEncounter } from "./ompathLiteHealth.js";
import { buildPreliminaryAssessment, detectEmergencyLanguage } from "./ompathLiteRules.js";
import { searchReviewedPatientResources } from "./ompathLiteResources.js";

const send=(res,status,payload)=>res.status(status).json(payload);
const clean=(value,max=1200)=>String(value??"").replace(/[<>]/g,"").trim().slice(0,max);

function expectedQuestionIds(category, answers){
 if(answers[0]?.answer==="1")return ["emergency_screen"];
 if(category==="Pregnancy-related concern"){
  const status=String(answers.find(answer=>answer.question_id==="pregnancy_status")?.answer||"");
  if(["2","3"].includes(status))return ["emergency_screen","pregnancy_status","pregnancy_bleeding_or_fluid"];
  if(status==="1"){
   const gestation=String(answers.find(answer=>answer.question_id==="gestation")?.answer||"");
   if(gestation==="1")return ["emergency_screen","pregnancy_status","gestation","pregnancy_bleeding_or_fluid"];
   if(["2","3","4"].includes(gestation))return ["emergency_screen","pregnancy_status","gestation","pregnancy_bleeding_or_fluid","pregnancy_movement"];
  }
  return null;
 }
 const pathways={
  "Menstrual problem":["emergency_screen","duration","fever","pregnancy_possibility","severity"],
  "Lower abdominal pain":["emergency_screen","onset","pregnancy_possibility","fever_vomiting","severity"],
  "Vaginal discharge":["emergency_screen","duration","fever","pregnancy_possibility","severity"],
  "Bleeding":["emergency_screen","bleeding_amount","pregnancy_possibility","duration","pain"],
  "Other health concern":["emergency_screen","duration","fever","worsening","care"],
 };
 return pathways[category]||null;
}
export default async function liteWeb(req,res){
 if(req.method==="GET")return send(res,200,{name:"OmpathStudy Lite Health Support",status:"ok",mode:"health_support"});
 if(req.method!=="POST")return send(res,405,{error:"Method not allowed."});
 const payload=typeof req.body==="string"?Object.fromEntries(new URLSearchParams(req.body)):req.body||{};
 if(clean(payload.action,40)!=="health-assess")return send(res,410,{error:"Learning and MCQ services have moved to https://www.ompathstudy.com. Lite now provides Health Support only."});
 try{
  const category=clean(payload.concern_category,80);
  const originalMessage=clean(payload.original_message,1200);
  const sessionId=clean(payload.session_id,120);
  const allowedCategories=["Pregnancy-related concern","Menstrual problem","Lower abdominal pain","Vaginal discharge","Bleeding","Other health concern"];
  const answers=Array.isArray(payload.answers)?payload.answers.slice(0,5):[];
  if(!/^[A-Za-z0-9._:-]{6,120}$/.test(sessionId))return send(res,400,{error:"Your health session could not be started. Refresh and try again."});
  if(!allowedCategories.includes(category))return send(res,400,{error:"Choose the main health concern."});
  if(payload.consent_given!==true)return send(res,400,{error:"Consent is required before health information can be stored."});
  const expected=expectedQuestionIds(category,answers);
  if(!expected||answers.length!==expected.length||answers.some((answer,index)=>!answer||answer.question_id!==expected[index]||!["1","2","3",...(answer.question_id==="gestation"?["4"]:[])].includes(String(answer.answer))))return send(res,400,{error:"Complete the emergency screen and the correct follow-up questions for the concern selected."});
  const emergencyFlags=detectEmergencyLanguage(originalMessage);
  if(String(answers[0].answer)==="1")emergencyFlags.push({rule:"self_reported_emergency_symptom",positive:true});
  const encounter=await createHealthEncounter({sessionId,phoneNumber:null,consentGiven:true,smsConsent:false,preferredLanguage:"en",channel:"web"});
  if(encounter?.assessment)return send(res,409,{error:"This health enquiry has already been assessed. Start a new enquiry if you need further help."});
  const assessment=buildPreliminaryAssessment({encounter:{concern_category:category,original_message:originalMessage},answers,emergencyFlags});
  const resources=await searchReviewedPatientResources({query:[category,originalMessage].filter(Boolean).join(" "),language:"en",limit:3});
  const status=["emergency","urgent"].includes(assessment.urgency_level)?"referred_urgent":"complete";
  const saved=await updateHealthEncounter({
   id:encounter.id,sessionId,phoneNumber:null,
   patch:{
    concern_category:category,
    original_message:originalMessage,
    normalized_summary:"",
    clarification_answers:answers,
    red_flag_results:emergencyFlags,
    assessment,
    urgency_level:assessment.urgency_level,
    status,
   },
  });
  if(!saved)throw new Error("The health assessment could not be securely saved.");
  return send(res,200,{
   assessment,
   resources:resources.filter(resource=>resource.slug).map(({title,slug,summary,updatedAt})=>({
    title,slug,summary,updated_at:updatedAt,
    url:"https://www.ompathstudy.com/blog/"+encodeURIComponent(slug),
   })),
   reference:encounter.id,
  });
 }catch(error){
  console.error("OmpathStudy Lite health assessment failed:",error instanceof Error?error.message:"unknown error");
  return send(res,503,{error:"We could not securely complete your assessment. Please try again. If symptoms are severe or worsening, seek in-person care now."});
 }
}
