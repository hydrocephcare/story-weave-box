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

/** The year a note or exam belongs to, from its category ("Year 4: Internal Medicine"), or null when it is for everyone. */
export const yearOfCategory = (category: string | null | undefined): number | null => {
  const m = String(category ?? "").match(/\byear\s*([1-6])\b/i);
  return m ? Number(m[1]) : null;
};
