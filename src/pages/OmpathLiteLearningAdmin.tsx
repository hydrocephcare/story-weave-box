import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, Clock3, Gift, Loader2, RefreshCw, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Student = { id:string; full_name:string; phone_number:string; study_level:string; sms_opt_in:boolean; parent_phone?:string|null; school_name?:string|null };
type Dashboard = { students:Student[]; attempts:{student_id:string;is_correct:boolean;attempted_at:string}[]; attendance:{id:string;student_id:string;attendance_date:string;status:string}[]; announcements:{id:string;title:string;body:string;status:string;created_at:string}[]; rewards:{id:string;student_id:string;amount:number;currency:string;reason:string;status:string;created_at:string}[] };

export default function OmpathLiteLearningAdmin() {
  const { session } = useAuth();
  const [data,setData]=useState<Dashboard|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [title,setTitle]=useState("");
  const [body,setBody]=useState("");
  const [audience,setAudience]=useState("");
  const [includeParents,setIncludeParents]=useState(false);
  const [selectedStudent,setSelectedStudent]=useState("");
  const [attendanceStatus,setAttendanceStatus]=useState("present");
  const [rewardAmount,setRewardAmount]=useState("20");
  const [rewardReason,setRewardReason]=useState("Quiz performance reward");

  const request=async(action:string,payload:Record<string,unknown>={})=>{
    const response=await fetch("/api/ompath-lite-learning",{method:"POST",headers:{Authorization:"Bearer "+session?.access_token,"Content-Type":"application/json"},body:JSON.stringify({action,...payload})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||"Request failed.");
    return result;
  };
  const refresh=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      if(!session?.access_token)throw new Error("Administrator sign-in is required.");
      const result=await request("teacher_dashboard");
      setData(result);
      if(!selectedStudent&&result.students?.[0])setSelectedStudent(result.students[0].id);
    }catch(e){setError(e instanceof Error?e.message:"Could not load the Lite dashboard.");}
    finally{setLoading(false);}
  },[session?.access_token]);
  useEffect(()=>{void refresh();},[refresh]);

  const createAnnouncement=async()=>{
    setSaving(true);setError("");setNotice("");
    try{await request("admin_action",{action:"create_announcement",title,body,audience_study_level:audience,include_parents:includeParents});setTitle("");setBody("");setNotice("Announcement saved as a draft. It has not been sent.");await refresh();}
    catch(e){setError(e instanceof Error?e.message:"Could not save announcement.");}
    finally{setSaving(false);}
  };
  const markAttendance=async()=>{
    if(!selectedStudent)return;
    setSaving(true);setError("");setNotice("");
    try{await request("admin_action",{action:"mark_attendance",student_id:selectedStudent,status:attendanceStatus});setNotice("Attendance recorded.");await refresh();}
    catch(e){setError(e instanceof Error?e.message:"Could not record attendance.");}
    finally{setSaving(false);}
  };
  const createReward=async()=>{
    if(!selectedStudent)return;
    setSaving(true);setError("");setNotice("");
    try{await request("admin_action",{action:"create_airtime_reward",student_id:selectedStudent,amount:Number(rewardAmount),reason:rewardReason});setNotice("Airtime reward request recorded as pending. No airtime was sent.");await refresh();}
    catch(e){setError(e instanceof Error?e.message:"Could not record reward.");}
    finally{setSaving(false);}
  };
  const sendReward=async(rewardId:string)=>{
    setSaving(true);setError("");setNotice("");
    try{await request("admin_action",{action:"send_airtime_reward",reward_id:rewardId});setNotice("Airtime request accepted by Africa's Talking.");await refresh();}
    catch(e){setError(e instanceof Error?e.message:"Airtime could not be sent.");}
    finally{setSaving(false);}
  };

  const total=data?.attempts.length||0;
  const correct=data?.attempts.filter(x=>x.is_correct).length||0;
  return <div className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">OmpathStudy Lite · EdTech</p><h1 className="mt-1 font-serif text-3xl font-bold">Learner operations</h1><p className="mt-2 text-sm text-muted-foreground">Manage learner activity, announcements, attendance and rewards.</p></div>
      <button onClick={()=>void refresh()} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm"><RefreshCw size={16}/> Refresh</button>
    </div>
    {error&&<div role="alert" className="mb-5 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"><AlertTriangle className="mr-2 inline" size={16}/>{error}</div>}
    {notice&&<div role="status" className="mb-5 rounded-xl border border-border bg-muted/40 p-4 text-sm">{notice}</div>}
    {loading?<div className="flex min-h-48 items-center justify-center gap-3 text-muted-foreground"><Loader2 className="animate-spin" size={20}/> Loading learner operations…</div>:data&&<>
      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[{label:"Registered learners",value:data.students.length,icon:Users},{label:"Questions attempted",value:total,icon:CheckCircle2},{label:"Correct answers",value:correct,icon:CheckCircle2},{label:"Accuracy",value:total?Math.round(correct/total*100)+"%":"—",icon:Clock3}].map(x=><div key={x.label} className="rounded-2xl border bg-card p-4"><div className="flex items-center justify-between text-muted-foreground"><span className="text-xs">{x.label}</span><x.icon size={16}/></div><p className="mt-3 text-3xl font-bold tabular-nums">{x.value}</p></div>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5">
          <div className="mb-4 flex items-center gap-2"><Bell size={18}/><h2 className="font-semibold">School announcement</h2></div>
          <label className="mb-3 block text-sm">Title<input className="mt-1 w-full rounded-lg border bg-background px-3 py-2" value={title} onChange={e=>setTitle(e.target.value)} maxLength={140}/></label>
          <label className="mb-3 block text-sm">Message<textarea className="mt-1 w-full rounded-lg border bg-background px-3 py-2" rows={4} value={body} onChange={e=>setBody(e.target.value)} maxLength={1200}/></label>
          <label className="mb-3 block text-sm">Target study year<select className="mt-1 w-full rounded-lg border bg-background px-3 py-2" value={audience} onChange={e=>setAudience(e.target.value)}><option value="">All learners</option>{[1,2,3,4,5,6].map(n=><option key={n} value={"Year "+n}>Year {n}</option>)}</select></label>
          <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={includeParents} onChange={e=>setIncludeParents(e.target.checked)}/> Include parent / guardian contacts who opted in</label>
          <button disabled={saving||title.trim().length<3||body.trim().length<3} onClick={()=>void createAnnouncement()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save announcement draft</button>
          <p className="mt-3 text-xs text-muted-foreground">Drafts are saved in Supabase. SMS delivery is not enabled until Africa’s Talking credentials are configured.</p>
        </section>
        <section className="rounded-2xl border bg-card p-5">
          <div className="mb-4 flex items-center gap-2"><CheckCircle2 size={18}/><h2 className="font-semibold">Attendance and learner rewards</h2></div>
          <label className="mb-3 block text-sm">Learner<select className="mt-1 w-full rounded-lg border bg-background px-3 py-2" value={selectedStudent} onChange={e=>setSelectedStudent(e.target.value)}><option value="">Select learner</option>{data.students.map(s=><option key={s.id} value={s.id}>{s.full_name} · {s.study_level}</option>)}</select></label>
          <div className="mb-5 flex gap-2"><select className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm" value={attendanceStatus} onChange={e=>setAttendanceStatus(e.target.value)}><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option></select><button disabled={saving||!selectedStudent} onClick={()=>void markAttendance()} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">Record attendance</button></div>
          <div className="mb-2 flex items-center gap-2"><Gift size={17}/><strong className="text-sm">Airtime reward request</strong></div>
          <div className="grid grid-cols-2 gap-2"><input className="rounded-lg border bg-background px-3 py-2 text-sm" value={rewardAmount} onChange={e=>setRewardAmount(e.target.value)} inputMode="decimal" placeholder="Amount (KES)"/><input className="rounded-lg border bg-background px-3 py-2 text-sm" value={rewardReason} onChange={e=>setRewardReason(e.target.value)} placeholder="Reason"/></div>
          <button disabled={saving||!selectedStudent} onClick={()=>void createReward()} className="mt-3 rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Create pending reward</button>
          <p className="mt-3 text-xs text-muted-foreground">Rewards are recorded for approval. Airtime is not sent automatically.</p>
        </section>
      </div>
      <section className="mt-6 overflow-hidden rounded-2xl border bg-card">
        <div className="border-b p-4"><h2 className="font-semibold">Registered learners</h2><p className="mt-1 text-xs text-muted-foreground">Learner phone numbers are visible only to authorised administrators.</p></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="p-3">Learner</th><th className="p-3">Study year</th><th className="p-3">School</th><th className="p-3">Learning SMS</th></tr></thead><tbody>{data.students.map(s=><tr key={s.id} className="border-t"><td className="p-3"><strong>{s.full_name}</strong><div className="text-xs text-muted-foreground">{s.phone_number}</div></td><td className="p-3">{s.study_level}</td><td className="p-3">{s.school_name||"—"}</td><td className="p-3">{s.sms_opt_in?"Opted in":"Off"}</td></tr>)}</tbody></table></div>
        {!data.students.length&&<p className="p-5 text-sm text-muted-foreground">No learners have registered yet.</p>}
      </section>
      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5"><h2 className="font-semibold">Recent announcements</h2>{data.announcements.slice(0,8).map(a=><div key={a.id} className="border-b py-3 last:border-0"><div className="flex items-center justify-between gap-2"><strong className="text-sm">{a.title}</strong><span className="text-xs text-muted-foreground">{a.status}</span></div><p className="mt-1 text-xs text-muted-foreground">{a.body}</p></div>)}{!data.announcements.length&&<p className="mt-3 text-sm text-muted-foreground">No announcements yet.</p>}</div>
        <div className="rounded-2xl border bg-card p-5"><h2 className="font-semibold">Airtime reward requests</h2>{data.rewards.slice(0,8).map(r=><div key={r.id} className="flex items-start justify-between gap-3 border-b py-3 last:border-0"><span><strong className="text-sm">{r.amount} {r.currency}</strong><small className="block text-xs text-muted-foreground">{r.reason}</small></span><span className="flex flex-col items-end gap-2"><small className="text-xs text-muted-foreground">{r.status}</small>{r.status==="pending"&&<button disabled={saving} onClick={()=>void sendReward(r.id)} className="rounded-md border px-2 py-1 text-xs font-semibold disabled:opacity-50">Approve &amp; send</button>}</span></div>)}{!data.rewards.length&&<p className="mt-3 text-sm text-muted-foreground">No reward requests yet.</p>}<p className="mt-3 text-xs text-muted-foreground">Sending requires AT_AIRTIME_ENABLED=true and an active Africa's Talking API key. Each send is an explicit administrator action.</p></div>
      </section>
    </>}
  </div>;
}
