import { useEffect, useState } from "react";
import { GraduationCap, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { celebrate } from "@/lib/celebration";
import { setUniversity as rememberUniversity } from "@/lib/university";

export const UNIVERSITIES = ["Mount Kenya University", "University of Nairobi", "Kenyatta University", "Moi University", "JKUAT", "Makerere University", "University of Dar es Salaam", "University of Ghana", "University of Lagos", "University of Cape Town", "Other"];
export const COUNTRIES = ["Kenya", "Uganda", "Tanzania", "Rwanda", "Nigeria", "Ghana", "South Africa", "Ethiopia", "India", "Pakistan", "Nepal", "United Kingdom", "United States", "Other"];
export const COURSES = [
  "MBChB / MBBS / MD — Medicine & Surgery",
  "BDS — Dental Surgery",
  "Diploma — Dental Health / Community Oral Health",
  "BSc Nursing",
  "BSc Clinical Medicine",
  "BSc Pharmacy",
  "BSc Medical Laboratory Sciences",
  "BSc Public Health",
  "BSc Physiotherapy",
  "BSc Nutrition & Dietetics",
  "Other",
];

export default function LearnerProfileGate() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [name, setName] = useState("");
  const [university, setUniversity] = useState("");
  const [course, setCourse] = useState("MBChB / MBBS / MD — Medicine & Surgery");
  const [year, setYear] = useState("");
  const [otherUni, setOtherUni] = useState("");
  const [country, setCountry] = useState("");

  useEffect(() => {
    if (authLoading || !user || isAdmin) { setOpen(false); return; }
    let alive = true;
    setChecking(true);
    (supabase as any).from("profiles").select("display_name,university,course,study_year,onboarding_completed").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        setName(data?.display_name || String(user.user_metadata?.full_name || ""));
        setUniversity((data as any)?.university || "");
        setCourse((data as any)?.course || "MBChB / MBBS / MD — Medicine & Surgery");
        setYear((data as any)?.study_year ? String((data as any).study_year) : "");
        const snoozed = Date.now() - Number(localStorage.getItem("ompath_profile_gate_snoozed_at") || 0) < 86400000;
        setOpen(!(data as any)?.onboarding_completed && !snoozed);
      })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [user, isAdmin, authLoading]);

  if (!user || isAdmin || authLoading || checking || !open) return null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const uniName = university === "Other" ? otherUni.trim() : university;
    if (!name.trim() || !uniName || !course || !year) return;
    setSaving(true);
    const { error } = await (supabase as any).from("profiles").upsert({
      user_id: user.id,
      display_name: name.trim(),
      university: uniName,
      course,
      study_year: Number(year),
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "user_id" });
    setSaving(false);
    if (!error) { void rememberUniversity(uniName, !UNIVERSITIES.includes(uniName)); if (country) void supabase.auth.updateUser({ data: { country } }).catch(() => undefined); }
    if (error) { toast({ title: "Profile was not saved", description: error.message, variant: "destructive" }); return; }
    celebrate();
    setCelebrating(true);
    toast({ title: "Study profile ready", description: "Recommendations will now follow your course and year." });
    setTimeout(() => { setOpen(false); setCelebrating(false); }, 1100);
  };

  return <div className="fixed inset-0 z-[200] grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
    {celebrating ? (
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 rounded-3xl border border-border bg-card p-8 text-center shadow-2xl duration-300">
        <div className="mx-auto flex h-16 w-16 animate-in zoom-in spin-in-6 items-center justify-center rounded-full bg-primary/10 text-primary duration-500">
          <Sparkles className="h-8 w-8" />
        </div>
        <h2 className="mt-4 font-serif text-xl font-bold text-foreground">You're all set, {name.trim().split(" ")[0]}!</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">Personalising your revision now…</p>
      </div>
    ) : (
    <form onSubmit={save} className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-8">
      <button type="button" aria-label="Close" onClick={() => { localStorage.setItem("ompath_profile_gate_snoozed_at", String(Date.now())); setOpen(false); }} className="float-right -mr-2 -mt-2 h-10 w-10 rounded-full text-xl text-muted-foreground hover:bg-muted">×</button>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><GraduationCap /></div>
      <h1 className="mt-4 font-serif text-2xl font-bold">Tell us what you study</h1>
      <p className="mt-2 text-sm text-muted-foreground">This lets OmpathStudy identify untouched units and recommend topics from answers you miss.</p>
      <label className="mt-5 block text-sm font-semibold" htmlFor="profile-name">Your name</label>
      <Input id="profile-name" value={name} onChange={e => setName(e.target.value)} required className="mt-1" />
      <label className="mt-4 block text-sm font-semibold" htmlFor="profile-university">University</label>
      <select id="profile-university" value={university} onChange={e => setUniversity(e.target.value)} required className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3">
        <option value="">Select university</option>{UNIVERSITIES.map(x => <option key={x}>{x}</option>)}
      </select>
{university === "Other" && <Input value={otherUni} onChange={e => setOtherUni(e.target.value)} placeholder="Type your university" aria-label="Your university" required className="mt-2" />}      <label className="mt-4 block text-sm font-semibold" htmlFor="profile-country">Country</label>      <select id="profile-country" value={country} onChange={e => setCountry(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3">        <option value="">Select country (optional)</option>{COUNTRIES.map(x => <option key={x}>{x}</option>)}      </select>
      <label className="mt-4 block text-sm font-semibold" htmlFor="profile-course">Course</label>
      <select id="profile-course" value={course} onChange={e => setCourse(e.target.value)} required className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3">
        <option value="">Select course</option>{COURSES.map(x => <option key={x}>{x}</option>)}
      </select>
      <label className="mt-4 block text-sm font-semibold" htmlFor="profile-year">Current year</label>
      <select id="profile-year" value={year} onChange={e => setYear(e.target.value)} required className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3">
        <option value="">Select year</option>{[1,2,3,4,5,6].map(x => <option key={x} value={x}>Year {x}</option>)}
      </select>
      <Button type="submit" disabled={saving} className="mt-6 min-h-11 w-full">{saving ? <Loader2 className="animate-spin" /> : "Start personalised revision"}</Button>
      <button type="button" onClick={() => { localStorage.setItem("ompath_profile_gate_snoozed_at", String(Date.now())); setOpen(false); }} className="mt-3 min-h-10 w-full text-sm font-semibold text-muted-foreground hover:text-foreground">Skip for now — remind me later</button>
    </form>
    )}
  </div>;
}
