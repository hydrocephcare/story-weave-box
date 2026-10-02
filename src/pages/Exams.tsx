import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle, Clock, Loader2, Phone, Shield, Sparkles, Trophy, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getSetting, getCategoryDisplayName, getYearFromCategory, buildExamPath } from "@/lib/store";
import { updateMetaTags } from "@/lib/seo";
import { dedupeResourceSummaries, isPublicMcqSet } from "@/lib/content-policy";

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

export default function Exams() {
  useEffect(() => {
    updateMetaTags({
      title: "Timed Exams",
      description: "Timed, proctored medical MCQ exams for Kenyan health students. Unit-based weekly exams with scoring.",
    });
  }, []);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  }, []);

  const loadExams = async () => {
    const { data } = await supabase
      .from("mcq_sets")
      .select("id,title,slug,category,created_at,updated_at")
      .eq("published", true)
      .or("title.ilike.%exam%,category.ilike.Weekly Exam%")
      .order("updated_at", { ascending: false });

    const usable = ((data || []) as unknown as ExamSet[])
      .filter(isPublicMcqSet)

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

  const allExams = useMemo(() => [sampleExam, ...filteredExamSets], [filteredExamSets]);

  return (
    <div className="min-h-screen bg-background">

      {/* ── Hero — only text changed, no logic ── */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-5xl">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary">
              <Trophy className="h-3.5 w-3.5" /> Unit-Based Weekly Exams
            </div>
            <h1 className="mb-3 font-serif text-3xl font-bold text-foreground sm:text-4xl">Exam Center</h1>
            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Timed, proctored MCQ exams drawn from your unit content. {selectedYear === "All" ? "Select a year from the menu to narrow exams." : `Currently viewing ${selectedYear} exams.`}
            </p>
          </motion.div>

          {/* Support card — new addition, no logic impact */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="mx-auto mt-7 max-w-lg rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 p-4 sm:p-5"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-rose-100 dark:bg-rose-900/40 p-2 shrink-0 mt-0.5">
                <Heart className="h-4 w-4 text-rose-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Support Ompath Study</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Each exam is just <strong className="text-foreground">KES {examPrice}</strong>. This goes directly toward building weekly exams, expanding the question bank, and keeping Ompath Study free for all health students in Kenya.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Exam list — 100% original logic, only subtitle text changed ── */}
      <section className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : allExams.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">No exams available yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {allExams.slice(0, visible).map((exam) => {
            const isSample = exam.id === "sample-exam";
            const unitName = inferUnit(exam);
            const yearTag = getYearFromCategory(exam.category);
            return (
              <div key={exam.id} className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 sm:p-5">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{unitName}</span>
                    {yearTag && <span className="rounded-md border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{yearTag}</span>}
                    <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-foreground">FREE</span>
                  </div>
                  <h2 className="font-serif text-base font-bold leading-snug text-foreground">{exam.title}</h2>
                </div>
                <div className="mt-4 flex items-center justify-end border-t border-border/60 pt-3">
                  <Button size="sm" onClick={() => navigate(isSample ? `/exams/${exam.id}/start` : buildExamPath(exam))} className="gap-1.5">
                    Start exam <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
          </div>
        )}
        {!loading && allExams.length > visible && (
          <div className="flex justify-center pt-2">
            <Button variant="outline" onClick={() => setVisible((v) => v + 12)}>Show more exams ({allExams.length - visible} left)</Button>
          </div>
        )}

      </section>

    </div>
  );
}
