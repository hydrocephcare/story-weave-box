import { Link } from "react-router-dom";
import { ArrowRight, GraduationCap, Stethoscope } from "lucide-react";
import { setTrack } from "@/lib/courseTrack";
import cats from "@/data/dentalCategories.json";

/** For visitors who are not signed in: the site carries more than one course, so say so up front. Signed-in students are placed by the course on their profile. */
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
            <h2 className="font-serif text-xl font-bold">Dental, IT, business and more</h2>
            <p className="mt-1 text-[15px] text-muted-foreground">Mount Kenya University past papers with model answers, flashcards, a mock exam and search, for every course below.</p>
            <Link to="/dental" onClick={() => setTrack("dental")} className="mt-2 inline-flex items-center gap-1 text-[15px] font-bold text-primary hover:underline">Open all past papers <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </div>
      <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
        {(cats as { slug: string; name: string }[]).filter((c) => c.slug !== "other-units").map((c) => <Link key={c.slug} to={`/dental/category/${c.slug}`} onClick={() => setTrack("dental")} className="font-semibold text-primary hover:underline">{c.name}</Link>)}
      </p>
    </section>
  );
}
