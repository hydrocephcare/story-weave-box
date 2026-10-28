import { Link, Outlet } from "react-router-dom";
import { Stethoscope } from "lucide-react";
import { useScopedYear } from "@/hooks/useMyYear";

/** Clinical rotations (the simulator, ward rounds, OSCE stations) start in Year 4. A student in Year 1 to 3 is shown what is for their year instead. "All years" mode and students without a chosen year see everything. */
export default function ClinicalGate() {
  const { year, ready } = useScopedYear();
  if (!ready) return <div className="min-h-[40dvh]" />;
  if (year && year < 4) {
    return (
      <main className="mx-auto max-w-xl px-5 py-14 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"><Stethoscope className="h-7 w-7" aria-hidden /></span>
        <h1 className="mt-4 font-serif text-2xl font-bold sm:text-3xl">Clinical rotations start in Year 4</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Ward-round cases, OSCE stations and the clinical simulator are for Year 4 and above. You are in Year {year}, so here is what is for you.</p>
        <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">
          <Link to={`/year/${year}`} className="rounded-xl border border-border bg-card p-3 text-sm font-bold hover:border-primary/50">Year {year} units and notes<span className="block text-xs font-normal text-muted-foreground">Everything for your year</span></Link>
          <Link to="/mcqs" className="rounded-xl border border-border bg-card p-3 text-sm font-bold hover:border-primary/50">Year {year} MCQs<span className="block text-xs font-normal text-muted-foreground">Practise with explanations</span></Link>
          <Link to="/daily" className="rounded-xl border border-border bg-card p-3 text-sm font-bold hover:border-primary/50">Daily dose<span className="block text-xs font-normal text-muted-foreground">Five questions from your year</span></Link>
          <Link to="/challenge" className="rounded-xl border border-border bg-card p-3 text-sm font-bold hover:border-primary/50">Challenge a friend<span className="block text-xs font-normal text-muted-foreground">On your year's topics</span></Link>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">Want a look ahead? Switch on "All years" in the menu. Wrong year? Change it in <Link to="/account" className="font-bold text-primary hover:underline">your account</Link>.</p>
      </main>
    );
  }
  return <Outlet />;
}
