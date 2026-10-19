import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const told = (): number | null => { try { const n = Number(localStorage.getItem("ompath_my_year")); return n >= 1 && n <= 6 ? n : null; } catch { return null; } };
const cache = new Map<string, number | null>();

/** The student's year of study: from their profile when signed in, otherwise what they once told Ompath AI. Null when unknown. */
export function useMyYear(): { year: number | null; ready: boolean } {
  const { user, loading } = useAuth();
  const [year, setYear] = useState<number | null>(() => (user && cache.has(user.id) ? cache.get(user.id)! : null));
  const [ready, setReady] = useState(Boolean(user && cache.has(user.id)));
  useEffect(() => {
    if (loading) return;
    if (!user) { setYear(null); setReady(true); return; }
    if (cache.has(user.id)) { setYear(cache.get(user.id) ?? told()); setReady(true); return; }
    let on = true;
    (supabase as unknown as { from: (t: string) => any }).from("profiles").select("study_year").eq("user_id", user.id).maybeSingle() // eslint-disable-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: { study_year?: number | string } | null }) => {
        const y = data?.study_year ? Number(data.study_year) : null;
        cache.set(user.id, y);
        if (on) { setYear(y ?? told()); setReady(true); }
      }, () => { if (on) { setYear(told()); setReady(true); } });
    return () => { on = false; };
  }, [user, loading]);
  return { year, ready };
}

const ALL_KEY = "ompath_all_years";
const ALL_EVENT = "ompath:all-years";
const readAll = (): boolean => { try { return localStorage.getItem(ALL_KEY) === "1"; } catch { return false; } };

/** "All years" mode: a student who picked a year normally sees only that year; this switch (in the menu) lets them browse every year. Remembered on this device. */
export function useAllYears(): [boolean, (v: boolean) => void] {
  const [all, setAll] = useState(readAll);
  useEffect(() => { const on = () => setAll(readAll()); window.addEventListener(ALL_EVENT, on); window.addEventListener("storage", on); return () => { window.removeEventListener(ALL_EVENT, on); window.removeEventListener("storage", on); }; }, []);
  const set = (v: boolean) => { try { localStorage.setItem(ALL_KEY, v ? "1" : "0"); } catch { /* storage blocked */ } setAll(v); window.dispatchEvent(new Event(ALL_EVENT)); };
  return [all, set];
}

/** The year the pages should be limited to: the student's own year, or null for "all years" mode and for people who never chose one. */
export function useScopedYear(): { year: number | null; myYear: number | null; allYears: boolean; ready: boolean } {
  const { year, ready } = useMyYear();
  const [allYears] = useAllYears();
  return { year: allYears ? null : year, myYear: year, allYears, ready };
}

/** The year a note or exam belongs to, from its category ("Year 4: Internal Medicine"), or null when it is for everyone. */
export const yearOfCategory = (category: string | null | undefined): number | null => {
  const m = String(category ?? "").match(/\byear\s*([1-6])\b/i);
  return m ? Number(m[1]) : null;
};
