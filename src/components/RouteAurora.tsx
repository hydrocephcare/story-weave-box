import { useLocation } from "react-router-dom";
import HeroAurora from "@/components/HeroAurora";

// pages that open without a colour wash of their own get one here, in a colour that fits what the page is for
const HUE: Record<string, string> = {
  flashcards: "Biochemistry & genetics", exams: "Surgery", papers: "Pathology", essays: "Psychiatry", books: "Anatomy", pharmacology: "Pharmacology",
  stories: "Obstetrics & gynaecology", "new-notes": "Medicine", recent: "Medicine", "must-knows": "Physiology", "course-outlines": "Public health",
  "daily-dose": "Paediatrics", dashboard: "Medicine", account: "Medicine", partners: "Public health", app: "Medicine", clinical: "Microbiology & immunology",
  "my-revision": "Physiology", revision: "Physiology", "study-map": "Anatomy", contests: "Surgery",
};

/** A moving, subject-coloured wash behind the top of pages that have none of their own. It scrolls away with the page and fades out. */
export default function RouteAurora() {
  const seg = useLocation().pathname.split("/")[1] ?? "";
  const about = HUE[seg];
  if (!about) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[460px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_50%,transparent)] print:hidden" aria-hidden>
      <div className="relative isolate h-full w-full"><HeroAurora about={about} /></div>
    </div>
  );
}
