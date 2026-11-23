import { useEffect } from "react";

const STORIES_ORIGIN = "https://stories.ompathstudy.com";

/** Legacy OmpathStudy story URLs now resolve to the independent Stories publication. */
export default function StoriesRedirect() {
  useEffect(() => {
    const target = new URL(window.location.pathname + window.location.search + window.location.hash, STORIES_ORIGIN);
    window.location.replace(target.toString());
  }, []);
  return <main className="flex min-h-[55vh] items-center justify-center px-5 text-sm text-muted-foreground">Opening Stories…</main>;
}
