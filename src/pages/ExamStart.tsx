import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Clock, Loader2, Shield, Trophy, GraduationCap, BookOpen, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import ExamMode from "@/components/ExamMode";
import { Helmet } from "react-helmet-async";
import { extractIdFromParam, getSetting } from "@/lib/store";
import StudyControls from "@/components/StudyControls";
import HelpfulVote from "@/components/HelpfulVote";
import { sanitizeMcqQuestions } from "@/lib/mcq-normalization";
import { isPublicMcqSet } from "@/lib/content-policy";
import { isWeekly, shortTitle, weeklyDate } from "@/lib/examMeta";
import { shuffleOptions } from "@/lib/mcqSet";
import { useAuth } from "@/hooks/useAuth";

interface ExamSet {
  id: string;
  title: string;
  category: string;
  questions: { question: string; options: string[]; correct_answer: number; explanation?: string }[];
}

interface StudentInfo {
  name: string;
  university: string;
  course: string;
}

export function cleanExamQuestions(raw: unknown): ExamSet["questions"] {
  return sanitizeMcqQuestions(raw) as ExamSet["questions"];
}

const UNLOCKED_KEY = "unlocked_exams";
const STUDENT_CREDS_KEY = "student_credentials";
const EXAM_FREE_LIMIT = 15;

// ── credential helpers ───────────────────────────────────────
function loadCreds(): StudentInfo | null {
  try {
    const raw = localStorage.getItem(STUDENT_CREDS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveCreds(info: StudentInfo) {
  try { localStorage.setItem(STUDENT_CREDS_KEY, JSON.stringify(info)); } catch { /* quota */ }
}

// ── base lists ───────────────────────────────────────────────
const BASE_UNIVERSITIES = [
  "Africa Nazarene University",
  "Daystar University",
  "Dedan Kimathi University",
  "Egerton University",
  "Jomo Kenyatta University of Agriculture and Technology",
  "KCA University",
  "Kabarak University",
  "Kenya Methodist University",
  "Kenyatta University",
  "Maseno University",
  "Masinde Muliro University",
  "Moi University",
  "Strathmore University",
  "Technical University of Kenya",
  "United States International University",
  "University of Nairobi",
];

const BASE_COURSES = [
  "Biomedical Science",
  "Clinical Medicine",
  "Dental Surgery (BDS)",
  "Health Records & Information Management",
  "Medical Laboratory Science",
  "Medicine (MBChB)",
  "Nursing",
  "Nutrition and Dietetics",
  "Pharmacy (B.Pharm)",
  "Physiotherapy",
  "Public Health",
];

function sampleExam(): ExamSet {
  return {
    id: "sample-exam",
    title: "Sample Pathology Exam",
    category: "Pathology",
    questions: [
      {
        question: "Which process is the hallmark of acute inflammation in early tissue injury?",
        options: ["Fibrosis", "Neutrophil recruitment", "Granuloma formation", "Metaplasia"],
        correct_answer: 1,
        explanation: "Acute inflammation is dominated by vascular changes and neutrophil migration.",
      },
      {
        question: "A classic Reed-Sternberg cell is most associated with which disease?",
        options: ["Burkitt lymphoma", "Hodgkin lymphoma", "Multiple myeloma", "AML"],
        correct_answer: 1,
        explanation: "Reed-Sternberg cells are pathognomonic for Hodgkin lymphoma.",
      },
    ],
  };
}

export default function ExamStart() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Param can be a slug, "<uuid>-<slug>", or raw UUID. We resolve later.
  const rawParam = id ? decodeURIComponent(id) : null;
  const directId = extractIdFromParam(rawParam || undefined);
  const isSampleParam = rawParam === "sample-exam";
  const [exam, setExam] = useState<ExamSet | null>(null);
  const [examId, setExamId] = useState<string | null>(directId || (isSampleParam ? "sample-exam" : null));
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [editing, setEditing] = useState(false);

  // Pre-fill from saved credentials
  const [studentInfo, setStudentInfo] = useState<StudentInfo>(() => {
    return loadCreds() ?? { name: "", university: "", course: "" };
  });
  const wasRestored = useMemo(() => {
    const c = loadCreds();
    return !!(c?.name || c?.university || c?.course);
  }, []);

  // Approved custom institutions from DB
  const [extraUniversities, setExtraUniversities] = useState<string[]>([]);
  const [extraCourses, setExtraCourses] = useState<string[]>([]);

  // "Add new" UI
  const [addingUni, setAddingUni] = useState(false);
  const [addingCourse, setAddingCourse] = useState(false);
  const [customUniInput, setCustomUniInput] = useState("");
  const [customCourseInput, setCustomCourseInput] = useState("");
  const [submittingUni, setSubmittingUni] = useState(false);
  const [submittingCourse, setSubmittingCourse] = useState(false);

  // Payment state — exam is free to start; paywall triggers at Q15 inside ExamMode
  const [examPrice, setExamPrice] = useState(5);
  const [isPaid, setIsPaid] = useState(true);
  const [phoneInput, setPhoneInput] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "pending" | "completed" | "failed">("idle");

  // Load price + restore unlock status
  useEffect(() => {
    getSetting("exam_price").then((p) => {
      if (p && !isNaN(Number(p))) setExamPrice(Number(p));
    });
  }, []);
  useEffect(() => {
    if (!examId) return;
    try {
      const raw = localStorage.getItem(UNLOCKED_KEY);
      const set = new Set<string>(raw ? JSON.parse(raw) : []);
      if (set.has(examId)) setIsPaid(true);
    } catch { /* corrupt/unavailable storage — treat as not unlocked */ }
  }, [examId]);

  const persistUnlocked = (id: string) => {
    try {
      const raw = localStorage.getItem(UNLOCKED_KEY);
      const set = new Set<string>(raw ? JSON.parse(raw) : []);
      set.add(id);
      localStorage.setItem(UNLOCKED_KEY, JSON.stringify([...set]));
    } catch { /* quota */ }
  };

  const pollPayment = (txnId: string) => {
    let attempts = 0;
    const pollId = setInterval(async () => {
      attempts++;
      if (attempts > 60) { clearInterval(pollId); setPaymentStatus("failed"); return; }
      try {
        const { data: result, error } = await supabase.functions.invoke("check-payment", {
          body: { transaction_id: txnId },
        });
        if (error) return;
        if (result.status === "completed") {
          clearInterval(pollId);
          setPaymentStatus("completed");
          setIsPaid(true);
          if (examId) persistUnlocked(examId);
        } else if (result.status === "failed") {
          clearInterval(pollId);
          setPaymentStatus("failed");
        }
      } catch { /* transient network error — the interval will retry */ }
    }, 2000);
  };

  const handlePay = async () => {
    const phone = phoneInput.trim();
    if (!phone || !examId) return;
    setPaymentStatus("pending");
    try {
      const { data, error } = await supabase.functions.invoke("initiate-payment", {
        body: { phone, amount: examPrice, package_type: `exam:${examId}` },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Payment failed");
      pollPayment(data.transaction_id);
    } catch {
      setPaymentStatus("failed");
    }
  };

  // Load exam
  useEffect(() => {
    const run = async () => {
      if (!rawParam) { navigate("/exams"); return; }
      // Resolve by id first, then by slug
      let resolvedId = directId;
      let data: Pick<Tables<"mcq_sets">, "id" | "title" | "category" | "questions"> | null = null;
      if (isSampleParam) { setExam(sampleExam()); setExamId("sample-exam"); setLoading(false); return; }
      if (resolvedId) {
        const r = await supabase
          .from("mcq_sets")
          .select("id, title, category, questions")
          .eq("id", resolvedId)
          .eq("published", true)
          .maybeSingle();
        data = r.data;
      } else {
        const r = await supabase
          .from("mcq_sets")
          .select("id, title, category, questions")
          .eq("slug", rawParam)
          .eq("published", true)
          .maybeSingle();
        data = r.data;
        resolvedId = data?.id || null;
        // Public links use the clean slug (no id suffix), but the stored slug is "<clean slug>-<id prefix>"
        if (!data) {
          const alt = await supabase
            .from("mcq_sets")
            .select("id, title, category, questions, slug")
            .ilike("slug", `${rawParam.replace(/[%_]/g, "")}-%`)
            .eq("published", true)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(5);
          const hit = (alt.data || []).find((row) => /^[0-9a-f]{6,12}$/i.test(String(row.slug).slice(rawParam.length + 1)));
          if (hit) { data = hit; resolvedId = hit.id; }
        }
        // Legacy links are "<title-slug>-<first 6 chars of id>"; match on the id prefix.
        const shortId = !data ? rawParam.match(/-([0-9a-f]{6})$/i)?.[1]?.toLowerCase() : undefined;
        if (shortId) {
          const { data: candidates } = await supabase
            .from("mcq_sets")
            .select("id")
            .eq("published", true)
            .ilike("title", "%exam%");
          const match = candidates?.find((c) => c.id.toLowerCase().startsWith(shortId));
          if (match) {
            const full = await supabase
              .from("mcq_sets")
              .select("id, title, category, questions")
              .eq("id", match.id)
              .maybeSingle();
            data = full.data;
            resolvedId = data?.id || null;
          }
        }
      }
      if (!resolvedId || !data || !isPublicMcqSet(data)) { navigate("/exams", { replace: true }); return; }
      const questions = shuffleOptions(cleanExamQuestions(data.questions), resolvedId);
      if (!questions.length) { navigate("/exams", { replace: true }); return; }
      setExamId(resolvedId);
      setExam({ ...(data as unknown as ExamSet), questions });
      setLoading(false);
    };
    run();
  }, [rawParam, directId, isSampleParam, navigate]);

  // Load approved custom institutions from DB
  useEffect(() => {
    supabase
      .from("pending_institutions")
      .select("type, value")
      .eq("status", "approved")
      .then(({ data }) => {
        if (data) {
          setExtraUniversities(data.filter((d) => d.type === "university").map((d) => d.value));
          setExtraCourses(data.filter((d) => d.type === "course").map((d) => d.value));
        }
      });
  }, []);

  // a signed-in learner's profile fills the form the first time
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    (supabase as any).from("profiles").select("display_name,university,course").eq("user_id", user.id).maybeSingle().then(({ data }: { data: { display_name?: string; university?: string; course?: string } | null }) => {
      if (!data) return;
      setStudentInfo((prev) => ({ name: data.display_name || prev.name || "", university: data.university || prev.university || "", course: data.course || prev.course || "" }));
    });
  }, [user]);

  const allUniversities = useMemo(
    () => [...new Set([...BASE_UNIVERSITIES, ...extraUniversities])].sort(),
    [extraUniversities]
  );
  const allCourses = useMemo(
    () => [...new Set([...BASE_COURSES, ...extraCourses])].sort(),
    [extraCourses]
  );

  const unitName = useMemo(() => {
    if (!exam) return "General";
    const c = exam.category?.replace(/^Weekly Exam\s*:?\s*/i, "").trim();
    return c && c !== "Weekly Exam" ? c : "General";
  }, [exam]);

  const totalMinutes = useMemo(() => (exam ? exam.questions.length : 60), [exam]);

  // Update a field and immediately persist credentials
  const updateField = (field: keyof StudentInfo, value: string) => {
    setStudentInfo((prev) => {
      const updated = { ...prev, [field]: value };
      saveCreds(updated); // save on every change
      return updated;
    });
  };

  // Submit custom university
  const handleSubmitCustomUni = async () => {
    const val = customUniInput.trim();
    if (!val) return;
    setSubmittingUni(true);
    try {
      await supabase.from("pending_institutions").upsert(
        { type: "university", value: val, submitted_by: studentInfo.name || "Anonymous", status: "pending" },
        { onConflict: "type,value", ignoreDuplicates: true }
      );
      updateField("university", val);
      setAddingUni(false);
      setCustomUniInput("");
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingUni(false);
    }
  };

  // Submit custom course
  const handleSubmitCustomCourse = async () => {
    const val = customCourseInput.trim();
    if (!val) return;
    setSubmittingCourse(true);
    try {
      await supabase.from("pending_institutions").upsert(
        { type: "course", value: val, submitted_by: studentInfo.name || "Anonymous", status: "pending" },
        { onConflict: "type,value", ignoreDuplicates: true }
      );
      updateField("course", val);
      setAddingCourse(false);
      setCustomCourseInput("");
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingCourse(false);
    }
  };

  const handleStartExam = () => {
    if (!studentInfo.name.trim() || !studentInfo.university || !studentInfo.course) return;
    saveCreds(studentInfo); // ensure saved before entering exam
    setStarted(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!exam) return null;

  const ogUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${location.pathname}${location.search}`
      : location.pathname;
  const title = `${exam.title} | Start Exam | OmpathStudy Kenya`;
  const description =
    "Start a timed MCQ exam on OmpathStudy for Kenyan medical and health students. Register your details and take a proctored unit-based exam.";
  const keywords =
    "OmpathStudy, start exam, medical exams Kenya, nursing exams Kenya, timed MCQ, proctored exam, exam rules, medical education Kenya";

  if (started) {
    return (
      <>
        <Helmet>
          <title>{title}</title>
          <meta name="description" content={description} />
          <meta name="keywords" content={keywords} />
          <meta name="robots" content="noindex,follow" />
          <meta property="og:title" content={title} />
          <meta property="og:description" content={description} />
          <meta property="og:type" content="website" />
          <meta property="og:url" content={ogUrl} />
          <meta name="twitter:card" content="summary" />
          <meta name="twitter:title" content={title} />
          <meta name="twitter:description" content={description} />
        </Helmet>
        <ExamMode
          questions={exam.questions}
          title={exam.title}
          setId={exam.id === "sample-exam" ? undefined : exam.id}
          timeLimitMinutes={totalMinutes}
          studentInfo={studentInfo}
          unitName={unitName}
          onExit={() => setStarted(false)}
          freeLimit={exam.id === "sample-exam" ? 0 : EXAM_FREE_LIMIT}
          examPrice={examPrice}
          isPaid={true}
          paymentStatus={paymentStatus}
          phoneInput={phoneInput}
          onPhoneChange={setPhoneInput}
          onPay={handlePay}
          onRetryPay={() => setPaymentStatus("idle")}
        />
      </>
    );
  }

  let previous: number | null = null, resuming = false;
  try {
    const r = JSON.parse(localStorage.getItem(`exam_result_${exam.id}`) || "null");
    if (r && Number(r.total)) previous = Math.round((Number(r.score) / Number(r.total)) * 100);
    resuming = !!localStorage.getItem(`exam_session_${exam.id}`);
  } catch { /* storage blocked */ }
  const weekly = isWeekly(exam.title, exam.category);
  const dateTxt = weekly ? weeklyDate(exam.title) : null;
  const fieldCls = "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";
  const ready = !!studentInfo.name.trim() && !!studentInfo.university && !!studentInfo.course;
  const rules: [typeof Clock, string][] = [
    [Clock, `${totalMinutes} minutes, one minute a question. The exam submits itself when time runs out.`],
    [Shield, "Stay on this page. Switching tabs submits the exam."],
    [Check, "Answer in any order, flag questions to revisit, and review before you submit."],
    [Trophy, "You get your score and every answer with its explanation straight after."],
  ];

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="keywords" content={keywords} />
          <meta name="robots" content="noindex,follow" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={ogUrl} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
      </Helmet>

      <section className="relative overflow-hidden bg-[#0b2545] text-white">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
        <div className="relative mx-auto max-w-5xl px-4 pb-10 pt-6 sm:pb-14">
          <Link to="/exams" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/70 hover:text-white"><ArrowLeft className="h-4 w-4" aria-hidden /> Exam Center</Link>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
            <span className="rounded-full bg-emerald-400/20 px-2.5 py-1 text-emerald-200">{weekly ? `Weekly exam${dateTxt ? ` · ${dateTxt}` : ""}` : "Timed exam"}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/80">{unitName}</span>
          </div>
          <h1 className="mt-3 max-w-3xl font-serif text-3xl font-bold leading-tight sm:text-5xl">{shortTitle(exam.title, exam.category)}</h1>
          <div className="mt-6 flex flex-wrap gap-3">
            {[[exam.questions.length, "questions"], [totalMinutes, "minutes"], [4, "options each"]].map(([n, l]) => (
              <div key={String(l)} className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 backdrop-blur"><p className="text-2xl font-bold tabular-nums">{n}</p><p className="text-[11px] font-semibold uppercase tracking-wider text-white/65">{l}</p></div>
            ))}
            {previous && <div className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 backdrop-blur"><p className="text-2xl font-bold tabular-nums">{previous}%</p><p className="text-[11px] font-semibold uppercase tracking-wider text-white/65">your last score</p></div>}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div className="rounded-3xl border border-border bg-card p-6">
            <h2 className="flex items-center gap-2 font-serif text-xl font-bold"><Shield className="h-5 w-5 text-primary" aria-hidden /> Before you begin</h2>
            <ul className="mt-4 space-y-3">
              {rules.map(([Icon, text]) => <li key={text} className="flex items-start gap-3 text-[15px] leading-snug text-muted-foreground"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="h-4 w-4" aria-hidden /></span><span className="pt-1">{text}</span></li>)}
            </ul>
            <p className="mt-4 rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">Charge your device and find a quiet spot. Copying and right-click are switched off during the exam.</p>
          </div>
          {exam.id !== "sample-exam" && <StudyControls resourceType="exam" resourceId={exam.id} title={exam.title} />}
          {exam.id !== "sample-exam" && <HelpfulVote resourceType="exam" resourceId={exam.id} />}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-serif text-xl font-bold"><GraduationCap className="h-5 w-5 text-primary" aria-hidden /> Your details</h2>
            <p className="mt-1 text-sm text-muted-foreground">{user && ready ? "Taken from your sign-up profile." : wasRestored ? "Saved from your last exam. Change anything that is out of date." : "Shown with your result. Saved on this device for next time."}</p>
            {user && ready && !editing ? (
              <div className="mt-5 rounded-2xl border border-border bg-muted/40 p-4">
                <p className="text-sm font-bold">{studentInfo.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{studentInfo.university}</p>
                <p className="text-sm text-muted-foreground">{studentInfo.course}</p>
                <button type="button" onClick={() => setEditing(true)} className="mt-3 text-sm font-bold text-primary hover:underline">Not you, or out of date? Edit</button>
              </div>
            ) : (
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-semibold">Full name
                <input className={`${fieldCls} mt-1.5 font-normal`} placeholder="As it should appear on your result" value={studentInfo.name} onChange={(e) => updateField("name", e.target.value)} autoComplete="name" />
              </label>
              <div>
                <label className="block text-sm font-semibold" htmlFor="exam-uni">University</label>
                {!addingUni ? (
                  <select id="exam-uni" value={studentInfo.university} onChange={(e) => (e.target.value === "__add__" ? setAddingUni(true) : updateField("university", e.target.value))} className={`${fieldCls} mt-1.5 font-normal`}>
                    <option value="">Select your university</option>
                    {allUniversities.map((u) => <option key={u} value={u}>{u}</option>)}
                    {studentInfo.university && !allUniversities.includes(studentInfo.university) && <option value={studentInfo.university}>{studentInfo.university}</option>}
                    <option value="__add__">+ Not listed</option>
                  </select>
                ) : (
                  <div className="mt-1.5 space-y-2">
                    <input className={fieldCls} placeholder="Type your university" value={customUniInput} onChange={(e) => setCustomUniInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSubmitCustomUni(); }} autoFocus />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSubmitCustomUni} disabled={!customUniInput.trim() || submittingUni} className="gap-1">{submittingUni ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Use this</Button>
                      <Button size="sm" variant="outline" onClick={() => { setAddingUni(false); setCustomUniInput(""); }}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold" htmlFor="exam-course">Course</label>
                {!addingCourse ? (
                  <select id="exam-course" value={studentInfo.course} onChange={(e) => (e.target.value === "__add__" ? setAddingCourse(true) : updateField("course", e.target.value))} className={`${fieldCls} mt-1.5 font-normal`}>
                    <option value="">Select your course</option>
                    {allCourses.map((c) => <option key={c} value={c}>{c}</option>)}
                    {studentInfo.course && !allCourses.includes(studentInfo.course) && <option value={studentInfo.course}>{studentInfo.course}</option>}
                    <option value="__add__">+ Not listed</option>
                  </select>
                ) : (
                  <div className="mt-1.5 space-y-2">
                    <input className={fieldCls} placeholder="Type your course" value={customCourseInput} onChange={(e) => setCustomCourseInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSubmitCustomCourse(); }} autoFocus />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSubmitCustomCourse} disabled={!customCourseInput.trim() || submittingCourse} className="gap-1">{submittingCourse ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Use this</Button>
                      <Button size="sm" variant="outline" onClick={() => { setAddingCourse(false); setCustomCourseInput(""); }}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            )}
            <button type="button" onClick={handleStartExam} disabled={!ready} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-bold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none">
              <BookOpen className="h-5 w-5" aria-hidden /> {resuming ? "Resume exam" : "Start exam"}
            </button>
            <p className="mt-3 text-center text-xs text-muted-foreground">{ready ? `${exam.questions.length} questions · ${totalMinutes} minutes` : "Fill in the three fields to begin."}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
