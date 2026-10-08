// Which features are free for everyone and which are for Pro (subscribers). The admin can flip any of them in Admin > Site manager > Features,
// and it takes effect for every visitor at once. Each feature has a sensible default, so nothing needs setting up.
import { useSiteConfig, type SiteConfig } from "@/lib/siteConfig";

export type Tier = "free" | "pro";
export interface Feature { key: string; label: string; blurb: string; defaultTier: Tier }

export const FEATURES: Feature[] = [
  { key: "unlimitedAi", label: "Unlimited AI questions", blurb: "Free accounts get a daily number of AI answers. Pro has no limit.", defaultTier: "pro" },
  { key: "unlimitedPictures", label: "Unlimited picture questions", blurb: "Anatomy, histology and embryology spot questions with pictures, beyond the daily free set.", defaultTier: "pro" },
  { key: "longQuiz", label: "Practice quizzes of more than 10 questions", blurb: "\"Give me 30 MCQs on physiology\": built from the site's own questions, answers hidden until you submit.", defaultTier: "pro" },
  { key: "essays", label: "Essay and short-answer practice", blurb: "Essay and SAQ questions with the model answer hidden until you tap.", defaultTier: "free" },
  { key: "fullPaper", label: "Full past papers in the AI", blurb: "Ask for a paper and read it in a pop-up, with the first part visible and the rest on tap.", defaultTier: "free" },
  { key: "studyPlanSave", label: "Save study plans and add them to a calendar", blurb: "Anyone can see a plan. Saving it and exporting to a phone calendar is Pro.", defaultTier: "pro" },
  { key: "reminders", label: "Reminders", blurb: "\"Remind me to revise cardiology tomorrow at 6 pm\": an alert on the site and a calendar entry on the phone.", defaultTier: "pro" },
  { key: "review", label: "Review: weak topics, bookmarks and progress", blurb: "Shows what you keep missing, what you saved, what you read, and what to do next.", defaultTier: "pro" },
];

export const tierOf = (key: string, cfg: Pick<SiteConfig, "proFeatures">): Tier => cfg.proFeatures?.[key] ?? FEATURES.find((f) => f.key === key)?.defaultTier ?? "free";

/** True when this person may use the feature: it is free for everyone, or they are Pro (a subscriber or an admin). */
export const featureAllowed = (key: string, cfg: Pick<SiteConfig, "proFeatures">, isPro: boolean): boolean => tierOf(key, cfg) === "free" || isPro;

export function useFeatures(isPro: boolean) {
  const cfg = useSiteConfig();
  return {
    can: (key: string) => featureAllowed(key, cfg, isPro),
    /** Pro-only right now (so the UI can show a small "Pro" tag). */
    isProOnly: (key: string) => tierOf(key, cfg) === "pro",
  };
}
