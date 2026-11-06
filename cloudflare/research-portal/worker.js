export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "ompathstudy-research-portal" }, {
        headers: { "Cache-Control": "no-store" }
      });
    }
    if (url.pathname !== "/" && url.pathname !== "/index.html") {
      return Response.redirect(new URL("/", url), 302);
    }
    return new Response(PAGE, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Frame-Options": "DENY",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://esm.sh; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://strfwaqvxvkhjbqrwmla.supabase.co wss://strfwaqvxvkhjbqrwmla.supabase.co https://esm.sh; img-src 'self' data: https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
      }
    });
  }
};

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#102c36">
<title>Research Workspace | OmpathStudy</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{font-family:"DM Sans",sans-serif;color:#172b32;background:#f4f7f6;font-synthesis:none;text-rendering:optimizeLegibility}
*{box-sizing:border-box}body{margin:0;min-height:100vh}button,input,select,textarea{font:inherit}button{cursor:pointer}
.shell{min-height:100vh;display:grid;grid-template-columns:260px 1fr}.sidebar{background:#102c36;color:#e9f2f0;padding:28px 20px;display:flex;flex-direction:column;gap:30px}.brand{display:flex;align-items:center;gap:10px;font:800 19px Manrope}.mark{width:34px;height:34px;border-radius:11px;background:#b8e6d7;color:#103a35;display:grid;place-items:center;font-weight:800}.side-label{font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:#8ba6a5;font-weight:700;margin:8px 10px}.side-link{display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:10px;color:#c5d6d3;text-decoration:none;font-size:13px}.side-link.active,.side-link:hover{background:#20434a;color:white}.sidebar-bottom{margin-top:auto;border-top:1px solid #34535a;padding-top:18px;color:#8ba6a5;font-size:11px;line-height:1.6}
main{min-width:0}.topbar{height:72px;border-bottom:1px solid #e2e9e6;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 34px}.crumb{font-size:12px;color:#708187}.user-chip{font-size:12px;font-weight:700;color:#31535a;background:#edf5f2;padding:9px 12px;border-radius:30px}
.content{max-width:1120px;padding:34px;margin:auto}.welcome{background:linear-gradient(120deg,#153e43,#23655c);border-radius:20px;padding:30px;color:#fff;display:flex;justify-content:space-between;gap:20px;align-items:center}.eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:.16em;font-weight:800;color:#a8d7c9}.welcome h1{font:800 28px Manrope;margin:10px 0 7px}.welcome p{font-size:13px;line-height:1.7;color:#d0e2dd;margin:0;max-width:600px}.welcome a{color:#16443e;background:#d4f0e5;text-decoration:none;font-weight:800;font-size:12px;padding:12px 15px;border-radius:10px;white-space:nowrap}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:20px 0}.stat,.panel,.project{background:#fff;border:1px solid #e4ebe8;border-radius:15px;padding:18px}.stat small{color:#7b8d90;font-size:11px}.stat strong{display:block;font:800 24px Manrope;margin-top:7px;color:#1c4548}
.section-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:28px 0 14px}.section-head h2{font:800 17px Manrope;margin:0}.muted{color:#75878a;font-size:12px;line-height:1.65}
.btn{border:0;border-radius:10px;padding:11px 15px;background:#1c665b;color:#fff;font-size:12px;font-weight:800}.btn.secondary{background:#edf4f1;color:#315e56}.btn.danger{background:#fff0ed;color:#a33f2d}.btn:disabled{opacity:.5;cursor:not-allowed}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.project h3{font:800 15px Manrope;margin:0 0 6px}.project-meta{font-size:11px;color:#718286;margin-bottom:14px}.tag{display:inline-block;padding:5px 8px;border-radius:20px;background:#edf6f2;color:#276454;font-size:10px;font-weight:800}.project p{font-size:12px;line-height:1.6;color:#627579}.project-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px}
.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}.field label{font-size:11px;font-weight:800;color:#52676b}.field input,.field select,.field textarea{width:100%;border:1px solid #dce6e2;background:#fff;border-radius:9px;padding:11px 12px;color:#183238;font-size:12px;outline:none}.field input:focus,.field select:focus,.field textarea:focus{border-color:#438d7e;box-shadow:0 0 0 3px #438d7e18}.field textarea{min-height:84px;resize:vertical}
.panel{margin-top:18px}.panel h2{font:800 16px Manrope;margin:0 0 6px}.panel-head{display:flex;justify-content:space-between;gap:15px;align-items:center;margin-bottom:16px}
.empty{padding:32px;text-align:center;border:1px dashed #cbdad4;border-radius:14px;color:#728487;font-size:12px;line-height:1.7}.doc-row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 0;border-top:1px solid #edf1ef;font-size:11px}.doc-row a{color:#276c5e;font-weight:800;text-decoration:none}
.auth-wrap{min-height:100vh;display:grid;grid-template-columns:1fr 1fr;background:#fff}.auth-side{background:linear-gradient(145deg,#102c36,#21665b);color:#fff;padding:8vw;display:flex;flex-direction:column;justify-content:center}.auth-side h1{font:800 clamp(30px,4vw,48px) Manrope;line-height:1.1;margin:25px 0 12px}.auth-side p{max-width:450px;color:#d2e2dd;line-height:1.8;font-size:14px}.auth-main{display:grid;place-items:center;padding:28px}.auth-card{width:min(420px,100%)}.auth-card h2{font:800 24px Manrope;margin:0 0 8px}.auth-card .field{margin-top:13px}.auth-card .btn{width:100%;margin-top:18px;padding:13px}.switch{border:0;background:none;color:#287467;font-weight:800;font-size:12px;margin-top:16px}.notice{padding:11px 13px;border-radius:9px;font-size:12px;line-height:1.5;margin:12px 0;background:#eef6f1;color:#2c6753}.notice.error{background:#fff0ed;color:#9d3e2c}
.toast{position:fixed;right:20px;bottom:20px;background:#183b3d;color:#fff;padding:12px 16px;border-radius:10px;font-size:12px;box-shadow:0 10px 35px #0c282b30;z-index:10}.hidden{display:none!important}
@media(max-width:800px){.shell{grid-template-columns:1fr}.sidebar{padding:14px 16px;gap:10px;flex-direction:row;align-items:center}.sidebar nav,.side-label,.sidebar-bottom{display:none}.topbar{height:58px;padding:0 17px}.content{padding:20px 16px}.welcome{padding:22px;display:block}.welcome h1{font-size:23px}.welcome a{display:inline-block;margin-top:16px}.stats{gap:8px}.stat{padding:13px}.stat strong{font-size:20px}.grid{grid-template-columns:1fr}.auth-wrap{grid-template-columns:1fr}.auth-side{padding:30px 25px}.auth-side h1{font-size:30px}.auth-main{padding:35px 22px}}
@media(max-width:430px){.stats{grid-template-columns:1fr}.form-grid{grid-template-columns:1fr}.field.full{grid-column:auto}.section-head{align-items:flex-start;flex-direction:column}.user-chip{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
</style>
</head>
<body>
<div id="app"></div>
<div id="toast" class="toast hidden" role="status"></div>
<script type="module">
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL = "https://strfwaqvxvkhjbqrwmla.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cmZ3YXF2eHZraGpicXJ3bWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MTIwNzEsImV4cCI6MjEwODI4ODA3MX0.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE";
const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
const app = document.getElementById("app");
const stages = [
 ["topic_selection","Topic selection"],["proposal_development","Proposal development"],["ethics_approval","Ethics approval"],["data_collection","Data collection"],["data_analysis","Data analysis"],["report_writing","Report writing"],["defence","Research defence"],["completed","Completed"]
];
const universities = ["Mount Kenya University","University of Nairobi","Jomo Kenyatta University of Agriculture and Technology","Kenyatta University","Moi University","Maseno University","Aga Khan University","Egerton University","Kisii University","Kenya Methodist University","Other"];
let user=null, profile=null, projects=[], documents=[], authMode="signin", busy=false;
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const stageName = (v) => (stages.find(s=>s[0]===v)||stages[0])[1];
function toast(message,error=false){const el=document.getElementById("toast");el.textContent=message;el.style.background=error?"#8f3528":"#183b3d";el.classList.remove("hidden");setTimeout(()=>el.classList.add("hidden"),3200)}
function field(label,name,type="text",value="",placeholder="",required=false){return '<div class="field"><label for="'+name+'">'+label+'</label><input id="'+name+'" name="'+name+'" type="'+type+'" value="'+esc(value)+'" placeholder="'+esc(placeholder)+'" '+(required?'required':'')+'></div>'}
function options(items,selected){return items.map(i=>'<option value="'+esc(i[0])+'" '+(i[0]===selected?'selected':'')+'>'+esc(i[1])+'</option>').join("")}
function renderAuth(){
 app.innerHTML='<div class="auth-wrap"><section class="auth-side"><div class="brand"><span class="mark">OpS</span> OmpathStudy</div><span class="eyebrow" style="margin-top:54px">Research Hub · Student workspace</span><h1>Your research.<br>Organised with purpose.</h1><p>Keep your research projects, milestones and working documents together. Learn the process, stay organised and retain full ownership of your academic work.</p><p style="font-size:11px;color:#a9c5bd;margin-top:25px">A dedicated workspace for students across universities and disciplines.</p></section><section class="auth-main"><form class="auth-card" id="auth-form"><h2>'+(authMode==="signin"?'Welcome back':'Create your workspace')+'</h2><p class="muted">'+(authMode==="signin"?'Sign in with your OmpathStudy account.':'Register using your email address. You can use the same account as OmpathStudy.')+'</p><div id="auth-notice"></div>'+field("Email address","email","email","","name@example.com",true)+field("Password","password","password","","At least 8 characters",true)+(authMode==="signup"?field("Full name","full_name","text","","Your name",true):"")+'<button class="btn" type="submit" '+(busy?'disabled':'')+'>'+(busy?'Please wait…':authMode==="signin"?'Sign in':'Create account')+'</button><button class="switch" type="button" id="auth-switch">'+(authMode==="signin"?"New to Research Hub? Create an account":"Already registered? Sign in")+'</button><p class="muted" style="margin-top:22px"><a href="https://www.ompathstudy.com/research/" style="color:#287467">← Back to Research Hub information</a></p></form></section></div>';
 document.getElementById("auth-switch").onclick=()=>{authMode=authMode==="signin"?"signup":"signin";renderAuth()};
 document.getElementById("auth-form").onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;const fd=new FormData(e.currentTarget);const email=String(fd.get("email")||"").trim().toLowerCase(),password=String(fd.get("password")||"");
  const notice=document.getElementById("auth-notice");notice.innerHTML="";
  try{
   if(authMode==="signup"){
    if(password.length<8)throw new Error("Use a password with at least 8 characters.");
    const fullName=String(fd.get("full_name")||"").trim();
    const {data,error}=await db.auth.signUp({email,password,options:{data:{full_name:fullName,display_name:fullName}}});if(error)throw error;
    if(data.session){user=data.user;await ensureProfile(fullName);await loadWorkspace()}
    else {busy=false;notice.innerHTML='<div class="notice">Account created. Check your email for the confirmation link, then return here and sign in.</div>';renderAuth();document.getElementById("auth-notice").innerHTML='<div class="notice">Account created. Check your email for the confirmation link, then return here and sign in.</div>';return}
   }else{const {data,error}=await db.auth.signInWithPassword({email,password});if(error)throw error;user=data.user;await loadWorkspace()}
  }catch(err){busy=false;notice.innerHTML='<div class="notice error">'+esc(err.message||"Unable to authenticate.")+'</div>';return}
  busy=false;renderDashboard();
 };
}
async function ensureProfile(name){
 const {data,error}=await db.from("profiles").select("*").eq("user_id",user.id).maybeSingle();if(error)throw error;
 profile=data;
 if(!profile){const {data:created,error:createError}=await db.from("profiles").insert({user_id:user.id,display_name:name||user.user_metadata?.full_name||user.email}).select("*").single();if(createError)throw createError;profile=created}
}
async function loadWorkspace(){
 if(!user)return;await ensureProfile(profile?.display_name||user.user_metadata?.full_name||"");
 const [p,d]=await Promise.all([
  db.from("research_projects").select("*").order("updated_at",{ascending:false}),
  db.from("research_documents").select("*").order("created_at",{ascending:false})
 ]);
 if(p.error)throw p.error;if(d.error)throw d.error;projects=p.data||[];documents=d.data||[];
}
function renderDashboard(){
 const name=profile?.display_name||user?.user_metadata?.full_name||user?.email||"Student";
 const university=profile?.university||"University not selected";
 const active=projects.filter(p=>p.stage!=="completed").length;
 app.innerHTML='<div class="shell"><aside class="sidebar"><div class="brand"><span class="mark">OpS</span> OmpathStudy</div><nav style="display:block"><div class="side-label">Workspace</div><a class="side-link active" href="#overview">▦ <span>Overview</span></a><a class="side-link" href="#projects">▤ <span>My projects</span></a><a class="side-link" href="#profile">◉ <span>My profile</span></a><a class="side-link" href="https://www.ompathstudy.com/research/resources/">⌘ <span>Research learning</span></a><div class="side-label" style="margin-top:25px">OmpathStudy</div><a class="side-link" href="https://www.ompathstudy.com/">↗ <span>Main website</span></a></nav><div class="sidebar-bottom">Your research remains your responsibility. OmpathStudy supports learning and organisation, not academic misconduct.</div></aside><main><header class="topbar"><div class="crumb">Research Hub / My workspace</div><div class="user-chip">'+esc(user.email)+'</div></header><div class="content"><section class="welcome"><div><div class="eyebrow">Your research workspace</div><h1>Welcome, '+esc(name.split(" ")[0])+'</h1><p>'+esc(university)+' · Keep your projects, milestones and documents organised in one private space.</p></div><a href="#new-project" id="new-project-link">＋ New project</a></section><section class="stats"><div class="stat"><small>Total projects</small><strong>'+projects.length+'</strong></div><div class="stat"><small>In progress</small><strong>'+active+'</strong></div><div class="stat"><small>Documents saved</small><strong>'+documents.length+'</strong></div></section><div class="section-head" id="projects"><div><h2>My research projects</h2><div class="muted">Only you can access the projects and documents in this workspace.</div></div><button class="btn" id="show-project-form">＋ Add project</button></div><div id="project-form-wrap" class="panel hidden"><div class="panel-head"><div><h2>Start a research project</h2><div class="muted">You can update the details and stage at any time.</div></div><button class="btn secondary" id="cancel-project">Cancel</button></div><form id="project-form" class="form-grid">'+
 field("Project title","title","text","","e.g. Factors associated with…",true)+field("Programme / course","programme","text",profile?.course||"","Your programme",true)+
 '<div class="field"><label for="stage">Current stage</label><select id="stage" name="stage">'+options(stages,"topic_selection")+'</select></div>'+field("Target completion date","target_date","date","")+
 '<div class="field full"><label for="research_question">Research question or main objective</label><textarea id="research_question" name="research_question" placeholder="What are you investigating?"></textarea></div><div class="field full"><label for="notes">Private working notes</label><textarea id="notes" name="notes" placeholder="Record your next steps, supervisor feedback or decisions."></textarea></div><div class="field full"><button class="btn" type="submit">Save research project</button></div></form></div><div id="project-list" class="grid">'+renderProjects()+'</div><section class="panel" id="profile"><div class="panel-head"><div><h2>Academic profile</h2><div class="muted">Used to organise your workspace. This does not imply university endorsement.</div></div></div><form id="profile-form" class="form-grid">'+field("Full name","display_name","text",profile?.display_name||name,"Your name",true)+'<div class="field"><label for="university">University / institution</label><select id="university" name="university"><option value="">Select your university</option>'+universities.map(v=>'<option '+(profile?.university===v?'selected':'')+'>'+esc(v)+'</option>').join("")+'</select></div>'+field("Programme / course","course","text",profile?.course||"","e.g. MBChB, Nursing, Pharmacy")+'<div class="field"><label for="study_year">Year of study</label><select id="study_year" name="study_year"><option value="">Select year</option>'+[1,2,3,4,5,6,7].map(n=>'<option value="'+n+'" '+(Number(profile?.study_year)===n?'selected':'')+'>Year '+n+'</option>').join("")+'</select></div><div class="field full"><button class="btn secondary" type="submit">Save profile</button></div></form></section><div class="section-head"><div><h2>Research documents</h2><div class="muted">Private files attached to your projects. Maximum 10 MB per file.</div></div></div><div class="panel">'+renderDocuments()+'</div><div class="muted" style="margin-top:22px;text-align:center">OmpathStudy Research Hub · <a href="https://www.ompathstudy.com/research/academic-integrity/" style="color:#287467">Academic integrity</a> · <button id="signout" class="switch">Sign out</button></div></div></main></div>';
 document.getElementById("new-project-link").onclick=()=>document.getElementById("project-form-wrap").classList.remove("hidden");
 document.getElementById("show-project-form").onclick=()=>document.getElementById("project-form-wrap").classList.remove("hidden");
 document.getElementById("cancel-project").onclick=()=>document.getElementById("project-form-wrap").classList.add("hidden");
 document.getElementById("project-form").onsubmit=saveProject;
 document.getElementById("profile-form").onsubmit=saveProfile;
 document.getElementById("signout").onclick=async()=>{await db.auth.signOut();user=null;profile=null;projects=[];documents=[];renderAuth()};
 document.querySelectorAll("[data-stage]").forEach(el=>el.onchange=()=>updateStage(el.dataset.stage,el.value));
 document.querySelectorAll("[data-delete-project]").forEach(el=>el.onclick=()=>deleteProject(el.dataset.deleteProject));
 document.querySelectorAll("[data-upload]").forEach(el=>el.onchange=()=>uploadDocument(el.dataset.upload,el.files?.[0]));
 document.querySelectorAll("[data-download]").forEach(el=>el.onclick=()=>downloadDocument(el.dataset.download));
 document.querySelectorAll("[data-delete-document]").forEach(el=>el.onclick=()=>deleteDocument(el.dataset.deleteDocument));
}
function renderProjects(){
 if(!projects.length)return '<div class="empty" style="grid-column:1/-1">You have not added a research project yet.<br>Start by recording your topic, proposal or current research stage.</div>';
 return projects.map(p=>'<article class="project"><div style="display:flex;justify-content:space-between;gap:10px"><div><span class="tag">'+esc(stageName(p.stage))+'</span><h3 style="margin-top:10px">'+esc(p.title)+'</h3><div class="project-meta">'+esc(p.programme||profile?.course||"")+' · '+esc(p.university||profile?.university||"")+'</div></div><button class="btn danger" data-delete-project="'+esc(p.id)+'" aria-label="Delete project">Delete</button></div>'+(p.research_question?'<p>'+esc(p.research_question)+'</p>':'')+'<div class="field" style="margin-top:13px"><label>Research stage</label><select data-stage="'+esc(p.id)+'">'+options(stages,p.stage)+'</select></div><div class="project-foot"><span class="muted">'+(p.target_date?'Target: '+esc(p.target_date):'No target date set')+'</span><label class="btn secondary" style="cursor:pointer">＋ Attach file<input type="file" data-upload="'+esc(p.id)+'" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.pptx" hidden></label></div></article>').join("");
}
function renderDocuments(){
 if(!documents.length)return '<div class="empty">No research documents saved yet.<br>Attach a proposal, questionnaire, dataset or presentation to one of your projects.</div>';
 return documents.map(d=>'<div class="doc-row"><div><strong>'+esc(d.file_name)+'</strong><div class="muted">'+esc((projects.find(p=>p.id===d.project_id)||{}).title||"Research project")+' · '+Math.max(1,Math.round(Number(d.size_bytes)/1024))+' KB</div></div><div style="display:flex;gap:10px"><button class="switch" data-download="'+esc(d.id)+'">Open</button><button class="switch" data-delete-document="'+esc(d.id)+'" style="color:#a33f2d">Remove</button></div></div>').join("");
}
async function saveProject(e){
 e.preventDefault();const fd=new FormData(e.currentTarget);const row={user_id:user.id,title:String(fd.get("title")||"").trim(),programme:String(fd.get("programme")||"").trim(),university:profile?.university||"",stage:String(fd.get("stage")||"topic_selection"),research_question:String(fd.get("research_question")||"").trim(),notes:String(fd.get("notes")||"").trim(),target_date:fd.get("target_date")||null};
 const {error}=await db.from("research_projects").insert(row);if(error){toast(error.message,true);return}await loadWorkspace();renderDashboard();toast("Research project saved.");
}
async function saveProfile(e){
 e.preventDefault();const fd=new FormData(e.currentTarget);const row={user_id:user.id,display_name:String(fd.get("display_name")||"").trim(),university:String(fd.get("university")||"")||null,course:String(fd.get("course")||"").trim()||null,study_year:fd.get("study_year")?Number(fd.get("study_year")):null,onboarding_completed:true,updated_at:new Date().toISOString()};
 const {data,error}=await db.from("profiles").upsert(row,{onConflict:"user_id"}).select("*").single();if(error){toast(error.message,true);return}profile=data;toast("Academic profile updated.");renderDashboard();
}
async function updateStage(id,stage){
 const {error}=await db.from("research_projects").update({stage,updated_at:new Date().toISOString()}).eq("id",id);if(error){toast(error.message,true);return}await loadWorkspace();renderDashboard();toast("Research stage updated.");
}
async function deleteProject(id){
 if(!confirm("Delete this research project and its document records? This cannot be undone."))return;
 const related=documents.filter(d=>d.project_id===id);for(const d of related){await db.storage.from("research-documents").remove([d.storage_path])}
 const {error}=await db.from("research_projects").delete().eq("id",id);if(error){toast(error.message,true);return}await loadWorkspace();renderDashboard();toast("Project deleted.");
}
async function uploadDocument(projectId,file){
 if(!file)return;if(file.size>10485760){toast("File exceeds the 10 MB limit.",true);return}
 const allowed=["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","text/csv","application/vnd.openxmlformats-officedocument.presentationml.presentation"];
 if(!allowed.includes(file.type)){toast("Please upload a PDF, Word, Excel, CSV or PowerPoint file.",true);return}
 const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100);const path=user.id+"/"+projectId+"/"+Date.now()+"-"+safeName;
 const up=await db.storage.from("research-documents").upload(path,file,{contentType:file.type,upsert:false});if(up.error){toast(up.error.message,true);return}
 const meta=await db.from("research_documents").insert({user_id:user.id,project_id:projectId,storage_path:path,file_name:file.name,mime_type:file.type,size_bytes:file.size});
 if(meta.error){await db.storage.from("research-documents").remove([path]);toast(meta.error.message,true);return}
 await loadWorkspace();renderDashboard();toast("Document saved privately.");
}
async function downloadDocument(id){
 const doc=documents.find(d=>d.id===id);if(!doc)return;const {data,error}=await db.storage.from("research-documents").createSignedUrl(doc.storage_path,60);if(error){toast(error.message,true);return}window.open(data.signedUrl,"_blank","noopener,noreferrer");
}
async function deleteDocument(id){
 const doc=documents.find(d=>d.id===id);if(!doc)return;if(!confirm("Remove this document?"))return;
 const [storage,meta]=await Promise.all([db.storage.from("research-documents").remove([doc.storage_path]),db.from("research_documents").delete().eq("id",id)]);
 if(storage.error||meta.error){toast((storage.error||meta.error).message,true);return}await loadWorkspace();renderDashboard();toast("Document removed.");
}
async function start(){
 const {data,error}=await db.auth.getSession();if(error){renderAuth();return}
 user=data.session?.user||null;
 if(user){try{await loadWorkspace();renderDashboard()}catch(e){console.error(e);toast(e.message||"Could not load workspace",true);renderAuth()}}
 else renderAuth();
 db.auth.onAuthStateChange((_event,session)=>{if(!session){user=null;profile=null;projects=[];documents=[];renderAuth()}});
}
start();
</script>
</body>
</html>`;
