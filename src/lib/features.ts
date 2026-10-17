// All learner-facing OmpathStudy features are free. Subscription tiers are intentionally disabled.
import { useSiteConfig, type SiteConfig } from "@/lib/siteConfig";

export type Tier = "free" | "pro";
export interface Feature { key: string; label: string; blurb: string; defaultTier: Tier }

export const FEATURES: Feature[] = [
  { key: "deepNotes", label: "Deep exam notes", blurb: "Full clinical and exam-focused explanations on every topic page, available free to every learner.", defaultTier: "free" },
  { key: "unlimitedAi", label: "Unlimited AI questions", blurb: "Ask Ompath AI questions and get explanations without a subscription limit.", defaultTier: "free" },
  { key: "unlimitedPictures", label: "Unlimited picture questions", blurb: "Practise anatomy, histology and embryology spot questions with pictures.", defaultTier: "free" },
  { key: "longQuiz", label: "Practice quizzes of more than 10 questions", blurb: "\"Give me 30 MCQs on physiology\": built from the site's own questions, answers hidden until you submit.", defaultTier: "free" },
  { key: "essays", label: "Essay and short-answer practice", blurb: "Essay and SAQ questions with the model answer hidden until you tap.", defaultTier: "free" },
  { key: "fullPaper", label: "Full past papers in the AI", blurb: "Ask for a paper and read it in a pop-up, with the first part visible and the rest on tap.", defaultTier: "free" },
  { key: "studyPlanSave", label: "Save study plans and add them to a calendar", blurb: "Create, save and export study plans to your phone calendar.", defaultTier: "free" },
  { key: "reminders", label: "Reminders", blurb: "\"Remind me to revise cardiology tomorrow at 6 pm\": an alert on the site and a calendar entry on the phone.", defaultTier: "free" },
  { key: "review", label: "Review: weak topics, bookmarks and progress", blurb: "Review weak topics, bookmarks, progress and suggested next steps.", defaultTier: "free" },
];

export const tierOf = (_key: string, _cfg: Pick<SiteConfig, "proFeatures">): Tier => "free";

/** All features are available to every learner; no subscription is required. */
export const featureAllowed = (_key: string, _cfg: Pick<SiteConfig, "proFeatures">, _isPro: boolean): boolean => true;

export function useFeatures(isPro: boolean) {
  const cfg = useSiteConfig();
  return {
    can: (key: string) => featureAllowed(key, cfg, isPro),
    /** Pro-only right now (so the UI can show a small "Pro" tag). */
    isProOnly: (_key: string) => false,
  };
}
