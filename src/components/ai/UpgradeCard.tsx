import { Check, BookOpen } from "lucide-react";

/** Former Pro upgrade card, now a clear notice that all OmpathStudy learner features are free. */
export default function UpgradeCard(_props: {
  kind: "questions" | "pictures" | "answers" | "quiz" | "feature";
  title?: string;
  why?: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-primary/25 bg-primary/5 p-4" aria-label="Free access">
      <p className="flex items-center gap-2 font-serif text-base font-bold">
        <Check className="h-4 w-4 text-primary" /> All OmpathStudy features are free
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        No subscription or payment is needed. Continue studying, practising questions, revealing answers, and using Ompath AI.
      </p>
      <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-primary">
        <BookOpen className="h-4 w-4" /> Free access for every learner
      </p>
    </section>
  );
}
