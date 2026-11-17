import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, GraduationCap, HelpCircle, Menu, MessageSquare, Phone, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";
import "./ompath-lite.css";

type Profile = { phone_number: string; full_name: string; study_level: string; preferred_subject?: string | null; sms_opt_in?: boolean };
type Question = { question: string; options: string[]; explanation?: string };
type SetItem = { id: string; title: string; category?: string; subject: string; question_count: number; questions?: Question[] };
type Library = { subjects: { name: string; sets: SetItem[] }[]; totals: { sets: number; questions: number } };
type Result = { correct: boolean; correctIndex: number; explanation: string };

const API = "/api/ai?task=lite-web";
const years = [1,2,3,4,5,6];
async function request<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "We could not complete that request. Please try again.");
  return payload as T;
}
const getStored = (): Profile | null => { try { const v=localStorage.getItem("ompath-lite-profile"); return v?JSON.parse(v):null; } catch { return null; } };

export default function OmpathLiteApp() {
  const [profile,setProfile]=useState<Profile|null>(()=>getStored());
  const [screen,setScreen]=useState<"home"|"library"|"practice"|"progress"|"help">("home");
  const [library,setLibrary]=useState<Library|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [year,setYear]=useState(profile?Number(profile.study_level.match(/[1-6]/)?.[0]||1):1);
  const [subject,setSubject]=useState("");
  const [setItem,setSetItem]=useState<SetItem|null>(null);
  const [questionIndex,setQuestionIndex]=useState(0);
  const [answer,setAnswer]=useState<number|null>(null);
  const [result,setResult]=useState<Result|null>(null);
  const [saving,setSaving]=useState(false);
  const [showRegister,setShowRegister]=useState(false);
  const [name,setName]=useState(profile?.full_name||"");
  const [phone,setPhone]=useState(profile?.phone_number||"");
  const [registerYear,setRegisterYear]=useState(year);
  const [mobileMenu,setMobileMenu]=useState(false);
  const [attempts,setAttempts]=useState<{title:string;correct:boolean;attempted_at:string}[]>([]);
  useEffect(()=>{ document.title="OmpathStudy Lite | Focused Medical Learning"; let meta=document.querySelector('meta[name="description"]'); if(!meta){meta=document.createElement("meta");meta.setAttribute("name","description");document.head.appendChild(meta);} meta.setAttribute("content","A lightweight way to access OmpathStudy medical MCQs, practise by study year and review explanations."); let theme=document.querySelector('meta[name="theme-color"]'); if(theme)theme.setAttribute("content","#173a32"); },[]);

  const loadLibrary=useCallback(async(y:number)=>{
    setLoading(true);setError("");
    try { const data=await request<Library>({action:"library",year:y}); setLibrary(data); }
    catch(e){setError(e instanceof Error?e.message:"Could not load the OmpathStudy question bank.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{ if(profile) void loadLibrary(year); },[profile,year,loadLibrary]);
  useEffect(()=>{ if(profile && screen==="progress") void request<{attempts:typeof attempts}>({action:"progress",phone:profile.phone_number}).then(d=>setAttempts(d.attempts||[])).catch(e=>setError(e.message)); },[profile,screen]);

  const currentSubject=useMemo(()=>library?.subjects.find(s=>s.name===subject),[library,subject]);
  const question=setItem?.questions?.[questionIndex];
  const totalQuestions=setItem?.question_count||0;
  const answeredCount=attempts.length;

  const register=async()=>{
    setSaving(true);setError("");
    try{
      const normalized=phone.replace(/[\s()-]/g,"");
      const data=await request<{profile:Profile}>({action:"register",full_name:name,phone_number:normalized,study_year:registerYear});
      setProfile(data.profile);localStorage.setItem("ompath-lite-profile",JSON.stringify(data.profile));setYear(registerYear);setShowRegister(false);setScreen("library");
    }catch(e){setError(e instanceof Error?e.message:"Registration failed.");}
    finally{setSaving(false);}
  };
  const chooseSet=async(s:SetItem)=>{
    setLoading(true);setError("");
    try{const data=await request<{set:SetItem}>({action:"set",set_id:s.id,year});setSetItem(data.set);setQuestionIndex(0);setAnswer(null);setResult(null);setScreen("practice");}
    catch(e){setError(e instanceof Error?e.message:"Could not open this question set.");}
    finally{setLoading(false);}
  };
  const submitAnswer=async()=>{
    if(!profile||!setItem||answer===null||!question)return;
    setSaving(true);setError("");
    try{
      const data=await request<{correct:boolean;correctIndex:number;explanation:string}>({action:"answer",phone:profile.phone_number,set_id:setItem.id,question_index:questionIndex,selected_option:answer+1});
      setResult(data);
      setAttempts(prev=>[{title:setItem.title,correct:data.correct,attempted_at:new Date().toISOString()},...prev]);
    }catch(e){setError(e instanceof Error?e.message:"Your answer could not be saved.");}
    finally{setSaving(false);}
  };
  const nextQuestion=()=>{if(questionIndex+1<totalQuestions){setQuestionIndex(v=>v+1);setAnswer(null);setResult(null);}else{setScreen("progress");setSetItem(null);}};
  const changeSms=async(enabled:boolean)=>{
    if(!profile)return;
    setSaving(true);setError("");
    try{const data=await request<{profile:Profile}>({action:"sms-preference",phone:profile.phone_number,enabled});setProfile(data.profile);localStorage.setItem("ompath-lite-profile",JSON.stringify(data.profile));}
    catch(e){setError(e instanceof Error?e.message:"Could not update SMS preference.");}
    finally{setSaving(false);}
  };
  const logout=()=>{localStorage.removeItem("ompath-lite-profile");setProfile(null);setLibrary(null);setScreen("home");setShowRegister(false);};

  return <div className="lite-shell">
    <header className="lite-topbar"><a className="lite-brand" href="/" aria-label="OmpathStudy Lite home"><span className="lite-brand-mark">O<span>+</span></span><span>OMPATH<span className="lite-brand-light">LITE</span><small>MEDICAL LEARNING, MADE ACCESSIBLE</small></span></a>
      <nav className="lite-nav">{profile&&<><button className={screen==="library"?"active":""} onClick={()=>setScreen("library")}>Question bank</button><button className={screen==="progress"?"active":""} onClick={()=>setScreen("progress")}>My progress</button><button className={screen==="help"?"active":""} onClick={()=>setScreen("help")}>Help</button></>}</nav>
      <div className="lite-account">{profile?<><span className="lite-avatar">{profile.full_name.slice(0,1).toUpperCase()}</span><span className="lite-account-name">{profile.full_name.split(" ")[0]}<small>{profile.study_level}</small></span><button className="lite-quiet-btn" onClick={logout}>Sign out</button></>:<button className="lite-signin" onClick={()=>setShowRegister(true)}>Get started <ArrowRight size={15}/></button>}</div>
      <button className="lite-mobile-menu" onClick={()=>setMobileMenu(v=>!v)} aria-label="Toggle navigation">{mobileMenu?<X/>:<Menu/>}</button>
    </header>
    {mobileMenu&&<div className="lite-mobile-nav"><button onClick={()=>{setScreen("library");setMobileMenu(false)}}>Question bank</button><button onClick={()=>{setScreen("progress");setMobileMenu(false)}}>My progress</button><button onClick={()=>{setScreen("help");setMobileMenu(false)}}>Help</button></div>}
    <main className="lite-main">
      {error&&<div className="lite-alert" role="alert">{error}<button onClick={()=>setError("")} aria-label="Dismiss"><X size={16}/></button></div>}
      {!profile&&<section className="lite-hero">
        <div className="lite-hero-copy"><div className="lite-eyebrow"><span/> THE LIGHTWEIGHT LEARNING CHANNEL</div><h1>Your medical learning.<br/><em>Without the barriers.</em></h1><p>Access thousands of existing OmpathStudy MCQs, practise by study year, and learn from clear explanations. Designed for a fast, focused experience on any device.</p><div className="lite-hero-actions"><button className="lite-primary" onClick={()=>setShowRegister(true)}>Create free learner profile <ArrowRight size={17}/></button><a href="https://www.ompathstudy.com" target="_blank" rel="noreferrer">Explore full OmpathStudy <ArrowRight size={14}/></a></div><div className="lite-trust"><ShieldCheck size={17}/> Uses OmpathStudy's existing published learning library</div></div>
        <div className="lite-hero-art"><div className="lite-art-orbit orbit-one"/><div className="lite-art-orbit orbit-two"/><div className="lite-study-card"><div className="lite-card-head"><span>DAILY PRACTICE</span><span className="lite-live-dot"/></div><div className="lite-card-icon"><GraduationCap size={28}/></div><strong>Build clinical confidence.</strong><p>One question at a time.</p><div className="lite-progress-line"><i/></div><div className="lite-card-foot"><span>Learn</span><span>Practise</span><span>Improve</span></div></div><div className="lite-float-note"><CheckCircle2 size={16}/> Understand every answer</div></div>
        <div className="lite-hero-stats"><div><strong>1,500+</strong><span>MCQ sets in the parent library</span></div><div><strong>6 years</strong><span>Medical study levels</span></div><div><strong>One source</strong><span>No duplicated question banks</span></div></div>
      </section>}
      {profile&&screen==="home"&&<section className="lite-welcome"><div><div className="lite-eyebrow"><span/> YOUR STUDY SPACE</div><h1>Welcome back, {profile.full_name.split(" ")[0]}.</h1><p>Your {profile.study_level} learning space is ready. Pick up where you left off.</p><button className="lite-primary" onClick={()=>setScreen("library")}>Explore your question bank <ArrowRight size={17}/></button></div><div className="lite-welcome-graphic"><BookOpen size={66}/><span>LEARN · PRACTISE · GROW</span></div></section>}
      {profile&&screen==="library"&&<section className="lite-content"><div className="lite-section-heading"><div><div className="lite-eyebrow"><span/> THE QUESTION BANK</div><h1>Choose what to study.</h1><p>Browse published MCQ sets already available in OmpathStudy.</p></div><label className="lite-year-select">Study year<select value={year} onChange={e=>{setYear(Number(e.target.value));setSubject("");}}>{years.map(y=><option key={y} value={y}>Year {y}</option>)}</select></label></div>
        {loading?<div className="lite-loading"><RefreshCw className="spin"/> Loading your question bank…</div>:library&&<><div className="lite-library-summary"><div><BookOpen/><strong>{library.totals.sets.toLocaleString()}</strong><span>question sets</span></div><div><GraduationCap/><strong>{library.totals.questions.toLocaleString()}</strong><span>questions available</span></div><div><Sparkles/><strong>Year {year}</strong><span>your selected level</span></div></div>
        {!subject?<div className="lite-subject-grid">{library.subjects.map((s,i)=><button className="lite-subject-card" key={s.name} onClick={()=>setSubject(s.name)}><span className="lite-subject-number">{String(i+1).padStart(2,"0")}</span><strong>{s.name}</strong><span>{s.sets.length} question sets <ArrowRight size={15}/></span></button>)}{!library.subjects.length&&<p>No published sets were found for this year yet. Try another study year or visit the full library.</p>}</div>:<><button className="lite-back-link" onClick={()=>setSubject("")}><ChevronLeft size={16}/> All subjects</button><h2 className="lite-subject-title">{subject}</h2><div className="lite-set-list">{(currentSubject?.sets||[]).map(s=><button key={s.id} className="lite-set-row" onClick={()=>void chooseSet(s)}><span className="lite-set-icon"><BookOpen/></span><span><strong>{s.title}</strong><small>{s.question_count} questions · Published OmpathStudy content</small></span><ArrowRight/></button>)}</div></>}</>}
      </section>}
      {profile&&screen==="practice"&&setItem&&<section className="lite-practice"><button className="lite-back-link" onClick={()=>setScreen("library")}><ChevronLeft size={16}/> Back to question bank</button><div className="lite-practice-head"><div><div className="lite-eyebrow"><span/> PRACTICE SESSION</div><h1>{setItem.title}</h1><p>Question {questionIndex+1} of {totalQuestions}</p></div><div className="lite-question-progress"><span style={{width:`${((questionIndex+1)/Math.max(totalQuestions,1))*100}%`}}/></div></div>
        {question?<div className="lite-question-card"><div className="lite-question-label">QUESTION {questionIndex+1}</div><h2>{question.question}</h2><div className="lite-options">{question.options.map((option,i)=><button key={i} disabled={!!result} className={`lite-option ${answer===i?"selected":""} ${result&&i===result.correctIndex?"correct":result&&answer===i&&!result.correct?"incorrect":""}`} onClick={()=>setAnswer(i)}><span>{String.fromCharCode(65+i)}</span>{option}{result&&i===result.correctIndex&&<CheckCircle2 size={18}/>}</button>)}</div>
          {result?<div className={`lite-feedback ${result.correct?"is-correct":"is-incorrect"}`}><strong>{result.correct?"Correct. Well done.":"Not quite. Let's review."}</strong><p>{result.explanation||"Review the correct answer and continue practising."}</p><button className="lite-primary" onClick={nextQuestion}>{questionIndex+1<totalQuestions?"Next question":"Finish session"} <ArrowRight size={16}/></button></div>:<button className="lite-primary lite-submit" disabled={answer===null||saving} onClick={()=>void submitAnswer()}>{saving?"Checking…":"Check my answer"} <ArrowRight size={16}/></button>}
        </div>:<div className="lite-alert">This question is not available in the selected set.</div>}
      </section>}
      {profile&&screen==="progress"&&<section className="lite-content"><div className="lite-eyebrow"><span/> YOUR LEARNING RECORD</div><h1>Progress that matters.</h1><p className="lite-section-intro">Your practice history is recorded against the original OmpathStudy question sets.</p><div className="lite-library-summary"><div><Activity/><strong>{answeredCount}</strong><span>answers recorded this visit</span></div><div><CheckCircle2/><strong>{attempts.filter(a=>a.correct).length}</strong><span>correct answers this visit</span></div><div><GraduationCap/><strong>{profile.study_level}</strong><span>your study level</span></div></div><div className="lite-preferences"><div><div><strong>Daily learning SMS</strong><p>Choose whether you want to receive learning messages when the SMS service is configured.</p></div><label className="lite-switch"><input type="checkbox" checked={!!profile.sms_opt_in} onChange={e=>void changeSms(e.target.checked)} disabled={saving}/><span/></label></div><p className="lite-muted">You can unsubscribe at any time. SMS delivery depends on the service being enabled.</p></div><h2 className="lite-subject-title">Recent practice</h2>{attempts.length?<div className="lite-set-list">{attempts.map((a,i)=><div className="lite-set-row static" key={i}><span className={`lite-result-icon ${a.correct?"good":"bad"}`}>{a.correct?<CheckCircle2/>:<X/>}</span><span><strong>{a.title}</strong><small>{new Date(a.attempted_at).toLocaleString()}</small></span><b>{a.correct?"Correct":"Incorrect"}</b></div>)}</div>:<p className="lite-muted">Your answers will appear here after your first practice session.</p>}</section>}
      {profile&&screen==="help"&&<section className="lite-content"><div className="lite-eyebrow"><span/> SUPPORT</div><h1>How Lite works.</h1><div className="lite-help-grid"><article><Phone/><h3>Access by phone</h3><p>Register and study using the Africa's Talking USSD channel once its service code has been activated.</p></article><article><BookOpen/><h3>Use existing questions</h3><p>Lite reads published OmpathStudy MCQ sets. It does not create a second, conflicting question bank.</p></article><article><MessageSquare/><h3>SMS learning</h3><p>SMS preferences are stored with your learner profile. Delivery requires the SMS provider and daily schedule to be configured.</p></article><article><HelpCircle/><h3>Need more detail?</h3><p>Visit the full platform for notes, flashcards, past papers and additional learning tools.</p><a href="https://www.ompathstudy.com" target="_blank" rel="noreferrer">Open OmpathStudy <ArrowRight size={14}/></a></article></div></section>}
    </main>
    <footer className="lite-footer"><div className="lite-brand small"><span className="lite-brand-mark">O<span>+</span></span><span>OMPATH<span className="lite-brand-light">LITE</span><small>MEDICAL LEARNING, MADE ACCESSIBLE</small></span></div><p>A focused learning channel by OmpathStudy. Existing content, one shared source of truth.</p><a href="https://www.ompathstudy.com" target="_blank" rel="noreferrer">Full OmpathStudy <ArrowRight size={14}/></a><span>© {new Date().getFullYear()} OmpathStudy</span></footer>
    {showRegister&&<div className="lite-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowRegister(false)}}><section className="lite-modal" role="dialog" aria-modal="true" aria-labelledby="lite-register-title"><button className="lite-modal-close" onClick={()=>setShowRegister(false)} aria-label="Close"><X/></button><div className="lite-eyebrow"><span/> GET STARTED</div><h2 id="lite-register-title">Create your learner profile.</h2><p>Use the same phone number you will use for USSD learning.</p><label>Full name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" autoComplete="name"/></label><label>Mobile number<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+2547XXXXXXXX" autoComplete="tel"/></label><small className="lite-muted">Include your country code, e.g. +254 for Kenya.</small><label>Medical study year<select value={registerYear} onChange={e=>setRegisterYear(Number(e.target.value))}>{years.map(y=><option key={y} value={y}>Year {y}</option>)}</select></label><button className="lite-primary full" disabled={saving||name.trim().length<2||phone.replace(/\D/g,"").length<9} onClick={()=>void register()}>{saving?"Creating profile…":"Create learner profile"} <ArrowRight size={16}/></button><p className="lite-privacy"><ShieldCheck size={14}/> Your profile is used to save your learning progress and preferences.</p></section></div>}
  </div>;
}
