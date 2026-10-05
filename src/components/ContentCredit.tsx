import { BookOpen } from "lucide-react";

export default function ContentCredit() {
  return (
    <section className="my-5 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-background shadow-sm">
      <div className="flex items-center gap-4 px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm" aria-hidden>
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Ompath Study</p>
          <p className="mt-0.5 font-serif text-lg font-bold text-foreground">Compiled by Abongo</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Study resources organised and prepared for medical students.</p>
        </div>
      </div>
    </section>
  );
}
