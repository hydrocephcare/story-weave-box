import StudyPanel from "@/components/StudyPanel";
import StickyRail from "@/components/StickyRail";

/**
 * Puts the study desk beside a page on wide screens. The desk is sticky, so it stays beside the page
 * all the way down instead of scrolling away and leaving an empty column. On phones and tablets the page is shown on its own.
 */
export default function RailLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1760px] xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6 xl:pr-6">
      <div className="min-w-0">{children}</div>
      <aside className="hidden xl:block" aria-label="Study desk">
        <StickyRail className="py-6">
          <StudyPanel />
        </StickyRail>
      </aside>
    </div>
  );
}
