import { Check, Lock } from "lucide-react";
import { FREE_DAILY_PICTURES, FREE_DAILY_QUESTIONS, FREE_REVEALS_PER_SUBJECT } from "@/lib/ompathAi";
import { openSubscribePrompt } from "@/lib/subscribe-prompt";

const COPY = {
  answers: {
    title: "You have used today's free answers",
    why: `Each day the first ${FREE_REVEALS_PER_SUBJECT} answers in gross anatomy, histology and embryology are free. Subscribe to reveal every answer.`,
    reason: "Subscribe to reveal every answer, with explanations.",
  },
  questions: {
    title: "You have used today's free AI questions",
    why: `Free accounts get ${FREE_DAILY_QUESTIONS} AI questions a day. Greetings, your timetable, notes search and questions you have asked before stay free and instant.`,
    reason: "Subscribe for unlimited Ompath AI questions, answers, and picture questions.",
  },
  pictures: {
    title: "That is today's free picture questions",
    why: `Free accounts get ${FREE_DAILY_PICTURES} picture questions a day. Your first set each time you open the drill is always free.`,
    reason: "Subscribe for unlimited picture questions, answers and AI explanations.",
  },
} as const;

/** The in-chat "you have reached the free limit" card: it says what is free, what a subscription adds, and opens the existing payment window. */
export default function UpgradeCard({ kind }: { kind: "questions" | "pictures" | "answers" }) {
  const c = COPY[kind];
  return (
    <section className="overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-4" aria-label="Upgrade">
      <p className="flex items-center gap-2 font-serif text-base font-bold"><Lock className="h-4 w-4 text-primary" /> {c.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{c.why}</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {["Unlimited AI questions and explanations", "Every spot-question answer, with pictures", "Verified answer keys on every paper"].map((t) => <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{t}</li>)}
      </ul>
      <button type="button" onClick={() => openSubscribePrompt(c.reason)} className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-transform active:scale-[0.98]">See plans and subscribe</button>
      <p className="mt-2 text-center text-xs text-muted-foreground">Your free allowance comes back tomorrow.</p>
    </section>
  );
}
