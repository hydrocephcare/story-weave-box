import { useEffect, useMemo, useState } from "react";
import LoadMoreButton from "@/components/LoadMoreButton";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle, Clock, Loader2, Phone, Shield, Sparkles, Trophy, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getSetting, getCategoryDisplayName, getYearFromCategory, buildExamPath } from "@/lib/store";
import { updateMetaTags } from "@/lib/seo";
import { dedupeResourceSummaries, isPublicMcqSet } from "@/lib/content-policy";
import ContentCredit from "@/components/ContentCredit";

interface ExamSet {
  id: string;
  title: string;
  category: string;
  created_at: string;
  slug?: string | null;
}

const UNLOCKED_KEY = "unlocked_exams";

function inferUnit(exam: ExamSet): string {
  const fromCategory = exam.category?.replace(/^Weekly Exam\s*:?\s*/i, "").trim();
  if (fromCategory && fromCategory !== "Weekly Exam") return getCategoryDisplayName(fromCategory);

  const titleMatch = exam.title.match(/Weekly\s+(.+?)\s+Exam/i);
  if (titleMatch?.[1]) return titleMatch[1].trim();

  return "General";
}

const isExamSet = (e: { title: string; category: string }) => /exam/i.test(e.title) || /^weekly exam/i.test(e.category || "");

/** One page, two lists: /exams holds the timed exams, /mcqs holds the practice question banks (every other published question set). */
export default function Exams({ mode = "exam" }: { mode?: "exam" | "mcq" }) {
  const mcqMode = mode === "mcq";
  useEffect(() => {
    updateMetaTags(mcqMode
      ? { title: "MCQ Question Banks", description: "Practice multiple-choice questions by topic and unit for Kenyan medical and health-science students, with instant answers and explanations." }
      : { title: "Timed Exams", description: "Timed, proctored medical MCQ exams for Kenyan health students. Unit-based weekly exams with scoring." });
  }, [mcqMode]);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedYear = searchParams.get("year") || "All";
  const [examSets, setExamSets] = useState<ExamSet[]>([]);
  const [visible, setVisible] = useState(12);
  const [loading, setLoading] = useState(true);
  const [examPrice, setExamPrice] = useState(5);
  const [phoneByExamId, setPhoneByExamId] = useState<Record<string, string>>({});
  const [paying, setPaying] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "pending" | "completed" | "failed">("idle");
  const [payingForExamId, setPayingForExamId] = useState<string | null>(null);
  const [unlockedExams, setUnlockedExams] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true); setVisible(12); setUnitPick(null);
    loadExams();
    getSetting("exam_price").then((price) => {
      if (price && !isNaN(Number(price))) setExamPrice(Number(price));
    });

    const saved = localStorage.getItem(UNLOCKED_KEY);
    if (saved) {
      try {
        setUnlockedExams(new Set(JSON.parse(saved)));
      } catch {
        setUnlockedExams(new Set());
      }
    }
  }, [mcqMode]);

  const loadExams = async () => {
    const { data } = await supabase
      .from("mcq_sets")
      .select("id,title,slug,category,created_at,updated_at")
      .eq("published", true)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    const usable = ((data || []) as unknown as ExamSet[])
      .filter(isPublicMcqSet)
      .filter((e) => isExamSet(e) !== mcqMode);

    setExamSets(dedupeResourceSummaries(usable));
    setLoading(false);
  };

  const persistUnlocked = (next: Set<string>) => {
    setUnlockedExams(next);
    localStorage.setItem(UNLOCKED_KEY, JSON.stringify([...next]));
  };

  const pollPayment = (txnId: string, examId: string) => {
    let attempts = 0;
    const pollId = setInterval(async () => {
      attempts += 1;
      if (attempts > 60) {
        clearInterval(pollId);
        setPaymentStatus("failed");
        setPaying(false);
        return;
      }

      try {
        const { data: result, error } = await supabase.functions.invoke("check-payment", {
          body: { transaction_id: txnId },
        });
        if (error) return;

        if (result.status === "completed") {
          clearInterval(pollId);
          setPaymentStatus("completed");
          setPaying(false);
          const next = new Set(unlockedExams);
          next.add(examId);
          persistUnlocked(next);
        } else if (result.status === "failed") {
          clearInterval(pollId);
          setPaymentStatus("failed");
          setPaying(false);
        }
      } catch {
        // keep polling
      }
    }, 2000);
  };

  const handlePay = async (exam: ExamSet) => {
    const phone = (phoneByExamId[exam.id] || "").trim();
    if (!phone) return;

    setPaying(true);
    setPaymentStatus("pending");
    setPayingForExamId(exam.id);

    try {
      const { data, error } = await supabase.functions.invoke("initiate-payment", {
        body: {
          phone,
          amount: examPrice,
          package_type: `exam:${inferUnit(exam)}`,
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "Payment failed");
      }

      pollPayment(data.transaction_id, exam.id);
    } catch {
      setPaymentStatus("failed");
      setPaying(false);
    }
  };

  const sampleExam: ExamSet = {
    id: "sample-exam",
    title: "Sample Pathology Exam",
    category: "Pathology",
    created_at: new Date().toISOString(),
  };

  const filteredExamSets = useMemo(() => {
    if (selectedYear === "All") return examSets;
    return examSets.filter((exam) => getYearFromCategory(exam.category) === selectedYear);
  }, [examSets, selectedYear]);

  const [q, setQ] = useState("");
  const [unitPick, setUnitPick] = useState<string | null>(null);
  const yearChips = useMemo(() => [...new Set(examSets.map((e) => getYearFromCategory(e.category)).filter(Boolean) as string[])].sort(), [examSets]);
  const unitChips = useMemo(() => {
    const n = new Map<string, number>();
    for (const e of filteredExamSets) { const u = inferUnit(e); n.set(u, (n.get(u) ?? 0) + 1); }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [filteredExamSets]);
  const allExams = useMemo(() => {
    const needles = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = filteredExamSets.filter((e) => (!unitPick || inferUnit(e) === unitPick) && needles.every((w) => `${e.title} ${inferUnit(e)}`.toLowerCase().includes(w)));
    return unitPick || needles.length || mcqMode ? list : [sampleExam, ...list];
  }, [filteredExamSets, q, unitPick]);

  const chip = (on: boolean) => `shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/60"}`;
  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 px-4 py-7 sm:py-9">
        <div className="mx-auto max-w-6xl">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-primary"><Trophy className="h-3.5 w-3.5" aria-hidden /> {mcqMode ? "Practice questions" : "Timed exams"}</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-foreground sm:text-5xl">{mcqMode ? "MCQ Question Banks" : "Exam Center"}</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{mcqMode ? "Practice multiple-choice questions by topic. Each answer comes with its explanation." : "Timed multiple-choice exams from your units. You get your score and the answers at the end."} {loading ? "" : mcqMode ? `${examSets.length} question banks.` : `${examSets.length + 1} exams available.`}</p>
          <ContentCredit />
        </div>
      </section>

      <section className="exam-controls mx-auto max-w-6xl px-4 pt-6">
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Year">
          <button type="button" onClick={() => setSearchParams({})} aria-pressed={selectedYear === "All"} className={chip(selectedYear === "All")}>All years</button>
          {yearChips.map((y) => <button key={y} type="button" onClick={() => { setSearchParams({ year: y }); setUnitPick(null); }} aria-pressed={selectedYear === y} className={chip(selectedYear === y)}>{y}</button>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={mcqMode ? "Search question banks, e.g. cardiology, anatomy" : "Search exams, e.g. pathology, physiology"} aria-label="Search exams" className="max-w-sm" />
          <span className="text-sm text-muted-foreground">{loading ? "" : `${allExams.length} shown`}</span>
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : allExams.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">Nothing matches. Try another year or a shorter search.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {allExams.slice(0, visible).map((exam) => {
              const isSample = exam.id === "sample-exam";
              const unitName = inferUnit(exam);
              const yearTag = getYearFromCategory(exam.category);
              return (
                <article key={exam.id} className="exam-simple flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">{unitName}{yearTag ? ` · ${yearTag}` : ""}</p>
                  <h2 className="mt-1 font-serif text-lg font-bold leading-snug text-foreground">{exam.title}</h2>
                  <div className="mt-auto pt-4"><Button size="sm" onClick={() => navigate(isSample ? `/exams/${exam.id}/start` : mcqMode ? `/mcqs/${exam.slug || exam.id}` : buildExamPath(exam))} className="gap-1.5">{mcqMode ? "Practise" : "Start exam"} <ArrowRight className="h-3.5 w-3.5" /></Button></div>
                </article>
              );
            })}
          </div>
        )}
        {!loading && allExams.length > visible && (
          <div className="flex justify-center pt-2">
            <LoadMoreButton onMore={() => setVisible((v) => v + 12)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent">Show more</LoadMoreButton>
          </div>
        )}
      </section>
    </div>
  );
}
