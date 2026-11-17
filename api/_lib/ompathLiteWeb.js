/** Browser-facing API for OmpathStudy Lite Health Support.
 * The Lite public channel is health support only. Learning resources live on the main site.
 * All health records are written server-side; the Supabase service key is never exposed.
 */
import { createHealthEncounter, updateHealthEncounter } from "./ompathLiteHealth.js";
import { buildPreliminaryAssessment, detectEmergencyLanguage } from "./ompathLiteRules.js";
import { searchReviewedPatientResources } from "./ompathLiteResources.js";

const send=(res,status,payload)=>res.status(status).json(payload);
const clean=(value,max=1200)=>String(value??"").replace(/[<>]/g,"").trim().slice(0,max);

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
  const allowedIds=new Set(["emergency_screen","pregnancy_status","gestation","pregnancy_bleeding_or_fluid","pregnancy_movement","duration","fever","pregnancy_possibility","severity","onset","fever_vomiting","bleeding_amount","pain","worsening","care"]);
  const answers=Array.isArray(payload.answers)?payload.answers.slice(0,5):[];
  if(!/^[A-Za-z0-9._:-]{6,120}$/.test(sessionId))return send(res,400,{error:"Your health session could not be started. Refresh and try again."});
  if(!allowedCategories.includes(category))return send(res,400,{error:"Choose the main health concern."});
  if(payload.consent_given!==true)return send(res,400,{error:"Consent is required before health information can be stored."});
  if(answers.length<1||answers.length>5||answers[0]?.question_id!=="emergency_screen"||(String(answers[0]?.answer)!=="1"&&answers.length<2)||answers.some(answer=>!answer||!allowedIds.has(answer.question_id)||!["1","2","3","4"].includes(String(answer.answer))))return send(res,400,{error:"Complete the emergency screen and all relevant follow-up questions."});
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
