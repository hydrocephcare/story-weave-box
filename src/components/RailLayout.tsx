import { useLocation } from "react-router-dom";
import StudyPanel from "@/components/StudyPanel";
import StickyRail from "@/components/StickyRail";

/**
 * Puts the study desk beside a page on wide screens. The desk is sticky, so it stays beside the page
 * all the way down instead of scrolling away and leaving an empty column. On phones and tablets the page is shown on its own.
 * On a year page the desk follows that year.
 */
export default function RailLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const viewed = pathname.match(/^\/(?:year|timetable)\/(?:year-)?([1-6])/);
  return (
    <div className="mx-auto w-full max-w-[1760px] xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6 xl:pr-6">
      <div className="min-w-0">{children}</div>
      <aside className="hidden xl:block" aria-label="Study desk">
        <StickyRail className="py-6">
          <StudyPanel year={viewed ? Number(viewed[1]) : undefined} />
        </StickyRail>
      </aside>
    </div>
  );
}
