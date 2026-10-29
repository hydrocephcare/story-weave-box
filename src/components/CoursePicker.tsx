import { Link } from "react-router-dom";
import { GraduationCap, Stethoscope } from "lucide-react";
import { chooseTrack } from "@/lib/courseTrack";
import { SECTIONS } from "@/lib/sections";

/** For visitors who are not signed in: the site carries more than one course, so say so up front. Each course is its own section with its own home, menu and search. */
export default function CoursePicker() {
  return (
    <section className="mx-auto max-w-6xl px-5 pt-10 sm:pt-12" aria-label="Choose your course">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Pick your course</p>
      <div className="mt-3 grid gap-x-10 gap-y-6 border-y border-border py-6 sm:grid-cols-2">
        <div className="flex items-start gap-4">
          <Stethoscope className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden />
          <div>
            <h2 className="font-serif text-xl font-bold">MBChB (Medicine)</h2>
            <p className="mt-1 text-[15px] text-muted-foreground">Notes, MCQs, flashcards, essays and past papers for Years 1 to 6. You are already here: scroll on.</p>
          </div>
        </div>
        <div className="flex items-start gap-4">
          <GraduationCap className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden />
          <div>
            <h2 className="font-serif text-xl font-bold">Other courses</h2>
            <p className="mt-1 text-[15px] text-muted-foreground">Past papers with model answers, flashcards, a mock exam and search: one section for each course.</p>
          </div>
        </div>
      </div>
      <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
        {SECTIONS.map((s) => <Link key={s.slug} to={`/${s.slug}`} onClick={() => chooseTrack(s.slug as never)} className="font-semibold text-primary hover:underline">{s.name}</Link>)}
      </p>
    </section>
  );
}
