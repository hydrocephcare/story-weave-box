// The student's university. It decides what Ompath AI can be "custom made" for: MKU students have the official timetable, lecturers and
// MKU past papers; everyone else gets the general notes, MCQs and tools, and can add their own university if it is not listed.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const UNIVERSITIES = ["Mount Kenya University (MKU)", "University of Nairobi (UoN)", "Kenyatta University (KU)", "JKUAT", "Moi University", "Maseno University", "Egerton University", "Kabarak University", "Aga Khan University", "Kenya Methodist University", "Technical University of Mombasa"];
const KEY = "ompath_university";
const CUSTOM = "ompath_university_custom";
const EVENT = "ompath:university";

export const isMku = (u: string | null | undefined) => /\bmku\b|mount kenya/i.test(u ?? "");
export const shortName = (u: string) => u.match(/\(([^)]+)\)/)?.[1] ?? u.replace(/ University$/i, "");

export function getUniversity(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } }
export function getCustomUniversities(): string[] { try { const v = JSON.parse(localStorage.getItem(CUSTOM) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }

/** Saves the choice on this device and, when signed in, on the account so it follows the student. */
export async function setUniversity(name: string, custom = false) {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!clean) return;
  try {
    localStorage.setItem(KEY, clean);
    if (custom && !UNIVERSITIES.includes(clean)) localStorage.setItem(CUSTOM, JSON.stringify([...new Set([clean, ...getCustomUniversities()])].slice(0, 8)));
  } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(EVENT));
  try { await supabase.auth.updateUser({ data: { university: clean } }); } catch { /* not signed in */ }
}

/** The student's university: from this device, or from their account on a new device. */
export function useUniversity(): [string | null, (name: string, custom?: boolean) => Promise<void>] {
  const [uni, setUni] = useState<string | null>(getUniversity);
  useEffect(() => {
    const on = () => setUni(getUniversity());
    window.addEventListener(EVENT, on);
    if (!getUniversity()) {
      void supabase.auth.getUser().then(({ data }) => {
        const u = (data.user?.user_metadata as { university?: string } | undefined)?.university;
        if (u) { try { localStorage.setItem(KEY, u); } catch { /* ignore */ } setUni(u); }
      }, () => undefined);
    }
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return [uni, setUniversity];
}

/** What this university gets, in plain words (shown as the benefits card). */
export function benefitsFor(uni: string | null): { title: string; points: string[]; note?: string } {
  if (isMku(uni)) {
    return { title: "Custom made for MKU", points: ["Your official timetable and lecturers, asked in plain words", "MKU past papers and CATs with answers", "Notes mapped to your unit outlines", "Reminders and a study plan built on your week"] };
  }
  return {
    title: uni ? `Made for ${shortName(uni)} students` : "Made for medical students",
    points: ["Notes by year and unit", "Past papers, MCQs and spot questions with pictures", "Study plans, quizzes and a review of your weak topics"],
    note: "The timetable and lecturers are MKU-only for now. If your university would like the same, tell us and we will set it up.",
  };
}
