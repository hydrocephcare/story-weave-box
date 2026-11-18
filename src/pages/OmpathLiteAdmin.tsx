import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Encounter = { id:string; concern_category:string|null; status:string; urgency_level:string; channel:string; created_at:string; updated_at:string };
type Candidate = { id:string; title:string; slug:string|null; content_type:string|null; verification_status:string; updated_at:string };
type Approval = { article_id:string; status:string; reviewer_name:string|null; review_due_at:string|null; article_updated_at_snapshot:string|null };
type Operations = { ussd:{callbackSecret:boolean;callbackPath:string;networkProvider:string;mode:string}; sms:{databaseSettings:boolean;enabled:boolean;environment:string;providerUsername:boolean;providerApiKey:boolean;senderId:boolean;inboundSecret:boolean;cronSecret:boolean}; ai:{enabled:boolean;groqConfigured:boolean;geminiConfigured:boolean;backgroundExecution:string}; storage:{supabaseUrl:boolean;serviceRoleKey:boolean;adminAuth:string}; safety:{liveSmsSentByDiagnostics:boolean;ussdTestUsesLiveNetwork:boolean;aiAffectsTriage:boolean} };
type Data = { healthEncounters:Encounter[]; stats:{encounters:number;emergency:number;urgent:number;awaiting:number;completed:number}; guideCandidates:Candidate[]; guideApprovals:Approval[]; operations:Operations };
type TestResult = { ok:boolean; mode:string; response?:string; liveSmsSent?:boolean; provider?:string; enabled?:boolean; modelRequestSent?:boolean; error?:string };

export default function OmpathLiteAdmin() {
 const {session}=useAuth();
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [reviewerName,setReviewerName]=useState(""),[qualification,setQualification]=useState(""),[registrationBody,setRegistrationBody]=useState(""),[registrationNumber,setRegistrationNumber]=useState("");
 const [reviewDays,setReviewDays]=useState("180"),[language,setLanguage]=useState("en"),[audience,setAudience]=useState("general"),[attested,setAttested]=useState(false),[saving,setSaving]=useState("");
 const [testResult,setTestResult]=useState<TestResult|null>(null),[testing,setTesting]=useState("");
 const refresh=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   if(!session?.access_token)throw new Error("Sign in as an administrator.");
   const response=await fetch("/api/ompath-lite-admin",{headers:{Authorization:"Bearer "+session.access_token}});
   const payload=await response.json();if(!response.ok)throw new Error(payload.error||"Could not load Health Support data.");setData(payload);
  }catch(reason){setError(reason instanceof Error?reason.message:"Could not load Health Support data.");}finally{setLoading(false);}
 },[session?.access_token]);
 useEffect(()=>{void refresh();},[refresh]);
 const runTest=async(action:"ussd_menu_test"|"sms_readiness_test"|"ai_readiness_test")=>{
  setTesting(action);setTestResult(null);setError("");
  try{
   const response=await fetch("/api/ompath-lite-admin",{method:"POST",headers:{Authorization:"Bearer "+session?.access_token,"Content-Type":"application/json"},body:JSON.stringify({action})});
   const payload=await response.json();if(!response.ok)throw new Error(payload.error||"Test failed.");setTestResult(payload);
  }catch(reason){setTestResult({ok:false,mode:"error",error:reason instanceof Error?reason.message:"Test failed."});}finally{setTesting("");}
 };
 const review=async(articleId:string,action:"approve"|"reject"|"suspend")=>{
  setSaving(articleId);setError("");setNotice("");
  try{
   const response=await fetch("/api/ompath-lite-admin",{method:"POST",headers:{Authorization:"Bearer "+session?.access_token,"Content-Type":"application/json"},body:JSON.stringify({
    article_id:articleId,action,reviewer_name:reviewerName,reviewer_qualification:qualification,registration_body:registrationBody,registration_number:registrationNumber,
    review_due_days:Number(reviewDays),patient_language:language,audience,reviewer_attested:attested
   })});
   const payload=await response.json();if(!response.ok)throw new Error(payload.error||"Could not save guide review.");
   setNotice(action==="approve"?"Guide approval recorded. Delivery remains conditional on current review and unchanged article content.":"Guide status changed to "+action+".");await refresh();
  }catch(reason){setError(reason instanceof Error?reason.message:"Could not save guide review.");}finally{setSaving("");}
 };
 const approvals=new Map((data?.guideApprovals||[]).map(x=>[x.article_id,x]));
 return <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
  <div className="mb-7 flex flex-wrap items-center justify-between gap-3"><div>
   <Link to="/admin" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/> Main admin</Link>
   <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">OmpathStudy · Lite Health Support</p>
   <h1 className="mt-1 font-serif text-3xl font-bold text-foreground sm:text-4xl">Health Support operations</h1>
   <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Monitor de-identified intake activity and manage the separate patient-guide review register. Phone numbers and symptom narratives are not shown here.</p>
  </div><button onClick={()=>void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm"><RefreshCw className="h-4 w-4"/> Refresh</button></div>
  {error&&<div role="alert" className="mb-5 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
  {notice&&<div role="status" className="mb-5 rounded-xl border border-border bg-muted/40 p-4 text-sm">{notice}</div>}
  {loading?<div className="flex min-h-48 items-center justify-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin"/> Loading Health Support activity…</div>:data&&<>
   <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-5">{[
    {label:"Recent enquiries",value:data.stats.encounters,icon:Clock3},{label:"Emergency",value:data.stats.emergency,icon:AlertTriangle},{label:"Urgent",value:data.stats.urgent,icon:AlertTriangle},{label:"Awaiting action",value:data.stats.awaiting,icon:Clock3},{label:"Completed",value:data.stats.completed,icon:CheckCircle2}
   ].map(x=><div key={x.label} className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center justify-between gap-2 text-muted-foreground"><span className="text-xs">{x.label}</span><x.icon className="h-4 w-4"/></div><p className="mt-3 text-3xl font-bold tabular-nums">{x.value}</p></div>)}</div>
   <section className="mb-7 overflow-hidden rounded-2xl border border-border bg-card">
    <div className="border-b border-border p-4"><h2 className="font-semibold">Service configuration and integration health</h2><p className="mt-1 text-xs text-muted-foreground">Live configuration status from the Lite server. Secret values are never returned to the browser.</p></div>
    <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
     {[
      {title:"USSD · Africa's Talking",items:[["Callback secret",data.operations.ussd.callbackSecret],["Callback endpoint",true],["Network mode",true]],detail:data.operations.ussd.callbackPath+" · "+data.operations.ussd.mode},
      {title:"SMS · Africa's Talking",items:[["SMS settings row",data.operations.sms.databaseSettings],["Provider username",data.operations.sms.providerUsername],["Provider API key",data.operations.sms.providerApiKey],["Sender ID",data.operations.sms.senderId],["Inbound STOP secret",data.operations.sms.inboundSecret],["Cron secret",data.operations.sms.cronSecret]],detail:"Mode: "+data.operations.sms.environment+" · "+(data.operations.sms.enabled?"Enabled":"Disabled")},
      {title:"AI extraction",items:[["Groq credentials",data.operations.ai.groqConfigured],["Gemini credentials",data.operations.ai.geminiConfigured],["Feature flag",data.operations.ai.enabled]],detail:"Background: "+data.operations.ai.backgroundExecution+" · Does not control triage"},
      {title:"Supabase",items:[["Project URL",data.operations.storage.supabaseUrl],["Server service key",data.operations.storage.serviceRoleKey],["Admin authorisation",true]],detail:data.operations.storage.adminAuth}
     ].map(group=><div key={group.title} className="rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold">{group.title}</h3><div className="mt-3 space-y-2">{group.items.map(([label,ok])=><div key={label} className="flex items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">{label}</span><span className={ok?"font-semibold text-emerald-700":"font-semibold text-amber-700"}>{ok?"Configured":"Missing"}</span></div>)}</div><p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">{group.detail}</p>
     </div>)}
    </div>
    <div className="border-t border-border p-4"><h3 className="text-sm font-semibold">Safe test centre</h3><p className="mt-1 text-xs text-muted-foreground">These checks do not contact a mobile network, send an SMS, or make an AI model request.</p>
     <div className="mt-3 flex flex-wrap gap-2">
      <button disabled={!!testing} onClick={()=>void runTest("ussd_menu_test")} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">{testing==="ussd_menu_test"?"Testing…":"Test USSD menu"}</button>
      <button disabled={!!testing} onClick={()=>void runTest("sms_readiness_test")} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">{testing==="sms_readiness_test"?"Checking…":"Check SMS readiness"}</button>
      <button disabled={!!testing} onClick={()=>void runTest("ai_readiness_test")} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">{testing==="ai_readiness_test"?"Checking…":"Check AI readiness"}</button>
     </div>
     {testResult&&<pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">{JSON.stringify(testResult,null,2)}</pre>}
    </div>
    <div className="border-t border-border bg-muted/30 p-4 text-xs text-muted-foreground">This first control panel provides secure configuration visibility and safe diagnostics. Provider credentials and Cloudflare secrets must still be changed in the Lite Cloudflare Pages environment; they are intentionally not editable or revealable through a browser. Runtime switches and full USSD session replay will be added as the next control-plane stage.</div>
   </section>
   <section className="mb-7 overflow-hidden rounded-2xl border border-border bg-card">
    <div className="border-b border-border p-4"><h2 className="font-semibold">Patient-guide approval register</h2><p className="mt-1 text-xs text-muted-foreground">Only published main-site articles already marked patient-facing and reviewed appear here. Lite approval is a separate review gate.</p></div>
    <div className="grid gap-4 border-b border-border p-4 md:grid-cols-2">
     <label className="text-sm">Reviewer full name<input value={reviewerName} onChange={e=>setReviewerName(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"/></label>
     <label className="text-sm">Professional qualification<input value={qualification} onChange={e=>setQualification(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" placeholder="e.g. Registered Clinical Officer"/></label>
     <label className="text-sm">Registration body<input value={registrationBody} onChange={e=>setRegistrationBody(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"/></label>
     <label className="text-sm">Registration number<input value={registrationNumber} onChange={e=>setRegistrationNumber(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"/></label>
     <label className="text-sm">Guide language<select value={language} onChange={e=>setLanguage(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"><option value="en">English</option><option value="sw">Kiswahili</option></select></label>
     <label className="text-sm">Intended audience<select value={audience} onChange={e=>setAudience(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"><option value="general">General</option><option value="adult_women">Adult women</option><option value="pregnancy">Pregnancy</option><option value="postpartum">Postpartum</option><option value="adolescent">Adolescents</option><option value="caregiver">Caregivers</option></select></label>
     <label className="text-sm">Review validity<select value={reviewDays} onChange={e=>setReviewDays(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"><option value="90">90 days</option><option value="180">180 days</option><option value="365">365 days</option></select></label>
     <label className="flex items-start gap-2 text-sm md:col-span-2"><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)} className="mt-1"/> I confirm that I am appropriately qualified and registered to review this patient-facing health information, and that my registration details are accurate.</label>
    </div>
    <div className="divide-y divide-border">{data.guideCandidates.map(article=>{
     const approval=approvals.get(article.id),current=approval?.status==="approved"&&approval.article_updated_at_snapshot===article.updated_at&&approval.review_due_at&&Date.parse(approval.review_due_at)>Date.now();
     return <div key={article.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div className="min-w-0">
      <p className="font-medium">{article.title}</p><p className="mt-1 text-xs text-muted-foreground">{article.slug||"No slug"} · {article.content_type} · {article.verification_status}</p>
      <p className="mt-1 text-xs">Status: <span className={current?"font-semibold text-emerald-700":"text-muted-foreground"}>{current?"Approved and current":approval?.status||"Not yet reviewed"}</span>{approval?.review_due_at?" · Review due "+new Date(approval.review_due_at).toLocaleDateString():""}</p>
     </div><div className="flex flex-wrap gap-2">
      <button disabled={!!saving||!reviewerName.trim()||!qualification.trim()||!registrationBody.trim()||!registrationNumber.trim()||!attested} onClick={()=>void review(article.id,"approve")} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">{saving===article.id?"Saving…":"Approve guide"}</button>
      <button disabled={!!saving} onClick={()=>void review(article.id,"reject")} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">Reject</button>
      {approval?.status==="approved"&&<button disabled={!!saving} onClick={()=>void review(article.id,"suspend")} className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive disabled:opacity-40">Suspend</button>}
     </div></div>;
    })}{!data.guideCandidates.length&&<div className="p-6 text-sm text-muted-foreground">No main-site articles are currently classified as patient guides. No guide can be approved or sent until a patient-facing article is prepared and reviewed on the main OmpathStudy site.</div>}</div>
    <div className="flex items-start gap-2 border-t border-border bg-muted/30 p-4 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/> Registration details are self-attested here and are not independently verified by OmpathStudy. Verify the reviewer's identity and current registration externally before granting approval. Any edit to the main article invalidates its approval automatically.</div>
   </section>
   <section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="border-b border-border p-4"><h2 className="font-semibold">Recent de-identified enquiries</h2><p className="mt-1 text-xs text-muted-foreground">Latest 200 encounters: category, urgency, channel and timestamp only.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3">Concern</th><th className="p-3">Urgency</th><th className="p-3">Status</th><th className="p-3">Channel</th><th className="p-3">Received</th></tr></thead><tbody>{data.healthEncounters.map(x=><tr key={x.id} className="border-t border-border"><td className="p-3 font-medium">{x.concern_category||"Not specified"}</td><td className="p-3"><span className={x.urgency_level==="emergency"?"font-semibold text-destructive":x.urgency_level==="urgent"?"font-semibold text-amber-700":"text-muted-foreground"}>{x.urgency_level}</span></td><td className="p-3">{x.status.replace(/_/g," ")}</td><td className="p-3 uppercase text-xs">{x.channel}</td><td className="p-3 text-muted-foreground">{new Date(x.created_at).toLocaleString()}</td></tr>)}</tbody></table>{!data.healthEncounters.length&&<p className="p-6 text-sm text-muted-foreground">No health enquiries have been recorded yet.</p>}</div></section>
  </>}
  <div className="mt-8 text-xs text-muted-foreground">OmpathStudy Lite is a health-support intake channel. Medical learning remains on the main OmpathStudy website.</div>
 </div>;
}
