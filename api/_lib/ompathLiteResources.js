/**
 * Patient-facing resource retrieval for OmpathStudy Lite.
 * A main-site article is eligible only when current, published, reviewed
 * as patient content AND separately approved in the Lite registry.
 */
const PATIENT_CONTENT_TYPES=["patient_guide","patient_information","health_guide","Patient Guide","Patient Information","Health Guide"];
const clean=(value,max=240)=>String(value??"").replace(/[<>]/g,"").trim().slice(0,max);
function resourceDbUrl(){const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!base||!key)return null;return{base:base.replace(/\/$/,""),key};}
function searchTerms(value){return[...new Set(clean(value,240).toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>=3).slice(0,6))];}
async function queryRows(config,table,params){
 const response=await fetch(`${config.base}/rest/v1/${table}?${params}`,{headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,Accept:"application/json"},signal:AbortSignal.timeout(4500)});
 if(!response.ok)throw new Error("Patient resource lookup failed.");const rows=await response.json();return Array.isArray(rows)?rows:[];
}
export function isEligiblePatientResource(row,approval){
 return Boolean(row&&row.published===true&&row.deleted_at==null&&row.requires_review===false&&
  ["reviewed","verified"].includes(row.verification_status)&&PATIENT_CONTENT_TYPES.includes(row.content_type)&&
  approval?.status==="approved"&&Date.parse(approval.review_due_at)>Date.now()&&
  Date.parse(row.updated_at)<=Date.parse(approval.article_updated_at_snapshot));
}
export async function searchReviewedPatientResources({query,language="en",limit=4}={}){
 const config=resourceDbUrl(),terms=searchTerms(query);if(!config||!terms.length)return[];
 try{
  const approvalParams=new URLSearchParams({select:"article_id,patient_language,audience,review_due_at,article_updated_at_snapshot",status:"eq.approved",review_due_at:"gt."+new Date().toISOString(),patient_language:"eq."+(language==="sw"?"sw":"en"),limit:"100"});
  const approvals=await queryRows(config,"lite_patient_guide_approvals",approvalParams);if(!approvals.length)return[];
  const byId=new Map(approvals.map(x=>[x.article_id,x]));
  const params=new URLSearchParams({select:"id,title,slug,category,content_type,verification_status,meta_description,content,updated_at,published,requires_review,deleted_at",id:"in.("+approvals.map(x=>x.article_id).join(",")+")",published:"eq.true",deleted_at:"is.null",requires_review:"eq.false",verification_status:"in.(reviewed,verified)",content_type:"in.("+PATIENT_CONTENT_TYPES.map(x=>`"${x}"`).join(",")+")",order:"updated_at.desc",limit:String(Math.min(5,Math.max(1,Number(limit)||4)))});
  params.set("or","("+terms.flatMap(t=>[`title.ilike.*${t}*`,`category.ilike.*${t}*`,`meta_description.ilike.*${t}*`]).join(",")+")");
  const rows=await queryRows(config,"articles",params);
  return rows.filter(row=>isEligiblePatientResource(row,byId.get(row.id))).slice(0,5).map(row=>({
   id:clean(row.id,36),title:clean(row.title,180),slug:clean(row.slug,180),category:clean(row.category,100),
   contentType:clean(row.content_type,60),verificationStatus:row.verification_status,summary:clean(row.meta_description,500),
   content:clean(row.content,6000),updatedAt:row.updated_at||null,language,audience:byId.get(row.id).audience,
   source:"OmpathStudy clinician-approved patient guide"
  }));
 }catch{console.error("Lite patient-resource lookup failed.");return[];}
}
