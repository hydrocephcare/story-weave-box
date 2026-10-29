import { Link, Outlet } from "react-router-dom";
import { Stethoscope } from "lucide-react";
import { useMyYear } from "@/hooks/useMyYear";
import { useAuth } from "@/hooks/useAuth";

/** Clinical rotations (the simulator, ward rounds, OSCE stations) start in Year 4. A student in Year 1 to 3 is shown what is for their year instead. Students without a chosen year, and admins who preview it, see everything. */
export default function ClinicalGate() {
  const { year, ready } = useMyYear();
  const { isAdmin } = useAuth();
  // an admin can look at the clinical area on purpose (?preview=1); it is remembered for the rest of the visit
  const preview = isAdmin && (() => { try { if (new URLSearchParams(window.location.search).get("preview") === "1") sessionStorage.setItem("ompath_clin_preview", "1"); return sessionStorage.getItem("ompath_clin_preview") === "1"; } catch { return false; } })();
  if (!ready) return <div className="min-h-[40dvh]" />;
  if (year && year < 4 && !preview) {
    return (
      <main className="mx-auto max-w-xl px-5 py-14 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"><Stethoscope className="h-7 w-7" aria-hidden /></span>
        <h1 className="mt-4 font-serif text-2xl font-bold sm:text-3xl">Clinical rotations start in Year 4</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Ward-round cases, OSCE stations and the clinical simulator are for Year 4 and above. You are in Year {year}, so here is what is for you.</p>
        <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">
          <Link to={`/year/${year}`} className="rounded-xl border border-border bg-card p-3 text-sm font-bold hover:border-primary/50">Year {year} units and notes<span className="block text-xs font-normal text-muted-foreground">Everything for your year</span></Link>
          <Link to="/mcqs" className="rounded-xl border border-border bg-card p-3 text-sm font-bold hover:border-primary/50">Year {year} MCQs<span className="block text-xs font-normal text-muted-foreground">Practise with explanations</span></Link>
          <Link to="/daily" className="rounded-xl border border-border bg-card p-3 text-sm font-bold hover:border-primary/50">Daily dose<span className="block text-xs font-normal text-muted-foreground">Five questions from your year</span></Link>
          <Link to="/friend-zone" className="rounded-xl border border-border bg-card p-3 text-sm font-bold hover:border-primary/50">Challenge a friend<span className="block text-xs font-normal text-muted-foreground">On your year's topics</span></Link>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">Wrong year? Pick it with the Y1 to Y6 buttons, or change it in <Link to="/account" className="font-bold text-primary hover:underline">your account</Link>.{isAdmin && <> Admin: <Link to="/clinical?preview=1" className="font-bold text-primary hover:underline">preview the clinical area</Link>.</>}</p>
      </main>
    );
  }
  return <Outlet />;
}
